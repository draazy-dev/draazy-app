import { describe, expect, it } from 'vitest';
import { setupFetch, status } from '../net.js';
import { writeUser } from '../../../../../src/lib/auth.js';
import * as m from '../../../../../src/services/providers/http/managedMapper.js';
import * as managed from '../../../../../src/services/providers/http/managedProvider.js';

describe('managedMapper', () => {
  it('bhkLabel and deal conversions', () => {
    expect(m.bhkLabel(0)).toBe('');
    expect(m.bhkLabel('2')).toBe('2 BHK');
    expect(m.bhkLabel(6)).toBe('5+ BHK');
    expect(m.toClientDeal('rent')).toBe('rent');
    expect(m.toClientDeal('buy')).toBe('sale');
    expect(m.toWireDeal('rent')).toBe('rent');
    expect(m.toWireDeal('sale')).toBe('buy');
  });

  it('toManaged maps a rental with the signed-in owner', () => {
    writeUser({ name: 'Owner', mobile: '99' });
    const vm = m.toManaged({
      id: 'm1', deal: 'rent', price: '25000', bhk: 2, society: 'Soc', locality: 'Baner', propertyType: 'Flat', rented: 1,
      dueDay: 0, rentClaims: [{ a: 1 }], createdAt: '2026-01-01T00:00:00Z', updatedAt: 'garbage',
    });
    expect(vm).toMatchObject({
      id: 'm1', visibility: 'private', status: 'managed', type: 'Flat', bhk: '2 BHK', bhkNum: 2, loc: 'Soc, Baner, Pune', deal: 'rent',
      price: 25000, priceStr: '₹25,000/mo', owner: 'Owner', ownerMobile: '99', rented: true, dueDay: 5, rentClaims: [{ a: 1 }],
      createdAt: Date.parse('2026-01-01T00:00:00Z'), updatedAt: null, areaUnit: 'sqft',
    });
    localStorage.clear();
  });

  it('toManaged for a sale without a signed-in user', () => {
    localStorage.clear();
    const vm = m.toManaged({ id: 'm2', deal: 'buy', price: 15000000 });
    expect(vm).toMatchObject({ deal: 'sale', priceStr: '₹1,50,00,000', owner: '', ownerMobile: '', loc: 'Pune', rentClaims: [] });
    expect(m.toManaged(null)).toBeNull();
    expect(m.toManagedList(null)).toEqual([]);
    expect(m.toManagedList([null, { id: 'a' }])).toHaveLength(1);
  });

  it('receipts and tracked rent', () => {
    expect(m.toRentReceipt(null)).toBeNull();
    expect(m.toRentReceipt({ id: 'r', rentMonth: '2026-01', amount: '5', createdAt: '2026-01-01T00:00:00Z' }))
      .toMatchObject({ id: 'r', ym: '2026-01', amount: 5, createdAt: Date.parse('2026-01-01T00:00:00Z') });
    expect(m.toRentReceiptList('x')).toEqual([]);
    expect(m.toTrackedRent({ id: 't', monthlyRent: '9', receipts: [{ id: 'r' }, null] })).toMatchObject({
      id: 't', monthlyRent: 9, status: 'due', receipts: [{ id: 'r' }],
    });
    expect(m.toTrackedRentList(undefined)).toEqual([]);
  });

  it('toCreateRequest maps listing fields', () => {
    expect(m.toCreateRequest()).toMatchObject({
      title: null, deal: 'buy', propertyType: 'Flat', bhk: null, price: 0, locality: 'Pune', societyId: null, area: null, rented: false,
      monthlyRent: null, dueDay: null,
    });
    expect(m.toCreateRequest({ deal: 'rent', price: '12000', type: 'Villa', bhk: '3', area: '900', monthlyRent: 1, dueDay: '7', rented: true }))
      .toMatchObject({ deal: 'rent', propertyType: 'Villa', bhk: 3, area: 900, monthlyRent: 12000, dueDay: 7, rented: true });
    expect(m.toCreateRequest({ deal: 'sale', monthlyRent: '8' }).monthlyRent).toBe(8);
  });

  it('toUpdateRequest only sends keys present in the patch', () => {
    expect(m.toUpdateRequest({})).toEqual({});
    expect(m.toUpdateRequest({
      deal: 'sale', type: 'Flat', title: 't', bhk: '2', price: 'x', locality: 'L', localitySlug: 's', societyId: 'so', area: 0,
      areaUnit: 'sqft', furnishing: 'f', rented: 0, tenantName: 'T', tenantMobile: 'M', monthlyRent: '5', dueDay: '3',
      landlordPan: 'abcde1234f', valuation: { v: 1 },
    })).toEqual({
      deal: 'buy', propertyType: 'Flat', title: 't', bhk: 2, price: 0, locality: 'L', localitySlug: 's', societyId: 'so', area: null,
      areaUnit: 'sqft', furnishing: 'f', rented: false, tenantName: 'T', tenantMobile: 'M', monthlyRent: 5, dueDay: 3,
      landlordPan: 'ABCDE1234F', valuation: { v: 1 },
    });
    expect(m.toUpdateRequest({ propertyType: 'Plot', landlordPan: null })).toEqual({ propertyType: 'Plot', landlordPan: '' });
  });
});

describe('managedProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('tracked rent', async () => {
    net.reply([{ id: 't1' }]);
    expect(await managed.listTrackedRent()).toMatchObject([{ id: 't1' }]);
    expect(net.last().path).toBe('/me/tracked-rent');
    net.reply({ id: 't1', status: 'claimed' });
    expect(await managed.claimRentPaid('t/1')).toMatchObject({ status: 'claimed' });
    expect(net.last()).toMatchObject({ path: '/me/tracked-rent/t%2F1/paid', method: 'POST', body: {} });
    await managed.rejectRentClaim('m1', '2026-01');
    expect(net.last()).toMatchObject({ path: '/me/managed-properties/m1/rent-claims/2026-01', method: 'DELETE' });
  });

  it('listManaged supports paged and bare responses', async () => {
    net.reply({ content: [{ id: 'a' }] });
    expect(await managed.listManaged()).toHaveLength(1);
    net.fresh();
    net.reply([{ id: 'a' }, { id: 'b' }]);
    expect(await managed.listManaged()).toHaveLength(2);
  });

  it('getManaged maps 404 to null and rethrows others', async () => {
    net.reply({ id: 'a' });
    expect(await managed.getManaged('a')).toMatchObject({ id: 'a' });
    net.reply(status(404, { message: 'gone' }));
    expect(await managed.getManaged('a')).toBeNull();
    net.reply(status(500, { message: 'boom' }));
    await expect(managed.getManaged('a')).rejects.toMatchObject({ status: 500 });
  });

  it('register / update / delete / stopRentTracking', async () => {
    net.reply({ id: 'n' });
    await managed.registerManaged({ deal: 'rent', price: 10 });
    expect(net.last()).toMatchObject({ path: '/me/managed-properties', method: 'POST', body: { deal: 'rent', monthlyRent: 10 } });
    net.reply({ id: 'n', title: 'T' });
    expect(await managed.updateManaged('n', { title: 'T' })).toMatchObject({ title: 'T' });
    expect(net.last()).toMatchObject({ path: '/me/managed-properties/n', method: 'PATCH', body: { title: 'T' } });
    await managed.deleteManaged('n');
    expect(net.last()).toMatchObject({ path: '/me/managed-properties/n', method: 'DELETE' });
    net.reply({ id: 'n' });
    await managed.stopRentTracking('n');
    expect(net.last()).toMatchObject({ path: '/me/managed-properties/n/rent-tracking', method: 'DELETE' });
  });

  it('rent receipts', async () => {
    net.reply([{ id: 'r' }]);
    expect(await managed.listRentReceipts('m1')).toHaveLength(1);
    expect(net.last()).toMatchObject({ path: '/me/managed-properties/m1/rent-receipts', query: { months: '6' } });
    net.reply({ id: 'r', rentMonth: '2026-02' });
    expect(await managed.recordRentReceipt('m1', '2026-02')).toMatchObject({ ym: '2026-02' });
    expect(net.last().body).toEqual({ rentMonth: '2026-02' });
    net.reply(null);
    await expect(managed.recordRentReceipt('m1', '2026-03')).rejects.toThrow('returned nothing');
  });

  describe('ensureManagedForListing', () => {
    it('skips invalid and flatmate listings without calling the API', async () => {
      expect(await managed.ensureManagedForListing(null)).toBeNull();
      expect(await managed.ensureManagedForListing({})).toBeNull();
      expect(await managed.ensureManagedForListing({ id: 'x', flatmate: true })).toBeNull();
      expect(await managed.ensureManagedForListing({ id: 'x', flatmatePost: {} })).toBeNull();
      expect(await managed.ensureManagedForListing({ id: 'x', flatmateGroup: 1 })).toBeNull();
      expect(net.calls).toHaveLength(0);
    });

    it('registers the published listing', async () => {
      net.reply({ id: 'm9', publishedListingId: 'L1' });
      const res = await managed.ensureManagedForListing({ id: 'L1', title: 'T', deal: 'buy', price: 100, bhkNum: 2, type: 'Flat' });
      expect(net.last().body).toMatchObject({ publishedListingId: 'L1', deal: 'buy', bhk: 2, title: 'T' });
      expect(res).toMatchObject({ id: 'm9', publishedListingId: 'L1' });
      await managed.ensureManagedForListing({ id: 'L2', deal: 'rent', bhk: '3' });
      expect(net.last().body).toMatchObject({ deal: 'rent', bhk: 3 });
    });

    it('treats 409/404 as already-managed and rethrows others', async () => {
      net.reply(status(409, { message: 'dup' }));
      expect(await managed.ensureManagedForListing({ id: 'L1' })).toBeNull();
      net.reply(status(404, { message: 'x' }));
      expect(await managed.ensureManagedForListing({ id: 'L1' })).toBeNull();
      net.reply(status(500, { message: 'x' }));
      await expect(managed.ensureManagedForListing({ id: 'L1' })).rejects.toMatchObject({ status: 500 });
    });
  });
});
