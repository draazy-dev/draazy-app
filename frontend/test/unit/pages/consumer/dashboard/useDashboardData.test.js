import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

afterEach(cleanup);

const navigate = vi.fn();
let savedSearches = [];

vi.mock('react-router', () => ({ useNavigate: () => navigate }));
vi.mock('../../../../../src/context/SavedSearchContext.jsx', () => ({ useSavedSearches: () => ({ searches: savedSearches }) }));
vi.mock('../../../../../src/services/meDashboardService.js', () => ({ primeMeDashboard: vi.fn() }));
vi.mock('../../../../../src/services/propertyService.js', () => ({ listPropertiesByIds: vi.fn(), searchListings: vi.fn() }));
vi.mock('../../../../../src/services/visitService.js', () => ({
  listVisits: vi.fn(), myVisitRequests: vi.fn(), rescheduleVisit: vi.fn(), updateVisitStatus: vi.fn(),
}));
vi.mock('../../../../../src/services/contactService.js', () => ({ myContactRequests: vi.fn() }));
vi.mock('../../../../../src/services/documentService.js', () => ({ listDocRequests: vi.fn() }));
vi.mock('../../../../../src/services/flatmateService.js', () => ({
  listMyGroupApplications: vi.fn(), myRequests: vi.fn(), listMyFlatmateCases: vi.fn(),
}));
vi.mock('../../../../../src/services/photoRequestService.js', () => ({ myPhotoRequests: vi.fn() }));
vi.mock('../../../../../src/services/dealService.js', () => ({ offersOnMine: vi.fn() }));
vi.mock('../../../../../src/services/serviceRequestService.js', () => ({ listServiceRequests: vi.fn() }));
vi.mock('../../../../../src/services/propertyReviewService.js', () => ({ listMyPropertyReviews: vi.fn() }));
vi.mock('../../../../../src/lib/localPrefs.js', () => ({ getRecentProps: vi.fn() }));
vi.mock('../../../../../src/lib/data/myListings.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadMyListings: vi.fn(),
}));
vi.mock('../../../../../src/pages/consumer/listings/alertCriteria.js', () => ({ searchHref: (s) => `/search/${s.id}` }));

import { primeMeDashboard } from '../../../../../src/services/meDashboardService.js';
import { listPropertiesByIds, searchListings } from '../../../../../src/services/propertyService.js';
import { listVisits, myVisitRequests, rescheduleVisit, updateVisitStatus } from '../../../../../src/services/visitService.js';
import { myContactRequests } from '../../../../../src/services/contactService.js';
import { listDocRequests } from '../../../../../src/services/documentService.js';
import { listMyFlatmateCases, listMyGroupApplications, myRequests } from '../../../../../src/services/flatmateService.js';
import { myPhotoRequests } from '../../../../../src/services/photoRequestService.js';
import { offersOnMine } from '../../../../../src/services/dealService.js';
import { listServiceRequests } from '../../../../../src/services/serviceRequestService.js';
import { listMyPropertyReviews } from '../../../../../src/services/propertyReviewService.js';
import { getRecentProps } from '../../../../../src/lib/localPrefs.js';
import { loadMyListings } from '../../../../../src/lib/data/myListings.js';
import { useDashboardData } from '../../../../../src/pages/consumer/dashboard/useDashboardData.js';

const user = { mobile: '9999999999', name: 'Asha' };
const toast = vi.fn();

function setup({ listings = [], mine = [], onMine = [] } = {}) {
  loadMyListings.mockResolvedValue(listings);
  listVisits.mockResolvedValue(mine);
  myVisitRequests.mockResolvedValue(onMine);
  myRequests.mockResolvedValue([]);
  listServiceRequests.mockResolvedValue([]);
  listDocRequests.mockResolvedValue([]);
  myContactRequests.mockResolvedValue({ items: [] });
  listMyGroupApplications.mockResolvedValue({ items: [] });
  myPhotoRequests.mockResolvedValue({ items: [] });
  offersOnMine.mockResolvedValue([]);
  listMyPropertyReviews.mockResolvedValue({ items: [] });
  listMyFlatmateCases.mockResolvedValue([]);
  getRecentProps.mockReturnValue([]);
  listPropertiesByIds.mockResolvedValue([]);
  searchListings.mockResolvedValue({ items: [] });
}

const render = (props = {}) => renderHook((p) => useDashboardData(p), { initialProps: { user, toast, ownsProperty: true, ...props } });

beforeEach(() => {
  vi.clearAllMocks();
  savedSearches = [];
  setup();
});

describe('useDashboardData loading', () => {
  it('loads listings and merges visits, tagging hosted ones and sorting newest first', async () => {
    setup({
      listings: [{ id: 'a', uuid: 'ua' }],
      mine: [{ id: 1, createdAt: 10 }],
      onMine: [{ id: 2, createdAt: 20, listing: 'Flat' }, { id: 1, createdAt: 10 }],
    });
    const { result } = render();
    await waitFor(() => expect(result.current.listingsLoaded).toBe(true));
    expect(result.current.listings).toEqual([{ id: 'a', uuid: 'ua' }]);
    expect(result.current.visits.map((v) => v.id)).toEqual([2, 1]);
    expect(result.current.visits[0]).toMatchObject({ hostedByMe: true, listing: 'Flat', ownerMobile: '' });
    expect(result.current.visits[1].hostedByMe).toBe(true);
    expect(result.current.dataStatus).toBe('ready');
  });

  it('maps contact and photo requests to lead rows for owners', async () => {
    myContactRequests.mockResolvedValue({
      items: [{ id: 1, propertySlug: 'slug', requester: { name: 'Ravi', verified: true }, contact: { mobile: '98' }, status: 'pending', createdAt: '2026-01-01T00:00:00Z' }],
    });
    myPhotoRequests.mockResolvedValue({ items: [{ id: 2, propertyId: 'p2', propertyTitle: 'T', requester: { mobile: '97' } }] });
    const { result } = render();
    await waitFor(() => expect(result.current.contactReqs).toHaveLength(1));
    expect(result.current.contactReqs[0]).toEqual({
      id: 1, propId: 'slug', buyerName: 'Ravi', buyerMobile: '98', verified: true, status: 'pending', requestedAt: Date.parse('2026-01-01T00:00:00Z'),
    });
    await waitFor(() => expect(result.current.photoReqs).toHaveLength(1));
    expect(result.current.photoReqs[0]).toEqual({
      id: 2, propId: 'p2', propLabel: 'T', buyerName: 'A buyer', buyerMobile: '97', status: 'pending', requestedAt: 0,
    });
    expect(listDocRequests).toHaveBeenCalledWith('9999999999');
  });

  it('skips owner-only reads when the user owns no property', async () => {
    const { result } = render({ ownsProperty: false });
    await waitFor(() => expect(result.current.listingsLoaded).toBe(true));
    expect(myContactRequests).not.toHaveBeenCalled();
    expect(offersOnMine).not.toHaveBeenCalled();
    expect(listMyPropertyReviews).not.toHaveBeenCalled();
    expect(myRequests).toHaveBeenCalled();
  });

  it('reads owner data when non-flatmate listings exist even if ownsProperty is false', async () => {
    setup({ listings: [{ id: 'a' }] });
    const { result } = render({ ownsProperty: false });
    await waitFor(() => expect(myContactRequests).toHaveBeenCalled());
    expect(result.current.listings).toHaveLength(1);
  });

  it('does not read anything without a mobile', async () => {
    const noMobile = { name: 'x' };
    renderHook(() => useDashboardData({ user: noMobile, toast, ownsProperty: true }));
    await waitFor(() => expect(loadMyListings).toHaveBeenCalled());
    expect(myRequests).not.toHaveBeenCalled();
    expect(listServiceRequests).not.toHaveBeenCalled();
  });
});

describe('useDashboardData feed', () => {
  it('shows recent properties when present', async () => {
    getRecentProps.mockReturnValue(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    listPropertiesByIds.mockResolvedValue([{ id: 'a' }]);
    const { result } = render({ ownsProperty: false });
    await waitFor(() => expect(result.current.recent).toEqual([{ id: 'a' }]));
    expect(listPropertiesByIds).toHaveBeenCalledWith(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(searchListings).not.toHaveBeenCalled();
    expect(result.current.recommended).toEqual([]);
  });

  it('falls back to newest listings for non-owners with no history', async () => {
    searchListings.mockResolvedValue({ items: [{ id: 'n1' }] });
    const { result } = render({ ownsProperty: false });
    await waitFor(() => expect(result.current.recommended).toEqual([{ id: 'n1' }]));
    expect(searchListings).toHaveBeenCalledWith({ sort: 'createdAt,desc' }, expect.objectContaining({ size: 6 }));
  });

  it('does not recommend to owners and survives a feed failure', async () => {
    const { result } = render({ ownsProperty: true });
    await waitFor(() => expect(listPropertiesByIds).toHaveBeenCalled());
    expect(searchListings).not.toHaveBeenCalled();
    expect(result.current.recommended).toEqual([]);
    listPropertiesByIds.mockRejectedValue(new Error('x'));
    const failing = render({ ownsProperty: false });
    await waitFor(() => expect(listPropertiesByIds).toHaveBeenCalledTimes(2));
    expect(failing.result.current.recent).toEqual([]);
  });

  it('does not load a feed while ownsProperty is unknown', async () => {
    renderHook(() => useDashboardData({ user, toast, ownsProperty: undefined }));
    await waitFor(() => expect(loadMyListings).toHaveBeenCalled());
    expect(listPropertiesByIds).not.toHaveBeenCalled();
  });
});

describe('useDashboardData alert matches', () => {
  it('keeps up to three active searches with matches', async () => {
    savedSearches = [
      { id: 1, label: 'A', matchCount: 2 },
      { id: 2, alerts: false, matchCount: 5 },
      { id: 3, matchCount: 0, unreadCount: 4 },
      { id: 4, matchCount: 0 },
      { id: 5, matchCount: 1, newCount: 1 },
      { id: 6, matchCount: 9 },
    ];
    const { result } = render();
    await waitFor(() => expect(result.current.alertMatches).toHaveLength(3));
    expect(result.current.alertMatches).toEqual([
      { id: 1, label: 'A', count: 2, newCount: undefined, href: '/search/1' },
      { id: 3, label: 'your saved search', count: 0, newCount: 4, href: '/search/3' },
      { id: 5, label: 'your saved search', count: 1, newCount: 1, href: '/search/5' },
    ]);
  });
});

describe('useDashboardData visits', () => {
  const seeded = () => setup({ mine: [{ id: 1, status: 'scheduled', createdAt: 5 }] });

  it('optimistically updates a status, then refreshes visits', async () => {
    seeded();
    updateVisitStatus.mockResolvedValue({});
    const { result } = render();
    await waitFor(() => expect(result.current.visits).toHaveLength(1));
    listVisits.mockResolvedValue([{ id: 1, status: 'confirmed', createdAt: 5 }]);
    let ok;
    await act(async () => { ok = await result.current.mutateVisit(1, { status: 'confirmed' }); });
    expect(ok).toBe(true);
    expect(updateVisitStatus).toHaveBeenCalledWith(1, 'confirmed');
    await waitFor(() => expect(result.current.visits[0].status).toBe('confirmed'));
    expect(result.current.busyIds.has('visit:1')).toBe(false);
    expect(toast).not.toHaveBeenCalled();
  });

  it('reschedules when a new time is given', async () => {
    seeded();
    rescheduleVisit.mockResolvedValue({});
    const { result } = render();
    await waitFor(() => expect(result.current.visits).toHaveLength(1));
    await act(async () => { await result.current.mutateVisit(1, { when: '2026-07-01' }); });
    expect(rescheduleVisit).toHaveBeenCalledWith(1, '2026-07-01');
    expect(updateVisitStatus).not.toHaveBeenCalled();
  });

  it('rolls back and toasts when the write fails', async () => {
    seeded();
    updateVisitStatus.mockRejectedValue(new Error('x'));
    const { result } = render();
    await waitFor(() => expect(result.current.visits).toHaveLength(1));
    let ok;
    await act(async () => { ok = await result.current.mutateVisit(1, { status: 'cancelled' }); });
    expect(ok).toBe(false);
    expect(result.current.visits[0].status).toBe('scheduled');
    expect(toast).toHaveBeenCalledWith('Could not update that visit. Please try again.', 'error');
    expect(result.current.busyIds.size).toBe(0);
  });

  it('refuses a second write while one is in flight', async () => {
    seeded();
    let release;
    updateVisitStatus.mockReturnValue(new Promise((r) => { release = r; }));
    const { result } = render();
    await waitFor(() => expect(result.current.visits).toHaveLength(1));
    let first;
    act(() => { first = result.current.mutateVisit(1, { status: 'confirmed' }); });
    await waitFor(() => expect(result.current.busyIds.has('visit:1')).toBe(true));
    expect(result.current.mutateVisit(1, { status: 'cancelled' })).toBe(false);
    expect(updateVisitStatus).toHaveBeenCalledTimes(1);
    await act(async () => { release({}); await first; });
  });
});

describe('useDashboardData openReview', () => {
  it('routes a property to its support thread by uuid', async () => {
    setup({ listings: [{ id: 'slug', uuid: 'uuid-1' }] });
    const { result } = render();
    await waitFor(() => expect(result.current.listings).toHaveLength(1));
    result.current.openReview('slug', { replace: true });
    expect(navigate).toHaveBeenCalledWith('/messages?support=property%3Auuid-1', { replace: true });
    result.current.openReview('unknown');
    expect(navigate).toHaveBeenLastCalledWith('/messages?support=property%3Aunknown', undefined);
  });

  it('routes flatmate case keys', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.listingsLoaded).toBe(true));
    result.current.openReview('fm:room:42');
    expect(navigate).toHaveBeenCalledWith('/messages?support=flatmate_room%3A42', undefined);
  });
});

describe('useDashboardData reviews', () => {
  it('indexes property reviews by id and slug, and flatmate cases by case key', async () => {
    setup({ listings: [{ id: 'slug', uuid: 'uuid-1' }, { id: 'fmx', flatmate: true }] });
    listMyPropertyReviews.mockResolvedValue({ items: [{ propertyId: 'uuid-1', unread: 1 }] });
    listMyFlatmateCases.mockResolvedValue([{ kind: 'room', id: 7, unread: 2 }]);
    const { result } = render();
    await waitFor(() => expect(result.current.reviewsByProp.size).toBe(3));
    const map = result.current.reviewsByProp;
    expect(map.get('uuid-1')).toBe(map.get('slug'));
    expect(map.get('fm:room:7')).toEqual({ kind: 'room', id: 7, unread: 2 });
  });

  it('clears review rows when the reads fail', async () => {
    setup({ listings: [{ id: 'fmx', flatmate: true }] });
    listMyPropertyReviews.mockRejectedValue(new Error('x'));
    listMyFlatmateCases.mockRejectedValue(new Error('x'));
    const { result } = render();
    await waitFor(() => expect(listMyFlatmateCases).toHaveBeenCalled());
    expect(result.current.reviewsByProp.size).toBe(0);
  });
});

describe('useDashboardData refresh', () => {
  it('refreshRequests primes the dashboard read and refetches', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.listingsLoaded).toBe(true));
    const before = loadMyListings.mock.calls.length;
    await act(async () => { result.current.refreshRequests(); });
    expect(primeMeDashboard).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(loadMyListings.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() => expect(offersOnMine.mock.calls.length).toBeGreaterThan(1));
  });

  it('refreshes at most once per 30s when the tab becomes visible', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    const { result } = render();
    await waitFor(() => expect(result.current.listingsLoaded).toBe(true));
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(primeMeDashboard).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1_010_000);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(primeMeDashboard).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1_040_000);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(primeMeDashboard).toHaveBeenCalledTimes(2);
  });

  it('ignores visibility changes while hidden', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { result } = render();
    await waitFor(() => expect(result.current.listingsLoaded).toBe(true));
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(primeMeDashboard).not.toHaveBeenCalled();
  });
});
