import { describe, expect, it } from 'vitest';
import {
  INITIAL, RANGE, SET_KEYS, applyFiltersToSearchParams, deserializeF, filtersToParams, hasFilterParams,
  normBhk, paramsToFilters, rangeChanged, serializeF, switchDealFilters,
} from '../../../../src/lib/listings/filterState.js';

const qs = (s) => new URLSearchParams(s);

describe('INITIAL and serialisation', () => {
  it('builds empty defaults for a deal', () => {
    const f = INITIAL('rent');
    expect(f.deal).toBe('rent');
    expect(f.budget).toEqual(RANGE.budget);
    expect(f.types).toBeInstanceOf(Set);
    expect(f.nearRadius).toBe(5);
    expect(INITIAL('buy').budget).not.toBe(RANGE.budget);
  });

  it('round-trips sets through serializeF/deserializeF', () => {
    const f = INITIAL('buy');
    f.types = new Set(['flat']);
    f.amenities = new Set(['gym']);
    const s = serializeF(f);
    expect(s.types).toEqual(['flat']);
    const back = deserializeF(JSON.parse(JSON.stringify(s)));
    expect(back.types).toEqual(new Set(['flat']));
    SET_KEYS.forEach((k) => expect(back[k]).toBeInstanceOf(Set));
    expect(back.amenities.has('gym')).toBe(true);
  });

  it('deserializeF cleans legacy and invalid fields', () => {
    const back = deserializeF({ deal: 'buy', minBaths: 9, food: true, ownerOnly: true, postedBy: 'x', avail: 'uc' });
    expect(back.minBaths).toBe('');
    expect(back.food).toBe('nonveg');
    expect(back.ownerOnly).toBeUndefined();
    expect(back.postedBy).toBeUndefined();
    expect(back.avail).toBeUndefined();
    expect(back.constr).toEqual(new Set(['under', 'new']));
    expect(deserializeF({ deal: 'rent', minBaths: '2', food: 'jain' })).toMatchObject({ minBaths: '2', food: 'jain' });
    expect(deserializeF({ deal: 'buy', avail: 'zzz' }).constr.size).toBe(0);
    expect(deserializeF(undefined).deal).toBeUndefined();
  });

  it('deserializeF resets area when the unit does not fit the types', () => {
    const back = deserializeF({ deal: 'buy', types: ['farmland'], areaUnit: 'sqft', area: [0, 6000] });
    expect(back.areaUnit).toBe('acre');
    expect(back.area).toEqual([0, 871200]);
  });

  it('rangeChanged compares both ends', () => {
    expect(rangeChanged([0, 5], [0, 5])).toBe(false);
    expect(rangeChanged([1, 5], [0, 5])).toBe(true);
    expect(rangeChanged([0, 4], [0, 5])).toBe(true);
  });

  it('normBhk maps tokens to the deal keys', () => {
    expect(normBhk('2', 'buy')).toBe('2');
    expect(normBhk('9', 'rent')).toBe('4plus');
    expect(normBhk('', 'rent')).toBeNull();
  });
});

describe('hasFilterParams', () => {
  it('detects filter and legacy keys only', () => {
    expect(hasFilterParams(qs('sort=newest&page=2'))).toBe(false);
    expect(hasFilterParams(qs('loc=baner'))).toBe(true);
    expect(hasFilterParams(qs('locality=baner'))).toBe(true);
    expect(hasFilterParams(qs('sharing=2'))).toBe(true);
  });
});

describe('paramsToFilters', () => {
  it('parses a buy URL', () => {
    const f = paramsToFilters(qs('ptype=flat,villa&loc=Baner,Pune West&soc=s1&bhks=2,5plus&furn=furnished,nope&facing=east&minBaths=2&amen=gym,lift&v=rera,owner,bogus&age=2-10&floor=1-5&constr=ready,bogus&preLeased=true&budget=1000000-5000000'), 'buy');
    expect(f.types).toEqual(new Set(['flat', 'villa']));
    expect(f.localities).toEqual(new Set(['baner', 'pune-west']));
    expect(f.societies).toEqual(new Set(['s1']));
    expect(f.bhk).toEqual(new Set(['2', '5plus']));
    expect(f.furnishing).toEqual(new Set(['furnished']));
    expect(f.minBaths).toBe('2');
    expect(f.amenities).toEqual(new Set(['gym', 'lift']));
    expect(f.verified).toEqual({ rera: true, owner: true });
    expect(f.age).toEqual([2, 10]);
    expect(f.floor).toEqual([1, 5]);
    expect(f.constr).toEqual(new Set(['ready']));
    expect(f.preLeased).toBe(true);
    expect(f.budget).toEqual([1000000, 5000000]);
  });

  it('parses a rent URL and ignores buy-only types', () => {
    const f = paramsToFilters(qs('ptype=flatmates,farmland&room=single&tenants=family,company&availfrom=15&pets=1&food=jain&rent=5000-20000&deposit=0-50000'), 'rent');
    expect(f.types).toEqual(new Set(['flatmates', 'farmland']));
    expect(f.room).toEqual(new Set(['single']));
    expect(f.tenants).toEqual(new Set(['family', 'company']));
    expect(f.availFrom).toBe('15');
    expect(f.pets).toBe(true);
    expect(f.food).toBe('jain');
    expect(f.rent).toEqual([5000, 20000]);
    expect(f.deposit).toEqual([0, 50000]);
    expect(paramsToFilters(qs('ptype=flatmates'), 'buy').types.size).toBe(0);
  });

  it('accepts legacy aliases', () => {
    const f = paramsToFilters(qs('type=apartment&locality=Koregaon Park&bhk=4&avail=ready'), 'buy');
    expect(f.types).toEqual(new Set(['flat']));
    expect(f.localities).toEqual(new Set(['koregaon-park']));
    expect(f.bhk).toEqual(new Set(['4', '5plus']));
    expect(f.constr).toEqual(new Set(['ready']));
  });

  it('falls back to defaults on malformed ranges', () => {
    const f = paramsToFilters(qs('budget=9-1&age=a-b&floor=1-2-3&rent=x'), 'buy');
    expect(f.budget).toEqual(RANGE.budget);
    expect(f.age).toEqual(RANGE.age);
    expect(f.floor).toEqual(RANGE.floor);
  });

  it('parses commercial subtypes and land facets', () => {
    expect(paramsToFilters(qs('ptype=commercial&ctype=office,nope&shell=bareShell'), 'buy')).toMatchObject({
      commercialTypes: new Set(['office']), shell: new Set(['bareShell']),
    });
    const land = paramsToFilters(qs('ptype=plot&landuse=residential&na=approved&area=100-500&areaUnit=sqyd'), 'buy');
    expect(land.landUse).toEqual(new Set(['residential']));
    expect(land.areaUnit).toBe('sqyd');
    expect(land.area).toEqual([900, 4500]);
  });

  it('resets area when the unit is unsupported for the types', () => {
    const f = paramsToFilters(qs('ptype=flat&area=1-2&areaUnit=acre'), 'buy');
    expect(f.areaUnit).toBe('sqft');
    expect(f.area).toEqual([0, 6000]);
  });

  it('parses near params with clamping', () => {
    const f = paramsToFilters(qs('near=18.5,73.8&nearlabel=Office&nearmode=min&nearr=99'), 'buy');
    expect(f).toMatchObject({ near: '18.5,73.8', nearLabel: 'Office', nearMode: 'min', nearRadius: 25 });
    expect(paramsToFilters(qs('near=bogus&nearr=3'), 'buy').near).toBe('');
    expect(paramsToFilters(qs('near=1,2&nearmode=zzz&nearr=-4'), 'buy')).toMatchObject({ nearMode: 'km', nearRadius: 5 });
  });
});

describe('filtersToParams', () => {
  it('serialises nothing for defaults', () => {
    expect(filtersToParams(INITIAL('buy'))).toEqual({});
    expect(filtersToParams(INITIAL('rent'))).toEqual({});
  });

  it('serialises buy filters', () => {
    const f = INITIAL('buy');
    f.types = new Set(['flat']);
    f.bhk = new Set(['2', '3']);
    f.furnishing = new Set(['semi']);
    f.facing = new Set(['east']);
    f.minBaths = '2';
    f.amenities = new Set(['gym']);
    f.localities = new Set(['baner']);
    f.societies = new Set(['s1']);
    f.verified = { owner: true, rera: true };
    f.age = [1, 5];
    f.floor = [2, 40];
    f.constr = new Set(['ready']);
    f.budget = [1000, 2000];
    f.near = '18.5,73.8';
    f.nearLabel = 'Work';
    f.nearRadius = 8;
    f.nearMode = 'min';
    expect(filtersToParams(f)).toEqual({
      loc: 'baner', soc: 's1', ptype: 'flat', bhks: '2,3', furn: 'semi', facing: 'east', minBaths: '2', amen: 'gym',
      v: 'owner,rera', age: '1-5', floor: '2-40', constr: 'ready', budget: '1000-2000',
      near: '18.5,73.8', nearlabel: 'Work', nearr: '8', nearmode: 'min',
    });
  });

  it('serialises rent filters and omits buy-only ones', () => {
    const f = INITIAL('rent');
    f.types = new Set(['flat']);
    f.tenants = new Set(['family']);
    f.availFrom = 'now';
    f.pets = true;
    f.food = 'veg';
    f.rent = [5000, 9000];
    f.deposit = [0, 10000];
    f.constr = new Set(['ready']);
    f.preLeased = true;
    expect(filtersToParams(f)).toEqual({
      ptype: 'flat', tenants: 'family', availfrom: 'now', pets: '1', food: 'veg', rent: '5000-9000', deposit: '0-10000',
    });
  });

  it('only emits facets relevant to the selected property types', () => {
    const f = INITIAL('buy');
    f.types = new Set(['plot']);
    f.bhk = new Set(['2']);
    f.landUse = new Set(['mixed']);
    f.na = new Set(['approved']);
    f.verified = { rera: true, owner: true };
    f.area = [900, 4500];
    f.areaUnit = 'sqyd';
    expect(filtersToParams(f)).toEqual({ ptype: 'plot', landuse: 'mixed', na: 'approved', v: 'owner', area: '100-500', areaUnit: 'sqyd' });
  });

  it('emits commercial facets', () => {
    const f = INITIAL('buy');
    f.types = new Set(['commercial']);
    f.commercialTypes = new Set(['shop']);
    f.shell = new Set(['warmShell']);
    f.preLeased = true;
    expect(filtersToParams(f)).toMatchObject({ ptype: 'commercial', ctype: 'shop', shell: 'warmShell', preLeased: 'true' });
  });

  it('emits room for shared-room searches', () => {
    const f = INITIAL('rent');
    f.types = new Set(['flatmates']);
    f.room = new Set(['shared']);
    expect(filtersToParams(f).room).toBe('shared');
  });

  it('round-trips through paramsToFilters', () => {
    const f = INITIAL('rent');
    f.types = new Set(['flat']);
    f.bhk = new Set(['1']);
    f.rent = [8000, 30000];
    f.localities = new Set(['baner']);
    const back = paramsToFilters(new URLSearchParams(filtersToParams(f)), 'rent');
    expect(back.types).toEqual(f.types);
    expect(back.bhk).toEqual(f.bhk);
    expect(back.rent).toEqual(f.rent);
    expect(back.localities).toEqual(f.localities);
  });
});

describe('applyFiltersToSearchParams', () => {
  it('replaces filter keys but keeps unrelated ones', () => {
    const f = INITIAL('buy');
    f.localities = new Set(['baner']);
    const next = applyFiltersToSearchParams(qs('sort=newest&loc=old&type=flat&sharing=2'), f);
    expect(next.get('sort')).toBe('newest');
    expect(next.get('loc')).toBe('baner');
    expect(next.has('type')).toBe(false);
    expect(next.has('sharing')).toBe(false);
  });
});

describe('switchDealFilters', () => {
  it('keeps shared facets and drops deal-specific ones', () => {
    const prev = paramsToFilters(qs('ptype=flat,plot&loc=baner&amen=gym&bhk=2&preLeased=true&near=1,2&nearlabel=X&budget=1-5'), 'buy');
    prev.verified = { owner: true };
    prev.locQuery = 'ba';
    const next = switchDealFilters(prev, 'rent');
    expect(next.deal).toBe('rent');
    expect(next.types).toEqual(new Set(['flat', 'plot']));
    expect(next.localities).toEqual(new Set(['baner']));
    expect(next.amenities).toEqual(new Set(['gym']));
    expect(next.verified).toEqual({ owner: true });
    expect(next.locQuery).toBe('ba');
    expect(next.preLeased).toBe(false);
    expect(next.budget).toEqual(RANGE.budget);
    expect(next.near).toBe('1,2');
  });

  it('drops types not offered for the new deal and re-expands BHK', () => {
    const prev = INITIAL('rent');
    prev.types = new Set(['flatmates', 'commercial']);
    prev.commercialTypes = new Set(['office']);
    prev.bhk = new Set(['4plus']);
    prev.food = 'veg';
    const toBuy = switchDealFilters(prev, 'buy');
    expect(toBuy.types).toEqual(new Set(['commercial']));
    expect(toBuy.commercialTypes).toEqual(new Set(['office']));
    expect(toBuy.food).toBe('');
    expect(toBuy.bhk).toEqual(new Set(['4', '5plus']));
    const back = switchDealFilters(prev, 'rent');
    expect(back.food).toBe('veg');
  });

  it('keeps a customised area only when the area kind is unchanged', () => {
    const prev = INITIAL('buy');
    prev.types = new Set(['flat']);
    prev.area = [500, 2000];
    expect(switchDealFilters(prev, 'rent').area).toEqual([500, 2000]);
    const plot = { ...prev, types: new Set(['plot']), area: [100, 900], areaUnit: 'sqft' };
    expect(switchDealFilters(plot, 'rent').area).toEqual([100, 900]);
    expect(switchDealFilters({ ...plot, types: new Set(['flat']) }, 'rent').area).toEqual([100, 900]);
  });
});
