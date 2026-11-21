import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '../../../../../src/services/http.js';
import { useOwnerControls } from '../../../../../src/pages/consumer/flatmates/detail/useOwnerControls.js';
import useFlatmatesSearch from '../../../../../src/pages/consumer/flatmates/useFlatmatesSearch.js';
import { useGroupPickers } from '../../../../../src/pages/consumer/flatmates/useGroupPickers.js';
import { useLocalityCoords } from '../../../../../src/pages/consumer/flatmates/useLocalityCoords.js';
import useRaiseHint from '../../../../../src/pages/consumer/flatmates/useRaiseHint.js';
import useLivingStyle from '../../../../../src/pages/consumer/flatmates/livingStyle/useLivingStyle.js';
import * as Q from '../../../../../src/pages/consumer/flatmates/livingStyle/questions.js';
import { SHARE_OPENER, SEEKER_OPENER, GROUP_OPENER } from '../../../../../src/pages/consumer/flatmates/openers.js';
import { ROOM_AMENITIES, ROOM_PARKING } from '../../../../../src/pages/consumer/flatmates/roomAmenities.js';
import * as consts from '../../../../../src/pages/consumer/flatmates/constants.js';
import * as flatmateService from '../../../../../src/services/flatmateService.js';
import * as propertyService from '../../../../../src/services/propertyService.js';
import * as rentService from '../../../../../src/services/rentService.js';
import { searchLocalities } from '../../../../../src/services/localityService.js';

const navigate = vi.fn();
const toast = vi.fn();
let authUser = { mobile: '9000000001' };

vi.mock('react-router', () => ({ useNavigate: () => navigate }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
vi.mock('../../../../../src/context/ToastContext.jsx', () => ({ useToast: () => ({ toast }) }));
vi.mock('../../../../../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: authUser }) }));
vi.mock('../../../../../src/services/flatmateService.js', () => ({
  feed: vi.fn(), setGroupSeats: vi.fn(), setRoomSeats: vi.fn(), setRoomOccupants: vi.fn(), deleteGroup: vi.fn(), deleteRoom: vi.fn(),
  deletePost: vi.fn(), myLivingStyle: vi.fn(), saveMyLivingStyle: vi.fn(),
}));
vi.mock('../../../../../src/services/propertyService.js', () => ({ myListings: vi.fn() }));
vi.mock('../../../../../src/services/rentService.js', () => ({ myTenancies: vi.fn() }));
vi.mock('../../../../../src/services/localityService.js', () => ({ searchLocalities: vi.fn() }));

afterEach(cleanup);

describe('useOwnerControls', () => {
  const room = { id: 'r1', seatsTotal: 3, seatsOpen: 1, occupants: 1 };
  const setup = (kind = 'room', item = room) => {
    const patch = vi.fn();
    const hook = renderHook(() => useOwnerControls(kind, item, patch));
    return { patch, ...hook };
  };

  it('adjusts room seats', async () => {
    flatmateService.setRoomSeats.mockResolvedValue({ seatsOpen: 2 });
    const { result, patch } = setup();
    await act(() => result.current.onSeats(1));
    expect(flatmateService.setRoomSeats).toHaveBeenCalledWith('r1', 2);
    expect(patch).toHaveBeenCalledWith({ seatsOpen: 2 });
    expect(toast).toHaveBeenCalledWith('flatmates.roomSeatReopened');
  });

  it('reports a filled room or a marked seat', async () => {
    flatmateService.setRoomSeats.mockResolvedValue({ seatsOpen: 0 });
    const { result } = setup();
    await act(() => result.current.onSeats(-1));
    expect(toast).toHaveBeenCalledWith('flatmates.roomAllFilled');
    flatmateService.setRoomSeats.mockResolvedValue({ seatsOpen: 1 });
    const second = setup('room', { ...room, seatsOpen: 2 });
    await act(() => second.result.current.onSeats(-1));
    expect(toast).toHaveBeenCalledWith('flatmates.seatMarkedFilled');
  });

  it('ignores seat changes that hit the bounds', async () => {
    const { result } = setup('room', { ...room, seatsOpen: 0 });
    await act(() => result.current.onSeats(-1));
    expect(flatmateService.setRoomSeats).not.toHaveBeenCalled();
  });

  it('resizes a group', async () => {
    flatmateService.setGroupSeats.mockResolvedValue({ seatsTotal: 4, rent: 4000 });
    const { result } = setup('group', { id: 'g1', seatsTotal: 3, rent: 3000, members: [{}] });
    await act(() => result.current.onSeats(1));
    expect(flatmateService.setGroupSeats).toHaveBeenCalledWith('g1', 3);
    expect(toast).toHaveBeenCalledWith('flatmates.groupSeatsResized');
  });

  it('toasts the server message when a seat update fails', async () => {
    flatmateService.setRoomSeats.mockRejectedValue(new ApiError({ code: 'x', message: 'Nope', status: 400 }));
    const { result, patch } = setup();
    await act(() => result.current.onSeats(1));
    expect(toast).toHaveBeenCalledWith('Nope', 'error');
    expect(patch).not.toHaveBeenCalled();
  });

  it('adds and removes people', async () => {
    flatmateService.setRoomOccupants.mockResolvedValue({ occupants: 2 });
    const { result } = setup();
    await act(() => result.current.onPeople(1));
    expect(flatmateService.setRoomOccupants).toHaveBeenCalledWith('r1', 2);
    expect(toast).toHaveBeenCalledWith('flatmates.roomPersonAdded');
    flatmateService.setRoomOccupants.mockResolvedValue({ occupants: 0 });
    await act(() => result.current.onPeople(-1));
    expect(toast).toHaveBeenCalledWith('flatmates.roomPersonRemoved');
  });

  it('warns at capacity and ignores negative counts', async () => {
    flatmateService.setRoomOccupants.mockResolvedValue({ occupants: 1 });
    const { result } = setup();
    await act(() => result.current.onPeople(1));
    expect(toast).toHaveBeenCalledWith('flatmates.roomAtCapacity', 'info');
    flatmateService.setRoomOccupants.mockClear();
    const empty = setup('room', { id: 'r2' });
    await act(() => empty.result.current.onPeople(-1));
    expect(flatmateService.setRoomOccupants).not.toHaveBeenCalled();
  });

  it('navigates to reissue the agreement', () => {
    const { result } = setup('room', { id: 'r1', propertyId: 'p 1' });
    result.current.onReissue();
    expect(navigate).toHaveBeenCalledWith('/services/rent-agreement?flat=p%201&reissue=1');
  });

  it.each([['group', 'deleteGroup'], ['room', 'deleteRoom'], ['post', 'deletePost']])('deletes a %s after confirmation', async (kind, fn) => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    flatmateService[fn].mockResolvedValue();
    const { result } = setup(kind, { id: 'x' });
    await act(() => result.current.onDelete());
    expect(flatmateService[fn]).toHaveBeenCalledWith('x');
    expect(navigate).toHaveBeenCalledWith('/dashboard#listings');
    expect(toast).toHaveBeenCalledWith('flatmates.detailDeleted');
  });

  it('does not delete when cancelled or failing', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { result } = setup();
    await act(() => result.current.onDelete());
    expect(flatmateService.deleteRoom).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    flatmateService.deleteRoom.mockRejectedValue(new Error('boom'));
    await act(() => result.current.onDelete());
    expect(toast).toHaveBeenCalledWith('common.somethingWentWrong', 'error');
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('useFlatmatesSearch', () => {
  const page = { items: [{ id: 1 }], total: 1, verifiedTotal: 1, pageCount: 1, otherTabTotal: 4, tabTotals: { rooms: 1 } };

  it('loads a feed and exposes totals', async () => {
    flatmateService.feed.mockResolvedValue(page);
    const filters = { q: 'load-1' };
    const { result } = renderHook(() => useFlatmatesSearch({ tab: 'people', filters, viewer: 'u' }));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ items: [{ id: 1 }], otherCount: 4, tabTotals: { rooms: 1 }, loaded: true });
    expect(flatmateService.feed.mock.calls[0][0]).toBe('people');
    expect(flatmateService.feed.mock.calls[0][4].auth).toBe(true);
  });

  it('does nothing without filters and omits auth for an unknown viewer', async () => {
    const { result } = renderHook(() => useFlatmatesSearch({ filters: null }));
    expect(result.current.status).toBe('loading');
    expect(flatmateService.feed).not.toHaveBeenCalled();
    flatmateService.feed.mockResolvedValue({ items: [], total: 0 });
    const filters = { q: 'anon' };
    renderHook(() => useFlatmatesSearch({ filters }));
    await waitFor(() => expect(flatmateService.feed).toHaveBeenCalled());
    expect(flatmateService.feed.mock.calls[0][4].auth).toBeUndefined();
  });

  it('surfaces errors and refetches on retry', async () => {
    const err = new Error('down');
    flatmateService.feed.mockRejectedValueOnce(err).mockResolvedValue(page);
    const filters = { q: 'err-1' };
    const { result } = renderHook(() => useFlatmatesSearch({ filters }));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe(err);
    expect(result.current.loaded).toBe(false);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(flatmateService.feed).toHaveBeenCalledTimes(2);
  });

  it('shows loading and empty data while switching tabs', async () => {
    flatmateService.feed.mockResolvedValue(page);
    const filters = { q: 'tabs-1' };
    const { result, rerender } = renderHook(({ tab }) => useFlatmatesSearch({ tab, filters }), { initialProps: { tab: 'move-in' } });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ tab: 'teams' });
    expect(result.current.status).toBe('loading');
    expect(result.current.items).toEqual([]);
    expect(result.current.otherCount).toBeNull();
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });
});

describe('useGroupPickers', () => {
  it('stays idle when closed or signed out', () => {
    renderHook(() => useGroupPickers(null, true));
    renderHook(() => useGroupPickers({ mobile: '1' }, false));
    expect(propertyService.myListings).not.toHaveBeenCalled();
    expect(rentService.myTenancies).not.toHaveBeenCalled();
  });

  it('loads approved listings and active tenancies', async () => {
    propertyService.myListings.mockResolvedValue([{ id: 1, status: 'Approved' }, { id: 2, status: 'draft' }, { id: 3, status: 'live' }]);
    rentService.myTenancies.mockResolvedValue([]);
    const user = { mobile: '9' };
    const { result } = renderHook(() => useGroupPickers(user, true));
    await waitFor(() => expect(result.current.myApprovedListingsStatus).toBe('ready'));
    expect(result.current.myApprovedListings.map((l) => l.id)).toEqual([1, 3]);
    await waitFor(() => expect(result.current.myTenanciesStatus).toBe('ready'));
    expect(result.current.myTenancies).toEqual([]);
  });
});

describe('useLocalityCoords', () => {
  it('resolves centres by case-insensitive name and caches lookups', async () => {
    searchLocalities.mockResolvedValue([{ name: 'baner', lat: 18.5, lng: 73.8 }, { name: 'Baner Road', lat: 1, lng: 2 }]);
    const { result } = renderHook(() => useLocalityCoords(['Baner', '', 'Baner']));
    expect(result.current).toEqual({});
    await waitFor(() => expect(result.current).toEqual({ Baner: [18.5, 73.8] }));
    const again = renderHook(() => useLocalityCoords(['Baner']));
    expect(again.result.current).toEqual({ Baner: [18.5, 73.8] });
    expect(searchLocalities).toHaveBeenCalledTimes(1);
  });

  it('retries after a failed lookup and ignores empty input', async () => {
    searchLocalities.mockRejectedValueOnce(new Error('x')).mockResolvedValue([{ name: 'Wakad', lat: 1, lng: 2 }]);
    const { result } = renderHook(() => useLocalityCoords(['Wakad']));
    await waitFor(() => expect(searchLocalities).toHaveBeenCalledTimes(1));
    expect(result.current).toEqual({});
    const second = renderHook(() => useLocalityCoords(['Wakad']));
    await waitFor(() => expect(second.result.current).toEqual({ Wakad: [1, 2] }));
    expect(renderHook(() => useLocalityCoords([])).result.current).toEqual({});
  });
});

describe('useRaiseHint', () => {
  const base = { tab: 'move-in', filters: { budget: [0, 10000] }, query: { q: 'a' }, empty: true };

  it('is null unless the search is empty and budget narrowed', () => {
    expect(renderHook(() => useRaiseHint({ ...base, empty: false })).result.current).toBeNull();
    expect(renderHook(() => useRaiseHint({ ...base, filters: { budget: [0, 40000] } })).result.current).toBeNull();
    expect(renderHook(() => useRaiseHint({ ...base, filters: {} })).result.current).toBeNull();
    expect(flatmateService.feed).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: 'group', rent: 30000, seatsTotal: 2 }, 15000, 15000],
    [{ kind: 'room', budget: 12200, priceBasis: 'person' }, 12200, 13000],
    [{ kind: 'seeker', budget: 18000 }, 18000, 18000],
  ])('suggests a wider budget from %j', async (row, price, budget) => {
    flatmateService.feed.mockResolvedValue({ items: [row] });
    const { result } = renderHook(() => useRaiseHint(base));
    await waitFor(() => expect(result.current).toEqual({ price, budget }));
    expect(flatmateService.feed.mock.calls[0][1]).toMatchObject({ budget: undefined, sort: 'budget-low', me: undefined });
  });

  it('clears the hint when nothing cheaper is above the ceiling or the call fails', async () => {
    flatmateService.feed.mockResolvedValue({ items: [{ kind: 'seeker', budget: 5000 }] });
    const { result } = renderHook(() => useRaiseHint(base));
    await waitFor(() => expect(flatmateService.feed).toHaveBeenCalled());
    expect(result.current).toBeNull();
    flatmateService.feed.mockResolvedValue({ items: [] });
    const empty = renderHook(() => useRaiseHint({ ...base, query: { q: 'b' } }));
    await waitFor(() => expect(flatmateService.feed).toHaveBeenCalledTimes(2));
    expect(empty.result.current).toBeNull();
    flatmateService.feed.mockRejectedValue(new Error('x'));
    const failing = renderHook(() => useRaiseHint({ ...base, query: { q: 'c' } }));
    await waitFor(() => expect(flatmateService.feed).toHaveBeenCalledTimes(3));
    expect(failing.result.current).toBeNull();
  });
});

describe('living style', () => {
  it('helps with questions', () => {
    expect(Q.splitEmoji('Neat \u2728')).toEqual({ emoji: '\u2728', text: 'Neat' });
    expect(Q.splitEmoji('Plain')).toEqual({ emoji: '', text: 'Plain' });
    expect(Q.answeredCount({ tidy: 0, food: 2, sleep: 'x' })).toBe(2);
    expect(Q.answeredCount(null)).toBe(0);
    expect(Q.matchTier(80)).toBe('great');
    expect(Q.matchTier(50)).toBe('good');
    expect(Q.matchTier(10)).toBe('low');
    expect(Q.vibeCellCx(true)).toContain('text-teal-300');
    expect(Q.vibeCellCx(false)).toContain('text-gray-300');
    expect(Object.keys(Q.STYLE_ICONS)).toEqual(Q.STYLE_KEYS);
  });

  it('loads, saves and rolls back answers', async () => {
    authUser = { mobile: '9100000001' };
    flatmateService.myLivingStyle.mockResolvedValue({ answers: { tidy: 1 } });
    const { result, rerender } = renderHook(() => useLivingStyle());
    expect(result.current.signedIn).toBe(true);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ answers: { tidy: 1 }, count: 1, version: 0 });

    flatmateService.saveMyLivingStyle.mockResolvedValue();
    await act(() => result.current.save({ tidy: 2, food: 0 }));
    expect(result.current.answers).toEqual({ tidy: 2, food: 0 });
    await waitFor(() => expect(result.current.version).toBe(1));

    const failing = { tidy: 0 };
    flatmateService.saveMyLivingStyle.mockRejectedValue(new Error('save failed'));
    await act(async () => { await expect(result.current.save(failing)).rejects.toThrow('save failed'); });
    expect(result.current.answers).toEqual({ tidy: 2, food: 0 });

    flatmateService.myLivingStyle.mockResolvedValue({ answers: { quiet: 1 } });
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.answers).toEqual({ quiet: 1 }));

    authUser = null;
    rerender();
    expect(result.current.signedIn).toBe(false);
    await expect(result.current.save({})).rejects.toThrow('not_ready');
    expect(result.current.status).toBe('idle');
  });

  it('reports a load error', async () => {
    authUser = { mobile: '9100000002' };
    flatmateService.myLivingStyle.mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useLivingStyle());
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});

describe('static flatmate data', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exposes copy and amenity tables', () => {
    expect(SHARE_OPENER).toEqual({ solo: expect.any(String), bring: expect.any(String), match: expect.any(String) });
    expect(SEEKER_OPENER).toBeTruthy();
    expect(GROUP_OPENER).toBeTruthy();
    expect(ROOM_AMENITIES.every(([key, icon]) => key && icon)).toBe(true);
    expect(ROOM_PARKING).toEqual(['bike', 'car']);
    expect(Object.keys(consts).length).toBeGreaterThan(0);
  });
});
