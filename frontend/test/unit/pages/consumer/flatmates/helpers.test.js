import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as H from '../../../../../src/pages/consumer/flatmates/helpers.js';
import * as M from '../../../../../src/pages/consumer/flatmates/model.js';
import { uploadPersonalDocument } from '../../../../../src/services/documentService.js';

vi.mock('../../../../../src/services/documentService.js', () => ({ uploadPersonalDocument: vi.fn() }));

const t = (key, vars) => (vars ? `${key}:${vars.amount}` : key);

describe('flatmates helpers: titles and formatting', () => {
  it('builds paths', () => {
    expect(H.detailPath('room', 'a b')).toBe('/flatmates/room/a%20b');
    expect(H.roomEditHref('x/y')).toBe('/list-property?flatmate=1&editRoom=x%2Fy');
    expect(H.segClass(true)).toMatch(/ active$/);
    expect(H.segClass(false)).not.toMatch(/active/);
  });

  it('derives titles', () => {
    expect(H.roomTitle({ title: 'T' })).toBe('T');
    expect(H.roomTitle({ society: 'S' })).toBe('S');
    expect(H.roomTitle({ flatType: '2BHK', localities: ['Baner'] })).toBe('2BHK in Baner');
    expect(H.roomTitle({ locality: 'Aundh' })).toBe('Room in Aundh');
    expect(H.roomTitle({})).toBe('Room in Pune');
    expect(H.seekerTitle({ name: 'Ann' })).toBe('Ann');
    expect(H.seekerTitle({})).toBe('Flatmate');
    expect(H.seekerHeadline({ occupation: ' Dev ', localities: ['A', 'B'] })).toContain('Dev looking for a room in A, B');
    expect(H.seekerHeadline({})).toContain('Flatmate looking for a room');
  });

  it('formats money and labels', () => {
    expect(H.inr(25000)).toBe('\u20b925,000');
    expect(H.initials('ann lee kim')).toBe('AL');
    expect(H.initials('')).toBe('?');
    expect(H.avatarGrad('female')).toContain('pink');
    expect(H.avatarGrad('male')).toContain('blue');
    expect(H.avatarGrad('x')).toContain('teal');
    expect(H.policyAvatar('women')).toContain('pink');
    expect(H.policyAvatar('men')).toContain('blue');
    expect(H.policyAvatar('any')).toContain('teal');
    expect([H.genderLabel('female'), H.genderLabel('male'), H.genderLabel()]).toEqual(['Woman', 'Man', 'Flatmate']);
    expect([H.genderPref('female'), H.genderPref('male'), H.genderPref()]).toEqual(['Women only', 'Men only', 'Anyone']);
    expect([H.foodLabel('veg'), H.foodLabel('nonveg'), H.foodLabel()]).toEqual(['Veg only', 'Non-veg ok', 'Any food']);
    expect(H.perHead({ rent: 30000, seatsTotal: 4 })).toBe(7500);
    expect(H.shareFloor({ seatsTotal: 4, preferences: { rentMin: 20000 } })).toBe(5000);
    expect(H.shareFloor({ seatsTotal: 4 })).toBeNull();
  });

  it('formats money ranges', () => {
    expect(H.moneyRange(1000, 1000, t)).toBe('\u20b91,000');
    expect(H.moneyRange(1000, 2000, t)).toContain('\u20b91,000');
    expect(H.moneyRange(0, 2000, t)).toBe('flatmates.upToAmount:\u20b92,000');
    expect(H.moneyRange(1000, 0, t)).toBe('flatmates.fromAmount:\u20b91,000');
    expect(H.moneyRange(0, 0, t)).toBeNull();
    expect(H.seekerBudget({ budget: 5000, budgetMax: 8000 })).toContain('\u20b95,000');
    expect(H.seekerBudget({ budget: 5000, budgetMax: 3000 })).toBe('\u20b95,000');
    expect(H.bhkText(['2', '4'])).toBe('2 / 4+ BHK');
    expect(H.bhkText([])).toBeNull();
  });
});

describe('flatmates helpers: urls and must-haves', () => {
  it('builds a group listings url', () => {
    const url = H.groupListingsUrl({
      localities: ['Baner'], localitySlug: 'baner-slug', bhk: ['2', '4'], rentMin: 1000, rentMax: 2000, depositMax: 500, furnishing: 'semi', bachelors: true,
      gatedOnly: true, parking: 'car',
    });
    const q = new URLSearchParams(url.split('?')[1]);
    expect(url.startsWith('/listings?')).toBe(true);
    expect(q.get('loc')).toBe('baner-slug');
    expect(q.get('bhks')).toBe('2,4plus');
    expect(q.get('rent')).toBe('1000-2000');
    expect(q.get('deposit')).toBe('0-500');
    expect(q.get('furn')).toBe('semi');
    expect(q.get('tenants')).toBe('bachelors');
    expect(q.get('amen')).toBe('security,parking');
    expect(H.groupListingsUrl({ locality: 'Wakad' })).toMatch(/loc=wakad/);
    expect(H.groupListingsUrl({})).toBe('/listings?deal=rent');
  });

  it('builds a matching rooms url', () => {
    const q = new URLSearchParams(H.matchingRoomsUrl({ locality: 'Baner', budget: 9000, budgetMax: 12000, furnishing: 'semi', gatedOnly: true, attachedBath: true }).split('?')[1]);
    expect(Object.fromEntries(q)).toEqual({ view: 'move-in', loc: 'Baner', budget: '0-12000', furn: 'semi', gated: '1', bath: '1' });
    expect(H.matchingRoomsUrl({ localities: ['A', 'B'], budget: 5, furnishing: 'unfurnished' })).toBe('/flatmates?view=move-in&budget=0-5');
  });

  it('lists must-haves that have labels', () => {
    expect(H.mustHaves({ gatedOnly: true, bachelors: true, attachedBath: true, parking: 'car' }, t).map(([i]) => i))
      .toEqual(['building-2', 'bath', 'parking-circle', 'users']);
    expect(H.mustHaves({}, t)).toEqual([]);
  });
});

describe('flatmates helpers: seats and verification', () => {
  it('computes seats', () => {
    const g = { seatsTotal: 4, members: [{}, {}] };
    expect(H.maxOpenSeats(g)).toBe(2);
    expect(H.maxOpenSeats({ seatsTotal: 1, members: [{}, {}] })).toBe(0);
    expect(H.seatsLeft(g)).toBe(2);
    expect(H.seatsLeft({ ...g, seatsOpen: 1 })).toBe(1);
    expect(H.seatsLeft({ ...g, seatsOpen: 9 })).toBe(2);
    expect(H.seatsLeft({ ...g, seatsOpen: -2 })).toBe(0);
    expect(H.seatCeiling('group', { ...g, seatsOpen: 1 })).toBe(1 + H.MAX_GROUP_SEATS - 4);
    expect(H.seatCeiling('room', g)).toBe(2);
    expect(H.groupLocalities({ localities: ['A'] })).toEqual(['A']);
    expect(H.groupLocalities({ locality: 'B' })).toEqual(['B']);
    expect(H.groupLocalities({})).toEqual([]);
  });

  it('checks verification', () => {
    expect(H.allVerified({ members: [] })).toBe(false);
    expect(H.allVerified({ members: [{ verified: true }, { verified: true }] })).toBe(true);
    expect(H.allVerified({ members: [{ verified: true }, {}] })).toBe(false);
    expect(H.hostTierMeta({ verificationTier: 'owner' })).toBeTruthy();
    expect(H.hostTierMeta({ verificationTier: 'x' })).toBeNull();
    expect(H.hostTierMeta(null)).toBeNull();
    expect(H.showHostBadge({ verificationTier: 'tenant' }, 'approved')).toBe(true);
    expect(H.showHostBadge({ verificationTier: 'tenant' }, 'pending')).toBe(false);
    expect(H.showHostBadge({ verificationTier: 'owner' }, 'pending')).toBe(true);
    expect(H.showHostBadge({ verificationTier: 'owner' }, 'pending', false)).toBe(false);
    expect(H.showHostBadge({}, 'approved')).toBe(false);
    expect(H.hostVerifiedFor({ verificationTier: 'owner' })).toBe(true);
    expect(H.hostVerifiedFor({ verificationTier: 'tenant' }, 'approved')).toBe(true);
    expect(H.hostVerifiedFor({ verificationTier: 'tenant' }, 'x')).toBe(false);
    expect(H.hostVerifiedFor({})).toBe(false);
    expect(H.hostVerifiedFor(null)).toBe(false);
  });
});

describe('flatmates helpers: matching, freshness, dates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 10, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('matchFor tiers', () => {
    const me = { localities: ['Baner'], budget: 10000, budgetMax: 14000, gender: 'male' };
    expect(H.matchFor({ locality: 'Baner' }, null)).toBeNull();
    expect(H.matchFor({ locality: 'Aundh', budget: 1 }, me)).toBeNull();
    expect(H.matchFor({ locality: 'Baner', gender: 'female' }, me)).toBeNull();
    expect(H.matchFor({ locality: 'Baner' }, me)).toEqual({ tier: 'good', locality: 'Baner', budget: '\u20b910k\u201314k' });
    expect(H.matchFor({ locality: 'Baner', budget: 12000 }, me).tier).toBe('great');
    expect(H.matchFor({ localities: ['Baner'], budget: 17000 }, me).tier).toBe('good');
    expect(H.matchFor({ locality: 'Baner', budget: 50000 }, me)).toBeNull();
    expect(H.matchFor({ locality: 'Baner', budget: 500 }, { localities: ['Baner'], budget: 500 }).budget).toBe('\u20b9500');
    expect(H.matchFor({ locality: 'Baner', gender: 'any' }, { localities: ['Baner'] }).tier).toBe('good');
  });

  it('isFresh uses createdAt or relative time text', () => {
    expect(H.isFresh({ createdAt: Date.now() - 60000 })).toBe(true);
    expect(H.isFresh({ createdAt: Date.now() - 2 * 86400000 })).toBe(false);
    expect(H.isFresh({ time: 'Just now' })).toBe(true);
    expect(H.isFresh({})).toBe(true);
    expect(H.isFresh({ time: '3 hours ago' })).toBe(true);
    expect(H.isFresh({ time: '30 mins ago' })).toBe(true);
    expect(H.isFresh({ time: '2 days ago' })).toBe(false);
    expect(H.isFresh({ time: '1 week ago' })).toBe(false);
    expect(H.isFresh({ time: 'long ago' })).toBe(false);
  });

  it('handles move-in dates', () => {
    expect(H.todayIso()).toBe('2026-03-10');
    expect(H.isDateVal('2026-01-01')).toBe(true);
    expect(H.isDateVal('now')).toBe(false);
    expect(H.moveInLabel('now')).toBe('Immediately');
    expect(H.moveInLabel('2026-03-09')).toBe('Immediately');
    expect(H.moveInLabel('2026-04-05')).toMatch(/^By /);
    expect(H.moveInLabel('2026-04-05', '')).not.toMatch(/^By /);
    expect(H.moveInLabel('x')).toBe('Flexible');
    expect(H.moveInLabel('2026-99-99')).toBe('Flexible');
    expect(H.moveInByForm('2026-03-01')).toBe('now');
    expect(H.moveInByForm('2026-05-01')).toBe('2026-05-01');
    expect(H.moveInByForm('')).toBe('');
    expect(H.moveInByWire('2026-05-01')).toBe('2026-05-01');
    expect(H.moveInByWire('')).toBeNull();
    expect(H.moveInByWire('now', '2026-03-01')).toBe('2026-03-01');
    expect(H.moveInByWire('now', '2026-09-01')).toBe('2026-03-10');
    expect(H.moveInByWire('now')).toBe('2026-03-10');
  });
});

describe('flatmates helpers: agreement docs', () => {
  it('rejects non image/pdf files and missing files', async () => {
    expect(await H.readAgreementDoc(null)).toBeNull();
    expect(await H.readAgreementDoc({ type: 'text/plain' })).toBeNull();
  });

  it('flags oversize files without reading them', async () => {
    uploadPersonalDocument.mockResolvedValue({ id: 'doc1' });
    const doc = await H.readAgreementDoc({ name: 'a.pdf', size: 4 * 1024 * 1024, type: 'application/pdf' });
    expect(doc).toMatchObject({ id: 'doc1', tooLarge: true, dataUrl: null, name: 'a.pdf' });
    expect(uploadPersonalDocument).toHaveBeenCalledWith(expect.objectContaining({ category: 'Rent agreement' }));
  });

  it('reads small files as data urls', async () => {
    uploadPersonalDocument.mockResolvedValue({ id: 'doc2' });
    const file = new File(['hello'], 'a.png', { type: 'image/png' });
    const doc = await H.readAgreementDoc(file, 'Other');
    expect(doc.id).toBe('doc2');
    expect(doc.dataUrl).toMatch(/^data:image\/png/);
    expect(uploadPersonalDocument).toHaveBeenCalledWith({ category: 'Other', file });
  });

  it('falls back to a null dataUrl when the reader errors', async () => {
    uploadPersonalDocument.mockResolvedValue({ id: 'doc3' });
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function fail() { this.onerror(); });
    const doc = await H.readAgreementDoc(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    expect(doc).toMatchObject({ id: 'doc3', dataUrl: null });
  });

  it('checks evidence', () => {
    expect(H.hasAgreementEvidence({ id: 'x' })).toBe(true);
    expect(H.hasAgreementEvidence({})).toBe(false);
    expect(H.hasAgreementEvidence(null)).toBe(false);
  });
});

describe('flatmates helpers: saved cards, coords, terms', () => {
  it('builds saved cards per kind', () => {
    expect(H.toSavedCard(null)).toBeNull();
    expect(H.toSavedCard({})).toBeNull();
    const room = H.toSavedCard({ id: 1, kind: 'room', locality: 'Baner', budget: 8000, flatType: '2BHK', roomType: 'Private', cover: 'c.jpg' });
    expect(room).toMatchObject({ id: 'r:1', saveKind: 'room', loc: 'Baner, Pune', priceNum: 8000, img: 'c.jpg' });
    expect(room.sub).toBe('2BHK \u00b7 Private');
    expect(H.toSavedCard({ id: 2, kind: 'room' })).toMatchObject({ loc: 'Pune', img: H.FLATMATE_IMG });
    const group = H.toSavedCard({ id: 3, kind: 'group', locality: 'Wakad', rent: 30000, seatsTotal: 3, members: [{}] });
    expect(group).toMatchObject({ id: 'g:3', title: 'Flatmate group', loc: 'Wakad, Pune', priceNum: 10000, img: H.FLATMATE_GROUP_IMG });
    expect(group.sub).toBe('1 member \u00b7 2 spots open');
    expect(H.toSavedCard({ id: 4, kind: 'group', rent: 3000, seatsTotal: 3, members: [{}, {}], seatsOpen: 1 }).sub).toBe('2 members \u00b7 1 spot open');
    const seeker = H.toSavedCard({ id: 5, name: 'Ann', gender: 'female', age: 24, occupation: 'Dev', budget: 7000, localities: ['Aundh'] });
    expect(seeker).toMatchObject({ id: 's:5', saveKind: 'post', loc: 'Aundh, Pune', title: 'Ann' });
    expect(seeker.sub).toBe('Woman \u00b7 24 \u00b7 Dev');
    expect(H.toSavedCard({ id: 6 }).loc).toBe('Pune');
  });

  it('adds deterministic jittered coords', () => {
    const coords = { Baner: [18.5, 73.8] };
    const post = { id: 'p1', locality: 'Baner' };
    const a = H.withCoords(post, coords);
    expect(a).toEqual(H.withCoords(post, coords));
    expect(Math.abs(a.lat - 18.5)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(a.lng - 73.8)).toBeLessThanOrEqual(0.005);
    expect(H.withCoords({ id: 2, localities: ['Baner'] }, coords).lat).toBeTypeOf('number');
    expect(H.withCoords(post)).toBe(post);
    expect(H.withCoords({ id: 1, locality: 'Nowhere' }, coords).lat).toBeUndefined();
    const withLL = { lat: 1, lng: 2, locality: 'Baner' };
    expect(H.withCoords(withLL, coords)).toBe(withLL);
    expect(H.withCoords(null, coords)).toBeNull();
  });

  it('computes budget bounds and numeric/term helpers', () => {
    expect(H.budgetIsAny([H.BUDGET_MIN, H.BUDGET_MAX])).toBe(true);
    expect(H.budgetIsAny([100, H.BUDGET_MAX])).toBe(false);
    expect(H.numeric('a', '')).toEqual({});
    expect(H.numeric('a', null)).toEqual({});
    expect(H.numeric('a', '5')).toEqual({ a: 5 });
    expect(H.terms({ noticePeriodDays: '30', lockInMonths: '', maintenanceBilling: 'incl', electricityBilling: 'meter' }))
      .toEqual({ noticePeriodDays: 30, maintenanceBilling: 'incl', electricityBilling: 'meter' });
    expect(H.terms({})).toEqual({});
  });
});

describe('flatmates model', () => {
  it('resolves room kinds', () => {
    expect(M.roomKindOf(null)).toBeNull();
    expect(M.roomKindOf({ roomKind: 'living' })).toBe('living');
    expect(M.roomKindOf({ roomKind: 'zzz', attachedBath: 'attached' })).toBe('master');
    expect(M.roomKindOf({})).toBe('bedroom');
  });

  it('computes seats and occupancy', () => {
    expect(M.seatsTotalOf(null)).toBe(1);
    expect(M.seatsTotalOf({ seatsTotal: 4 })).toBe(4);
    expect(M.seatsOpenOf({ seatsTotal: 4, seatsOpen: 9 })).toBe(4);
    expect(M.seatsOpenOf({ seatsTotal: 4, members: [{}] })).toBe(3);
    expect(M.seatsOpenOf({ seatsTotal: 4 })).toBe(4);
    expect(M.filledSeatsOf({ seatsTotal: 4, seatsOpen: 1 })).toBe(3);
    expect(M.occupancyOf(null)).toBe(M.OCCUPANCY_OCCUPIED);
    expect(M.occupancyOf({ occupancy: 'x' })).toBe(M.OCCUPANCY_OCCUPIED);
    expect(M.occupancyOf({ occupancy: 'empty', seatsTotal: 2, seatsOpen: 2 })).toBe(M.OCCUPANCY_EMPTY);
    expect(M.occupancyOf({ occupancy: 'empty', seatsTotal: 2, seatsOpen: 1 })).toBe(M.OCCUPANCY_FILLING);
    expect(M.occupancyOf({ occupancy: 'filling', flatCommitted: 0 })).toBe(M.OCCUPANCY_EMPTY);
    expect(M.occupancyOf({ occupancy: 'filling', flatCommitted: 2 })).toBe(M.OCCUPANCY_FILLING);
  });

  it('computes rent', () => {
    expect(M.priceBasisOf({ priceBasis: 'room' })).toBe('room');
    expect(M.priceBasisOf({})).toBe('person');
    expect(M.rentOf({ budget: '9000' })).toBe(9000);
    expect(M.rentOf(null)).toBe(0);
    expect(M.perPersonRent({ budget: 9000 }, 2)).toBe(4500);
    expect(M.perPersonRent({ budget: 9000 }, 0)).toBe(9000);
    expect(M.maxOccupantsOf({ maxOccupants: 5 })).toBe(5);
    expect(M.maxOccupantsOf(null)).toBe(M.DEFAULT_MAX_OCCUPANTS);
    expect(M.occupantsOf({ occupants: -3 })).toBe(0);
    expect(M.bestPerPersonRent({ budget: 9000, shareMax: 3 })).toBe(3000);
    expect(M.bestPerPersonRent({ budget: 9000 })).toBe(9000);
  });

  it('decorates rooms with flat ledger and share limits', () => {
    expect(M.decorateRooms()).toEqual([]);
    const rooms = [
      { id: 1, flatKey: 'f', occupants: 1, priceBasis: 'room', maxOccupants: 3 },
      { id: 2, flatKey: 'f', occupants: 1, priceBasis: 'room' },
      { id: 3, propertyId: 'p', priceBasis: 'room', seatsTotal: 2 },
      { id: 4, flatCommitted: 5 },
    ];
    const out = M.decorateRooms(rooms);
    expect(out[0]).toMatchObject({ flatCommitted: 2, flatMax: 3, shareMax: 1 });
    expect(out[1].flatCommitted).toBe(2);
    expect(out[2].shareMax).toBe(2);
    expect(out[3]).toMatchObject({ flatCommitted: 5, shareMax: 1 });
    expect(M.decorateRooms([{ id: 9, priceBasis: 'room' }])[0].shareMax).toBeGreaterThanOrEqual(1);
  });

  it('describes room places and labels', () => {
    expect(M.roomPlacesOf({ seatsTotal: 0 })).toBe(1);
    expect(M.hasSharerAlready({ seatsTotal: 2, seatsOpen: 1 })).toBe(true);
    expect(M.hasSharerAlready({ seatsTotal: 2, seatsOpen: 2 })).toBe(false);
    expect(M.hasSharerAlready({})).toBe(false);
    expect(M.roomTypeLabel(null, t)).toBeNull();
    expect(M.roomTypeLabel({ roomType: M.ROOM_DOUBLE }, t)).toBe('flatmates.roomDouble');
    expect(M.roomTypeLabel({ roomType: 'Private', seatsTotal: 1 }, t)).toBe('flatmates.roomSingle');
    expect(M.roomTypeLabel({ roomType: 'Private', shareMax: 2 }, t)).toBeNull();
    expect(M.ROOM_KIND_ORDER).toHaveLength(3);
  });
});
