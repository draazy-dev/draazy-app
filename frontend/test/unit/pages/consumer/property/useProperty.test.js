import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({
  id: 'flat-in-baner-abc123',
  routeState: null,
  params: new URLSearchParams(),
  setParams: vi.fn(),
  auth: { isIn: false, user: null, loading: false },
  flags: {},
  toast: vi.fn(),
  sendToSignIn: vi.fn(),
  gate: { gate: { status: 'none' }, loading: false, refresh: vi.fn() },
  visits: { visits: null, refresh: vi.fn() },
}));

vi.mock('react-router', () => ({
  useParams: () => ({ id: h.id }),
  useLocation: () => ({ state: h.routeState }),
  useSearchParams: () => [h.params, h.setParams],
}));
vi.mock('react-i18next', () => {
  const t = (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key);
  return { useTranslation: () => ({ t }) };
});
vi.mock('../../../../../src/lib/useScrollReveal.js', () => ({ useScrollReveal: () => ({ current: null }) }));
vi.mock('../../../../../src/services/demandService.js', () => ({ recordSignal: vi.fn() }));
vi.mock('../../../../../src/services/propertyService.js', () => ({ getProperty: vi.fn() }));
vi.mock('../../../../../src/lib/pmf.js', () => ({ track: vi.fn() }));
vi.mock('../../../../../src/lib/referralShare.js', () => ({ referralShareUrlNow: (u) => `ref:${u}` }));
vi.mock('../../../../../src/lib/usePrefetchReferralCode.js', () => ({ usePrefetchReferralCode: vi.fn() }));
vi.mock('../../../../../src/context/AuthContext.jsx', () => ({ useAuth: () => h.auth }));
vi.mock('../../../../../src/context/ToastContext.jsx', () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock('../../../../../src/context/AppFlagsContext.jsx', () => ({ useAppFlags: () => ({ flagEnabled: (k) => Boolean(h.flags[k]) }) }));
vi.mock('../../../../../src/pages/consumer/property/useContactGate.js', () => ({ useContactGate: () => h.gate }));
vi.mock('../../../../../src/pages/consumer/property/useMyVisits.js', () => ({ useMyVisits: () => h.visits }));
vi.mock('../../../../../src/services/photoRequestService.js', () => ({ requestPhotos: vi.fn() }));
vi.mock('../../../../../src/lib/localPrefs.js', () => ({ pushRecentProp: vi.fn(), getLastSearch: vi.fn() }));
vi.mock('../../../../../src/lib/useSignInGate.js', () => ({ replay: (e) => e?.again, useSignInGate: () => h.sendToSignIn }));
vi.mock('../../../../../src/lib/auth.js', () => ({ isInternal: (u) => Boolean(u?.internal) }));

import { getProperty } from '../../../../../src/services/propertyService.js';
import { recordSignal } from '../../../../../src/services/demandService.js';
import { requestPhotos } from '../../../../../src/services/photoRequestService.js';
import { pushRecentProp, getLastSearch } from '../../../../../src/lib/localPrefs.js';
import { track } from '../../../../../src/lib/pmf.js';
import { ApiError } from '../../../../../src/services/http.js';
import useProperty from '../../../../../src/pages/consumer/property/useProperty.js';

afterEach(cleanup);

const flat = (extra = {}) => ({
  id: 'abc123',
  uuid: 'uuid-1',
  status: 'approved',
  deal: 'buy',
  type: 'Flat',
  bhkNum: 2,
  locality: 'Baner',
  localitySlug: 'baner',
  price: 5000000,
  area: 1000,
  areaUnit: 'sqft',
  bath: 2,
  furnishing: 'semi',
  parkingSpaces: 1,
  construction: 'ready',
  amenities: ['gym', 'security', 'power', 'unknown-amenity'],
  gallery: ['a.jpg', '', 'b.jpg'],
  image: 'cover.jpg',
  facing: 'East',
  reraId: 'P123',
  ownerVerified: true,
  ownershipVerified: true,
  ownerMobile: '9000000001',
  ...extra,
});

async function load(property, { auth } = {}) {
  if (auth) h.auth = { isIn: false, user: null, loading: false, ...auth };
  getProperty.mockResolvedValue(property);
  const view = renderHook(() => useProperty());
  await waitFor(() => expect(view.result.current.loading).toBeUndefined());
  return view;
}

beforeEach(() => {
  h.id = 'flat-in-baner-abc123';
  h.routeState = null;
  h.params = new URLSearchParams();
  h.auth = { isIn: false, user: null, loading: false };
  h.flags = {};
  h.toast.mockReset();
  h.sendToSignIn.mockReset();
  h.setParams.mockReset();
  h.gate = { gate: { status: 'none' }, loading: false, refresh: vi.fn().mockResolvedValue({}) };
  h.visits = { visits: null, refresh: vi.fn() };
  getProperty.mockReset();
  recordSignal.mockReset();
  requestPhotos.mockReset();
  pushRecentProp.mockReset();
  track.mockReset();
  getLastSearch.mockReset().mockReturnValue(null);
});

const detail = (view, key) => view.result.current.details.find((d) => d[3] === key);

describe('useProperty status handling', () => {
  it('starts loading and then records the view', async () => {
    getProperty.mockResolvedValue(flat());
    const view = renderHook(() => useProperty());
    expect(view.result.current.loading).toBe(true);
    await waitFor(() => expect(view.result.current.p).toBeTruthy());
    expect(getProperty).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ maxAge: expect.anything() }));
    expect(recordSignal).toHaveBeenCalledWith({ kind: 'view', localitySlug: 'baner', propertyId: 'uuid-1' });
    expect(pushRecentProp).toHaveBeenCalledWith('abc123');
    expect(track).toHaveBeenCalledWith('view_listing', { id: 'abc123', locality: 'Baner', deal: 'buy' });
  });

  it('reports not found', async () => {
    getProperty.mockResolvedValue(null);
    const view = renderHook(() => useProperty());
    await waitFor(() => expect(view.result.current.notFound).toBe(true));
    expect(recordSignal).not.toHaveBeenCalled();
  });

  it('hides listings under review from the public', async () => {
    getProperty.mockResolvedValue(flat({ status: 'pending' }));
    const view = renderHook(() => useProperty());
    await waitFor(() => expect(view.result.current.underReview).toBe(true));
  });

  it('shows paused and closed states', async () => {
    getProperty.mockResolvedValue(flat({ status: 'paused' }));
    const paused = renderHook(() => useProperty());
    await waitFor(() => expect(paused.result.current.listingPaused).toBe(true));
    getProperty.mockResolvedValue(flat({ status: 'rented' }));
    const rented = renderHook(() => useProperty());
    await waitFor(() => expect(rented.result.current.dealClosed).toBe(true));
    expect(rented.result.current.closedWord).toBe('property.rentedOutWord');
    getProperty.mockResolvedValue(flat({ status: 'sold' }));
    const sold = renderHook(() => useProperty());
    await waitFor(() => expect(sold.result.current.closedWord).toBe('property.soldWord'));
  });

  it('lets owners and admins preview unapproved listings', async () => {
    const owner = await load(flat({ status: 'pending' }), { auth: { isIn: true, user: { mobile: '9000000001' } } });
    expect(owner.result.current).toMatchObject({ isOwner: true, ownerPreview: true, staffPreview: false });
    cleanup();
    const admin = await load(flat({ status: 'flagged' }), { auth: { isIn: true, user: { mobile: '1', internal: true } } });
    expect(admin.result.current).toMatchObject({ isAdmin: true, ownerPreview: true, staffPreview: true });
  });
});

describe('useProperty derived view', () => {
  it('builds a residential buy view', async () => {
    const view = await load(flat());
    const v = view.result.current;
    expect(v.kind).toBe('residential');
    expect(v.isRent).toBe(false);
    expect(v.title).toBe('2 BHK Flat for Sale in Baner'.replace(/^2 BHK/, v.title.split(' Flat')[0]));
    expect(v.title.endsWith('Flat for Sale in Baner')).toBe(true);
    expect(v.priceStr).toContain('\u20b9');
    expect(v.gallery).toEqual(['a.jpg', 'b.jpg']);
    expect(v.showPerUnit).toBe(true);
    expect(v.perUnitVal).toContain('5,000');
    expect(v.furnishLabel).toBe('property.furnishing.semi');
    expect(v.parkingLabel).toBe('1');
    expect(v.possessionLabel).toBe('property.readyToMove');
    expect(v.baths).toBe(2);
    expect(detail(view, 'keydetail.age')).toBeTruthy();
    expect(v.tags.map((t) => t[3])).toEqual(['tag.verifiedOwner', 'tag.ownershipVerified', 'tag.zeroBrokerage']);
    expect(v.topHighlights.length).toBeLessThanOrEqual(4);
    expect(v.amenPhrase).toContain('Gymnasium');
    expect(v.amenPhrase).toContain('unknown-amenity');
    expect(v.overviewMore.startsWith('property.overviewResidential')).toBe(true);
    expect(v.hasAmenities).toBe(true);
    expect(v.canChat).toBe(false);
    expect(v.ownerMob).toBe('9000000001');
  });

  it('builds a rent view with availability and furnishing highlights', async () => {
    const view = await load(flat({ deal: 'rent', price: 25000, availableFrom: 'now' }));
    const v = view.result.current;
    expect(v.isRent).toBe(true);
    expect(v.priceStr).toMatch(/25,000\/month$/);
    expect(v.showPerUnit).toBe(false);
    expect(detail(view, 'keydetail.available')).toBeTruthy();
    expect(v.highlights.some(([icon]) => icon === 'sofa')).toBe(true);
    expect(v.title).toContain('for Rent');
  });

  it('falls back to dashes for missing values', async () => {
    const view = await load(flat({ furnishing: '', parkingSpaces: 0, construction: undefined, area: 0, bath: undefined, amenities: [], gallery: [] }));
    const v = view.result.current;
    expect(v.furnishLabel).toBe('\u2014');
    expect(v.parkingLabel).toBe('\u2014');
    expect(v.possessionLabel).toBe('\u2014');
    expect(v.areaLabel).toBe('\u2014');
    expect(v.baths).toBeNull();
    expect(v.gallery).toEqual(['cover.jpg']);
    expect(v.amenPhrase).toBe('property.modernAmenities');
  });

  it('uses the pre-completion possession date', async () => {
    const view = await load(flat({ construction: 'under', availableDate: '2099-01-15' }));
    expect(view.result.current.possessionLabel).toContain('property.availableFromDate');
    const nl = await load(flat({ construction: 'new' }));
    expect(nl.result.current.possessionLabel).toBe('property.newLaunch');
    expect(nl.result.current.highlights.some(([icon]) => icon === 'hard-hat')).toBe(true);
  });

  it('builds a land view with specs', async () => {
    const view = await load(flat({
      type: 'Open Plot',
      landUse: 'residential',
      plotLength: 50,
      plotWidth: 40,
      roadWidth: 30,
      openSides: 2,
      waterSource: 'Borewell',
      naSanctioned: true,
      otherRights: 'none',
      buyerEligibility: 'any',
      cornerPlot: true,
      satbara: true,
      plotZone: 'Residential Zone',
    }));
    const v = view.result.current;
    expect(v.kind).toBe('land');
    expect(v.isLand).toBe(true);
    const keys = v.details.map((d) => d[3]);
    expect(keys).toEqual(expect.arrayContaining(['keydetail.plotArea', 'keydetail.plotZone', 'keydetail.facing', 'keydetail.perUnitBuy', 'keydetail.title']));
    expect(v.details.some((d) => d[2] === '50 \u00d7 40 ft')).toBe(true);
    expect(v.details.some((d) => d[2] === 'property.naStatus.sanctioned')).toBe(true);
    expect(v.highlights.some(([, text]) => text.startsWith('property.zoneLabel'))).toBe(true);
    expect(v.highlights.some(([, text]) => text === 'property.clearTitleHl')).toBe(true);
    expect(v.overviewMore.startsWith('property.overviewLand')).toBe(true);
  });

  it('builds a commercial view with type-specific specs', async () => {
    const view = await load(flat({ type: 'Office Space', commercialType: 'office', furnishing: 'furnished' }));
    const v = view.result.current;
    expect(v.kind).toBe('commercial');
    expect(v.details.some((d) => d[3] === 'keydetail.bedrooms')).toBe(false);
    expect(v.overviewMore.startsWith('property.overviewCommercial')).toBe(true);
    const rent = await load(flat({ type: 'Shop', deal: 'rent', price: 40000 }));
    expect(rent.result.current.details.some((d) => d[3] === 'keydetail.available')).toBe(true);
  });

  it('computes the return link from state, last search or a default', async () => {
    h.routeState = { from: '/listings?from=state' };
    expect((await load(flat())).result.current.returnTo).toBe('/listings?from=state');
    cleanup();
    h.routeState = null;
    getLastSearch.mockReturnValue({ search: '/listings?last=1' });
    expect((await load(flat())).result.current.returnTo).toBe('/listings?last=1');
    cleanup();
    getLastSearch.mockReturnValue(null);
    expect((await load(flat())).result.current.returnTo).toBe('/listings?deal=buy&loc=Baner');
  });

  it('shares on WhatsApp', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const view = await load(flat());
    view.result.current.waShare();
    expect(open).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/?text='), '_blank', 'noopener');
    expect(decodeURIComponent(open.mock.calls[0][0])).toContain('ref:');
  });
});

describe('useProperty tabs', () => {
  it('shows amenities for residential listings and hides it for amenity-less commercial ones', async () => {
    const res = await load(flat({ amenities: [] }));
    expect(res.result.current.tabs.map((t) => t.id)).toEqual(['overview', 'amenities', 'location', 'pricing', 'trust']);
    cleanup();
    const comm = await load(flat({ type: 'Shop', amenities: [] }));
    expect(comm.result.current.tabs.map((t) => t.id)).not.toContain('amenities');
    cleanup();
    h.flags = { reviewsEnabled: true };
    const reviews = await load(flat({ type: 'Shop', amenities: [] }));
    expect(reviews.result.current.tabs.map((t) => t.id)).toContain('amenities');
    expect(reviews.result.current.reviewsOn).toBe(true);
  });

  it('reads the tab from the URL and ignores unknown or hidden tabs', async () => {
    h.params = new URLSearchParams('tab=pricing');
    const view = await load(flat());
    expect(view.result.current.activeTab).toBe('pricing');
    expect(view.result.current.current).toBe('pricing');
    cleanup();
    h.params = new URLSearchParams('tab=bogus');
    expect((await load(flat())).result.current.activeTab).toBe('overview');
    cleanup();
    h.params = new URLSearchParams('tab=amenities');
    const hidden = await load(flat({ type: 'Shop', amenities: [] }));
    expect(hidden.result.current.current).toBe('overview');
  });

  it('writes the selected tab to the URL', async () => {
    const view = await load(flat());
    view.result.current.selectTab('trust');
    const [updater, options] = h.setParams.mock.calls[0];
    expect(updater(new URLSearchParams('x=1')).toString()).toBe('x=1&tab=trust');
    expect(options).toEqual({ replace: true });
    view.result.current.selectTab('overview');
    expect(h.setParams.mock.calls[1][0](new URLSearchParams('tab=trust&x=1')).toString()).toBe('x=1');
  });
});

describe('useProperty actions', () => {
  it('sends logged-out users to inline OTP for contact and schedule', async () => {
    const view = await load(flat());
    act(() => view.result.current.handleContact());
    expect(view.result.current.inlineOtpReason).toBe('contact');
    act(() => view.result.current.closeInlineOtp());
    expect(view.result.current.inlineOtpReason).toBeNull();
    act(() => view.result.current.handleSchedule());
    expect(view.result.current.inlineOtpReason).toBe('schedule');
  });

  it('tells users to wait while auth is loading', async () => {
    const view = await load(flat(), { auth: { loading: true } });
    act(() => view.result.current.handleContact());
    expect(h.toast).toHaveBeenCalledWith('auth.gateChecking', 'info');
    expect(view.result.current.inlineOtpReason).toBeNull();
  });

  it('opens contact and visit dialogs for signed-in users', async () => {
    const view = await load(flat(), { auth: { isIn: true, user: { id: 'u1', mobile: '9' } } });
    act(() => view.result.current.handleContact());
    expect(view.result.current.contactOpen).toBe(true);
    act(() => view.result.current.closeContact());
    expect(view.result.current.contactOpen).toBe(false);
    expect(h.gate.refresh).toHaveBeenCalled();
    act(() => view.result.current.handleSchedule());
    expect(view.result.current.visitOpen).toBe(true);
    act(() => view.result.current.closeVisit());
    expect(view.result.current.visitOpen).toBe(false);
    expect(h.visits.refresh).toHaveBeenCalled();
  });

  it('resumes the pending action after inline verification', async () => {
    const view = await load(flat(), { auth: { isIn: false } });
    act(() => view.result.current.handleSchedule());
    h.auth = { isIn: true, user: { id: 'u1', mobile: '9' }, loading: false };
    getProperty.mockResolvedValue(flat());
    act(() => view.result.current.onInlineOtpVerified());
    await waitFor(() => expect(view.result.current.visitOpen).toBe(true));
    expect(view.result.current.inlineOtpReason).toBeNull();
  });

  it('refetches the property when the auth identity changes', async () => {
    const view = await load(flat());
    getProperty.mockClear();
    h.auth = { isIn: true, user: { id: 'u1', mobile: '9' }, loading: false };
    view.rerender();
    await waitFor(() => expect(getProperty).toHaveBeenCalledWith(expect.any(String)));
  });

  it('exposes contact approval and chat flags', async () => {
    h.gate = { ...h.gate, gate: { status: 'approved' } };
    h.flags = { inAppMessaging: true };
    const view = await load(flat());
    expect(view.result.current).toMatchObject({ contactApproved: true, canChat: true, contactStatus: 'approved' });
  });
});

describe('useProperty requestPhotos and reporting', () => {
  it('asks signed-out users to sign in', async () => {
    const view = await load(flat());
    await act(() => view.result.current.requestPhotos({ again: 'again' }));
    expect(h.sendToSignIn).toHaveBeenCalledWith('photos', undefined, 'again');
    act(() => view.result.current.openReport({ again: 'rep' }));
    expect(h.sendToSignIn).toHaveBeenCalledWith('report', undefined, 'rep');
  });

  it('opens the report dialog for signed-in users', async () => {
    const view = await load(flat(), { auth: { isIn: true, user: { mobile: '9' } } });
    act(() => view.result.current.openReport({}));
    expect(view.result.current.reportOpen).toBe(true);
  });

  it('does not let owners request photos on their own listing', async () => {
    const view = await load(flat(), { auth: { isIn: true, user: { mobile: '9000000001' } } });
    await act(() => view.result.current.requestPhotos({}));
    expect(h.toast).toHaveBeenCalledWith('property.ownListingPhotos', 'info');
    expect(requestPhotos).not.toHaveBeenCalled();
  });

  it('toasts success and duplicate results', async () => {
    const view = await load(flat(), { auth: { isIn: true, user: { mobile: '9' } } });
    requestPhotos.mockResolvedValueOnce({ created: true });
    await act(() => view.result.current.requestPhotos({}));
    expect(requestPhotos).toHaveBeenCalledWith('abc123');
    expect(h.toast).toHaveBeenLastCalledWith('property.photosSent', 'success');
    requestPhotos.mockResolvedValueOnce({ created: false });
    await act(() => view.result.current.requestPhotos({}));
    expect(h.toast).toHaveBeenLastCalledWith('property.photosDuplicate', 'info');
  });

  it('maps request errors to the right feedback', async () => {
    const view = await load(flat(), { auth: { isIn: true, user: { mobile: '9' } } });
    requestPhotos.mockRejectedValueOnce(new ApiError({ code: 'x', message: 'm', status: 401 }));
    await act(() => view.result.current.requestPhotos({ again: 'a' }));
    expect(h.sendToSignIn).toHaveBeenCalledWith('photos', expect.any(String), 'a');
    requestPhotos.mockRejectedValueOnce(new ApiError({ code: 'recently_withdrawn', message: 'Wait', status: 409 }));
    await act(() => view.result.current.requestPhotos({}));
    expect(h.toast).toHaveBeenLastCalledWith('Wait', 'info');
    requestPhotos.mockRejectedValueOnce(new ApiError({ code: 'bad', message: 'm', status: 400 }));
    await act(() => view.result.current.requestPhotos({}));
    expect(h.toast).toHaveBeenLastCalledWith('property.ownListingPhotos', 'info');
    requestPhotos.mockRejectedValueOnce(new Error('boom'));
    await act(() => view.result.current.requestPhotos({}));
    expect(h.toast).toHaveBeenLastCalledWith('property.photosFailed', 'error');
  });

  it('ignores a second request while one is in flight', async () => {
    const view = await load(flat(), { auth: { isIn: true, user: { mobile: '9' } } });
    let release;
    requestPhotos.mockImplementation(() => new Promise((res) => { release = res; }));
    let first;
    act(() => { first = view.result.current.requestPhotos({}); });
    await act(() => view.result.current.requestPhotos({}));
    expect(requestPhotos).toHaveBeenCalledTimes(1);
    await act(async () => { release({ created: true }); await first; });
  });
});
