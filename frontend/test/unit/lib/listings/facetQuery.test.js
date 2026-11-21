import { describe, expect, it } from 'vitest';
import { toFacetQuery } from '../../../../src/lib/listings/facetQuery.js';
import { INITIAL } from '../../../../src/lib/listings/filterState.js';
import { haversineKm, seedPosition } from '../../../../src/lib/listings/coords.js';
import { BHK_KEYS, expandBhkToken } from '../../../../src/lib/listings/bhkOptions.js';
import { sectionVisible, typeGroups } from '../../../../src/lib/listings/filterRelevance.js';
import {
  areaBounds, areaProfileForTypes, areaRangeToUrl, defaultAreaRangeSqft, displayAreaRange, formatAreaRange,
  formatAreaValue, fromSqft, isDefaultAreaRange, parseAreaRange, toSqft, unitLabel,
} from '../../../../src/lib/listings/areaUnits.js';

describe('toFacetQuery', () => {
  it('produces an empty-facet query for defaults', () => {
    const q = toFacetQuery(INITIAL('buy'));
    expect(q).toMatchObject({ deal: 'buy', rank: 'relevance' });
    ['q', 'sort', 'types', 'minPrice', 'maxPrice', 'nearLat', 'construction', 'bhks'].forEach((k) => expect(q[k]).toBeUndefined());
  });

  it('maps ranking and sorting', () => {
    const f = INITIAL('buy');
    expect(toFacetQuery(f, { sort: 'newest' }).rank).toBe('newest');
    expect(toFacetQuery(f, { sort: 'price-psf' }).rank).toBe('pricePerSqft');
    expect(toFacetQuery(f, { sort: 'verified' }).rank).toBe('verified');
    expect(toFacetQuery(f, { sort: 'price-low' })).toMatchObject({ rank: 'relevance', sort: 'price,asc' });
    expect(toFacetQuery(f, { sort: 'price-high' }).sort).toBe('price,desc');
    expect(toFacetQuery(f, { q: 'baner' }).q).toBe('baner');
  });

  it('builds a buy query', () => {
    const f = INITIAL('buy');
    f.types = new Set(['flat']);
    f.bhk = new Set(['2']);
    f.furnishing = new Set(['semi', 'unfurnished']);
    f.facing = new Set(['east', 'west']);
    f.minBaths = '3';
    f.localities = new Set(['baner']);
    f.societies = new Set(['s1']);
    f.amenities = new Set(['gym']);
    f.budget = [1000, 50000000];
    f.constr = new Set(['ready', 'new']);
    f.verified = { owner: true, ownership: true, rera: true };
    f.age = [0, 5];
    f.floor = [3, 40];
    f.area = [100, 6000];
    const q = toFacetQuery(f);
    expect(q).toMatchObject({
      types: ['flat'], bhks: ['2'], furnishings: ['semi-furnished', 'unfurnished'], facing: 'east,west', minBaths: 3,
      localities: ['baner'], societies: ['s1'], amenities: ['gym'], minPrice: 1000, maxPrice: undefined,
      construction: ['ready-to-move', 'new-launch'], ownerVerified: true, ownershipVerified: true, rera: true,
      minAge: undefined, maxAge: 5, minFloor: 3, maxFloor: undefined, minArea: 100, maxArea: undefined,
    });
    expect(toFacetQuery(f, { dropLocalities: true }).localities).toBeUndefined();
  });

  it('builds a rent query with deposit, pets and food', () => {
    const f = INITIAL('rent');
    f.types = new Set(['flat']);
    f.rent = [5000, 100000];
    f.deposit = [0, 50000];
    f.pets = true;
    f.food = 'veg';
    f.availFrom = '15';
    f.tenants = new Set(['family']);
    f.constr = new Set(['ready']);
    const q = toFacetQuery(f);
    expect(q).toMatchObject({ minPrice: 5000, maxPrice: undefined, minDeposit: undefined, maxDeposit: 50000, pets: true, food: 'veg', availableFrom: '15', tenants: ['family'] });
    expect(q.construction).toBeUndefined();
    expect(toFacetQuery({ ...f, types: new Set(['flatmates']), room: new Set(['shared']) }).room).toEqual(['shared']);
  });

  it('marks unknown construction values as unmatchable', () => {
    const f = INITIAL('buy');
    f.constr = new Set(['bogus']);
    expect(toFacetQuery(f).construction).toEqual(['no.such.possession']);
  });

  it('supports commercial and land facets', () => {
    const c = INITIAL('buy');
    c.types = new Set(['commercial']);
    c.commercialTypes = new Set(['office']);
    c.shell = new Set(['bareShell']);
    c.preLeased = true;
    expect(toFacetQuery(c)).toMatchObject({ commercialUses: ['office'], shell: 'bareShell', preLeased: true });
    const l = INITIAL('buy');
    l.types = new Set(['plot']);
    l.landUse = new Set(['mixed']);
    l.na = new Set(['approved']);
    expect(toFacetQuery(l)).toMatchObject({ landUse: ['mixed'], na: 'approved' });
  });

  it('converts the near point and minute radius', () => {
    const f = INITIAL('buy');
    f.near = '18.5,73.8';
    f.nearRadius = 10;
    expect(toFacetQuery(f)).toMatchObject({ nearLat: 18.5, nearLng: 73.8, nearRadiusKm: 10 });
    f.nearMode = 'min';
    expect(toFacetQuery(f).nearRadiusKm).toBeCloseTo(4);
    f.near = 'x,y';
    expect(toFacetQuery(f).nearLat).toBeUndefined();
    f.near = '1,2';
    f.nearRadius = 0;
    expect(toFacetQuery(f).nearLat).toBeUndefined();
  });
});

describe('coords', () => {
  it('seedPosition is deterministic and near the city centre', () => {
    const a = seedPosition({ id: 'abc' });
    expect(seedPosition({ id: 'abc' })).toEqual(a);
    expect(Math.abs(a[0] - 18.5204)).toBeLessThanOrEqual(0.0045 * 4 + 1e-9);
    expect(Math.abs(a[1] - 73.8567)).toBeLessThanOrEqual(0.0045 * 4 + 1e-9);
    expect(seedPosition(undefined)).toEqual(seedPosition({ id: '' }));
  });

  it('haversineKm computes great-circle distance', () => {
    expect(haversineKm(18.5, 73.8, 18.5, 73.8)).toBe(0);
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.19, 1);
  });
});

describe('bhkOptions', () => {
  it('lists keys per deal', () => {
    expect(BHK_KEYS.buy).toContain('5plus');
    expect(BHK_KEYS.rent).toContain('4plus');
  });

  it('expands tokens', () => {
    expect(expandBhkToken('3plus', 'buy')).toEqual(['3', '4', '5plus']);
    expect(expandBhkToken('3plus', 'rent')).toEqual(['3', '4plus']);
    expect(expandBhkToken('6plus', 'buy')).toEqual(['5plus']);
    expect(expandBhkToken('7', 'buy')).toEqual(['5plus']);
    expect(expandBhkToken('0', 'rent')).toEqual(['0']);
    expect(expandBhkToken('-1', 'rent')).toEqual(['0']);
    expect(expandBhkToken('abc', 'rent')).toEqual([]);
    expect(expandBhkToken(null, 'rent')).toEqual([]);
    expect(expandBhkToken('4', 'buy', { source: 'legacy' })).toEqual(['4', '5plus']);
    expect(expandBhkToken('4', 'buy')).toEqual(['4']);
    expect(expandBhkToken('2', 'unknown')).toEqual(['2']);
  });
});

describe('filterRelevance', () => {
  it('groups types', () => {
    expect(typeGroups(new Set(['flat', 'house', 'commercial', 'plot']))).toEqual(new Set(['residential', 'commercial', 'land']));
    expect(typeGroups(new Set(['other']))).toEqual(new Set());
  });

  it('shows sections by selected types', () => {
    const flat = new Set(['flat']);
    expect(sectionVisible('bhk', flat)).toBe(true);
    expect(sectionVisible('bhk', new Set(['plot']))).toBe(false);
    expect(sectionVisible('bhk', new Set())).toBe(true);
    expect(sectionVisible('bhk', undefined)).toBe(true);
    expect(sectionVisible('landUse', new Set(['plot']))).toBe(true);
    expect(sectionVisible('landUse', flat)).toBe(false);
    expect(sectionVisible('room', new Set(['flatmates']))).toBe(true);
    expect(sectionVisible('room', undefined)).toBe(false);
    expect(sectionVisible('food', flat)).toBe(true);
    expect(sectionVisible('food', new Set())).toBe(false);
    expect(sectionVisible('shell', new Set(['commercial']))).toBe(true);
    expect(sectionVisible('age', new Set(['commercial']))).toBe(true);
    expect(sectionVisible('age', new Set(['flat', 'plot']))).toBe(false);
    expect(sectionVisible('area', new Set(['flat', 'plot']))).toBe(true);
  });
});

describe('areaUnits', () => {
  it('picks a profile from the types and preferred unit', () => {
    expect(areaProfileForTypes(new Set(['flat']), 'acre')).toMatchObject({ kind: 'built', unit: 'sqft', max: 6000 });
    expect(areaProfileForTypes(new Set(['plot']), 'sqyd')).toMatchObject({ kind: 'plot', unit: 'sqyd', label: 'sq.yd', max: 12000 });
    expect(areaProfileForTypes(new Set(['plot']), 'acre').unit).toBe('sqft');
    expect(areaProfileForTypes(new Set(['farmland']))).toMatchObject({ kind: 'farmland', unit: 'acre' });
    expect(areaProfileForTypes(undefined).kind).toBe('built');
    expect(unitLabel('nope')).toBe('sq.ft');
  });

  it('converts between units', () => {
    expect(toSqft(1, 'acre')).toBe(43560);
    expect(toSqft('x', 'acre')).toBe(0);
    expect(fromSqft(1089, 'guntha')).toBe(1);
    expect(fromSqft(100, 'nope')).toBe(100);
  });

  it('detects and displays default ranges', () => {
    const profile = areaProfileForTypes(new Set(['plot']), 'sqyd');
    const def = defaultAreaRangeSqft(profile);
    expect(def).toEqual([0, 108000]);
    expect(isDefaultAreaRange(def, profile)).toBe(true);
    expect(isDefaultAreaRange(undefined, profile)).toBe(false);
    expect(displayAreaRange(def, profile)).toEqual([0, 12000]);
    expect(displayAreaRange([900, 9000], profile)).toEqual([100, 1000]);
  });

  it('computes API bounds', () => {
    const profile = areaProfileForTypes(new Set(), 'sqft');
    expect(areaBounds(undefined, profile)).toEqual([undefined, undefined]);
    expect(areaBounds([0, 6000], profile)).toEqual([undefined, undefined]);
    expect(areaBounds([0, 3000], profile)).toEqual([undefined, 3000]);
    expect(areaBounds([100, 6000], profile)).toEqual([100, undefined]);
  });

  it('parses and serialises URL ranges', () => {
    expect(parseAreaRange('1-2', [0, 9], 'acre')).toEqual([43560, 87120]);
    expect(parseAreaRange('', [0, 9], 'acre')).toEqual([0, 9]);
    expect(parseAreaRange('2-1', [0, 9], 'acre')).toEqual([0, 9]);
    expect(parseAreaRange('a-b', [0, 9], 'acre')).toEqual([0, 9]);
    expect(parseAreaRange('1-2-3', [0, 9], 'acre')).toEqual([0, 9]);
    const farm = areaProfileForTypes(new Set(['farmland']), 'guntha');
    expect(areaRangeToUrl([1089, 2178], farm)).toBe('1-2');
    expect(areaRangeToUrl(defaultAreaRangeSqft(farm), farm)).toBe('0-80');
  });

  it('formats labels', () => {
    const profile = areaProfileForTypes(new Set(), 'sqft');
    expect(formatAreaRange([100, 6000], profile)).toBe('100 - 6000+ sq.ft');
    expect(formatAreaRange([100, 900], profile)).toBe('100 - 900 sq.ft');
    expect(formatAreaValue(12.3456, 'acre')).toBe('12.35 acre');
  });
});
