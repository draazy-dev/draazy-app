import { describe, expect, it } from 'vitest';
import { setupFetch } from '../net.js';
import * as loc from '../../../../../src/services/providers/http/localityProvider.js';

describe('localityProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listAdminLocalities maps rows with numeric coercion', async () => {
    net.reply([{ slug: 'baner', name: 'Baner', liveListings: '4', archived: 1, lat: '18.5', lng: '' }, null]);
    expect(await loc.listAdminLocalities()).toEqual([
      { slug: 'baner', name: 'Baner', liveListings: 4, archived: true, lat: 18.5, lng: null },
      { slug: '', name: '', liveListings: 0, archived: false, lat: null, lng: null },
    ]);
    net.reply({});
    expect(await loc.listAdminLocalities()).toEqual([]);
  });

  it('retire / restore post to the slug', async () => {
    net.reply({ slug: 'a b', archived: true });
    expect(await loc.retireLocality('a b')).toMatchObject({ slug: 'a b', archived: true });
    expect(net.last()).toMatchObject({ path: '/admin/localities/a%20b/retire', method: 'POST' });
    await loc.restoreLocality('x');
    expect(net.last().path).toBe('/admin/localities/x/restore');
  });

  it('getServedAreaReport normalises districts and outside rows', async () => {
    net.reply({
      servedDistricts: ['Pune', 7],
      outside: [{ kind: 'society', slug: 's', name: 'S', district: 'Nashik' }, { kind: 'x', slug: 'l' }],
      outsideTotal: '2',
      unchecked: 'bad',
    });
    expect(await loc.getServedAreaReport()).toEqual({
      servedDistricts: ['Pune', '7'],
      outside: [
        { kind: 'society', slug: 's', name: 'S', district: 'Nashik' },
        { kind: 'locality', slug: 'l', name: '', district: null },
      ],
      outsideTotal: 2,
      unchecked: 0,
    });
    net.reply(null);
    expect(await loc.getServedAreaReport()).toEqual({ servedDistricts: [], outside: [], outsideTotal: 0, unchecked: 0 });
  });

  it('recheckServedArea', async () => {
    net.reply({ checked: '5', remaining: 2 });
    expect(await loc.recheckServedArea()).toEqual({ checked: 5, remaining: 2 });
    expect(net.last()).toMatchObject({ path: '/admin/served-area/recheck', method: 'POST' });
    net.reply(null);
    expect(await loc.recheckServedArea()).toEqual({ checked: 0, remaining: 0 });
  });

  it('getLocality maps all stats', async () => {
    net.reply({ slug: 'baner', name: 'Baner', city: 'Pune', liveListings: 3, indexable: true, avgRent: 25000, forSale: '2', fromRent: null });
    expect(await loc.getLocality('baner')).toEqual({
      slug: 'baner', name: 'Baner', city: 'Pune', liveListings: 3, indexable: true, archived: false, avgRent: 25000, ratePerSqft: null,
      forSale: 2, forRent: 0, fromSale: null, fromRent: null, lat: null, lng: null,
    });
    expect(net.last().path).toBe('/localities/baner');
  });

  it('resolveLocality posts the place and returns a summary', async () => {
    net.reply({ slug: 's', name: 'N', city: 'C', lat: 1, lng: '2' });
    expect(await loc.resolveLocality({ placeId: 'p', name: 'N', lat: 1, lng: 2, types: ['sublocality'] }))
      .toEqual({ slug: 's', name: 'N', city: 'C', lat: 1, lng: 2 });
    expect(net.last()).toMatchObject({ path: '/localities/resolve', method: 'POST', body: { placeId: 'p', types: ['sublocality'] } });
  });

  it('searchLocalities sends q and a limit', async () => {
    net.reply([{ slug: 's', name: 'N' }]);
    expect(await loc.searchLocalities('ban')).toEqual([{ slug: 's', name: 'N', city: '', lat: null, lng: null }]);
    expect(net.last()).toMatchObject({ path: '/localities/search', query: { q: 'ban', limit: '10' } });
    net.reply(null);
    expect(await loc.searchLocalities('x')).toEqual([]);
  });
});
