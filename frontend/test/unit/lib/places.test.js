import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const geoMocks = vi.hoisted(() => ({
  activeLocationConstraint: vi.fn(() => ({ locationRestriction: { north: 1, south: 0, east: 1, west: 0 } })),
  enforcedServedBounds: vi.fn(() => null),
  filterSuggestions: vi.fn((l) => l),
  geoPolicySettled: vi.fn(() => Promise.resolve()),
  servedBoundsList: vi.fn(() => []),
  servedSearchBox: vi.fn(() => ({ north: 9, south: 8, east: 9, west: 8 })),
  withinAnyBounds: vi.fn(() => true),
}));
vi.mock('../../../src/lib/geoConfig.js', () => geoMocks);

import {
  fetchAdminSuggestions, fetchLocalitySuggestions, fetchPlaceDetails, fetchPlaceViewport, fetchSuggestions,
  getPlacesLib, isNamedSocietyPlace, newAutocompleteSession, normalizeComponents, pickAddress, LOCALITY_TYPES,
} from '../../../src/lib/places.js';

const prediction = (id, main = 'Baner', secondary = 'Pune', place) => ({
  placePrediction: {
    placeId: id,
    mainText: { toString: () => main },
    secondaryText: { toString: () => secondary },
    ...(place ? { toPlace: () => place } : {}),
  },
});

const latLng = (lat, lng) => ({ lat: () => lat, lng: () => lng });
const installPlaces = (fetchAutocompleteSuggestions, extra = {}) => {
  const lib = { AutocompleteSuggestion: { fetchAutocompleteSuggestions }, ...extra };
  window.google = { maps: { importLibrary: vi.fn(async () => lib), places: {} } };
  return lib;
};

beforeEach(() => {
  Object.values(geoMocks).forEach((m) => m.mockClear());
  geoMocks.enforcedServedBounds.mockReturnValue(null);
  geoMocks.servedBoundsList.mockReturnValue([]);
  geoMocks.filterSuggestions.mockImplementation((l) => l);
  geoMocks.withinAnyBounds.mockReturnValue(true);
});
afterEach(() => { delete window.google; });

describe('address helpers', () => {
  it('detects named places', () => {
    expect(isNamedSocietyPlace(['premise'])).toBe(true);
    expect(isNamedSocietyPlace(['route', 'establishment'])).toBe(true);
    expect(isNamedSocietyPlace(['route'])).toBe(false);
    expect(isNamedSocietyPlace([])).toBe(false);
    expect(isNamedSocietyPlace(undefined)).toBe(false);
    expect(LOCALITY_TYPES).toContain('sublocality');
  });

  it('normalises both new and legacy component shapes', () => {
    expect(normalizeComponents([{ types: ['route'], longText: 'MG Road' }, { types: 'x', long_name: 'Old' }, { types: ['a'] }]))
      .toEqual([{ types: ['route'], name: 'MG Road' }, { types: [], name: 'Old' }, { types: ['a'], name: '' }]);
    expect(normalizeComponents(null)).toEqual([]);
  });

  it('picks pincode, street and locality', () => {
    const comps = [
      { types: ['postal_code'], name: '411045' },
      { types: ['route'], name: 'R'.repeat(80) },
      { types: ['locality'], name: 'Pune' },
      { types: ['sublocality_level_1'], name: 'Baner' },
    ];
    const a = pickAddress(comps);
    expect(a.pincode).toBe('411045');
    expect(a.street).toHaveLength(60);
    expect(a.localityRaw).toBe('Baner');
    expect(pickAddress([{ types: ['postal_code'], name: '41104' }, { types: ['locality'], name: 'Pune' }]))
      .toEqual({ pincode: '', street: '', localityRaw: 'Pune' });
    expect(pickAddress([])).toEqual({ pincode: '', street: '', localityRaw: '' });
  });
});

describe('google maps access', () => {
  it('returns null when the SDK is absent or the import fails', async () => {
    expect(await getPlacesLib()).toBeNull();
    window.google = { maps: {} };
    expect(await getPlacesLib()).toBeNull();
    window.google = { maps: { importLibrary: vi.fn().mockRejectedValue(new Error('x')) } };
    expect(await getPlacesLib()).toBeNull();
  });

  it('creates an autocomplete session token when available', () => {
    expect(newAutocompleteSession()).toBeNull();
    const Token = vi.fn();
    window.google = { maps: { places: { AutocompleteSessionToken: Token } } };
    expect(newAutocompleteSession()).toBeInstanceOf(Token);
    window.google = { maps: { places: { AutocompleteSessionToken: function Bad() { throw new Error('x'); } } } };
    expect(newAutocompleteSession()).toBeNull();
  });
});

describe('fetchSuggestions', () => {
  it('returns nothing for short input or without the places library', async () => {
    expect(await fetchSuggestions('a')).toEqual([]);
    expect(await fetchSuggestions('  ')).toEqual([]);
    expect(await fetchSuggestions('baner')).toEqual([]);
  });

  it('requests with the active location constraint and maps predictions', async () => {
    const fetchAuto = vi.fn().mockResolvedValue({ suggestions: [prediction('p1'), { other: 1 }, prediction('p2', 'Aundh')] });
    installPlaces(fetchAuto);
    const out = await fetchSuggestions(' baner ', 'tok', { language: 'mr' });
    expect(fetchAuto).toHaveBeenCalledWith({
      input: 'baner', sessionToken: 'tok', includedRegionCodes: ['in'], language: 'mr',
      locationRestriction: { north: 1, south: 0, east: 1, west: 0 },
    });
    expect(out.map(({ placeId, mainText, secondaryText }) => ({ placeId, mainText, secondaryText }))).toEqual([
      { placeId: 'p1', mainText: 'Baner', secondaryText: 'Pune' },
      { placeId: 'p2', mainText: 'Aundh', secondaryText: 'Pune' },
    ]);
    expect(geoMocks.geoPolicySettled).toHaveBeenCalled();
  });

  it('falls back to the text when there is no main text', async () => {
    installPlaces(vi.fn().mockResolvedValue({ suggestions: [{ placePrediction: { placeId: 'p', text: { toString: () => 'Full text' } } }] }));
    const [s] = await fetchSuggestions('baner');
    expect(s).toMatchObject({ mainText: 'Full text', secondaryText: '' });
  });

  it('skips the city limit for admin and cross-city searches', async () => {
    const fetchAuto = vi.fn().mockResolvedValue({ suggestions: [prediction('p1')] });
    installPlaces(fetchAuto);
    await fetchAdminSuggestions('baner');
    expect(fetchAuto.mock.calls[0][0]).not.toHaveProperty('locationRestriction');
    expect(geoMocks.filterSuggestions).not.toHaveBeenCalled();
    await fetchSuggestions('baner', null, { crossCity: true });
    expect(fetchAuto.mock.calls[1][0]).toEqual({ input: 'baner', sessionToken: undefined, includedRegionCodes: ['in'] });
    expect(geoMocks.filterSuggestions).toHaveBeenCalledTimes(1);
  });

  it('uses an explicit location bias and primary types', async () => {
    const fetchAuto = vi.fn().mockResolvedValue({ suggestions: [] });
    installPlaces(fetchAuto);
    await fetchSuggestions('baner', null, { locationBias: { b: 1 }, includedPrimaryTypes: ['locality'] });
    expect(fetchAuto.mock.calls[0][0]).toMatchObject({ locationBias: { b: 1 }, includedPrimaryTypes: ['locality'] });
  });

  it('restricts to the served box for served-area searches', async () => {
    const fetchAuto = vi.fn().mockResolvedValue({ suggestions: [] });
    installPlaces(fetchAuto);
    await fetchLocalitySuggestions('baner');
    expect(fetchAuto.mock.calls[0][0]).toMatchObject({ locationRestriction: { north: 9, south: 8, east: 9, west: 8 }, includedPrimaryTypes: LOCALITY_TYPES });
    geoMocks.servedSearchBox.mockReturnValueOnce(null);
    await fetchLocalitySuggestions('baner');
    expect(fetchAuto.mock.calls[1][0]).not.toHaveProperty('locationRestriction');
    await fetchLocalitySuggestions('baner', null, { crossCity: true });
    expect(fetchAuto.mock.calls[2][0]).not.toHaveProperty('locationRestriction');
  });

  it('retries without primary types when the typed request fails', async () => {
    const fetchAuto = vi.fn().mockRejectedValueOnce(new Error('bad type')).mockResolvedValueOnce({ suggestions: [prediction('p1')] });
    installPlaces(fetchAuto);
    const out = await fetchSuggestions('baner', null, { includedPrimaryTypes: ['x'] });
    expect(out).toHaveLength(1);
    expect(fetchAuto.mock.calls[0][0]).toHaveProperty('includedPrimaryTypes');
    expect(fetchAuto.mock.calls[1][0]).not.toHaveProperty('includedPrimaryTypes');
  });

  it('returns an empty list when every attempt fails', async () => {
    installPlaces(vi.fn().mockRejectedValue(new Error('down')));
    expect(await fetchSuggestions('baner', null, { includedPrimaryTypes: ['x'] })).toEqual([]);
    expect(await fetchSuggestions('baner')).toEqual([]);
  });

  it('drops blacklisted suggestions via the geo filter', async () => {
    geoMocks.filterSuggestions.mockImplementation((l) => l.filter((s) => s.placeId !== 'p1'));
    installPlaces(vi.fn().mockResolvedValue({ suggestions: [prediction('p1'), prediction('p2')] }));
    expect((await fetchSuggestions('baner')).map((s) => s.placeId)).toEqual(['p2']);
  });

  it('fences suggestions to the enforced bounds by their resolved location', async () => {
    const inside = { fetchFields: vi.fn().mockResolvedValue(), location: latLng(18.5, 73.8) };
    const outside = { fetchFields: vi.fn().mockResolvedValue(), location: latLng(28, 77) };
    geoMocks.enforcedServedBounds.mockReturnValue([{ north: 19, south: 18, east: 74, west: 73 }]);
    geoMocks.withinAnyBounds.mockImplementation((lat) => lat < 20);
    installPlaces(vi.fn().mockResolvedValue({ suggestions: [prediction('in-1', 'A', 'B', inside), prediction('out-1', 'C', 'D', outside)] }));
    const out = await fetchSuggestions('baner');
    expect(out.map((s) => s.placeId)).toEqual(['in-1']);
    await fetchSuggestions('baner');
    expect(inside.fetchFields).toHaveBeenCalledTimes(1);
  });

  it('resolves a prediction location through the Place class and tolerates failures', async () => {
    const fetchFields = vi.fn().mockResolvedValue();
    class Place { constructor({ id }) { this.id = id; this.location = latLng(1, 2); this.fetchFields = fetchFields; } }
    geoMocks.enforcedServedBounds.mockReturnValue([{ north: 5, south: 0, east: 5, west: 0 }]);
    geoMocks.withinAnyBounds.mockImplementation((lat) => lat === 1);
    installPlaces(vi.fn().mockResolvedValue({ suggestions: [prediction('via-class'), prediction('broken', 'x', 'y', { fetchFields: vi.fn().mockRejectedValue(new Error('no')) })] }), { Place });
    const out = await fetchSuggestions('baner');
    expect(out.map((s) => s.placeId)).toEqual(['via-class']);
    expect(fetchFields).toHaveBeenCalledWith({ fields: ['location'] });
  });

  it('applies served-area fences only for a bias or several districts', async () => {
    const boxes = [{ north: 5, south: 0, east: 5, west: 0 }, { north: 9, south: 6, east: 9, west: 6 }];
    geoMocks.servedBoundsList.mockReturnValue(boxes);
    geoMocks.withinAnyBounds.mockReturnValue(false);
    const place = { fetchFields: vi.fn().mockResolvedValue(), location: latLng(1, 1) };
    installPlaces(vi.fn().mockResolvedValue({ suggestions: [prediction('served-1', 'a', 'b', place)] }));
    expect(await fetchSuggestions('baner', null, { servedArea: true })).toEqual([]);
    geoMocks.servedBoundsList.mockReturnValue([boxes[0]]);
    expect(await fetchSuggestions('baner', null, { servedArea: true })).toHaveLength(1);
    expect(await fetchSuggestions('baner', null, { servedArea: true, locationBias: { x: 1 } })).toEqual([]);
  });
});

describe('fetchPlaceViewport', () => {
  it('returns null for no suggestion or no resolvable place', async () => {
    expect(await fetchPlaceViewport(null)).toBeNull();
    expect(await fetchPlaceViewport({ placeId: 'x' })).toBeNull();
  });

  it('reads the centre and bounds from a prediction place', async () => {
    const place = {
      fetchFields: vi.fn().mockResolvedValue(),
      location: latLng(18.5, 73.8),
      viewport: { getNorthEast: () => latLng(19, 74), getSouthWest: () => latLng(18, 73) },
    };
    const out = await fetchPlaceViewport({ placeId: 'p', _p: { toPlace: () => place } });
    expect(out).toEqual({ center: { lat: 18.5, lng: 73.8 }, bounds: { north: 19, south: 18, east: 74, west: 73 } });
    expect(place.fetchFields).toHaveBeenCalledWith({ fields: ['location', 'viewport'] });
  });

  it('builds a Place from the id and tolerates a missing viewport/location', async () => {
    const fetchFields = vi.fn().mockResolvedValue();
    class Place { constructor() { this.fetchFields = fetchFields; } }
    installPlaces(vi.fn(), { Place });
    expect(await fetchPlaceViewport({ placeId: 'p' })).toEqual({ center: null, bounds: null });
  });

  it('returns null when fetching fails', async () => {
    expect(await fetchPlaceViewport({ placeId: 'p', _p: { toPlace: () => ({ fetchFields: vi.fn().mockRejectedValue(new Error('x')) }) } })).toBeNull();
  });
});

describe('fetchPlaceDetails', () => {
  it('returns null for no suggestion or place', async () => {
    expect(await fetchPlaceDetails(null)).toBeNull();
    expect(await fetchPlaceDetails({})).toBeNull();
  });

  it('maps a full place', async () => {
    const place = {
      id: 'pid', fetchFields: vi.fn().mockResolvedValue(), location: latLng(18.5, 73.8),
      addressComponents: [{ types: ['postal_code'], longText: '411045' }, { types: ['route'], longText: 'Baner Rd' }, { types: ['sublocality'], longText: 'Baner' }],
      formattedAddress: 'Baner Rd, Pune', displayName: 'Skyline', types: ['premise'],
    };
    expect(await fetchPlaceDetails({ placeId: 'x', _p: { toPlace: () => place } })).toEqual({
      placeId: 'pid', lat: 18.5, lng: 73.8, pincode: '411045', street: 'Baner Rd', localityRaw: 'Baner',
      formatted: 'Baner Rd, Pune', name: 'Skyline', isNamedPlace: true, types: ['premise'],
    });
  });

  it('uses safe defaults for a sparse place', async () => {
    class Place { constructor() { this.fetchFields = vi.fn().mockResolvedValue(); } }
    installPlaces(vi.fn(), { Place });
    expect(await fetchPlaceDetails({ placeId: 'sp' })).toEqual({
      placeId: 'sp', lat: null, lng: null, pincode: '', street: '', localityRaw: '', formatted: '', name: '', isNamedPlace: false, types: [],
    });
  });

  it('returns null when fetching fails', async () => {
    expect(await fetchPlaceDetails({ _p: { toPlace: () => ({ fetchFields: vi.fn().mockRejectedValue(new Error('x')) }) } })).toBeNull();
  });
});
