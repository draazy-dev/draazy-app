import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasContactDetails } from '../../../../../src/pages/consumer/list-property/contactDetails.js';
import { describeListing } from '../../../../../src/pages/consumer/list-property/describe.js';
import { adoptSharedDraft, draftKeyFor, DRAFT_OWNER_KEY } from '../../../../../src/pages/consumer/list-property/draftSlots.js';
import { editPayload } from '../../../../../src/pages/consumer/list-property/editPayload.js';
import { formatIndian, formatMoneyInput, groupPairs, moneyWords, perUnit } from '../../../../../src/pages/consumer/list-property/format.js';
import { initialForm, newListingForm, NEW_LISTING_DEFAULTS } from '../../../../../src/pages/consumer/list-property/initialForm.js';
import { MILESTONES, computeProgress } from '../../../../../src/pages/consumer/list-property/progress.js';
import { cleanText, roundMoney, toDecimal, toMoney } from '../../../../../src/pages/consumer/list-property/sanitize.js';
import { mapServerFieldErrors } from '../../../../../src/pages/consumer/list-property/serverFieldErrors.js';
import { normalizeYouTubeId } from '../../../../../src/pages/consumer/list-property/video.js';
import { triggerConfetti } from '../../../../../src/pages/consumer/list-property/confetti.js';
import * as styles from '../../../../../src/pages/consumer/list-property/styles.js';

describe('hasContactDetails', () => {
  it.each([
    '2 BHK in Kothrud - 65,00,000 / 750 sq.ft',
    'Spacious 3 BHK, 1,250 sq.ft, 4th floor of 12',
    'Expected rent 65000 - 70000 depending on furnishing',
    'Rent 65000 | 70000 negotiable',
    'Deposit 60000-90000, maintenance extra',
    'Rent 65000, 70000 negotiable',
    'Rent 65000/70000 negotiable',
    'Rent 65000 / 70000 negotiable',
    'Price 1,25,000, area 750 sq.ft',
    'Available 987654321 October',
    '',
    null,
  ])('accepts %j', (text) => {
    expect(hasContactDetails(text)).toBe(false);
  });

  it.each([
    '2 BHK Kothrud, call 9876543210',
    'Call 98765 43210 for a visit',
    'Owner 9 8 7 6 5 4 3 2 1 0',
    'Ring +91-98765-43210',
    "Call 98'765'43210",
    'Call 98765,43210',
    'Call 98765/43210',
    'Call 98,765,43210',
    'Call 98765 4321O',
    'Call 9876 dash 543210',
    'Call 98765 space 43210',
    'Call 98765 dot 43210',
    'Call 9876 O 54321',
    'Call 9876543210 or o98765 43210',
    'mail me at john@gmail.com',
    'john (at) gmail dot com',
    'reach wa.me/919876543210',
    'insta: @flatking',
    'Call \u0669\u0668\u0667\u0666\u0665\u0664\u0663\u0662\u0661\u0660',
    'call nine eight seven six five four three two one zero',
    'call 98765 double 3 210',
  ])('refuses %j', (text) => {
    expect(hasContactDetails(text)).toBe(true);
  });
});

describe('describeListing', () => {
  const rent = {
    deal: 'rent', propertyType: 'flat', bhk: '2', society: 'Green Meadows', locality: 'Baner', carpetArea: '780', areaUnit: 'sqft', floor: '5',
    totalFloors: '12', facing: 'East', furnishing: 'semi', parkingSpaces: '1', monthlyRent: '35000', deposit: '100000',
    availableFrom: '2099-10-01', preferredTenants: ['family'], amenities: ['Gym', 'Modular Kitchen'],
  };

  it('writes a contact-free description of a rental', () => {
    const text = describeListing(rent);
    expect(text).toMatch(/2 BHK/);
    expect(text).toMatch(/Green Meadows/);
    expect(text).toContain('780 sqft carpet');
    expect(text).toContain('floor 5 of 12');
    expect(text).toContain('Rent details:');
    expect(text).toContain('available from');
    expect(text).toContain('preferred tenants: family');
    expect(hasContactDetails(text)).toBe(false);
  });

  it('marks past availability as now and limits to four sentences', () => {
    const text = describeListing({ ...rent, availableFrom: '2000-01-01' });
    expect(text).toContain('available now');
    expect(describeListing(rent).match(/\. /g).length).toBeLessThanOrEqual(3);
  });

  it('describes a sale', () => {
    const text = describeListing({ deal: 'buy', propertyType: 'villa', price: '1,20,00,000', construction: 'ready', ownership: 'freehold', locality: 'Wakad' });
    expect(text).toContain('villa in Wakad.');
    expect(text).toContain('Sale details:');
    expect(text).toContain('possession: ready');
    expect(text).toContain('ownership: freehold');
  });

  it('falls back to defaults', () => {
    expect(describeListing({})).toMatch(/property in Pune\.$/);
    expect(describeListing({ propertyType: 'commercial', commercialType: 'unknown-type' })).toContain('in Pune.');
    expect(describeListing({ propertyType: 'openplot', furnishing: 'unfurnished' })).toContain('open plot');
  });
});

describe('draft slots', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('derives keys', () => {
    expect(draftKeyFor('')).toBe('dzDraft:list-property:v3');
    expect(draftKeyFor('9')).toBe('dzDraft:list-property:v3:9');
  });

  it('adopts an unstamped draft only with guest work', () => {
    localStorage.setItem(draftKeyFor(), JSON.stringify({ title: 'x' }));
    adoptSharedDraft('9');
    expect(localStorage.getItem(draftKeyFor('9'))).toBeNull();
    adoptSharedDraft('9', { guestWork: true });
    expect(JSON.parse(localStorage.getItem(draftKeyFor('9')))).toEqual({ title: 'x', [DRAFT_OWNER_KEY]: '9' });
    expect(localStorage.getItem(draftKeyFor())).toBeNull();
  });

  it('adopts a draft stamped with the same owner and ignores others', () => {
    localStorage.setItem(draftKeyFor(), JSON.stringify({ [DRAFT_OWNER_KEY]: '9' }));
    adoptSharedDraft('8', { guestWork: true });
    expect(localStorage.getItem(draftKeyFor('8'))).toBeNull();
    adoptSharedDraft('9');
    expect(localStorage.getItem(draftKeyFor('9'))).not.toBeNull();
  });

  it('ignores missing owners and corrupt drafts', () => {
    localStorage.setItem(draftKeyFor(), '{bad');
    expect(() => adoptSharedDraft('9', { guestWork: true })).not.toThrow();
    localStorage.setItem(draftKeyFor(), JSON.stringify({ a: 1 }));
    adoptSharedDraft('', { guestWork: true });
    expect(localStorage.getItem(draftKeyFor())).not.toBeNull();
  });
});

describe('format', () => {
  it('groups digits in the Indian system', () => {
    expect(formatIndian('1234567')).toBe('12,34,567');
    expect(formatIndian(999)).toBe('999');
    expect(formatIndian('')).toBe('');
    expect(formatIndian(null)).toBe('');
    expect(formatIndian('1250.6')).toBe('1,251');
    expect(formatIndian('abc')).toBe('');
    expect(groupPairs('123456')).toBe('12,34,56');
    expect(formatMoneyInput('1234567.5')).toBe('12,34,567.5');
    expect(formatMoneyInput('12345')).toBe('12,345');
  });

  it('writes amounts in words and per-unit rates', () => {
    expect(moneyWords('')).toBe('');
    expect(moneyWords('500')).toMatch(/500$/);
    expect(moneyWords('5000')).toMatch(/5 Thousand$/);
    expect(moneyWords('250000')).toMatch(/2\.50 Lakh$/);
    expect(moneyWords('20000000')).toMatch(/2 Crore$/);
    expect(perUnit('', '100')).toBe('');
    expect(perUnit('1000000', '500')).toMatch(/2,000 \/ sq\.ft$/);
    expect(perUnit('1000000', '500', 'sq.yd')).toMatch(/sq\.yd$/);
  });
});

describe('sanitize', () => {
  it('cleans numbers and text', () => {
    expect(toDecimal('a1,2.3.4')).toBe('12.34');
    expect(toDecimal('12')).toBe('12');
    expect(toDecimal(null)).toBe('');
    expect(toMoney('12.3456')).toBe('12.34');
    expect(toMoney('99')).toBe('99');
    expect(roundMoney('12.6')).toBe('13');
    expect(roundMoney('x')).toBe('');
    expect(cleanText('  a\u0007b\n')).toBe('ab');
    expect(cleanText(undefined)).toBe('');
  });
});

describe('normalizeYouTubeId', () => {
  const id = 'dQw4w9WgXcQ';
  it('accepts ids and the supported url shapes', () => {
    expect(normalizeYouTubeId('')).toEqual({ ok: true, id: '' });
    expect(normalizeYouTubeId(undefined)).toEqual({ ok: true, id: '' });
    expect(normalizeYouTubeId(` ${id} `)).toEqual({ ok: true, id });
    expect(normalizeYouTubeId(`https://www.youtube.com/watch?v=${id}&t=3`).id).toBe(id);
    expect(normalizeYouTubeId(`https://youtube.com/watch?x=1&v=${id}`).id).toBe(id);
    expect(normalizeYouTubeId(`https://youtu.be/${id}?si=1`).id).toBe(id);
    expect(normalizeYouTubeId(`https://www.youtube.com/shorts/${id}`).id).toBe(id);
  });

  it('rejects everything else', () => {
    expect(normalizeYouTubeId('https://evil.com/watch?v=' + id)).toEqual({ ok: false, id: '' });
    expect(normalizeYouTubeId('not a video')).toEqual({ ok: false, id: '' });
  });
});

describe('mapServerFieldErrors', () => {
  it('maps aliases to form fields and picks the earliest step', () => {
    const out = mapServerFieldErrors({ deal: 'buy' }, [
      { field: 'request.price', message: 'Too low' },
      { name: 'listing.area' },
      { path: 'fields.formDetails.reraNumber', reason: 'bad' },
      { field: 'locality', message: 'first' },
      { field: 'locality', message: 'ignored' },
    ]);
    expect(out.errors).toEqual({ price: 'Too low', carpetArea: true, reraId: 'bad', locality: 'first' });
    expect(out.step).toBe(1);
    expect(out.unknown).toEqual([]);
  });

  it('maps price to rent on rent listings and collects unknown fields', () => {
    const out = mapServerFieldErrors({ deal: 'rent' }, [{ field: 'price', message: 'x' }, { field: 'bogus[0]' }, {}, null]);
    expect(out.errors).toEqual({ monthlyRent: 'x' });
    expect(out.unknown).toEqual(['bogus[0]']);
    expect(out.step).toBe(3);
  });

  it('returns a null step when nothing maps', () => {
    expect(mapServerFieldErrors(null)).toEqual({ errors: {}, step: null, unknown: [] });
    expect(mapServerFieldErrors({}, [{ field: 'zzz' }]).step).toBeNull();
  });
});

describe('initial forms', () => {
  it('layers new-listing defaults over the blank form', () => {
    expect(newListingForm).toEqual({ ...initialForm, ...NEW_LISTING_DEFAULTS });
    expect(initialForm.deal).toBe('');
    expect(newListingForm.deal).toBe('buy');
  });
});

describe('computeProgress', () => {
  const photos = (n) => Array.from({ length: n }, (_, i) => `p${i}`);

  it('starts empty with no nudge', () => {
    const p = computeProgress({ form: newListingForm });
    expect(p).toMatchObject({ key: 'warmup', nudge: null });
    expect(p.pct).toBeLessThan(40);
    expect(p.total).toBeGreaterThan(10);
  });

  it('nudges for photos first once the user has typed something', () => {
    expect(computeProgress({ form: { ...newListingForm, locality: 'Baner' } }).nudge).toBe('photos');
    expect(computeProgress({ form: newListingForm, photos: photos(1) }).nudge).toBe('photos');
  });

  it('moves on to description and amenities', () => {
    const form = { ...newListingForm, locality: 'Baner', description: 'd' };
    expect(computeProgress({ form, photos: photos(20) }).nudge).toBe('amenities');
    expect(computeProgress({ form: { ...form, description: '' }, photos: photos(20) }).nudge).toBe('description');
    expect(computeProgress({ form: { ...form, amenities: ['Gym'] }, photos: photos(20) }).nudge).toBeNull();
  });

  const filledRent = {
    ...newListingForm, deal: 'rent', bathrooms: '2', carpetArea: '700', builtUp: '800', superBuiltUp: '900', floor: '3', totalFloors: '10', facing: 'East',
    age: '2', furnishing: 'furnished', furniture: ['Bed'], locality: 'Baner', flatNumber: '1', tower: 'A', societyId: 's1', street: 'st', landmark: 'lm',
    pincode: '411045', monthlyRent: '30000', deposit: '60000', rentMaintMode: 'extra', rentMaintenance: '1000', availableFrom: '2026-01-01',
    preferredTenants: ['family'], agreementDuration: '11', lockIn: '6', noticePeriod: '1', petsPolicy: 'no', foodPref: 'any', description: 'd', amenities: ['Gym'],
  };

  it('reaches 100% for a fully completed rental', () => {
    const p = computeProgress({ form: filledRent, photos: photos(20) });
    expect(p).toMatchObject({ pct: 100, key: 'ready', nudge: null });
    expect(p.done).toBe(p.total);
  });

  it('covers buy, land, commercial and farm variants', () => {
    const buy = computeProgress({ form: { ...newListingForm, deal: 'buy', construction: 'under', price: '1', locality: 'x' } });
    expect(buy.total).toBeGreaterThan(20);
    const land = computeProgress({ form: { ...newListingForm, deal: 'buy', propertyType: 'openplot', plotLength: '10', plotWidth: '10' } });
    const farm = computeProgress({ form: { ...newListingForm, deal: 'buy', propertyType: 'farmland', waterSource: 'well', buyerEligibility: 'x' } });
    expect(land.total).not.toBe(farm.total);
    const com = computeProgress({
      form: { ...newListingForm, deal: 'rent', propertyType: 'commercial', commercialType: 'office', suitableFor: ['x'], fixtures: ['y'] },
    });
    expect(com.total).toBeGreaterThan(10);
    const leased = computeProgress({ form: { ...newListingForm, deal: 'buy', propertyType: 'commercial', commercialType: 'office', tenancyStatus: 'leased' } });
    expect(leased.total).toBeGreaterThan(10);
    const house = computeProgress({ form: { ...newListingForm, propertyType: 'independent', plotArea: '1', floorsInHouse: '2' } });
    expect(house.total).toBeGreaterThan(5);
  });

  it('scores flatmate listings', () => {
    const p = computeProgress({ form: { ...newListingForm, bhk: '2', roomType: 'private', note: 'n' }, photos: photos(2), isFlatmateMode: true });
    expect(p.total).toBe(12);
    expect(p.pct).toBeGreaterThan(0);
  });

  it('exposes tier labels at each threshold', () => {
    expect(MILESTONES).toEqual([20, 40, 60, 80, 100]);
    const tiers = [];
    for (let n = 0; n <= 12; n += 1) {
      const form = { bhk: '2', roomType: 'x', furnishing: 'y', locality: 'z', rentShare: '1', deposit: '1', availableFrom: '1', lookingFor: 'any', foodPref: 'any', note: 'n' };
      const keys = Object.keys(form).slice(0, n);
      tiers.push(computeProgress({ form: Object.fromEntries(keys.map((k) => [k, form[k]])), isFlatmateMode: true }).key);
    }
    expect(new Set(tiers).size).toBeGreaterThanOrEqual(4);
  });
});

describe('editPayload', () => {
  const baseForm = { ...newListingForm, title: 'T', price: '100', locality: 'Baner', carpetArea: '500', builtUp: '600', amenities: [] };
  const original = (over = {}) => ({ form: baseForm, formDetails: {}, gallery: ['a.jpg'], area: 500, ...over });

  it('returns nothing when nothing changed', () => {
    expect(editPayload({ gallery: ['a.jpg'] }, baseForm, original())).toEqual({});
  });

  it('sends only changed fields', () => {
    const form = { ...baseForm, price: '200', locality: 'Aundh' };
    const out = editPayload({ price: 200, locality: 'Aundh', title: 'T', gallery: ['a.jpg'] }, form, original());
    expect(out).toEqual({ price: 200, locality: 'Aundh', localitySlug: undefined, title: 'T' });
  });

  it('refuses to clear a saved built-up area', () => {
    expect(() => editPayload({}, { ...baseForm, builtUp: '' }, original())).toThrow(/built-up/i);
  });

  it('flags cleared maintenance and land use', () => {
    const form = { ...baseForm, monthlyMaintenance: '' };
    const orig = original({ maintenance: 500, form: { ...baseForm, monthlyMaintenance: '500' } });
    expect(editPayload({ maintenance: undefined, gallery: ['a.jpg'] }, form, orig)).toMatchObject({ clearMaintenance: true });
    const landForm = { ...baseForm, plotZone: '' };
    const landOrig = original({ landUse: 'agri', form: { ...baseForm, plotZone: 'agri' } });
    expect(editPayload({ landUse: undefined, gallery: ['a.jpg'] }, landForm, landOrig)).toMatchObject({ clearLandUse: true });
  });

  it('updates the headline area only when it matched the carpet area', () => {
    const form = { ...baseForm, carpetArea: '550' };
    expect(editPayload({ carpetArea: 550, area: 550, gallery: ['a.jpg'] }, form, original())).toMatchObject({ area: 550, carpetArea: 550 });
    expect(editPayload({ carpetArea: 550, area: 550, gallery: ['a.jpg'] }, form, original({ area: 999 }))).not.toHaveProperty('area');
  });

  it('sends gallery and floor-plan changes', () => {
    const out = editPayload({ gallery: ['b.jpg', 'a.jpg'], floorPlan: 'a.jpg' }, baseForm, original({ gallery: ['a.jpg', 'b.jpg'], floorPlan: '' }));
    expect(out).toMatchObject({ floorPlan: 'a.jpg' });
    expect(out.gallery).toBeUndefined();
    expect(editPayload({ gallery: ['c.jpg'] }, baseForm, original())).toMatchObject({ gallery: ['c.jpg'] });
    expect(editPayload({ gallery: ['a.jpg'], floorPlan: '' }, baseForm, original({ floorPlan: 'a.jpg' }))).toMatchObject({ floorPlan: '' });
    expect(editPayload({ gallery: ['a.jpg'], floorPlan: '' }, baseForm, original({ floorPlan: 'gone.jpg' }))).not.toHaveProperty('floorPlan');
  });

  it('replaces form details wholesale when the property type changes', () => {
    const form = { ...baseForm, propertyType: 'villa' };
    const out = editPayload({ type: 'villa', formDetails: {}, gallery: ['a.jpg'] }, form, original({ form: { ...baseForm, propertyType: 'flat' } }));
    expect(out).toMatchObject({ type: 'villa', formDetails: {} });
  });
});

describe('static modules', () => {
  it('exports style tokens', () => {
    expect(Object.values(styles).every((v) => typeof v === 'string')).toBe(true);
  });

  it('launches confetti unless reduced motion is requested', () => {
    window.matchMedia = vi.fn(() => ({ matches: true }));
    triggerConfetti();
    expect(document.body.children.length).toBe(0);
    window.matchMedia = vi.fn(() => ({ matches: false }));
    const animate = vi.fn(() => ({}));
    Element.prototype.animate = animate;
    triggerConfetti();
    expect(animate).toHaveBeenCalledTimes(110);
    expect(document.body.children.length).toBe(110);
    const first = animate.mock.results[0].value;
    first.onfinish = undefined;
    document.body.innerHTML = '';
    delete Element.prototype.animate;
    delete window.matchMedia;
  });
});
