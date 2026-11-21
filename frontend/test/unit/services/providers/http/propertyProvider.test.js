import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupFetch, status } from '../net.js';
import * as props from '../../../../../src/services/providers/http/propertyProvider.js';

const row = (id, extra = {}) => ({ id: `u-${id}`, slug: id, title: `T${id}`, ...extra });

describe('propertyProvider', () => {
  const net = setupFetch({ signedIn: true });
  afterEach(() => vi.restoreAllMocks());

  it('listProperties sends a mapped public query and warns on unsupported filters and truncation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    net.reply({ content: [row('a')], totalElements: 5 });
    const out = await props.listProperties({ deal: 'rent', real: true }, 'price-asc');
    expect(out.map((p) => p.id)).toEqual(['a']);
    expect(net.last()).toMatchObject({ path: '/properties', query: { deal: 'rent', sort: 'price,asc', size: '100' } });
    expect(net.last().headers.Authorization).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });

  it('listProperties is quiet for a complete page', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    net.reply([row('a')]);
    await props.listProperties();
    expect(error).not.toHaveBeenCalled();
  });

  it('searchListings converts the page and returns the totals', async () => {
    net.reply({ content: [row('a')], totalElements: 30, verifiedElements: 4, unstatedElements: 2, totalPages: 2 });
    const res = await props.searchListings({ deal: 'buy' }, { page: 2, size: 10 });
    expect(net.last().query).toEqual({ deal: 'buy', page: '1', size: '10' });
    expect(res).toMatchObject({ total: 30, verifiedTotal: 4, unstatedTotal: 2, pageCount: 2 });
    net.fresh();
    net.reply(null);
    expect(await props.searchListings()).toEqual({ items: [], total: 0, verifiedTotal: 0, unstatedTotal: 0, pageCount: 0 });
    expect(net.last().query).toEqual({ page: '0', size: '24' });
  });

  it('moderation search, lookup, summary and single fetch', async () => {
    net.reply({ content: [row('m')], totalElements: 9, totalPages: 3 });
    const res = await props.searchForModeration({ archived: true }, 'oldest', { page: 3, size: 5 });
    expect(net.last()).toMatchObject({ path: '/admin/properties', query: { archived: 'true', page: '2', size: '5', sort: 'createdAt,asc' } });
    expect(res).toMatchObject({ total: 9, pageCount: 3 });
    net.reply(null);
    expect(await props.searchForModeration()).toMatchObject({ items: [], total: 0, pageCount: 0 });

    net.reply({ content: [{ slug: 's', id: 'i', title: 't', locality: 'l', owner: 'o', ownerMobile: 'm', status: 'live' }, { id: 'only-id' }], totalElements: 2 });
    const lookup = await props.lookupForModeration('baner');
    expect(net.last()).toMatchObject({ path: '/admin/properties/lookup', query: { q: 'baner', page: '0', size: '6' } });
    expect(lookup.items[0]).toEqual({ id: 's', title: 't', locality: 'l', owner: 'o', ownerMobile: 'm', status: 'live' });
    expect(lookup.items[1].id).toBe('only-id');
    net.reply(null);
    expect(await props.lookupForModeration('x', { size: 2 })).toEqual({ items: [], total: 0 });

    net.reply({ total: 1 });
    expect(await props.moderationSummary()).toEqual({ total: 1 });
    expect(net.last().path).toBe('/admin/properties/summary');
  });

  it('getModerationProperty and getProperty map 404 to null and rethrow other errors', async () => {
    net.reply(row('m'));
    expect((await props.getModerationProperty('a/b')).id).toBe('m');
    expect(net.last().path).toBe('/admin/properties/a%2Fb');
    net.reply(status(404, { message: 'x' }));
    expect(await props.getModerationProperty('a')).toBeNull();
    net.reply(status(500, { message: 'x' }));
    await expect(props.getModerationProperty('a')).rejects.toMatchObject({ status: 500 });

    net.reply(row('p'));
    expect((await props.getProperty('p', { maxAge: 1000 })).id).toBe('p');
    net.fresh();
    net.reply(status(404, {}));
    expect(await props.getProperty('p')).toBeNull();
    net.reply(status(500, {}));
    await expect(props.getProperty('p')).rejects.toMatchObject({ status: 500 });
  });

  it('featuredProperties slices to the limit', async () => {
    net.reply([row('a'), row('b'), row('c')]);
    expect((await props.featuredProperties(2)).map((p) => p.id)).toEqual(['a', 'b']);
    expect(net.last().path).toBe('/properties/featured');
  });

  it('bootstrap-backed sections', async () => {
    net.reply({ trustStats: { a: 1 }, counts: { b: 2 } });
    expect(await props.trustStats()).toEqual({ a: 1 });
    expect(await props.propertyCounts()).toEqual({ b: 2 });
  });

  it('ownerProfile and ownerListings', async () => {
    net.reply({ name: 'O' });
    expect(await props.ownerProfile('o/1')).toEqual({ name: 'O' });
    expect(net.last().path).toBe('/owners/o%2F1');
    net.reply(status(404, {}));
    expect(await props.ownerProfile('x')).toBeNull();
    net.reply(status(500, {}));
    await expect(props.ownerProfile('x')).rejects.toMatchObject({ status: 500 });
    net.reply([row('a')]);
    expect(await props.ownerListings('o1')).toHaveLength(1);
    expect(net.last().query).toEqual({ owner: 'o1', sort: 'createdAt,desc', size: '12' });
  });

  it('getPropertiesByIds drops the missing ones', async () => {
    net.on((c) => (c.path.endsWith('/gone') ? status(404, {}) : row(c.path.split('/').pop())));
    expect((await props.getPropertiesByIds(['a', 'gone', 'b'])).map((p) => p.id)).toEqual(['a', 'b']);
    expect(await props.getPropertiesByIds()).toEqual([]);
  });

  it('listPropertiesByIds and compareProperties keep the asked order and cap the ids', async () => {
    expect(await props.listPropertiesByIds([])).toEqual([]);
    expect(await props.compareProperties([])).toEqual([]);
    expect(net.calls).toHaveLength(0);

    net.reply([row('b'), row('a')]);
    expect((await props.listPropertiesByIds(['a', 'b', 'zzz'])).map((p) => p.id)).toEqual(['a', 'b']);
    net.reply([row('b'), row('a')]);
    const ids = Array.from({ length: 20 }, (_, i) => `i${i}`);
    await props.listPropertiesByIds(ids);
    expect(net.last().params.getAll('ids')).toHaveLength(16);

    net.reply([row('b'), { id: 'uu', slug: 'x' }]);
    expect((await props.compareProperties(['b', 'uu', 'c', 'd', 'e'])).map((p) => p.id)).toEqual(['b', 'x']);
    expect(net.last().path).toBe('/properties/compare');
    expect(net.last().params.getAll('ids')).toHaveLength(4);
  });

  it('search index, reels and similar', async () => {
    net.reply({ idx: 1 });
    expect(await props.searchIndex()).toEqual({ idx: 1 });
    net.reply([{ id: 'r' }]);
    expect(await props.propertyReels({ city: 'Pune' })).toEqual([{ id: 'r' }]);
    expect(net.last()).toMatchObject({ path: '/properties/reels', query: { city: 'Pune' } });
    net.reply([{ ...row('s'), distanceKm: 2.5 }]);
    expect(await props.similarProperties({ id: 's' })).toEqual([expect.objectContaining({ id: 's', _km: 2.5 })]);
    net.reply(null);
    expect(await props.similarProperties({ id: 's' })).toEqual([]);
  });

  it('owner listing reads', async () => {
    net.reply({ content: [row('a')], totalElements: 1 });
    expect(await props.myListings({}, { maxAge: 100 })).toHaveLength(1);
    expect(net.last()).toMatchObject({ path: '/me/listings', query: { size: '100' } });
    net.reply(row('c'));
    expect((await props.myListingCard('c/1')).id).toBe('c');
    expect(net.last().path).toBe('/me/listings/c%2F1/card');
    net.reply({ id: 'q' });
    expect(await props.listingSlots()).toEqual({ id: 'q' });
  });

  it('myListing returns the view model with an edit form', async () => {
    expect(await props.myListing('')).toBeNull();
    net.reply(row('m', { deal: 'rent', price: 10, societyId: 'sid', societyName: 'Sky' }));
    const res = await props.myListing('m');
    expect(res.form).toMatchObject({ deal: 'rent', monthlyRent: '10', society: 'Sky' });
    net.fresh();
    net.reply(row('m2', { societyId: 'sid' }));
    expect((await props.myListing('m2')).form.society).toBe('');
    net.fresh();
    net.reply(null);
    expect(await props.myListing('m3')).toBeNull();
    net.reply(status(404, {}));
    expect(await props.myListing('m4')).toBeNull();
    net.reply(status(500, {}));
    await expect(props.myListing('m5')).rejects.toMatchObject({ status: 500 });
  });

  it('prefetchMyListing only fires for an id', async () => {
    props.prefetchMyListing('');
    props.prefetchMyListing(undefined);
    expect(net.calls).toHaveLength(0);
    props.prefetchMyListing('p1');
    await vi.waitFor(() => expect(net.calls.length).toBeGreaterThan(0));
    expect(net.last().path).toBe('/me/listings/p1');
  });

  it('addListing posts to the owner or managed-home path', async () => {
    net.reply({ id: 'u', slug: 's', status: 'pending' });
    expect(await props.addListing({ title: 'T', deal: 'rent' })).toMatchObject({ id: 's', uuid: 'u', status: 'pending' });
    expect(net.last()).toMatchObject({ path: '/me/listings', method: 'POST', body: expect.objectContaining({ title: 'T', city: 'Pune' }) });
    await props.addListing({ title: 'T' }, { homeId: 'h/1' });
    expect(net.last().path).toBe('/me/managed-properties/h%2F1/listing');
  });

  it('checkOwnDuplicate composes the address and normalises the verdict', async () => {
    net.reply({ found: 1, existingId: 'e' });
    expect(await props.checkOwnDuplicate({ fields: { flatNumber: ' 4 ', tower: 'B', society: 'Sky', street: '', locality: 'Baner', propLat: 1, propLng: 2, electricityConsumerNo: 'E' } }))
      .toEqual({ found: true, existingId: 'e' });
    expect(net.last()).toMatchObject({
      path: '/me/listings/duplicate-check',
      body: { address: '4, B, Sky', locality: 'Baner', city: 'Pune', lat: 1, lng: 2, electricityMeterNo: 'E' },
    });
    net.reply(null);
    expect(await props.checkOwnDuplicate()).toEqual({ found: false, existingId: null });
    expect(net.last().body).toEqual({ city: 'Pune' });
  });

  it('admin: createListingOnBehalf and ownerListingStanding', async () => {
    net.reply(row('a'));
    expect((await props.createListingOnBehalf('999', '', { title: 'T' })).id).toBe('a');
    expect(net.last()).toMatchObject({ path: '/admin/properties', method: 'POST', body: { ownerMobile: '999', listing: expect.objectContaining({ title: 'T' }) } });
    expect(net.last().body.ownerName).toBeUndefined();
    await props.createListingOnBehalf('999', 'Raj', {});
    expect(net.last().body.ownerName).toBe('Raj');
    net.reply({ strikes: 0 });
    expect(await props.ownerListingStanding('+91 99')).toEqual({ strikes: 0 });
    expect(net.last().search).toContain('mobile=%2B91%2099');
  });

  it('listDuplicateClusters maps clusters and warns on unknown reasons', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    net.reply({
      clusters: [
        { id: 'c1', reason: 'address+image', sameOwner: 1, hints: [{ code: 'x', severity: 'hard', detail: 'd' }, null], listings: [row('a')] },
        { id: 'c2', reason: 'address' },
        { id: 'c3', reason: 'image' },
        { id: 'c4', reason: 'mystery' },
        { id: 'c5' },
      ],
      scanned: 40,
      truncated: 1,
    });
    const res = await props.listDuplicateClusters();
    expect(res.scanned).toBe(40);
    expect(res.truncated).toBe(true);
    expect(res.clusters.map((c) => c.reasonLabel)).toEqual([
      'same address and matching photos', 'same address / electricity meter', 'matching photos', undefined, undefined,
    ]);
    expect(res.clusters[0]).toMatchObject({ sameOwner: true, hints: [{ code: 'x', severity: 'hard', detail: 'd' }, { code: '', severity: 'soft', detail: '' }] });
    expect(res.clusters[0].listings[0].id).toBe('a');
    expect(res.clusters[1]).toMatchObject({ sameOwner: false, hints: [], listings: [] });
    expect(warn).toHaveBeenCalledOnce();
    net.fresh();
    net.reply(null);
    expect(await props.listDuplicateClusters()).toEqual({ clusters: [], scanned: 0, truncated: false });
  });

  it('duplicate merge / dismiss', async () => {
    await props.mergeDuplicateCluster('k', ['d1']);
    expect(net.last()).toMatchObject({ path: '/admin/properties/duplicates/merge', body: { keepId: 'k', dropIds: ['d1'] } });
    await props.dismissDuplicateCluster(['a', 'b']);
    expect(net.last()).toMatchObject({ path: '/admin/properties/duplicates/dismiss', body: { ids: ['a', 'b'] } });
  });

  it('owner write operations', async () => {
    net.reply({ id: 'u', slug: 's', status: 'live' });
    expect(await props.updateListingFields('s/1', { title: 'N' })).toMatchObject({ id: 's' });
    expect(net.last()).toMatchObject({ path: '/me/listings/s%2F1', method: 'PATCH', body: { title: 'N' } });
    net.reply({ id: 'u', status: 'removed' });
    expect(await props.takeListingDown('s')).toMatchObject({ status: 'removed' });
    expect(net.last()).toMatchObject({ path: '/me/listings/s', method: 'DELETE' });

    net.reply(row('p'));
    expect((await props.pauseListing('s')).id).toBe('p');
    expect(net.last()).toMatchObject({ path: '/me/listings/s/pause', method: 'POST', body: {} });
    await props.resumeListing('s');
    expect(net.last().path).toBe('/me/listings/s/resume');
    await props.confirmListingFresh('s');
    expect(net.last().path).toBe('/me/listings/s/confirm-available');
    await props.recordClaimLinkOpened('s');
    expect(net.last()).toMatchObject({ path: '/me/listings/s/opened', method: 'POST' });
    await props.confirmOwnerListing('s');
    expect(net.last().path).toBe('/me/listings/s/confirm');
  });

  it('moderator write operations', async () => {
    net.reply(row('a'));
    await props.updateListingAsModerator('s', { title: 'M' });
    expect(net.last()).toMatchObject({ path: '/properties/s/admin', method: 'PATCH', body: { title: 'M' } });
    await props.removeListingPhoto('s', 'ph.jpg', 'bad');
    expect(net.last()).toMatchObject({ path: '/properties/s/photos/takedown', body: { photo: 'ph.jpg', reason: 'bad' } });
    await props.archiveListing('s', 'dup');
    expect(net.last()).toMatchObject({ path: '/properties/s/archive', method: 'PATCH', body: { reason: 'dup' } });
    await props.archiveListing('s');
    expect(net.last().body).toEqual({});
    await props.restoreListing('s');
    expect(net.last()).toMatchObject({ path: '/properties/s/restore', method: 'PATCH' });
    await props.flagListing('s', 'spam');
    expect(net.last()).toMatchObject({ path: '/properties/s/flag', method: 'POST', body: { reason: 'spam' } });
    await props.clearFlag('s');
    expect(net.last()).toMatchObject({ path: '/properties/s/flag', method: 'DELETE' });
  });

  it('setListingStatus accepts a reason string or an options object and drops empty fields', async () => {
    await props.setListingStatus('s', 'rejected', 'why');
    expect(net.last()).toMatchObject({ path: '/properties/s/status', method: 'PATCH', body: { status: 'rejected', reason: 'why' } });
    await props.setListingStatus('s', 'live');
    expect(net.last().body).toEqual({ status: 'live' });
    await props.setListingStatus('s', 'rejected', { reason: '', reasonCode: 'photos', expectedStatus: 'pending' });
    expect(net.last().body).toEqual({ status: 'rejected', reasonCode: 'photos', expectedStatus: 'pending' });
    await props.setListingStatus('s', 'live', null);
    expect(net.last().body).toEqual({ status: 'live' });
  });
});
