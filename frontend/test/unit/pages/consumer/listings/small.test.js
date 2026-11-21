import { describe, it, expect, vi } from 'vitest';
import { INITIAL } from '../../../../../src/lib/listings/filterState.js';
import { buildActiveChips } from '../../../../../src/pages/consumer/listings/listingsChips.js';
import {
  alertLabel,
  dropHiddenFacets,
  buildAlertRecord,
  criteriaChips,
  searchHref,
} from '../../../../../src/pages/consumer/listings/alertCriteria.js';
import { emiOf, tenantLabel, flatmatesUrl, toggleSet } from '../../../../../src/pages/consumer/listings/matchers.js';
import { fmtRent, fmtAreaSqft } from '../../../../../src/pages/consumer/listings/format.js';
import { propLatLng } from '../../../../../src/pages/consumer/listings/geo.js';
import { FACING, BATHS, SHELL, NA_STATUS, FOOD } from '../../../../../src/pages/consumer/listings/filtersPanel/facetOptions.js';
import { tLabel } from '../../../../../src/pages/consumer/listings/filtersPanel/helpers.js';

const tr = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);

function chipsFor(f, extra = {}) {
  const setF = vi.fn();
  const set = vi.fn();
  const chips = buildActiveChips(f, {
    tr,
    locNameBySlug: { baner: 'Baner' },
    socNameBySlug: { 'soc-1': 'Society One' },
    setF,
    set,
    freeText: '',
    clearFreeText: vi.fn(),
    ...extra,
  });
  return { chips, setF, set };
}

const byId = (chips, id) => chips.find((c) => c.id === id);
const applyUpdater = (setF, base) => setF.mock.calls.at(-1)[0](base);

describe('buildActiveChips', () => {
  it('returns no chips for pristine buy and rent filters', () => {
    expect(chipsFor(INITIAL('buy')).chips).toEqual([]);
    expect(chipsFor(INITIAL('rent')).chips).toEqual([]);
  });

  it('adds a free-text chip with a clear handler', () => {
    const clearFreeText = vi.fn();
    const { chips } = chipsFor(INITIAL('buy'), { freeText: 'sea view', clearFreeText });
    expect(chips[0]).toMatchObject({ id: 'q', label: 'listings.chipFreeText:{"text":"sea view"}' });
    chips[0].remove();
    expect(clearFreeText).toHaveBeenCalled();
  });

  it('builds buy chips for types, bhk, localities, societies, furnishing and verification', () => {
    const f = {
      ...INITIAL('buy'),
      types: new Set(['flat']),
      bhk: new Set(['2']),
      facing: new Set(['east']),
      minBaths: '2',
      localities: new Set(['baner', 'unknown-loc']),
      societies: new Set(['soc-1']),
      furnishing: new Set(['furnished']),
      amenities: new Set(['gym']),
      verified: { owner: true, rera: false },
      constr: new Set(['ready']),
      budget: [1000000, 50000000],
      age: [0, 10],
      floor: [2, 40],
    };
    const { chips } = chipsFor(f);
    const ids = chips.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([
      'type-flat', 'bhk-2', 'facing-east', 'baths', 'loc-baner', 'loc-unknown-loc', 'soc-soc-1',
      'furn-furnished', 'amen-gym', 'v-owner', 'constr-ready', 'budget', 'age', 'floor',
    ]));
    expect(ids).not.toContain('v-rera');
    expect(byId(chips, 'loc-baner').label).toBe('Baner');
    expect(byId(chips, 'loc-unknown-loc').label).toBe('unknown-loc');
    expect(byId(chips, 'soc-soc-1').label).toBe('Society One');
    expect(byId(chips, 'baths').label).toBe('listings.baths2');
    expect(byId(chips, 'facing-east').label).toBe('listings.facingEast');
    expect(byId(chips, 'budget').label.endsWith('+')).toBe(true);
    expect(byId(chips, 'age').label).toBe('listings.chipAge:{"from":0,"to":"10"}');
    expect(byId(chips, 'floor').label).toBe('listings.chipFloor:{"from":2,"to":"40+"}');
  });

  it('marks open-ended upper bounds with a plus', () => {
    const f = { ...INITIAL('buy'), types: new Set(['flat']), age: [0, 25], budget: [0, 20000000] };
    const { chips } = chipsFor(f);
    expect(byId(chips, 'budget').label.endsWith('+')).toBe(false);
    expect(byId(chips, 'age')).toBeUndefined();
  });

  it('builds rent chips for tenants, rooms, availability, pets, food and ranges', () => {
    const f = {
      ...INITIAL('rent'),
      types: new Set(['flat']),
      tenants: new Set(['family']),
      availFrom: 'now',
      pets: true,
      food: 'veg',
      rent: [10000, 100000],
      deposit: [0, 500000],
      age: [1, 25],
      floor: [0, 10],
    };
    const { chips } = chipsFor(f);
    const ids = chips.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['ten-family', 'pets', 'food', 'rent', 'deposit', 'age', 'floor']));
    expect(byId(chips, 'food').label).toBe('listings.foodVegOnly');
    expect(byId(chips, 'rent').label.endsWith('+')).toBe(true);
    expect(byId(chips, 'deposit').label).toContain('listings.chipDeposit');
  });

  it('shows the room chip for flatmates and falls back to the non-veg label for unknown food', () => {
    const f = { ...INITIAL('rent'), types: new Set(['flatmates']), room: new Set(['private']), food: 'unknown' };
    const { chips } = chipsFor(f);
    expect(chips.some((c) => c.id === 'room-private')).toBe(true);
    expect(byId(chips, 'food').label).toBe('listings.nonVegOk');
  });

  it('adds commercial chips and a pre-leased chip', () => {
    const f = {
      ...INITIAL('buy'),
      types: new Set(['commercial']),
      commercialTypes: new Set(['shop']),
      shell: new Set(['bareShell']),
      preLeased: true,
    };
    const { chips } = chipsFor(f);
    expect(chips.map((c) => c.id)).toEqual(expect.arrayContaining(['type-commercial', 'ctype-shop', 'shell-bareShell', 'preLeased']));
    expect(byId(chips, 'shell-bareShell').label).toBe('listings.shellBare');
  });

  it('adds land chips for land use and na status', () => {
    const f = { ...INITIAL('buy'), types: new Set(['plot']), landUse: new Set(['residential']), na: new Set(['na']) };
    const { chips } = chipsFor(f);
    expect(chips.some((c) => c.id === 'landuse-residential')).toBe(true);
    expect(chips.some((c) => c.id === 'na-na')).toBe(true);
  });

  it('adds a near chip with km or minute units', () => {
    const km = chipsFor({ ...INITIAL('buy'), near: 'x', nearLabel: 'Airport', nearRadius: 3, nearMode: 'km' });
    expect(byId(km.chips, 'near').label).toBe('listings.chipNear:{"label":"Airport","radius":3,"unit":"listings.unitKm"}');
    const min = chipsFor({ ...INITIAL('buy'), near: 'x', nearRadius: 10, nearMode: 'min' });
    expect(byId(min.chips, 'near').label).toBe('listings.chipNear:{"label":"listings.place","radius":10,"unit":"listings.unitMin"}');
    byId(min.chips, 'near').remove();
    expect(min.set).toHaveBeenCalledWith({ near: '', nearLabel: '', nearRadius: 5 });
  });

  it('shows an area chip only when the range is not default', () => {
    const f = { ...INITIAL('buy'), types: new Set(['flat']), area: [500, 1500] };
    const { chips, set } = chipsFor(f);
    const chip = byId(chips, 'area');
    expect(chip.label).toContain('500 sq.ft');
    chip.remove();
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ area: expect.any(Array), areaUnit: expect.any(String) }));
  });

  it('remove handlers update state immutably', () => {
    const f = {
      ...INITIAL('buy'),
      types: new Set(['flat']),
      commercialTypes: new Set(['shop']),
      bhk: new Set(['2', '3']),
      verified: { owner: true },
    };
    const { chips, setF, set } = chipsFor(f);

    byId(chips, 'bhk-2').remove();
    const afterBhk = applyUpdater(setF, f);
    expect([...afterBhk.bhk]).toEqual(['3']);
    expect([...f.bhk]).toEqual(['2', '3']);

    byId(chips, 'type-flat').remove();
    const afterFlat = applyUpdater(setF, f);
    expect(afterFlat.types.size).toBe(0);
    expect(afterFlat.commercialTypes.size).toBe(0);

    const withComm = { ...f, types: new Set(['flat', 'commercial']) };
    const commChips = chipsFor(withComm);
    byId(commChips.chips, 'type-commercial').remove();
    const afterComm = applyUpdater(commChips.setF, withComm);
    expect(afterComm.types.has('commercial')).toBe(false);
    expect(afterComm.commercialTypes.size).toBe(0);

    byId(chips, 'v-owner').remove();
    expect(applyUpdater(setF, f).verified).toEqual({ owner: false });

    byId(chips, 'budget')?.remove();
    expect(set).not.toHaveBeenCalled();
  });

  it('rent range chips reset through set()', () => {
    const f = { ...INITIAL('rent'), types: new Set(['flat']), rent: [5000, 20000], deposit: [0, 5000], age: [2, 5], floor: [1, 3], availFrom: 'now', pets: true, food: 'veg', tenants: new Set(['family']) };
    const { chips, set } = chipsFor(f);
    ['rent', 'deposit', 'age', 'floor', 'pets', 'food'].forEach((id) => byId(chips, id).remove());
    expect(set).toHaveBeenCalledWith({ rent: [0, 100000] });
    expect(set).toHaveBeenCalledWith({ deposit: [0, 1000000] });
    expect(set).toHaveBeenCalledWith({ age: [0, 25] });
    expect(set).toHaveBeenCalledWith({ floor: [0, 40] });
    expect(set).toHaveBeenCalledWith({ pets: false });
    expect(set).toHaveBeenCalledWith({ food: '' });
  });

  it('baths chip removal clears the value', () => {
    const { chips, set } = chipsFor({ ...INITIAL('buy'), minBaths: '3' });
    byId(chips, 'baths').remove();
    expect(set).toHaveBeenCalledWith({ minBaths: '' });
  });
});

describe('alertCriteria', () => {
  it('labels alerts from types, bhk, deal and localities', () => {
    const label = alertLabel({ deal: 'buy', types: ['flat'], bhk: ['2'], localities: ['baner', 'wakad-pune'] }, { baner: 'Baner' });
    expect(label.split(' \u00b7 ')).toHaveLength(4);
    expect(label).toContain('Baner, Wakad Pune');
    expect(label).toContain('Buy');
  });

  it('falls back to a generic label', () => {
    expect(alertLabel({ deal: 'rent' })).toContain('Rent');
    expect(alertLabel({ deal: 'buy', types: new Set() })).toContain('Buy');
  });

  it('accepts sets and falls back to a cap-cased type', () => {
    const label = alertLabel({ deal: 'rent', types: new Set(['weird-type']), bhk: new Set(['5']) });
    expect(label).toContain('Weird Type');
    expect(label).toContain('Rent');
  });

  it('drops facets that are not relevant to the chosen types', () => {
    const rec = { types: ['plot'], bhk: ['2'], furnishing: ['furnished'], amenities: ['gym'], pets: true };
    const out = dropHiddenFacets(rec);
    expect(out).toMatchObject({ bhk: [], furnishing: [], amenities: [], pets: false });
    expect(rec.bhk).toEqual(['2']);
    const kept = dropHiddenFacets({ types: ['flat'], bhk: ['2'], pets: true });
    expect(kept).toMatchObject({ bhk: ['2'], pets: true });
  });

  it('builds a serialisable alert record with a label', () => {
    const f = { ...INITIAL('buy'), types: new Set(['flat']), bhk: new Set(['2']), localities: new Set(['baner']), pets: 1 };
    const rec = buildAlertRecord(f, { baner: 'Baner' });
    expect(rec.deal).toBe('buy');
    expect(rec.types).toEqual(['flat']);
    expect(rec.pets).toBe(true);
    expect(rec.label).toContain('Baner');
    expect(rec.rent).toEqual([0, 100000]);
    expect(buildAlertRecord({ deal: 'rent', types: [], commercialTypes: [], bhk: [], furnishing: [], amenities: [], localities: [] }).budget).toBeUndefined();
  });

  it('builds criteria chips including price, localities and pets', () => {
    const chips = criteriaChips({
      deal: 'buy',
      types: ['flat'],
      commercialTypes: ['shop'],
      bhk: ['2'],
      budget: [1000000, 50000000],
      localities: ['baner'],
      furnishing: ['furnished'],
      amenities: ['gym'],
      pets: true,
    }, { baner: 'Baner' });
    expect(chips[0]).toEqual({ icon: 'home', text: 'For Sale' });
    const icons = chips.map((c) => c.icon);
    expect(icons).toEqual(expect.arrayContaining(['building-2', 'briefcase', 'bed-double', 'wallet', 'map-pin', 'sofa', 'sparkles', 'paw-print']));
    expect(chips.find((c) => c.icon === 'wallet').text.endsWith('+')).toBe(true);
    expect(chips.find((c) => c.icon === 'map-pin').text).toBe('Baner');
  });

  it('builds rent criteria chips and omits default prices', () => {
    const rentChips = criteriaChips({ deal: 'rent', rent: [5000, 20000] });
    expect(rentChips[0]).toEqual({ icon: 'key-round', text: 'For Rent' });
    expect(rentChips.find((c) => c.icon === 'wallet').text.endsWith('/mo')).toBe(true);
    expect(criteriaChips({ deal: 'rent', rent: [0, 100000] }).some((c) => c.icon === 'wallet')).toBe(false);
    expect(criteriaChips({ deal: 'buy', budget: [0, 50000000] }).some((c) => c.icon === 'wallet')).toBe(false);
    expect(criteriaChips({ deal: 'buy' }).some((c) => c.icon === 'wallet')).toBe(false);
    expect(criteriaChips({ deal: 'rent', rent: [0, 100000] })).toHaveLength(1);
  });

  it('builds a listings search href', () => {
    const href = searchHref({ deal: 'rent', types: ['flat'], localities: ['baner'] });
    expect(href.startsWith('/listings?')).toBe(true);
    expect(href).toContain('deal=rent');
    expect(searchHref({ deal: 'other' })).toContain('deal=buy');
  });
});

describe('matchers', () => {
  it('computes a rounded EMI string', () => {
    expect(emiOf(5000000)).toMatch(/^.\d+k\/mo$/);
    expect(emiOf(0)).toBe(emiOf(0));
    expect(parseInt(emiOf(10000000).slice(1), 10)).toBeGreaterThan(parseInt(emiOf(5000000).slice(1), 10));
  });

  it('labels tenant preferences', () => {
    expect(tenantLabel()).toBe('');
    expect(tenantLabel([])).toBe('');
    expect(tenantLabel(['family', 'bachelor-male'])).toBe('Family / Bachelors');
    expect(tenantLabel(['family'])).toBe('Family');
    expect(tenantLabel(['company'])).toBe('Company');
    expect(tenantLabel(['bachelor-female'])).toBe('Bachelors');
  });

  it('builds flatmates urls', () => {
    const base = { localities: new Set(), tenants: new Set() };
    expect(flatmatesUrl(base, {})).toBe('/flatmates?view=move-in');
    expect(flatmatesUrl({ localities: new Set(['baner']), tenants: new Set(['bachelor-female']) }, { baner: 'Baner' })).toBe('/flatmates?view=move-in&loc=Baner&g=female');
    expect(flatmatesUrl({ localities: new Set(['x']), tenants: new Set(['bachelor-male']) }, {})).toBe('/flatmates?view=move-in&g=male');
    expect(flatmatesUrl({ localities: new Set(), tenants: new Set(['bachelor-male', 'bachelor-female']) }, {})).toBe('/flatmates?view=move-in');
  });

  it('toggles set membership immutably', () => {
    const s = new Set(['a']);
    expect([...toggleSet(s, 'b')]).toEqual(['a', 'b']);
    expect([...toggleSet(s, 'a')]).toEqual([]);
    expect([...s]).toEqual(['a']);
  });
});

describe('format, geo and facet helpers', () => {
  it('formats rent and area with Indian grouping', () => {
    expect(fmtRent(1234567)).toContain('12,34,567');
    expect(fmtRent('abc')).toContain('0');
    expect(fmtAreaSqft(12000)).toBe('12,000 sq.ft');
    expect(fmtAreaSqft(null)).toBe('0 sq.ft');
  });

  it('uses explicit coordinates and falls back to a seeded position', () => {
    expect(propLatLng({ lat: 1, lng: 2 })).toEqual([1, 2]);
    expect(propLatLng({ lat: 0, lng: 0 })).toEqual([0, 0]);
    const seeded = propLatLng({ id: 'abc' });
    expect(seeded).toEqual(propLatLng({ id: 'abc' }));
    expect(seeded[0]).toBeCloseTo(18.52, 1);
    expect(propLatLng(null)).toHaveLength(2);
  });

  it('exposes facet option tuples', () => {
    [FACING, BATHS, SHELL, NA_STATUS, FOOD].forEach((list) => {
      expect(list.length).toBeGreaterThan(0);
      list.forEach(([value, key]) => {
        expect(typeof value).toBe('string');
        expect(key.startsWith('listings.')).toBe(true);
      });
    });
    expect(FACING.map(([v]) => v)).toContain('east');
  });

  it('joins labels for selected keys', () => {
    const arr = [['a', 'Alpha'], ['b', 'Beta']];
    expect(tLabel(arr, new Set())).toBe('');
    expect(tLabel(arr, new Set(['a', 'b']))).toBe('Alpha, Beta');
    expect(tLabel(arr, new Set(['a', 'zzz']))).toBe('Alpha');
  });
});
