import { describe, expect, it, vi } from 'vitest';
import { setupFetch, status } from '../net.js';
import { DEFAULT_MAX_PHOTOS, MAX_PHOTOS_CEILING } from '../../../../../src/lib/uploads/policy.js';
import { GRIEVANCE_OFFICER_DEFAULT, PRICING_DEFAULTS } from '../../../../../src/services/settingsService.js';
import * as sm from '../../../../../src/services/providers/http/societyMapper.js';
import * as sp from '../../../../../src/services/providers/http/societyProvider.js';
import * as settings from '../../../../../src/services/providers/http/settingsProvider.js';

describe('societyMapper', () => {
  it('toRatingIndex', () => {
    expect(sm.toRatingIndex(null)).toEqual({});
    expect(sm.toRatingIndex([{ slug: 'a', avgRating: '4.5', reviewCount: '3' }, { slug: 'b' }, { avgRating: 1 }, null])).toEqual({
      a: { avg: 4.5, count: 3 }, b: { avg: null, count: 0 },
    });
  });

  it('toSociety', () => {
    expect(sm.toSociety(null)).toBeNull();
    expect(sm.toSociety({ name: 'no slug' })).toBeNull();
    expect(sm.toSociety({ slug: 's' })).toEqual({
      id: undefined, slug: 's', name: '', builder: '', localitySlug: '', lat: null, lng: null, placeId: '', year: null, towers: null, units: null, occupancy: null,
      maintenancePerSqft: null, parkingRatio: null, lifts: null, security: '', water: '', power: '', petPolicy: '', vegPolicy: '', rera: '', amenities: [],
      listingCount: 0, forSale: 0, forRent: 0, psf: null, rentAvg: null, homes: [],
    });
    const full = sm.toSociety({
      id: 1, slug: 's', name: 'N', builder: 'B', localitySlug: 'baner', lat: '18.5', lng: '73.8', placeId: 'pid', year: 2010, towers: 4, units: 200, occupancy: '90',
      maintenancePerSqft: '3', parkingRatio: '1.5', lifts: 6, security: 'sec', water: 'w', power: 'p', petPolicy: 'pet', vegPolicy: 'veg', rera: 'R', amenities: ['gym'],
      listingCount: '5', forSale: 3, forRent: 2, psf: '9000', rentAvg: '25000', homes: [{ id: 'h1', title: 'Flat' }],
    });
    expect(full).toMatchObject({ lat: 18.5, lng: 73.8, occupancy: 90, parkingRatio: 1.5, amenities: ['gym'], listingCount: 5, psf: 9000, rentAvg: 25000, towers: 4 });
    expect(full.homes).toHaveLength(1);
    expect(full.homes[0]).toMatchObject({ id: 'h1' });
  });

  it('toSocietyBrief', () => {
    expect(sm.toSocietyBrief(null)).toBeNull();
    expect(sm.toSocietyBrief({})).toBeNull();
    expect(sm.toSocietyBrief({ slug: 's' })).toEqual({ slug: 's', name: '', builder: '', units: null, towers: null, year: null, occupancy: null, rating: { avg: null, count: 0 } });
    expect(sm.toSocietyBrief({ slug: 's', name: 'N', builder: 'B', units: 1, towers: 2, year: 3, occupancy: '4', avgRating: '4.2', reviewCount: 7 })).toEqual({
      slug: 's', name: 'N', builder: 'B', units: 1, towers: 2, year: 3, occupancy: 4, rating: { avg: 4.2, count: 7 },
    });
  });
});

describe('societyProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listSocietiesPage', async () => {
    net.reply({ content: [{ slug: 'a', avgRating: 4, reviewCount: 2 }, { name: 'bad' }], totalElements: '12' });
    expect(await sp.listSocietiesPage({ q: 'sky', locality: 'baner', sort: 'rating', page: 1, size: 5 })).toMatchObject({
      rows: [expect.objectContaining({ slug: 'a' })], ratings: { a: { avg: 4, count: 2 } }, total: 12,
    });
    expect(net.last()).toMatchObject({ path: '/societies', query: { q: 'sky', locality: 'baner', sort: 'rating', page: '1', size: '5' } });
    net.fresh();
    net.reply(null);
    expect(await sp.listSocietiesPage()).toEqual({ rows: [], ratings: {}, total: 0 });
    expect(net.last().query).toEqual({ sort: 'relevance', page: '0', size: '24' });
  });

  it('topSocieties is a public cached read', async () => {
    net.reply([{ slug: 'a' }]);
    expect(await sp.topSocieties()).toEqual([{ slug: 'a' }]);
    expect(net.last().path).toBe('/societies/top');
    expect(net.last().headers.Authorization).toBeUndefined();
  });

  it('searchSocieties', async () => {
    net.reply({ content: [{ slug: 'a' }, null] });
    expect(await sp.searchSocieties('sky', { mapped: true })).toHaveLength(1);
    expect(net.last().query).toEqual({ q: 'sky', mapped: 'true', page: '0', size: '20' });
    net.fresh();
    net.reply({});
    expect(await sp.searchSocieties()).toEqual([]);
    expect(net.last().query).toEqual({ page: '0', size: '20' });
  });

  it('getSociety and getSocietyBrief map 404 to null', async () => {
    net.reply({ slug: 'a/b' });
    expect((await sp.getSociety('a/b')).slug).toBe('a/b');
    expect(net.last().path).toBe('/societies/a%2Fb');
    net.fresh();
    net.reply(status(404, {}));
    expect(await sp.getSociety('x')).toBeNull();
    net.fresh();
    net.reply(status(500, {}));
    await expect(sp.getSociety('x')).rejects.toMatchObject({ status: 500 });
    net.reply({ slug: 'a', avgRating: 4 });
    expect((await sp.getSocietyBrief('a/b')).rating.avg).toBe(4);
    expect(net.last().path).toBe('/societies/a%2Fb/brief');
    net.fresh();
    net.reply(status(404, {}));
    expect(await sp.getSocietyBrief('x')).toBeNull();
    net.fresh();
    net.reply(status(500, {}));
    await expect(sp.getSocietyBrief('x')).rejects.toMatchObject({ status: 500 });
  });

  it('admin directory, candidates and summary', async () => {
    net.reply({ content: [{ slug: 'a' }], totalElements: 1 });
    expect((await sp.listSocietyDirectory({ q: 'x', page: 2, size: 5 })).items).toEqual([{ slug: 'a' }]);
    expect(net.last()).toMatchObject({ path: '/admin/societies', query: { q: 'x', page: '2', size: '5' } });
    net.fresh();
    net.reply({});
    await sp.listSocietyDirectory();
    expect(net.last().query).toEqual({ page: '0', size: '20' });
    net.reply({ content: [], totalElements: 0 });
    await sp.listSocietyCandidates({ q: 'c', page: 1, size: 3 });
    expect(net.last()).toMatchObject({ path: '/admin/society-candidates', query: { q: 'c', page: '1', size: '3' } });
    net.fresh();
    net.reply({});
    await sp.listSocietyCandidates();
    expect(net.last().query).toEqual({ page: '0', size: '10' });
    net.reply({ total: 3 });
    expect(await sp.getSocietiesSummary()).toEqual({ total: 3 });
    expect(net.last().path).toBe('/admin/societies/summary');
  });

  it('duplicates for candidates only accepts an object map', async () => {
    net.reply({ a: ['b'] });
    expect(await sp.listDuplicatesForCandidates(['a', 'b'], { limit: 3 })).toEqual({ a: ['b'] });
    expect(net.last().path).toBe('/admin/society-candidates/duplicates');
    expect(net.last().search).toContain('slugs=');
    expect(net.last().query.limit).toBe('3');
    net.fresh();
    net.reply([1]);
    expect(await sp.listDuplicatesForCandidates(['a'])).toEqual({});
    net.fresh();
    net.reply(null);
    expect(await sp.listDuplicatesForCandidates(['a'])).toEqual({});
  });

  it('follow and followed list', async () => {
    net.reply({ content: [{ slug: 'a' }, { name: 'no slug' }, null], totalElements: 3 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await sp.listFollowedSocieties()).toEqual([{ slug: 'a' }]);
    expect(net.last()).toMatchObject({ path: '/me/societies/following', query: { page: '0', size: '500' } });
    warn.mockRestore();
    await sp.followSociety('a/b');
    expect(net.last()).toMatchObject({ path: '/me/societies/a%2Fb/follow', method: 'PUT' });
    await sp.unfollowSociety('a/b');
    expect(net.last()).toMatchObject({ path: '/me/societies/a%2Fb/follow', method: 'DELETE' });
  });

  it('resolveSociety', async () => {
    net.reply({ society: { slug: 's' }, candidates: [{ slug: 'c' }, {}] });
    expect(await sp.resolveSociety({ placeId: 'p', name: 'N', lat: 0, lng: 73.8 })).toEqual({
      society: expect.objectContaining({ slug: 's' }), candidates: [expect.objectContaining({ slug: 'c' })],
    });
    expect(net.last()).toMatchObject({ path: '/societies/resolve', query: { placeId: 'p', name: 'N', lat: '0', lng: '73.8' } });
    net.fresh();
    net.reply({});
    expect(await sp.resolveSociety({ placeId: 'p' })).toEqual({ society: null, candidates: [] });
    expect(net.last().query).toEqual({ placeId: 'p' });
  });

  it('mintSociety reports whether the society was newly created', async () => {
    net.reply(status(201, { slug: 'n' }));
    expect(await sp.mintSociety({ placeId: 'p', name: 'N', lat: 1, lng: 2, localityLabel: 'L', localitySlug: 'l' })).toEqual({ society: expect.objectContaining({ slug: 'n' }), created: true });
    expect(net.last()).toMatchObject({ path: '/societies', method: 'POST', body: { placeId: 'p', name: 'N', lat: 1, lng: 2, localityLabel: 'L', localitySlug: 'l', mintOrigin: 'listing' } });
    net.reply(status(200, { slug: 'n' }));
    expect((await sp.mintSociety({ placeId: 'p', mintOrigin: 'admin' })).created).toBe(false);
    expect(net.last().body.mintOrigin).toBe('admin');
  });

  it('merges and admin edits', async () => {
    net.reply({ content: [{ id: 1 }], totalElements: 1 });
    expect(await sp.listSocietyMerges({ page: 1, size: 5 })).toEqual([{ id: 1 }]);
    expect(net.last()).toMatchObject({ path: '/admin/society-merges', query: { page: '1', size: '5' } });
    net.reply({ ok: 1 });
    expect(await sp.mergeSocieties('a', 'b')).toEqual({ ok: 1 });
    expect(net.last()).toMatchObject({ path: '/admin/society-merges', method: 'POST', body: { from: 'a', into: 'b' } });
    await sp.undoSocietyMerge('a/b');
    expect(net.last()).toMatchObject({ path: '/admin/society-merges/a%2Fb', method: 'DELETE' });
    net.reply({ slug: 'a' });
    expect(await sp.getSocietyAdminView('a/b')).toEqual({ slug: 'a' });
    expect(net.last().path).toBe('/admin/societies/a%2Fb');
    net.reply({ slug: 'a' });
    await sp.editSociety('a/b', { name: 'N' });
    expect(net.last()).toMatchObject({ path: '/admin/societies/a%2Fb', method: 'PATCH', body: { name: 'N' } });
  });
});

describe('settingsProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('getSettings coalesces concurrent reads and remembers the ETag for updates', async () => {
    net.reply(status(200, { a: 1 }, { ETag: 'v1' }));
    const [one, two] = await Promise.all([settings.getSettings(), settings.getSettings()]);
    expect(one).toBe(two);
    expect(one).toEqual({ a: 1 });
    expect(net.calls).toHaveLength(1);
    expect(net.last().path).toBe('/admin/settings');

    const changed = vi.fn();
    window.addEventListener('draazy-settings-change', changed);
    net.reply(status(200, { a: 2 }, { ETag: 'v2' }));
    expect(await settings.updateSettings({ a: 2 })).toEqual({ a: 2 });
    expect(net.last()).toMatchObject({ method: 'PUT', body: { a: 2 } });
    expect(net.last().headers['If-Match']).toBe('v1');
    expect(changed).toHaveBeenCalledTimes(1);

    net.reply(status(200, null));
    expect(await settings.updateSettings({ a: 3 })).toEqual({});
    expect(net.last().headers['If-Match']).toBe('v2');
    window.removeEventListener('draazy-settings-change', changed);
  });

  it('getSettings falls back to an empty object and can be re-read', async () => {
    net.reply(status(200, 'nope'));
    expect(await settings.getSettings()).toEqual({});
    net.reply(status(200, { b: 1 }));
    expect(await settings.getSettings()).toEqual({ b: 1 });
  });

  it('getAdminFlags', async () => {
    net.reply({ x: true });
    expect(await settings.getAdminFlags()).toEqual({ x: true });
    expect(net.last().path).toBe('/admin/settings/flags');
    net.fresh();
    net.reply(null);
    expect(await settings.getAdminFlags()).toEqual({});
  });

  describe('bootstrap-backed sections', () => {
    const boot = (doc) => { net.fresh(); net.reply(doc); };

    it('getAppFlags', async () => {
      boot({ flags: { a: 1 } });
      expect(await settings.getAppFlags()).toEqual({ a: 1 });
      boot({ flags: 'x' });
      expect(await settings.getAppFlags()).toEqual({});
    });

    it('getMovePack', async () => {
      boot({ movePack: { enabled: true, items: { a: 1 } } });
      expect(await settings.getMovePack()).toEqual({ enabled: true, items: { a: 1 } });
      boot({ movePack: { enabled: 'yes', items: 5 } });
      expect(await settings.getMovePack()).toEqual({ enabled: false, items: {} });
      boot({});
      expect(await settings.getMovePack()).toEqual({ enabled: false, items: {} });
    });

    it('getGeo', async () => {
      boot({ geo: { c: 1 } });
      expect(await settings.getGeo()).toEqual({ c: 1 });
      boot({});
      expect(await settings.getGeo()).toEqual({});
    });

    it('getPricing overlays finite numbers on the defaults', async () => {
      boot({});
      expect(await settings.getPricing()).toEqual(PRICING_DEFAULTS);
      boot({ pricing: { listingPass: 1, contactPack: 'x', referral: { holdDays: 2, qualifyPerYear: NaN }, refunds: { packRefundDays: 3 } } });
      const p = await settings.getPricing();
      expect(p.listingPass).toBe(1);
      expect(p.contactPack).toBe(PRICING_DEFAULTS.contactPack);
      expect(p.referral).toEqual({ ...PRICING_DEFAULTS.referral, holdDays: 2 });
      expect(p.refunds).toEqual({ ...PRICING_DEFAULTS.refunds, packRefundDays: 3 });
    });

    it('getGrievanceOfficer', async () => {
      boot({ legal: { grievanceOfficer: { name: '  Ann ', email: ' a@x.com ' } } });
      expect(await settings.getGrievanceOfficer()).toEqual({ name: 'Ann', email: 'a@x.com' });
      boot({ legal: { grievanceOfficer: { name: 5, email: '  ' } } });
      expect(await settings.getGrievanceOfficer()).toEqual({ name: '', email: GRIEVANCE_OFFICER_DEFAULT.email });
      boot({});
      expect(await settings.getGrievanceOfficer()).toEqual({ name: '', email: GRIEVANCE_OFFICER_DEFAULT.email });
    });

    it('getListingPolicy accepts only a positive integer within the ceiling', async () => {
      boot({ listingPolicy: { maxPhotos: 5 } });
      expect(await settings.getListingPolicy()).toEqual({ maxPhotos: 5 });
      for (const bad of [0, -1, 1.5, MAX_PHOTOS_CEILING + 1, '5']) {
        boot({ listingPolicy: { maxPhotos: bad } });
        expect(await settings.getListingPolicy()).toEqual({ maxPhotos: DEFAULT_MAX_PHOTOS });
      }
      boot({});
      expect((await settings.getListingPolicy()).maxPhotos).toBe(DEFAULT_MAX_PHOTOS);
    });
  });
});
