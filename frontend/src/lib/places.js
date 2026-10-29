import { activeLocationConstraint, enforcedCityBounds, withinBounds, filterSuggestions, geoPolicySettled, PUNE_BOUNDS as GEO_PUNE_BOUNDS, PUNE_REGION_BOUNDS } from './geoConfig.js';

export const PUNE_BOUNDS = GEO_PUNE_BOUNDS;

export const LOCALITY_TYPES = ['locality', 'sublocality', 'neighborhood'];

const NAMED_PLACE_TYPES = [
  'premise', 'subpremise', 'apartment_complex', 'establishment', 'point_of_interest',
];

export function isNamedSocietyPlace(types) {
  const t = Array.isArray(types) ? types : [];
  if (!t.length) return false;
  if (t.some((x) => NAMED_PLACE_TYPES.includes(x))) return true;
  return false;
}

export async function getPlacesLib() {
  const g = typeof window !== 'undefined' ? window.google : null;
  if (!g || !g.maps || !g.maps.importLibrary) return null;
  try {
    return await g.maps.importLibrary('places');
  } catch {
    return null;
  }
}

export function normalizeComponents(comps) {
  return (Array.isArray(comps) ? comps : []).map((c) => ({
    types: Array.isArray(c.types) ? c.types : [],
    name: c.longText != null ? c.longText : (c.long_name != null ? c.long_name : ''),
  }));
}

export function pickAddress(components) {
  const get = (type) => {
    const c = components.find((x) => x.types.includes(type));
    return c ? String(c.name || '') : '';
  };
  const rawPin = get('postal_code');
  const pincode = /^\d{6}$/.test(rawPin) ? rawPin : '';
  const street = get('route');
  const localityRaw =
    get('sublocality_level_1') || get('sublocality') || get('neighborhood') ||
    get('locality') || '';
  return { pincode, street: String(street).slice(0, 60), localityRaw };
}

export function newAutocompleteSession() {
  const g = typeof window !== 'undefined' ? window.google : null;
  try {
    if (g && g.maps && g.maps.places && g.maps.places.AutocompleteSessionToken) {
      return new g.maps.places.AutocompleteSessionToken();
    }
  } catch {
  }
  return null;
}

const _predLocation = new Map();
const _PRED_CACHE_MAX = 500;

function cachePredLocation(id, loc) {
  if (_predLocation.size >= _PRED_CACHE_MAX) {
    const oldest = _predLocation.keys().next().value;
    if (oldest !== undefined) _predLocation.delete(oldest);
  }
  _predLocation.set(id, loc);
}

async function resolvePredictionLocation(pred) {
  const id = pred?.placeId;
  if (!id) return null;
  if (_predLocation.has(id)) return _predLocation.get(id);
  let loc = null;
  try {
    let place = pred._p && typeof pred._p.toPlace === 'function' ? pred._p.toPlace() : null;
    if (!place) {
      const lib = await getPlacesLib();
      if (lib && lib.Place) place = new lib.Place({ id });
    }
    if (place) {
      await place.fetchFields({ fields: ['location'] });
      if (place.location) loc = { lat: place.location.lat(), lng: place.location.lng() };
    }
  } catch {
    loc = null;
  }
  cachePredLocation(id, loc);
  return loc;
}

async function fenceToActiveCity(list) {
  const fence = enforcedCityBounds();
  if (!fence || !list.length) return list;
  const located = await Promise.all(list.map(async (s) => [s, await resolvePredictionLocation(s)]));
  const kept = located.filter(([, loc]) => withinBounds(loc?.lat, loc?.lng, fence)).map(([s]) => s);
  if (import.meta.env?.DEV && list.length && !kept.length) {
    // eslint-disable-next-line no-console
    console.warn('[places] city fence dropped all suggestions — check Admin ▸ Settings ▸ Maps city bounds.');
  }
  return kept;
}

export async function fetchSuggestions(input, sessionToken, opts = {}) {
  const q = String(input || '').trim();
  if (q.length < 2) return [];
  const places = await getPlacesLib();
  if (!places || !places.AutocompleteSuggestion) return [];

  const base = {
    input: q,
    sessionToken: sessionToken || undefined,
    includedRegionCodes: ['in'],
    ...(opts.ignoreCityLimit || opts.crossCity
      ? {}
      : opts.servedArea ? { locationRestriction: PUNE_REGION_BOUNDS }
      : (opts.locationBias ? { locationBias: opts.locationBias } : activeLocationConstraint())),
  };
  const withTypes = opts.includedPrimaryTypes?.length ? { ...base, includedPrimaryTypes: opts.includedPrimaryTypes } : base;

  const run = async (req) => {
    const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
    const mapped = (suggestions || [])
      .map((s) => {
        const p = s.placePrediction;
        if (!p) return null;
        const main = p.mainText ? p.mainText.toString() : (p.text ? p.text.toString() : '');
        const secondary = p.secondaryText?.toString() || '';
        return { placeId: p.placeId, mainText: main, secondaryText: secondary, _p: p };
      })
      .filter((x) => x?.placeId);
    if (opts.ignoreCityLimit) return mapped;
    await geoPolicySettled();
    const filtered = filterSuggestions(mapped);
    return opts.crossCity || opts.servedArea ? filtered : fenceToActiveCity(filtered);
  };

  try {
    return await run(withTypes);
  } catch {
    if (withTypes !== base) {
      try {
        return await run(base);
      } catch {
        return [];
      }
    }
    return [];
  }
}

export function fetchLocalitySuggestions(input, sessionToken, opts = {}) {
  return fetchSuggestions(input, sessionToken, { includedPrimaryTypes: LOCALITY_TYPES, crossCity: !!opts.crossCity, servedArea: !opts.crossCity });
}

export function fetchAreaSuggestions(input, sessionToken) {
  return fetchSuggestions(input, sessionToken, { includedPrimaryTypes: ['geocode'] });
}

export function fetchAdminSuggestions(input, sessionToken) {
  return fetchSuggestions(input, sessionToken, { ignoreCityLimit: true });
}

export async function fetchPlaceViewport(suggestion) {
  if (!suggestion) return null;
  const places = await getPlacesLib();
  try {
    let place = null;
    if (suggestion._p && typeof suggestion._p.toPlace === 'function') {
      place = suggestion._p.toPlace();
    } else if (places && places.Place && suggestion.placeId) {
      place = new places.Place({ id: suggestion.placeId });
    }
    if (!place) return null;
    await place.fetchFields({ fields: ['location', 'viewport'] });
    const loc = place.location;
    const center = loc ? { lat: loc.lat(), lng: loc.lng() } : null;
    let bounds = null;
    const vp = place.viewport;
    if (vp?.getNorthEast) {
      const ne = vp.getNorthEast();
      const sw = vp.getSouthWest();
      bounds = { north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() };
    }
    return { center, bounds };
  } catch {
    return null;
  }
}

export async function fetchPlaceDetails(suggestion) {
  if (!suggestion) return null;
  const places = await getPlacesLib();
  try {
    let place = null;
    if (suggestion._p && typeof suggestion._p.toPlace === 'function') {
      place = suggestion._p.toPlace();
    } else if (places && places.Place && suggestion.placeId) {
      place = new places.Place({ id: suggestion.placeId });
    }
    if (!place) return null;
    await place.fetchFields({ fields: ['location', 'addressComponents', 'formattedAddress', 'displayName', 'types'] });
    const a = pickAddress(normalizeComponents(place.addressComponents));
    return {
      placeId: place.id || suggestion.placeId || '',
      lat: place.location ? place.location.lat() : null,
      lng: place.location ? place.location.lng() : null,
      pincode: a.pincode,
      street: a.street,
      localityRaw: a.localityRaw,
      formatted: place.formattedAddress ? String(place.formattedAddress) : '',
      name: place.displayName ? String(place.displayName) : '',
      isNamedPlace: isNamedSocietyPlace(place.types),
      types: Array.isArray(place.types) ? place.types : [],
    };
  } catch {
    return null;
  }
}
