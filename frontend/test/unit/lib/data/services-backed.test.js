import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const myListings = vi.fn();
const myFlatmatePosts = vi.fn();
const myFlatmateGroups = vi.fn();
const myFlatmateRooms = vi.fn();
const getPropertiesByIds = vi.fn();
const getEntitlements = vi.fn();
const listingSlots = vi.fn();

vi.mock('../../../../src/services/propertyService.js', () => ({
  myListings: (...a) => myListings(...a),
  getPropertiesByIds: (...a) => getPropertiesByIds(...a),
  listingSlots: (...a) => listingSlots(...a),
}));
vi.mock('../../../../src/services/flatmateService.js', () => ({
  myFlatmatePosts: (...a) => myFlatmatePosts(...a),
  myFlatmateGroups: (...a) => myFlatmateGroups(...a),
  myFlatmateRooms: (...a) => myFlatmateRooms(...a),
}));
vi.mock('../../../../src/services/entitlementService.js', () => ({ getEntitlements: (...a) => getEntitlements(...a) }));
vi.mock('../../../../src/services/http.js', () => ({ REVISIT_MAX_AGE: 12345 }));
vi.mock('../../../../src/i18n/index.js', () => ({ default: { t: (k, o) => `${k}|${o?.defaultValue}` } }));

import * as my from '../../../../src/lib/data/myListings.js';
import { toRentalCard, toRentalCards, tenancyStatus } from '../../../../src/lib/data/tenancy.js';
import { depositInfo, fyLabel, fyStart, hraExemption } from '../../../../src/lib/data/tenantFinance.js';
import { CATEGORIES, STATUS, fmtTime, getCatIcon, getCatLabel, getStatusLabel } from '../../../../src/lib/data/support.js';
import { evaluateListingDedup, fingerprintKeys } from '../../../../src/lib/data/propertyIdentity.js';
import { estimateValuation } from '../../../../src/lib/data/valuation.js';
import { ROOM_SHARE_MAX, bedroomsOf, canSplitIntoRooms, capBoundsFor, maxRoomsForBhk } from '../../../../src/lib/data/flatSplit.js';
import { loadListingQuota, loadWizardQuota } from '../../../../src/lib/data/listingQuota.js';
import { TEAM_LABEL } from '../../../../src/lib/data/tickets.js';

beforeEach(() => {
  [myListings, myFlatmatePosts, myFlatmateGroups, myFlatmateRooms, getPropertiesByIds, getEntitlements, listingSlots].forEach((f) => f.mockReset());
});
afterEach(() => vi.useRealTimers());

describe('myListings: case keys', () => {
  it('classifies flatmate kinds', () => {
    expect(my.flatmateKindOf({ flatmateGroup: true, flatmate: true })).toBe('group');
    expect(my.flatmateKindOf({ flatmatePost: true, flatmate: true })).toBe('post');
    expect(my.flatmateKindOf({ flatmate: true })).toBe('room');
    expect(my.flatmateKindOf({})).toBeNull();
    expect(my.flatmateKindOf(null)).toBeNull();
  });

  it('round-trips case keys', () => {
    expect(my.flatmateCaseKey({ flatmate: true, id: 'r1' })).toBe('fm:room:r1');
    expect(my.flatmateCaseKey({ id: 'p1' })).toBeNull();
    expect(my.parseFlatmateCaseKey('fm:group:g:1')).toEqual({ kind: 'group', id: 'g:1' });
    expect(my.parseFlatmateCaseKey('fm:other:1')).toBeNull();
    expect(my.parseFlatmateCaseKey(null)).toBeNull();
  });
});

describe('myListings: mapping', () => {
  it('maps a flatmate post', () => {
    const l = my.flatmatePostToListing({ id: 'p', localities: ['Baner'], budget: 9000, modStatus: 'needs_info', mobile: '9', createdAt: 't' });
    expect(l).toMatchObject({ id: 'p', title: 'Looking to share \u2014 Baner', locality: 'Baner', price: 9000, status: 'pending', flatmatePost: true, ownerMobile: '9', type: 'Flatmate' });
    expect(my.flatmatePostToListing({ id: 'q' })).toMatchObject({ locality: 'Pune', ownerMobile: '', status: 'pending' });
  });

  it.each([
    ['live', 'approved'], ['approved', 'approved'], ['flagged', 'pending'], ['removed', 'rejected'], ['rejected', 'rejected'], ['expired', 'expired'], ['weird', 'pending'], [undefined, 'pending'],
  ])('maps moderation %s to card status %s', (mod, status) => {
    expect(my.flatmatePostToListing({ id: 'x', modStatus: mod }).status).toBe(status);
  });

  it('maps a group with per-head rent and ownership verification', () => {
    const g = my.flatmateGroupToListing({ id: 'g', title: 'T', rent: 30000, seatsTotal: 3, verificationTier: 'owner', hunting: false, modStatus: 'live' });
    expect(g).toMatchObject({ price: 10000, flatmateGroup: true, ownershipVerified: true, status: 'approved', locality: 'Pune' });
    expect(my.flatmateGroupToListing({ id: 'g', rent: 5000 }).price).toBe(5000);
    expect(my.flatmateGroupToListing({ id: 'g', verificationTier: 'tenant', reviewStatus: 'approved' }).ownershipVerified).toBe(true);
    expect(my.flatmateGroupToListing({ id: 'g', verificationTier: 'tenant', reviewStatus: 'pending' }).ownershipVerified).toBe(false);
    expect(my.flatmateGroupToListing({ id: 'g', verificationTier: 'owner', hunting: true }).ownershipVerified).toBe(false);
  });

  it('maps a room with title and locality fallbacks', () => {
    expect(my.roomToListing({ id: 'r', title: 'Mine', cover: 'c.jpg', budget: 0, occupants: 2, propertyId: 'p1' })).toMatchObject({ title: 'Mine', image: 'c.jpg', price: 0, occupants: 2, propertyId: 'p1' });
    expect(my.roomToListing({ id: 'r', flatType: '2BHK', society: 'Sun', localities: ['Aundh'] })).toMatchObject({ title: 'Flatmate \u2014 2BHK Sun', locality: 'Aundh', image: null, propertyId: null });
    expect(my.roomToListing({ id: 'r', locality: 'Wakad' }).title).toBe('Flatmate \u2014 Wakad');
    expect(my.roomToListing({ id: 'r', verificationTier: 'owner' }).ownershipVerified).toBe(true);
  });

  it('orders rows with posts, groups, rooms and then properties', () => {
    const rows = [{ id: 'a' }, { id: 'b', flatmatePost: true, flatmate: true }, { id: 'c', flatmateGroup: true, flatmate: true }, { id: 'd', flatmate: true }];
    const out = my.withRooms(rows, [{ id: 'room' }]);
    expect(out.map((r) => r.id)).toEqual(['b', 'c', 'room', 'a']);
  });
});

describe('myListings: loading', () => {
  it('loads all four sources and hides archived properties without a note', async () => {
    myListings.mockResolvedValue([{ id: 'p1' }, { id: 'p2', archived: true }, { id: 'p3', archived: true, archivedNote: 'sold' }]);
    myFlatmateRooms.mockResolvedValue({ items: [{ id: 'r1' }] });
    myFlatmatePosts.mockResolvedValue({ items: [{ id: 'f1' }] });
    myFlatmateGroups.mockResolvedValue({ items: [{ id: 'g1' }] });
    const out = await my.loadMyListings({ id: 'u' });
    expect(myListings).toHaveBeenCalledWith({ id: 'u' });
    expect(myFlatmatePosts).toHaveBeenCalledWith({ size: 100 });
    expect(out.map((l) => l.id)).toEqual(['f1', 'g1', 'r1', 'p1', 'p3']);
  });

  it('getMy* helpers map the page items', async () => {
    myFlatmateRooms.mockResolvedValue({ items: [{ id: 'r' }] });
    myFlatmatePosts.mockResolvedValue({ items: [{ id: 'f' }] });
    myFlatmateGroups.mockResolvedValue({ items: [{ id: 'g' }] });
    expect((await my.getMyRooms())[0].flatmate).toBe(true);
    expect((await my.getMyFlatmatePosts())[0].flatmatePost).toBe(true);
    expect((await my.getMyFlatmateGroups())[0].flatmateGroup).toBe(true);
  });
});

describe('tenancy', () => {
  it('builds a card with defaults', () => {
    expect(toRentalCard(undefined, undefined)).toMatchObject({ id: '', title: 'Rented home', address: 'Pune', ownerName: 'Your landlord', rent: 0, deposit: 0, dueDay: 1, status: 'active', pending: false, image: null });
  });

  it('derives due day from the lease start, capped at 28', () => {
    expect(toRentalCard({ startDate: '2026-02-15' }).dueDay).toBe(15);
    expect(toRentalCard({ startDate: '2026-01-31' }).dueDay).toBe(28);
    expect(toRentalCard({ startDate: '2026-01-xx' }).dueDay).toBe(1);
    expect(toRentalCard({ startDate: '2026-01-00' }).dueDay).toBe(1);
  });

  it('merges row and listing details', () => {
    const card = toRentalCard(
      { id: 'r1', propertyId: 'p1', ownerMobile: '+91 98765-43210', rent: '25000', deposit: '50000', startDate: '2026-03-05', endDate: '2027-02-28', status: 'pending', ownerName: 'Ravi' },
      { title: 'T', locality: 'Baner', localitySlug: 'baner', bhk: 2, img: 'i.jpg' },
    );
    expect(card).toMatchObject({ propId: 'p1', address: 'Baner', ownerMobile: '919876543210', rent: 25000, deposit: 50000, leaseStart: '2026-03-05', leaseEnd: '2027-02-28', pending: true, image: 'i.jpg', ownerName: 'Ravi' });
  });

  it('batches the property lookup and matches by id or uuid', async () => {
    getPropertiesByIds.mockResolvedValue([{ id: 'p1', title: 'One' }, { uuid: 'u2', title: 'Two' }]);
    const cards = await toRentalCards([{ propId: 'p1' }, { propertyId: 'u2' }, { propId: 'p1' }, null, {}]);
    expect(getPropertiesByIds).toHaveBeenCalledWith(['p1', 'u2']);
    expect(cards.map((c) => c.title)).toEqual(['One', 'Two', 'One', 'Rented home', 'Rented home']);
  });

  it('survives lookup failure and skips lookups with no ids', async () => {
    getPropertiesByIds.mockRejectedValue(new Error('x'));
    expect((await toRentalCards([{ propId: 'p' }]))[0].title).toBe('Rented home');
    getPropertiesByIds.mockClear();
    expect(await toRentalCards(undefined)).toEqual([]);
    await toRentalCards([{}]);
    expect(getPropertiesByIds).not.toHaveBeenCalled();
  });

  it('computes the next due date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 10, 12));
    const later = tenancyStatus({ dueDay: 20 });
    expect(later.month).toBe('2026-05');
    expect(later.nextDue).toEqual(new Date(2026, 4, 20));
    expect(later.nextDueLabel).toMatch(/20\s+May\s+2026/);
    expect(tenancyStatus({ dueDay: 3 }).nextDue).toEqual(new Date(2026, 5, 3));
    expect(tenancyStatus({ dueDay: 10 }).nextDue).toEqual(new Date(2026, 4, 10));
    expect(tenancyStatus(undefined).nextDue).toEqual(new Date(2026, 5, 1));
  });

  it('has no due date for pending or declined tenancies', () => {
    expect(tenancyStatus({ status: 'pending' })).toMatchObject({ nextDue: null, nextDueLabel: '' });
    expect(tenancyStatus({ status: 'declined', dueDay: 5 }).nextDue).toBeNull();
  });
});

describe('tenantFinance', () => {
  it('starts the financial year in April', () => {
    expect(fyStart(new Date(2026, 3, 1))).toEqual(new Date(2026, 3, 1));
    expect(fyStart(new Date(2026, 2, 31))).toEqual(new Date(2025, 3, 1));
    expect(fyLabel(new Date(2026, 5, 1))).toBe('FY 2026\u201327');
    expect(fyLabel(new Date(2026, 0, 1))).toBe('FY 2025\u201326');
  });

  it('computes the HRA exemption as the lowest of the limits', () => {
    expect(hraExemption({ annualRent: 240000, annualBasic: 600000, metro: false })).toEqual({ exemption: 180000, taxSaved: 36000, limitRent: 180000, limitPct: 240000, pct: 0.4 });
    expect(hraExemption({ annualRent: 600000, annualBasic: 600000, metro: true, slabRate: 0.3 })).toMatchObject({ exemption: 300000, taxSaved: 90000, pct: 0.5 });
    expect(hraExemption({ annualRent: 10000, annualBasic: 600000 }).exemption).toBe(0);
    expect(hraExemption({ annualRent: 100000, annualBasic: 0 })).toMatchObject({ exemption: 0, taxSaved: 0 });
    expect(hraExemption({}).exemption).toBe(0);
  });

  it('describes a locked deposit', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15));
    expect(depositInfo({ deposit: '100000', leaseStart: '2025-12', leaseEnd: '2026-11' })).toEqual({ deposit: 100000, monthsLocked: 6, refundDate: new Date(2026, 10, 1), foregoneAnnual: 6500 });
    expect(depositInfo({ deposit: 100000, leaseStart: '2027-01' }, 0.1)).toMatchObject({ monthsLocked: 0, refundDate: null, foregoneAnnual: 10000 });
    expect(depositInfo(undefined)).toEqual({ deposit: 0, monthsLocked: 0, refundDate: null, foregoneAnnual: 0 });
  });
});

describe('support helpers', () => {
  it('resolves labels through i18n with English defaults', () => {
    expect(getCatLabel('payment')).toBe('misc.cat_payment|Payments & Refunds');
    expect(getCatLabel('zzz')).toBe('misc.cat_zzz|Support');
    expect(getStatusLabel('waiting')).toBe('misc.status_waiting|Awaiting your reply');
    expect(getStatusLabel('weird')).toBe('misc.status_weird|weird');
    expect(CATEGORIES).toHaveLength(9);
    expect(Object.keys(STATUS)).toContain('in-progress');
  });

  it('resolves icons', () => {
    expect(getCatIcon('technical')).toBe('bug');
    expect(getCatIcon('zzz')).toBe('help-circle');
  });

  it('formats relative times', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 15, 0, 0));
    expect(fmtTime(null)).toBe('');
    expect(fmtTime(new Date(2026, 5, 15, 14, 59, 30))).toBe('just now');
    expect(fmtTime(new Date(2026, 5, 15, 14, 30, 0))).toBe('30 min ago');
    expect(fmtTime(new Date(2026, 5, 15, 9, 5, 0))).toMatch(/9:05\s*am/i);
    const old = fmtTime(new Date(2026, 5, 10, 9, 5, 0));
    expect(old).toMatch(/10\s+Jun,\s+9:05\s*am/i);
  });
});

describe('propertyIdentity', () => {
  it('fingerprints by electricity consumer number and unit address', () => {
    const keys = fingerprintKeys({ electricityConsumerNo: '12-345 678', society: ' Sun  City ', flatNumber: 'A-4', pincode: '411 045', locality: 'Baner' });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^ec:[0-9a-z]+$/);
    expect(keys[1]).toBe('addr:sun city|a-4|411045|baner');
  });

  it('skips weak signals and falls back to the tower', () => {
    expect(fingerprintKeys({ electricityConsumerNo: '123' })).toEqual([]);
    expect(fingerprintKeys({ society: 'S', flatNumber: '' })).toEqual([]);
    expect(fingerprintKeys({ society: 'S', tower: 'T2' })).toEqual(['addr:s|t2||']);
    expect(fingerprintKeys()).toEqual([]);
  });

  it('keeps the first key as the primary fingerprint', () => {
    const r = evaluateListingDedup({ fields: { electricityConsumerNo: '123456', society: 'S', flatNumber: '1' } });
    expect(r.fingerprint).toBe(r.fingerprintKeys[0]);
    expect(r.fingerprintKeys).toHaveLength(2);
    expect(evaluateListingDedup()).toEqual({ fingerprint: '', fingerprintKeys: [] });
  });
});

describe('estimateValuation', () => {
  const locality = { name: 'Baner', ratePerSqft: 10000, avgRent: 30000 };

  it('needs locality rates', () => {
    expect(estimateValuation()).toBeNull();
    expect(estimateValuation({ locality: { name: 'x', ratePerSqft: 1 } })).toBeNull();
  });

  it('estimates with defaults for a 2 BHK', () => {
    expect(estimateValuation({ locality })).toEqual({
      locality: 'Baner', perSqft: 10000, area: 900, bhk: 2,
      rent: { low: 26400, mid: 30000, high: 33600 },
      sale: { low: 7920000, mid: 9000000, high: 10080000 },
    });
  });

  it('scales by BHK, area and furnishing and clamps inputs', () => {
    const e = estimateValuation({ locality, bhk: 3, area: 1000, furnishing: 'furnished' });
    expect(e.rent.mid).toBe(49000);
    expect(e.sale.mid).toBe(10400000);
    expect(estimateValuation({ locality, bhk: 9 }).bhk).toBe(4);
    expect(estimateValuation({ locality, bhk: 0 }).bhk).toBe(2);
    expect(estimateValuation({ locality, area: 50 }).area).toBe(150);
    expect(estimateValuation({ locality, furnishing: 'mystery' }).rent.mid).toBe(30000);
  });
});

describe('flatSplit', () => {
  it('reads bedrooms from BHK values', () => {
    expect(bedroomsOf('3 BHK')).toBe(3);
    expect(bedroomsOf(2)).toBe(2);
    expect(bedroomsOf('studio')).toBe(0);
    expect(bedroomsOf(null)).toBe(0);
    expect(bedroomsOf(-1)).toBe(0);
  });

  it('allows one more room than bedrooms, unlimited from 4 BHK', () => {
    expect(maxRoomsForBhk(2)).toBe(3);
    expect(maxRoomsForBhk('studio')).toBe(2);
    expect(maxRoomsForBhk(4)).toBe(Infinity);
  });

  it('can split rentals of residential homes with an id', () => {
    expect(canSplitIntoRooms({ deal: 'rent', id: 1, type: 'Flat' })).toBe(true);
    expect(canSplitIntoRooms({ deal: 'sale', id: 1, type: 'Flat' })).toBe(false);
    expect(canSplitIntoRooms({ deal: 'rent', type: 'Flat' })).toBe(false);
    expect(canSplitIntoRooms({ deal: 'rent', id: 1, type: 'Office' })).toBe(false);
    expect(canSplitIntoRooms(null)).toBe(false);
  });

  it('bounds the cap by room count', () => {
    expect(ROOM_SHARE_MAX).toBe(3);
    expect(capBoundsFor(2)).toEqual({ min: 2, max: 6 });
    expect(capBoundsFor(0)).toEqual({ min: 1, max: 3 });
  });
});

describe('listing quota', () => {
  it('summarises entitlements with passes by property id', async () => {
    getEntitlements.mockResolvedValue({ listings: { allowance: 3, used: 3, passes: [{ propertyId: 7, expiresAt: 'x' }] } });
    expect(await loadListingQuota()).toEqual({ used: 3, allowance: 3, full: true, passes: { 7: 'x' } });
    expect(getEntitlements).toHaveBeenCalledWith({ maxAge: 12345 });
  });

  it('treats a missing or non-numeric allowance as unlimited', async () => {
    getEntitlements.mockResolvedValue({ listings: { used: '2' } });
    expect(await loadListingQuota()).toEqual({ used: 2, allowance: null, full: false, passes: {} });
  });

  it('falls back to an empty standing on failure', async () => {
    getEntitlements.mockRejectedValue(new Error('x'));
    expect(await loadListingQuota()).toEqual({ used: 0, allowance: null, full: false, passes: {} });
    listingSlots.mockRejectedValue(new Error('x'));
    expect(await loadWizardQuota()).toEqual({ used: 0, allowance: null, full: false, passes: {} });
  });

  it('loads wizard slots', async () => {
    listingSlots.mockResolvedValue({ allowance: 1, used: 0 });
    expect(await loadWizardQuota()).toMatchObject({ full: false, allowance: 1 });
  });
});

describe('ticket teams', () => {
  it('labels each service team', () => {
    expect(TEAM_LABEL.rental).toBe('Rent Agreement');
    expect(Object.keys(TEAM_LABEL)).toHaveLength(6);
  });
});
