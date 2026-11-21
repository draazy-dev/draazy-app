import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  petsFromPolicy, toEditForm, toListingCreate, toListingUpdate, toModerationQuery, toQuery, toViewModel,
  toViewModelList, toWriteResult, unsupportedFilters, yearsToAgeBand,
} from '../../../../../src/services/providers/http/propertyMapper.js';

afterEach(() => vi.restoreAllMocks());

const wire = {
  id: 'uuid-1', slug: 'baner-2bhk', propertyType: 'Apartment', coverImage: 'c.jpg', images: ['a', 'b'], video: 'yt1', description: 'd',
  bhk: 2, reraId: 'P123', deposit: 5, maintenance: 6, negotiable: true, ownership: 'freehold', loanAvailable: true,
  agreementDuration: 11, lockIn: 6, noticePeriod: 1, foodPref: 'veg', bestTimeToCall: 'eve', furniture: ['bed'],
  commercial: { shellType: 'warm' }, land: { plotZone: 'R1' }, address: 'addr', pincode: '411045', electricityMeterNo: 'E1',
  createdAt: '2026-02-03T10:00:00Z', lastConfirmedAt: '2026-02-04T10:00:00Z', flagReason: 'f', recheckPending: true,
  recheckReason: 'r', recheckRequestedAt: 'rr', recheckChanges: ['x'], ownerReplied: true, owner: { name: 'O', id: 'o1', mobile: '999' },
  title: 'T', deal: 'rent', price: 100, priceUnit: 'month', area: 900, areaUnit: 'sqft', furnishing: 'semi-furnished', locality: 'Baner',
  localitySlug: 'baner', societySlug: 's', societyName: 'Soc', societyId: 'sid', city: 'Pune', lat: 1, lng: 2, status: 'live',
  progress: { pct: 50 }, signals: { possibleBroker: 1, items: [{ code: 'c', severity: 'hard', detail: 'd' }, null] },
  dealStatus: 'paused', featured: true, verified: true, ownerVerified: true, ownershipVerified: true, ownershipRequestedAt: 'x',
  ownershipDeclinedReason: 'n', views: 1, enquiries: 2, docsCount: 3, pendingLeads: 4, photoCount: 5, descLength: 6, amenityCount: 7,
  qualityScore: 8, amenities: ['gym'], archived: true, archivedNote: 'an', adminPipeline: { postedByAdmin: true, postedByStaff: 'st', reminderCount: 2 },
  possession: 'ready-to-move', landUse: 'res', ageYears: 3, floor: 2, totalFloors: 10, facing: 'E', overlooking: 'park', bathrooms: 2,
  parking: 1, balconies: 1, carpetArea: 800, builtUpArea: 850, superBuiltUpArea: 900, floorPlan: 'fp', room: { beds: 1 },
  tenants: ['family'], availableFrom: 'af', availableOn: '2026-03-01', pets: true,
};

describe('toViewModel', () => {
  it('returns null for an empty payload', () => {
    expect(toViewModel(null)).toBeNull();
    expect(toViewModel(undefined)).toBeNull();
  });

  it('maps a fully populated wire object', () => {
    const vm = toViewModel(wire);
    expect(vm).toMatchObject({
      id: 'baner-2bhk', uuid: 'uuid-1', type: 'Apartment', image: 'c.jpg', gallery: ['a', 'b'], video: 'yt1', youtubeId: 'yt1', desc: 'd',
      rera: true, reraId: 'P123', deposit: 5, maintenance: 6, negotiable: true, lockin: 6, notice: 1, food: 'veg',
      shellType: 'warm', plotZone: 'R1', electricityConsumerNo: 'E1', createdAt: '2026-02-03', submittedAt: '2026-02-03T10:00:00Z',
      freshenedAt: '2026-02-04', confirmedAt: '2026-02-04T10:00:00Z', owner: 'O', ownerId: 'o1', ownerMobile: '999',
      furnishing: 'semi', construction: 'ready', dealStatus: 'paused', postedByAdmin: true, postedByStaff: 'st', reminderCount: 2,
      bath: 2, parkingSpaces: 1, availableOn: '2026-03-01', availableDate: '2026-03-01', pets: true, shareType: 'flatmates',
      societyName: 'Soc', societyId: 'sid', archived: true, archivedNote: 'an', tenants: ['family'],
    });
    expect(vm.signals).toEqual({
      possibleBroker: true, hardBlock: false, conflict: false,
      items: [{ code: 'c', severity: 'hard', detail: 'd' }, { code: '', severity: 'soft', detail: '' }],
    });
  });

  it('applies defaults for a minimal object', () => {
    const vm = toViewModel({ id: 'u' });
    expect(vm).toMatchObject({
      id: 'u', uuid: 'u', gallery: [], video: null, rera: false, reraId: '', deposit: null, furniture: null, address: '', pincode: '',
      createdAt: undefined, freshenedAt: undefined, recheckPending: false, recheckChanges: [], ownerReplied: false, furnishing: null,
      signals: null, dealStatus: 'active', featured: false, verified: false, views: 0, amenities: [], archived: false,
      postedByAdmin: false, postedByStaff: null, reminderCount: 0, construction: undefined, tenants: [], availableOn: null,
      availableDate: null, pets: null, shareType: null, youtubeId: '', food: null,
    });
  });

  it('reads the legacy food and availableDate fields and non-array signal items', () => {
    const vm = toViewModel({ id: 'u', food: 'jain', availableDate: '2026-04-01', signals: { hardBlock: 1, conflict: 1, items: 'x' } });
    expect(vm).toMatchObject({ food: 'jain', availableOn: '2026-04-01', availableDate: '2026-04-01' });
    expect(vm.signals).toEqual({ possibleBroker: false, hardBlock: true, conflict: true, items: [] });
  });

  it('warns once about an unrecognised furnishing or possession value and treats it as unstated', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const vm = toViewModel({ id: 'u', furnishing: 'weird', possession: 'odd' });
    expect(vm.furnishing).toBeNull();
    expect(vm.construction).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('toWriteResult and toViewModelList', () => {
  it('maps write results', () => {
    expect(toWriteResult(null)).toBeNull();
    expect(toWriteResult({ id: 'u', slug: 's', status: 'live' })).toEqual({
      id: 's', uuid: 'u', status: 'live', archived: false, recheckPending: false, recheckReason: '', recheckRequestedAt: '',
    });
  });

  it('accepts a bare array or a page', () => {
    expect(toViewModelList([{ id: 'a' }]).map((v) => v.id)).toEqual(['a']);
    expect(toViewModelList({ content: [{ id: 'b' }] }).map((v) => v.id)).toEqual(['b']);
    expect(toViewModelList(null)).toEqual([]);
  });
});

describe('queries', () => {
  it('toQuery maps filters and sorts', () => {
    expect(toQuery({ deal: 'rent', type: 'flat', locality: 'baner', society: 's', bhk: 2, minPrice: 1, maxPrice: 9, q: 'x', status: 'live', furnishing: 'semi', construction: 'ready' }, 'price-asc'))
      .toEqual({
        deal: 'rent', type: 'flat', locality: 'baner', societies: 's', bhk: 2, minPrice: 1, maxPrice: 9, furnishing: 'semi-furnished',
        possession: 'ready-to-move', q: 'x', status: 'live', sort: 'price,asc',
      });
    expect(toQuery().sort).toBe('createdAt,desc');
    expect(toQuery({}, 'bogus').sort).toBe('createdAt,desc');
    ['oldest', 'price-desc', 'area-desc', 'recheck-newest', 'badge-newest', 'confirmed-newest'].forEach((key) => {
      expect(toQuery({}, key).sort).toMatch(/,(asc|desc)$/);
    });
  });

  it('toQuery translates furnishing sets and drops unknown values', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(toQuery({ furnishing: new Set(['semi', 'furnished']) }).furnishing).toEqual(['semi-furnished', 'furnished']);
    expect(toQuery({ furnishing: ['nope'] }).furnishing).toBeUndefined();
    expect(toQuery({ furnishing: 'nope', construction: 'nope' })).toMatchObject({ furnishing: undefined, possession: undefined });
  });

  it('unsupportedFilters lists only active unsupported keys', () => {
    expect(unsupportedFilters({ includeArchived: true, real: false, includeAllStatuses: 0 })).toEqual(['includeArchived', 'includeAllStatuses']);
    expect(unsupportedFilters()).toEqual([]);
  });

  it('toModerationQuery adds the moderation keys that are defined', () => {
    const q = toModerationQuery({ archived: false, recheck: true, days: 3, badge: undefined }, 'oldest');
    expect(q).toMatchObject({ archived: false, recheck: true, days: 3, sort: 'createdAt,asc' });
    expect(q).not.toHaveProperty('badge');
    expect(toModerationQuery()).toHaveProperty('sort');
  });
});

describe('age bands and pets', () => {
  it.each([
    [null, ''], ['', ''], ['x', ''], [0, 'new'], [0.5, 'new'], [1, '1-5'], [4, '1-5'], [5, '5-10'], [10, '10-15'], [15, '15+'], [40, '15+'],
  ])('yearsToAgeBand(%s) = %s', (years, band) => {
    expect(yearsToAgeBand(years)).toBe(band);
  });

  it('petsFromPolicy', () => {
    expect(petsFromPolicy('yes')).toBe(true);
    expect(petsFromPolicy('no')).toBe(false);
    expect(petsFromPolicy('maybe')).toBeUndefined();
  });
});

describe('toEditForm', () => {
  it('copes with no view model', () => {
    const form = toEditForm();
    expect(form).toMatchObject({ deal: '', propertyType: '', bhk: '', price: '', monthlyRent: '', age: '', availableFrom: '', furniture: [], preferredTenants: [] });
  });

  it('builds a rent form', () => {
    const form = toEditForm({
      deal: 'rent', type: 'Apartment', price: 25000, maintenance: 1500, deposit: 50000, bhkNum: 2, area: 900, carpetArea: 800,
      builtUpArea: 850, superBuiltUpArea: 900, areaUnit: 'sqft', furnishing: 'semi', locality: 'Baner', localitySlug: 'baner',
      negotiable: true, reraId: 'R', title: 'T', desc: 'D', amenities: ['gym'], floor: 0, totalFloors: 10, facing: 'E', overlooking: 'p',
      ageYears: 6, bath: 2, parkingSpaces: 1, balconies: 2, electricityConsumerNo: 'E', pincode: '411045', societyId: 's', lat: 1, lng: 2,
      address: 'Flat 4, Tower B, Skyline, Baner Road', pets: false, construction: 'ready', tenants: ['family', 'martians'],
      formDetails: { landmark: 'Near park' },
    });
    expect(form).toMatchObject({
      deal: 'rent', propertyType: 'flat', bhk: '2', carpetArea: '800', builtUp: '850', superBuiltUp: '900', monthlyRent: '25000', price: '',
      deposit: '50000', rentMaintenance: '1500', monthlyMaintenance: '', rentMaintMode: 'extra', floor: 'Ground', totalFloors: '10',
      age: '5-10', bathrooms: '2', parkingSpaces: '1', balconies: '2', propLat: 1, propLng: 2, petsPolicy: 'no', construction: 'ready',
      preferredTenants: ['family'], existingAddress: 'Flat 4, Tower B, Skyline, Baner Road', amenities: ['gym'], priceNegotiable: true,
    });
  });

  it('builds a sale form, with plot area taken from area and pets policy yes', () => {
    const form = toEditForm({ deal: 'buy', type: 'Open Plot', price: 9000000, maintenance: 200, area: 1200, carpetArea: 5, pets: true, floor: 3 });
    expect(form).toMatchObject({
      price: '9000000', monthlyRent: '', rentMaintenance: '', monthlyMaintenance: '200', rentMaintMode: '', carpetArea: '1200',
      petsPolicy: 'yes', floor: '3',
    });
  });

  it('clamps a past availability date to today and keeps a future one', () => {
    expect(toEditForm({ availableOn: '2000-01-01' }).availableFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(toEditForm({ availableOn: '2000-01-01' }).availableFrom).not.toBe('2000-01-01');
    expect(toEditForm({ availableOn: '2999-01-01' }).availableFrom).toBe('2999-01-01');
  });

  it('recognises commercial sub-types and raw wizard types', () => {
    expect(toEditForm({ type: 'Office Space' })).toMatchObject({ propertyType: 'commercial' });
    expect(toEditForm({ type: 'villa' }).propertyType).toBe('villa');
    expect(toEditForm({ type: 'zzz' }).propertyType).toBe('');
  });
});

describe('toListingCreate', () => {
  it('copes with no input', () => {
    expect(toListingCreate()).toMatchObject({ city: 'Pune', possession: undefined, ageYears: undefined, address: undefined });
  });

  it('maps a full UI listing to the wire', () => {
    const out = toListingCreate({
      title: 'T', deal: 'rent', type: 'Apartment', price: 1, locality: 'L', localitySlug: 'l', city: 'Mumbai', bhkNum: 3, area: 10,
      areaUnit: 'sqft', landUse: 'res', carpetArea: '800', builtUp: '850', superBuiltUp: 'x', available: '2026-01-01', petsPolicy: 'yes',
      furnishing: 'furnished', deposit: 2, maintenance: 3, negotiable: false, lat: 1, lng: 2, reraId: 'R', construction: 'new',
      tenants: ['family'], amenities: ['a'], gallery: ['g'], floorPlan: 'fp', video: 'v', desc: 'D', flatNumber: '4', society: 'Sky',
      street: 'MG Rd', pincode: '411', formDetails: {}, floor: '3', societyId: 's', electricityConsumerNo: 'E', bathrooms: '2',
      parkingSpaces: '1', balconies: '', facing: 'E', overlooking: 'p', totalFloors: '0', age: '1-5',
    });
    expect(out).toMatchObject({
      propertyType: 'Apartment', city: 'Mumbai', bhk: 3, carpetArea: 800, builtUpArea: 850, superBuiltUpArea: undefined,
      availableOn: '2026-01-01', pets: true, furnishing: 'furnished', possession: 'new-launch', images: ['g'], description: 'D',
      address: '4, Sky, MG Rd', floor: 3, societyId: 's', electricityMeterNo: 'E', bathrooms: 2, parking: 1, balconies: undefined,
      totalFloors: undefined, ageYears: 1,
    });
  });

  it('prefers explicit values and fallbacks', () => {
    const out = toListingCreate({ propertyType: 'Villa', bhk: 4, pets: false, petsPolicy: 'yes', address: 'explicit', flat: 'x', parking: 2, images: ['i'], description: 'd', possession: 'under-construction', age: 'under-construction', formDetails: null });
    expect(out).toMatchObject({ propertyType: 'Villa', bhk: 4, pets: false, address: 'explicit', parking: 2, images: ['i'], description: 'd', possession: 'under-construction', ageYears: undefined, formDetails: undefined });
  });

  it('throws an internal error for a possession it cannot map', () => {
    const err = (() => { try { toListingCreate({ construction: 'bogus' }); } catch (e) { return e; } return null; })();
    expect(err).toBeInstanceOf(Error);
    expect(err.internal).toBe(true);
    expect(err.message).toContain('cannot map possession');
    expect(() => toListingCreate({ possession: 'bogus' })).toThrow('cannot map possession');
  });

  it('warns and omits an unknown furnishing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(toListingCreate({ furnishing: 'odd' }).furnishing).toBeUndefined();
  });
});

describe('toListingUpdate', () => {
  it('strips undefined values and the default city / address', () => {
    expect(toListingUpdate({ title: 'New' })).toEqual({ title: 'New' });
    expect(toListingUpdate()).toEqual({});
    expect(toListingUpdate({ city: 'Mumbai', address: 'a' })).toEqual({ city: 'Mumbai', address: 'a' });
  });

  it('adds clearing flags', () => {
    expect(toListingUpdate({ clearMaintenance: true, clearLandUse: true, available: '', pets: null, societyId: '' }))
      .toEqual({ clearMaintenance: true, clearLandUse: true, availableOn: '', clearPets: true, societyId: '' });
    expect(toListingUpdate({ clearMaintenance: 'yes', pets: true })).toEqual({ pets: true });
  });
});
