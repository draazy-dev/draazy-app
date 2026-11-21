import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getGeo = vi.fn();
const listCities = vi.fn();
vi.mock('../../../src/services/settingsService.js', () => ({ getGeo: (...a) => getGeo(...a) }));
vi.mock('../../../src/services/cityService.js', () => ({ listCities: (...a) => listCities(...a) }));

let geo;
beforeEach(async () => {
  vi.resetModules();
  getGeo.mockReset();
  listCities.mockReset();
  localStorage.clear();
  geo = await import('../../../src/lib/geoConfig.js');
});
afterEach(() => localStorage.clear());

const PUNE = { north: 19.40, south: 17.89, east: 75.17, west: 73.32 };

describe('bounds helpers', () => {
  it('validBounds needs four finite numbers in order', () => {
    expect(geo.validBounds({ north: 2, south: 1, east: 2, west: 1 })).toBe(true);
    expect(geo.validBounds({ north: 1, south: 2, east: 2, west: 1 })).toBe(false);
    expect(geo.validBounds({ north: 2, south: 1, east: 1, west: 1 })).toBe(false);
    expect(geo.validBounds({ north: 2, south: 1, east: 2 })).toBe(false);
    expect(geo.validBounds(null)).toBe(false);
  });

  it('unionBounds merges only valid boxes', () => {
    expect(geo.unionBounds([{ north: 2, south: 1, east: 2, west: 1 }, { north: 5, south: 0, east: 3, west: 2 }, null, { north: 0, south: 1 }]))
      .toEqual({ north: 5, south: 0, east: 3, west: 1 });
    expect(geo.unionBounds([])).toBeNull();
    expect(geo.unionBounds(undefined)).toBeNull();
  });

  it('withinAnyBounds is permissive without boxes or coordinates', () => {
    const box = { north: 10, south: 0, east: 10, west: 0 };
    expect(geo.withinAnyBounds(5, 5, [box])).toBe(true);
    expect(geo.withinAnyBounds(11, 5, [box])).toBe(false);
    expect(geo.withinAnyBounds(5, 5, [])).toBe(true);
    expect(geo.withinAnyBounds(null, 5, [box])).toBe(true);
    expect(geo.withinAnyBounds(5, undefined, [box])).toBe(true);
    expect(geo.withinAnyBounds(5, 11, [{ ...box, west: 20, east: 30 }, box])).toBe(false);
  });
});

describe('served districts', () => {
  it('defaults to Pune', () => {
    expect(geo.servedDistrictAreasOf({})).toEqual([{ name: 'Pune', placeId: 'ChIJQ97RPE_AwjsR5zbDDbo3wHI', bounds: PUNE }]);
    expect(geo.servedDistrictsOf(null)).toEqual(['Pune']);
  });

  it('reads names and objects, deduping case-insensitively', () => {
    const areas = geo.servedDistrictAreasOf({
      servedDistricts: ['Pune', 'pune', { name: 'Satara', placeId: 'p1', bounds: { north: 2, south: 1, east: 2, west: 1 } }, '', { name: 'Bad', bounds: { north: 1 } }, null],
      districtAreas: [{ name: 'Pune', placeId: 'pub', bounds: { north: 20, south: 10, east: 80, west: 70 } }],
    });
    expect(areas).toEqual([
      { name: 'Pune', placeId: 'pub', bounds: { north: 20, south: 10, east: 80, west: 70 } },
      { name: 'Satara', placeId: 'p1', bounds: { north: 2, south: 1, east: 2, west: 1 } },
      { name: 'Bad', placeId: null, bounds: null },
    ]);
  });

  it('falls back to built-in bounds when published bounds are invalid', () => {
    const [pune] = geo.servedDistrictAreasOf({ servedDistricts: ['Pune'], districtAreas: [{ name: 'Pune', bounds: { north: 1 } }] });
    expect(pune.bounds).toEqual(PUNE);
  });
});

describe('active city', () => {
  it('reads the stored city or defaults to Pune', () => {
    expect(geo.getActiveCity()).toBe('Pune');
    localStorage.setItem('draazyCity', 'Mumbai');
    expect(geo.getActiveCity()).toBe('Mumbai');
    expect(geo.getActiveCityGeo()).toMatchObject({ name: 'Mumbai', center: geo.CITY_GEO.Mumbai.center });
    localStorage.setItem('draazyCity', 'Atlantis');
    expect(geo.getActiveCityGeo()).toMatchObject({ name: 'Atlantis', center: geo.CITY_GEO.Pune.center });
  });

  it('falls back to the default when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(geo.getActiveCity()).toBe('Pune');
  });

  it('cityLabelFor prefers the listing city', () => {
    expect(geo.cityLabelFor({ city: 'Mumbai' })).toBe('Mumbai');
    expect(geo.cityLabelFor({ cityName: 'Delhi NCR' })).toBe('Delhi NCR');
    expect(geo.cityLabelFor(null)).toBe('Pune');
  });

  it('knows which static cities are live and have data', () => {
    expect(geo.getCityLive('Pune')).toBe(true);
    expect(geo.getCityLive('Mumbai')).toBe(false);
    expect(geo.getCityLive('Nowhere')).toBe(false);
    expect(geo.cityHasData('Pune')).toBe(true);
    expect(geo.cityHasData('Mumbai')).toBe(false);
    expect(geo.getCities().map((c) => c.name)).toEqual(Object.keys(geo.CITY_GEO));
  });

  it('getCities returns copies', () => {
    geo.getCities()[0].live = false;
    expect(geo.getCities()[0].live).toBe(true);
  });
});

describe('loadGeoPolicy', () => {
  it('settles immediately when never started', async () => {
    await expect(geo.geoPolicySettled()).resolves.toBeUndefined();
  });

  it('publishes the policy and city roster to listeners', async () => {
    getGeo.mockResolvedValue({ enforceCityLimit: false, blacklist: [{ term: 'Hell' }], servedDistricts: ['Pune'] });
    listCities.mockResolvedValue([{ slug: 'pune', name: 'Pune', live: true, listingCount: 4 }, { name: 'Mumbai', live: 'yes', listingCount: 'x' }, { nope: 1 }]);
    const fn = vi.fn();
    const off = geo.onGeoChange(fn);
    expect(fn).not.toHaveBeenCalled();
    const loading = geo.loadGeoPolicy();
    const settled = geo.geoPolicySettled();
    await loading;
    await settled;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(geo.getCities()).toEqual([
      { slug: 'pune', name: 'Pune', live: true, listingCount: 4 },
      { slug: undefined, name: 'Mumbai', live: false, listingCount: undefined },
    ]);
    expect(geo.getCityLive('PUNE')).toBe(true);
    expect(geo.getBlacklist()).toEqual([{ term: 'Hell' }]);
    expect(geo.enforcedServedBounds()).toBeNull();
    expect(geo.activeLocationConstraint()).toEqual({ locationBias: expect.any(Object) });
    off();
    await geo.loadGeoPolicy();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls a late subscriber immediately once published', async () => {
    getGeo.mockResolvedValue({});
    listCities.mockResolvedValue([]);
    await geo.loadGeoPolicy();
    const fn = vi.fn();
    geo.onGeoChange(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('keeps defaults when both requests fail', async () => {
    getGeo.mockRejectedValue(new Error('x'));
    listCities.mockRejectedValue(new Error('y'));
    await geo.loadGeoPolicy();
    expect(geo.getBlacklist()).toEqual([]);
    expect(geo.getCities().map((c) => c.name)).toEqual(Object.keys(geo.CITY_GEO));
    expect(geo.enforcedServedBounds()).toEqual([PUNE]);
    expect(geo.activeLocationConstraint()).toEqual({ locationRestriction: PUNE });
  });

  it('falls back to the default roster for a non-array response', async () => {
    getGeo.mockResolvedValue('nope');
    listCities.mockResolvedValue({ not: 'an array' });
    await geo.loadGeoPolicy();
    expect(geo.getCities().map((c) => c.name)).toEqual(Object.keys(geo.CITY_GEO));
  });

  it('ignores a stale load superseded by a newer one', async () => {
    let releaseFirst;
    getGeo.mockImplementationOnce(() => new Promise((r) => { releaseFirst = () => r({ blacklist: [{ term: 'old' }] }); }));
    listCities.mockResolvedValue([]);
    const first = geo.loadGeoPolicy();
    getGeo.mockResolvedValueOnce({ blacklist: [{ term: 'new' }] });
    await geo.loadGeoPolicy();
    releaseFirst();
    await first;
    expect(geo.getBlacklist()).toEqual([{ term: 'new' }]);
  });
});

describe('blacklist filtering', () => {
  const load = async (blacklist) => {
    getGeo.mockResolvedValue({ blacklist });
    listCities.mockResolvedValue([]);
    await geo.loadGeoPolicy();
  };

  it('does not blacklist anything by default', () => {
    expect(geo.isBlacklisted({ mainText: 'Baner' })).toBe(false);
    expect(geo.isBlacklisted(null)).toBe(false);
    const list = [{ placeId: 'a' }];
    expect(geo.filterSuggestions(list)).toBe(list);
    expect(geo.filterSuggestions(null)).toEqual([]);
    expect(geo.filterSuggestions([])).toEqual([]);
  });

  it('matches by place id or a term of at least two characters', async () => {
    await load([{ placeId: 'bad-1' }, { term: ' Slum ' }, { term: 'x' }]);
    expect(geo.isBlacklisted({ placeId: 'bad-1', mainText: 'Fine' })).toBe(true);
    expect(geo.isBlacklisted({ id: 'bad-1' })).toBe(true);
    expect(geo.isBlacklisted({ mainText: 'Big SLUM area' })).toBe(true);
    expect(geo.isBlacklisted({ name: 'x marks', secondaryText: 'x' })).toBe(false);
    expect(geo.isBlacklisted({ mainText: 'Baner', secondaryText: 'Pune' })).toBe(false);
    expect(geo.filterSuggestions([{ mainText: 'Slum', placeId: '1' }, { mainText: 'Baner', placeId: '2' }]).map((s) => s.placeId)).toEqual(['2']);
  });

  it('ignores a non-array blacklist', async () => {
    await load('bad');
    expect(geo.getBlacklist()).toEqual([]);
  });
});
