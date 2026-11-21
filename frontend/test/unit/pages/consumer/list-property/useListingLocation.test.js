import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';

vi.mock('../../../../../src/pages/consumer/list-property/geocode.js', () => ({
  reverseGeocode: vi.fn(),
  forwardGeocode: vi.fn(),
  fetchLocalitySuggestions: vi.fn(),
  fetchPlaceDetails: vi.fn(),
  newAutocompleteSession: vi.fn(() => 'session'),
}));
vi.mock('../../../../../src/services/localityService.js', () => ({
  resolveLocality: vi.fn(),
  searchLocalities: vi.fn(),
}));

import { reverseGeocode, forwardGeocode, fetchLocalitySuggestions, fetchPlaceDetails } from '../../../../../src/pages/consumer/list-property/geocode.js';
import { resolveLocality, searchLocalities } from '../../../../../src/services/localityService.js';
import useListingLocation, {
  societyLocalityName,
  activeLocality,
} from '../../../../../src/pages/consumer/list-property/useListingLocation.js';

afterEach(cleanup);

const BANER = { name: 'Baner', slug: 'baner' };

function setup(initial = {}, initialErrors = {}) {
  const formRef = { current: { propertyType: 'flat', ...initial } };
  const errorsRef = { current: initialErrors };
  const setForm = vi.fn((upd) => { formRef.current = typeof upd === 'function' ? upd(formRef.current) : upd; });
  const setErrors = vi.fn((upd) => { errorsRef.current = typeof upd === 'function' ? upd(errorsRef.current) : upd; });
  const view = renderHook(({ errors }) => useListingLocation({ setForm, formRef, errors, setErrors }), { initialProps: { errors: initialErrors } });
  return { view, formRef, errorsRef, setForm, setErrors, api: () => view.result.current };
}

beforeEach(() => {
  reverseGeocode.mockReset().mockResolvedValue({ pincode: '', street: '', localityRaw: '' });
  forwardGeocode.mockReset();
  fetchLocalitySuggestions.mockReset().mockResolvedValue([]);
  fetchPlaceDetails.mockReset();
  resolveLocality.mockReset();
  searchLocalities.mockReset().mockResolvedValue([]);
});

describe('societyLocalityName', () => {
  it('prefers known locality fields', async () => {
    expect(await societyLocalityName({ locality: 'Baner', localitySlug: 'b' })).toEqual({ name: 'Baner', slug: 'b' });
    expect(await societyLocalityName({ localityLabel: 'Label' })).toEqual({ name: 'Label', slug: '' });
    expect(await societyLocalityName({ localitySlug: 'pimple-saudagar' })).toEqual({ name: 'Pimple Saudagar', slug: 'pimple-saudagar' });
  });

  it('uses the raw locality or reverse geocodes the pin', async () => {
    expect(await societyLocalityName({ localityRaw: 'Raw' }, 1, 2)).toEqual({ name: 'Raw', slug: '' });
    expect(await societyLocalityName({}, NaN, 2)).toEqual({ name: '', slug: '' });
    reverseGeocode.mockResolvedValue({ localityRaw: 'Geo' });
    expect(await societyLocalityName({}, 1, 2)).toEqual({ name: 'Geo', slug: '' });
    reverseGeocode.mockResolvedValue({});
    expect(await societyLocalityName({}, 1, 2)).toEqual({ name: '', slug: '' });
  });
});

describe('activeLocality', () => {
  it('returns null for blank names and failures', async () => {
    expect(await activeLocality('  ', '')).toBeNull();
    searchLocalities.mockRejectedValue(new Error('x'));
    expect(await activeLocality('Baner', '')).toBeNull();
  });

  it('matches an active locality by slug or name', async () => {
    searchLocalities.mockResolvedValue([{ name: 'Wakad', slug: 'wakad' }, BANER]);
    expect(await activeLocality('whatever', 'baner')).toBe(BANER);
    expect(await activeLocality(' baner ', '')).toBe(BANER);
  });

  it('falls back to resolving through Google suggestions', async () => {
    searchLocalities.mockResolvedValue([]);
    fetchLocalitySuggestions.mockResolvedValue([{ mainText: 'Other', placeId: 'x' }, { mainText: 'Baner', placeId: 'pid' }]);
    fetchPlaceDetails.mockResolvedValue({ lat: 1, lng: 2, name: 'Baner', types: ['sublocality'] });
    resolveLocality.mockResolvedValue(BANER);
    expect(await activeLocality('Baner', '')).toBe(BANER);
    expect(resolveLocality).toHaveBeenCalledWith({ placeId: 'pid', name: 'Baner', lat: 1, lng: 2, types: ['sublocality'] });
    fetchPlaceDetails.mockResolvedValue({ lat: null, lng: 2 });
    expect(await activeLocality('Baner', '')).toBeNull();
    fetchLocalitySuggestions.mockResolvedValue([]);
    expect(await activeLocality('Baner', '')).toBeNull();
  });
});

describe('set', () => {
  it('updates the form and clears the field error', () => {
    const t = setup({}, { street: 'bad', other: 'x' });
    t.view.rerender({ errors: t.errorsRef.current });
    act(() => t.api().set('street', 'MG Road'));
    expect(t.formRef.current.street).toBe('MG Road');
    expect(t.errorsRef.current).toEqual({ other: 'x' });
  });

  it('marks tracked fields as user edited so autofill stops overwriting them', async () => {
    const t = setup();
    act(() => t.api().set('pincode', '411001'));
    reverseGeocode.mockResolvedValue({ pincode: '999999', street: 'Auto St', localityRaw: '' });
    await act(async () => { t.api().onPinMove(18.5, 73.8); });
    await waitFor(() => expect(t.formRef.current.street).toBe('Auto St'));
    expect(t.formRef.current.pincode).toBe('411001');
  });
});

describe('pin placement and autofill', () => {
  it('places a pin and autofills empty fields and the locality', async () => {
    searchLocalities.mockResolvedValue([BANER]);
    reverseGeocode.mockResolvedValue({ pincode: '411045', street: 'Main Rd', localityRaw: 'Baner' });
    const t = setup();
    await act(async () => { t.api().onPinMove(18.5, 73.8); });
    await waitFor(() => expect(t.formRef.current.locality).toBe('Baner'));
    expect(t.formRef.current).toMatchObject({ propLat: 18.5, propLng: 73.8, pinPlaced: true, pincode: '411045', street: 'Main Rd', localitySlug: 'baner' });
    await waitFor(() => expect(t.api().geoFillStatus).toBe('done'));
    expect(t.api().currentLocationStatus).toBe('');
  });

  it('does not refetch for the same pin and does not overwrite existing values', async () => {
    reverseGeocode.mockResolvedValue({ pincode: '411045', street: 'Main Rd', localityRaw: '' });
    const t = setup({ street: 'Mine' });
    await act(async () => { t.api().onPinMove(18.5, 73.8); });
    await act(async () => { t.api().onPinMove(18.5, 73.8); });
    expect(reverseGeocode).toHaveBeenCalledTimes(1);
    expect(t.formRef.current.street).toBe('Mine');
    expect(t.formRef.current.pincode).toBe('411045');
  });

  it('clears the location error when placing a pin', async () => {
    const t = setup({}, { location: 'Pin it' });
    t.view.rerender({ errors: t.errorsRef.current });
    await act(async () => { t.api().onPinMove(1, 2); });
    expect(t.errorsRef.current.location).toBeUndefined();
  });

  it('clears a stale locality when the replaced fill finds no active locality', async () => {
    reverseGeocode.mockResolvedValue({ pincode: '', street: '', localityRaw: 'Nowhere' });
    forwardGeocode.mockResolvedValue({ lat: 1, lng: 2, pincode: '', street: '', localityRaw: 'Nowhere' });
    const t = setup({ locality: 'Old', localitySlug: 'old' });
    act(() => t.api().onMapSearchChange('Nowhere'));
    await act(async () => { await t.api().runMapSearch(); });
    await waitFor(() => expect(t.formRef.current.locality).toBe(''));
    expect(t.formRef.current.localitySlug).toBe('');
  });
});

describe('map search', () => {
  it('ignores blank queries and reports not found', async () => {
    const t = setup();
    await act(async () => { await t.api().runMapSearch(); });
    expect(forwardGeocode).not.toHaveBeenCalled();
    act(() => t.api().onMapSearchChange('Nowhere'));
    forwardGeocode.mockResolvedValue(null);
    await act(async () => { await t.api().runMapSearch(); });
    expect(t.api().mapSearchStatus).toBe('notfound');
    act(() => t.api().onMapSearchChange('Else'));
    expect(t.api().mapSearchStatus).toBe('');
    expect(t.api().mapSearch).toBe('Else');
  });

  it('treats a geocoder failure as not found', async () => {
    forwardGeocode.mockRejectedValue(new Error('x'));
    const t = setup();
    act(() => t.api().onMapSearchChange('x'));
    await act(async () => { await t.api().runMapSearch(); });
    expect(t.api().mapSearchStatus).toBe('notfound');
  });

  it('flies to the result and fills the address', async () => {
    searchLocalities.mockResolvedValue([BANER]);
    forwardGeocode.mockResolvedValue({ lat: 18.5, lng: 73.8, pincode: '411045', street: 'S', localityRaw: 'Baner' });
    const t = setup();
    act(() => t.api().onMapSearchChange('Baner'));
    await act(async () => { await t.api().runMapSearch(); });
    expect(t.api().flyTo).toEqual([18.5, 73.8]);
    expect(t.api().mapSearchStatus).toBe('');
    await waitFor(() => expect(t.formRef.current.locality).toBe('Baner'));
    expect(t.formRef.current.pincode).toBe('411045');
  });

  it('backfills gaps from reverse geocoding after an area selection', async () => {
    reverseGeocode.mockResolvedValue({ pincode: '411001', street: 'Rev St', localityRaw: '' });
    const t = setup();
    act(() => t.api().onAreaSelect({ lat: 1, lng: 2, pincode: '', street: '', localityRaw: '' }));
    await waitFor(() => expect(t.formRef.current.pincode).toBe('411001'));
    expect(t.formRef.current.street).toBe('Rev St');
    act(() => t.api().onAreaSelect(null));
    act(() => t.api().onAreaSelect({ lat: null, lng: 2 }));
  });
});

describe('locality change', () => {
  it('flies to the locality coordinates', async () => {
    const t = setup();
    act(() => t.api().onLocalityChange('Baner', { slug: 'baner', lat: 18.5, lng: 73.8 }));
    expect(t.formRef.current).toMatchObject({ locality: 'Baner', localitySlug: 'baner', propLat: 18.5, pinPlaced: true });
    expect(t.api().flyTo).toEqual([18.5, 73.8]);
    await waitFor(() => expect(reverseGeocode).toHaveBeenCalled());
  });

  it('does not move a manually placed pin', async () => {
    const t = setup();
    await act(async () => { t.api().onPinMove(1, 2); });
    act(() => t.api().onLocalityChange('Wakad', { slug: 'wakad', lat: 9, lng: 9 }));
    expect(t.formRef.current.propLat).toBe(1);
    act(() => t.api().onLocalityChange('Plain'));
    expect(t.formRef.current.localitySlug).toBe('');
  });
});

describe('society picking', () => {
  const society = (extra = {}) => ({ id: 's1', name: 'Sky Heights', pincode: '411045', year: new Date().getFullYear() - 3, localitySlug: 'baner', lat: 18.5, lng: 73.8, ...extra });

  it('fills society fields, pins the map and binds the locality', async () => {
    searchLocalities.mockResolvedValue([BANER]);
    const t = setup({ construction: 'under' });
    act(() => t.api().onSocietyPick(society({ rera: 'p123' })));
    expect(t.formRef.current).toMatchObject({ societyId: 's1', society: 'Sky Heights', societyNotOnMaps: false, pincode: '411045', age: '1-5', reraId: 'P123', pinPlaced: true });
    expect(t.api().flyTo).toEqual([18.5, 73.8]);
    expect(t.api().societyFillNotice).toMatchObject({ name: 'Sky Heights' });
    await waitFor(() => expect(t.formRef.current.locality).toBe('Baner'));
    await waitFor(() => expect(t.api().societyFillNotice.fields).toContain('locality'));
  });

  it('skips RERA for completed projects and honours user-edited fields', async () => {
    const t = setup({ construction: 'ready' });
    act(() => t.api().set('pincode', '999999'));
    act(() => t.api().onSocietyPick(society({ rera: 'x', lat: null, lng: null, localitySlug: '', localityRaw: 'x' })));
    expect(t.formRef.current.reraId).toBeUndefined();
    expect(t.formRef.current.pincode).toBe('999999');
    expect(t.formRef.current.age).toBe('1-5');
  });

  it('pulls a missing pincode from the society pin', async () => {
    reverseGeocode.mockResolvedValue({ pincode: '411045', localityRaw: 'Baner' });
    const t = setup();
    act(() => t.api().onSocietyPick(society({ pincode: '', localitySlug: '' })));
    await waitFor(() => expect(t.formRef.current.pincode).toBe('411045'));
    await waitFor(() => expect(t.api().societyFillNotice.fields).toContain('pincode'));
  });

  it('clears the society when deselected or not on maps', () => {
    const t = setup({ societyId: 's1', society: 'X' });
    act(() => t.api().onSocietyPick({ notOnMaps: true }));
    expect(t.formRef.current).toMatchObject({ societyId: '', society: '', societyNotOnMaps: true });
    act(() => t.api().onSocietyPick(null));
    expect(t.formRef.current.societyNotOnMaps).toBe(false);
    expect(t.api().societyFillNotice).toBeNull();
  });

  it('ignores a stale pick for the pin pincode lookup', async () => {
    let release;
    reverseGeocode.mockImplementation(() => new Promise((res) => { release = res; }));
    const t = setup();
    act(() => t.api().onSocietyPick(society({ pincode: '', localitySlug: 'baner' })));
    act(() => t.api().onSocietyPick(null));
    await act(async () => { release({ pincode: '411045' }); });
    expect(t.formRef.current.pincode).toBeUndefined();
  });

  it('does not move a manually placed pin when a society is picked', async () => {
    const t = setup();
    await act(async () => { t.api().onPinMove(1, 2); });
    act(() => t.api().onSocietyPick(society()));
    expect(t.formRef.current.propLat).toBe(1);
  });
});

describe('current location', () => {
  let geo;

  beforeEach(() => {
    geo = { getCurrentPosition: vi.fn() };
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  });
  afterEach(() => {
    delete navigator.geolocation;
  });

  it('reports availability', () => {
    expect(setup().api().canUseCurrentLocation).toBe(true);
    delete navigator.geolocation;
    const t = setup();
    expect(t.api().canUseCurrentLocation).toBe(false);
    act(() => t.api().useCurrentLocation());
    expect(t.api().currentLocationStatus).toBe('unavailable');
  });

  it('pins and fills from the device position', async () => {
    geo.getCurrentPosition.mockImplementation((ok) => ok({ coords: { latitude: 18.5, longitude: 73.8 } }));
    reverseGeocode.mockResolvedValue({ pincode: '411045', street: '', localityRaw: '' });
    const t = setup();
    await act(async () => { t.api().useCurrentLocation(); });
    await waitFor(() => expect(t.api().currentLocationStatus).toBe('done'));
    expect(t.formRef.current).toMatchObject({ propLat: 18.5, pincode: '411045' });
    expect(geo.getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true });
  });

  it.each([[1, 'denied'], [3, 'timeout'], [2, 'error']])('maps geolocation error %s to %s', async (code, status) => {
    geo.getCurrentPosition.mockImplementation((ok, fail) => fail({ code }));
    const t = setup();
    act(() => t.api().useCurrentLocation());
    expect(t.api().currentLocationStatus).toBe(status);
  });

  it('ignores a result superseded by a manual pin', async () => {
    let ok;
    geo.getCurrentPosition.mockImplementation((cb) => { ok = cb; });
    const t = setup();
    act(() => t.api().useCurrentLocation());
    expect(t.api().currentLocationStatus).toBe('locating');
    await act(async () => { t.api().onPinMove(1, 2); });
    await act(async () => { await ok({ coords: { latitude: 9, longitude: 9 } }); });
    expect(t.formRef.current.propLat).toBe(1);
  });
});
