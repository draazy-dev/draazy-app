import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';

const h = vi.hoisted(() => ({
  isIn: true,
  toast: vi.fn(),
  gate: vi.fn(),
  follows: { toggle: vi.fn(), has: vi.fn(() => false) },
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
vi.mock('../../../../../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ isIn: h.isIn }) }));
vi.mock('../../../../../src/context/FollowContext.jsx', () => ({ useFollows: () => h.follows }));
vi.mock('../../../../../src/context/ToastContext.jsx', () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock('../../../../../src/lib/useScrollReveal.js', () => ({ useScrollReveal: () => ({ current: null }) }));
vi.mock('../../../../../src/lib/useSignInGate.js', async (orig) => ({ ...(await orig()), useSignInGate: () => h.gate }));
vi.mock('../../../../../src/pages/consumer/property/locationIntel.js', () => ({ commuteInfo: vi.fn(() => ({ mins: 12 })) }));
vi.mock('../../../../../src/services/societyService.js', () => ({ getSociety: vi.fn() }));
vi.mock('../../../../../src/services/reviewService.js', () => ({
  createEntityReview: vi.fn(),
  deleteReview: vi.fn(),
  getEntityReviewSummary: vi.fn(),
  listEntityReviews: vi.fn(),
  reviewRefusal: vi.fn(),
  updateReview: vi.fn(),
}));

import * as rs from '../../../../../src/services/reviewService.js';
import { getSociety } from '../../../../../src/services/societyService.js';
import { useSocietyHub } from '../../../../../src/pages/consumer/society/useSocietyHub.js';

const SOCIETY = {
  slug: 'sky-heights', name: 'Sky Heights', localitySlug: 'baner', lat: 18.5, lng: 73.8, placeId: 'pid 1',
  units: 1200, towers: 4, year: 2015, occupancy: 90, water: 'Borewell', power: 'Backup', parkingRatio: 1.5, lifts: 8,
  security: '24x7', maintenancePerSqft: 3, petPolicy: 'Allowed', vegPolicy: '', psf: 9000, rentAvg: 30000, forSale: 3, forRent: 2,
  homes: [{ id: 'h1' }], listingCount: 7,
};
const SUMMARY = { avg: 4.26, count: 5, catAvg: { Safety: 4.5, Maintenance: NaN, Management: 3 } };
const REVIEWS = { items: [{ id: 'r1', rating: 4, text: 'good', categories: { Safety: 5 }, mine: true }, { id: 'r2', mine: false }] };

function mount(url = '/society/Sky-Heights') {
  const wrapper = ({ children }) => React.createElement(MemoryRouter, { initialEntries: [url] },
    React.createElement(Routes, null, React.createElement(Route, { path: '/society/:slug', element: children })));
  const view = renderHook(() => ({ hub: useSocietyHub(), loc: useLocation() }), { wrapper });
  return { view, hub: () => view.result.current.hub, loc: () => view.result.current.loc };
}

beforeEach(() => {
  h.isIn = true;
  h.toast.mockReset();
  h.gate.mockReset();
  h.follows.toggle.mockReset();
  h.follows.has.mockReset().mockReturnValue(false);
  getSociety.mockReset().mockResolvedValue(SOCIETY);
  Object.values(rs).forEach((fn) => fn.mockReset());
  rs.listEntityReviews.mockResolvedValue(REVIEWS);
  rs.getEntityReviewSummary.mockResolvedValue(SUMMARY);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(cleanup);

const loaded = async (t) => {
  await waitFor(() => expect(t.hub().socLoading).toBe(false));
  await waitFor(() => expect(t.hub().rating.loading).toBe(false));
};

describe('useSocietyHub loading', () => {
  it('starts from a generic society then resolves the real one', async () => {
    const t = mount('/society/Sky-Heights?name=Fallback&loc=Wakad');
    expect(t.hub().soc).toMatchObject({ _generic: true, slug: 'sky-heights', name: 'Fallback', _locName: 'Wakad' });
    expect(t.hub().socLoading).toBe(true);
    await loaded(t);
    expect(getSociety).toHaveBeenCalledWith('sky-heights');
    expect(t.hub().soc).toMatchObject({ name: 'Sky Heights', _thin: false });
    expect(t.hub().locName).toBe('Baner');
  });

  it('marks sparse societies as thin and keeps the generic one when unknown', async () => {
    getSociety.mockResolvedValue({ slug: 'x', name: 'X', localitySlug: 'aundh' });
    const thin = mount();
    await loaded(thin);
    expect(thin.hub().soc._thin).toBe(true);
    cleanup();
    getSociety.mockResolvedValue(null);
    const unknown = mount();
    await loaded(unknown);
    expect(unknown.hub().soc._generic).toBe(true);
    expect(unknown.hub().locName).toBe('Pune');
  });

  it('reports a load failure and retries', async () => {
    getSociety.mockRejectedValueOnce(new Error('x'));
    const t = mount();
    await waitFor(() => expect(t.hub().loadError).toBeTruthy());
    act(() => t.hub().retryLoad());
    await waitFor(() => expect(t.hub().loadError).toBeNull());
    await loaded(t);
    expect(getSociety).toHaveBeenCalledTimes(2);
  });
});

describe('useSocietyHub derived data', () => {
  it('derives rating, bars, stats, living facts and location', async () => {
    const t = mount();
    await loaded(t);
    expect(t.hub().rating).toEqual({ avg: 4.26, count: 5, loading: false, failed: false });
    expect(t.hub().overall).toBe(4.3);
    expect(t.hub().bars).toEqual([
      { id: 'Safety', labelKey: 'society.catSafety', value: 4.5 },
      { id: 'Management', labelKey: 'society.catManagement', value: 3 },
    ]);
    expect(t.hub().stats.map((s) => s[1])).toEqual(['society.statUnits', 'society.statTowers', 'society.statBuilt', 'society.statOccupancy']);
    expect(t.hub().stats[2][2].args).toMatchObject({ year: 2015 });
    expect(t.hub().stats[3][2]).toBe('90%');
    expect(t.hub().living.map((l) => l[1])).not.toContain('society.livingFood');
    expect(t.hub().living).toHaveLength(7);
    expect(t.hub().priceStats).toEqual({ psf: 9000, rentAvg: 30000, forSale: 3, forRent: 2 });
    expect(t.hub().hasCoords).toBe(true);
    expect(t.hub().dirUrl).toBe('https://www.google.com/maps/dir/?api=1&destination=18.5,73.8&destination_place_id=pid%201');
    expect(t.hub().commute).toEqual({ mins: 12 });
    expect(t.hub().listings).toEqual([{ id: 'h1' }]);
    expect(t.hub().hero).toMatch(/^https:/);
    expect(t.hub().myReview.id).toBe('r1');
    expect(t.hub().followed).toBe(false);
  });

  it('has no overall rating, directions or stats for an empty society', async () => {
    getSociety.mockResolvedValue({ slug: 'sky-heights', name: 'Bare', localitySlug: 'x' });
    rs.getEntityReviewSummary.mockResolvedValue({ avg: null, count: 0 });
    rs.listEntityReviews.mockRejectedValue(new Error('x'));
    const t = mount();
    await loaded(t);
    expect(t.hub()).toMatchObject({ overall: null, dirUrl: null, hasCoords: false, stats: [], living: [], reviews: [] });
    expect(t.hub().tabs.map((x) => x.id)).toEqual(['overview', 'location']);
  });

  it('marks the rating failed when the summary cannot load', async () => {
    rs.getEntityReviewSummary.mockRejectedValue(new Error('x'));
    const t = mount();
    await waitFor(() => expect(t.hub().rating.failed).toBe(true));
    expect(t.hub().rating.loading).toBe(false);
  });

  it('reads reviews with the visitor window while signed out', async () => {
    h.isIn = false;
    const t = mount();
    await loaded(t);
    expect(rs.listEntityReviews).toHaveBeenCalledWith('society', 'sky-heights', { size: 5 });
  });

  it('shows the review and location tabs once there are enough reviews', async () => {
    const t = mount('/society/sky-heights?tab=reviews');
    await loaded(t);
    expect(t.hub().tabs.map((x) => x.id)).toEqual(['overview', 'homes', 'reviews', 'location']);
    expect(t.hub().tabs.find((x) => x.id === 'homes').count).toBe(7);
    expect(t.hub().current).toBe('reviews');
  });

  it('falls back to the overview for an unavailable tab and syncs the URL on select', async () => {
    const t = mount('/society/sky-heights?tab=bogus');
    await loaded(t);
    expect(t.hub().current).toBe('overview');
    act(() => t.hub().selectTab('homes'));
    expect(t.loc().search).toBe('?tab=homes');
    act(() => t.hub().selectTab('overview'));
    expect(t.loc().search).toBe('');
  });
});

describe('useSocietyHub follow', () => {
  it('toggles the follow for signed-in users', async () => {
    h.follows.toggle.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const t = mount();
    await loaded(t);
    await act(async () => { await t.hub().onFollow(); });
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.stringContaining('Following Sky Heights'), 'success'));
    await act(async () => { await t.hub().onFollow(); });
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Unfollowed', 'info'));
  });

  it('asks guests to sign in and ignores generic societies', async () => {
    h.isIn = false;
    const t = mount();
    await loaded(t);
    await act(async () => { await t.hub().onFollow(); });
    expect(h.gate).toHaveBeenCalledWith('society', undefined, expect.any(Function));
    expect(h.follows.toggle).not.toHaveBeenCalled();
    cleanup();
    h.isIn = true;
    getSociety.mockResolvedValue(null);
    const generic = mount();
    await loaded(generic);
    await act(async () => { await generic.hub().onFollow(); });
    expect(h.follows.toggle).not.toHaveBeenCalled();
  });
});

describe('useSocietyHub reviews', () => {
  it('opens the composer prefilled from the existing review and closes it', async () => {
    const t = mount();
    await loaded(t);
    await waitFor(() => expect(t.hub().myReview).toBeTruthy());
    act(() => t.hub().toggleComposer());
    expect(t.hub()).toMatchObject({ rateOpen: true, pick: 4, revText: 'good', cats: { Safety: 5 } });
    act(() => t.hub().setCat('Safety', 2));
    expect(t.hub().cats.Safety).toBe(2);
    act(() => t.hub().toggleComposer());
    expect(t.hub()).toMatchObject({ rateOpen: false, pick: 5, revText: '', cats: {} });
  });

  it('posts a new review and reloads', async () => {
    rs.listEntityReviews.mockResolvedValue({ items: [] });
    rs.createEntityReview.mockResolvedValue({ id: 'new' });
    const t = mount();
    await loaded(t);
    act(() => { t.hub().openComposer(); t.hub().setPick(3); t.hub().setRevText('  fine  '); });
    await act(async () => { t.hub().submitReview({}); });
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Thanks for reviewing this society!', 'success'));
    expect(rs.createEntityReview).toHaveBeenCalledWith('society', 'sky-heights', { rating: 3, text: 'fine', categories: {} });
    expect(t.hub().rateOpen).toBe(false);
  });

  it('updates an existing review', async () => {
    rs.updateReview.mockResolvedValue({ id: 'r1' });
    const t = mount();
    await loaded(t);
    await waitFor(() => expect(t.hub().myReview).toBeTruthy());
    await act(async () => { t.hub().submitReview({}); });
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('common.reviewUpdated', 'success'));
    expect(rs.updateReview).toHaveBeenCalledWith('r1', expect.objectContaining({ rating: 5 }));
  });

  it('stays quiet when the review call asks for a login', async () => {
    rs.listEntityReviews.mockResolvedValue({ items: [] });
    rs.createEntityReview.mockResolvedValue('login');
    const t = mount();
    await loaded(t);
    await act(async () => { t.hub().submitReview({}); });
    await waitFor(() => expect(rs.createEntityReview).toHaveBeenCalled());
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('shows a refusal or generic error when posting fails', async () => {
    rs.listEntityReviews.mockResolvedValue({ items: [] });
    rs.createEntityReview.mockRejectedValue(new Error('x'));
    rs.reviewRefusal.mockReturnValueOnce('Not allowed').mockReturnValue(null);
    const t = mount();
    await loaded(t);
    await act(async () => { t.hub().submitReview({}); });
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Not allowed', 'error'));
    await act(async () => { t.hub().submitReview({}); });
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Your review could not be posted. Please try again.', 'error'));
  });

  it('gates guests and generic societies from posting', async () => {
    h.isIn = false;
    const t = mount();
    await loaded(t);
    act(() => t.hub().submitReview({}));
    expect(h.gate).toHaveBeenCalled();
    expect(rs.createEntityReview).not.toHaveBeenCalled();
  });

  it('deletes the review after confirmation', async () => {
    rs.deleteReview.mockResolvedValue({});
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    const t = mount();
    await loaded(t);
    await waitFor(() => expect(t.hub().myReview).toBeTruthy());
    act(() => t.hub().deleteMine());
    expect(rs.deleteReview).not.toHaveBeenCalled();
    await act(async () => { t.hub().deleteMine(); });
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('common.reviewDeleted', 'success'));
    expect(confirm).toHaveBeenCalledTimes(2);
    rs.deleteReview.mockRejectedValue(new Error('x'));
    await act(async () => { t.hub().deleteMine(); });
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('common.reviewDeleteFailed', 'error'));
  });

  it('opens and closes the report dialog behind login', async () => {
    const t = mount();
    await loaded(t);
    act(() => t.hub().openReport({ id: 'r2' }));
    expect(t.hub().reportFor).toEqual({ id: 'r2' });
    act(() => t.hub().closeReport());
    expect(t.hub().reportFor).toBeNull();
    cleanup();
    h.isIn = false;
    const guest = mount();
    await loaded(guest);
    act(() => guest.hub().openReport({ id: 'r2' }));
    expect(guest.hub().reportFor).toBeNull();
    expect(h.gate).toHaveBeenCalledWith('society', undefined, expect.any(Function));
  });
});
