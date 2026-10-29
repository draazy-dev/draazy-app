import {
  getPlacesLib,
  normalizeComponents,
  pickAddress,
  isNamedSocietyPlace,
  newAutocompleteSession,
  fetchSuggestions,
  fetchLocalitySuggestions,
  fetchPlaceDetails,
} from '../../../lib/places.js';
import { getActiveCityGeo } from '../../../lib/geoConfig.js';

export { newAutocompleteSession, fetchSuggestions, fetchLocalitySuggestions, fetchPlaceDetails };

async function getGeocoder() {
  const g = typeof window !== 'undefined' ? window.google : null;
  if (!g || !g.maps) return null;
  if (g.maps.Geocoder) return new g.maps.Geocoder();
  if (g.maps.importLibrary) {
    try {
      const lib = await g.maps.importLibrary('geocoding');
      return new lib.Geocoder();
    } catch {
      return null;
    }
  }
  return null;
}

function runGeocode(geocoder, request) {
  return new Promise((resolve, reject) => {
    geocoder.geocode(request, (results, status) => {
      if (status === 'OK' && results && results.length) resolve(results);
      else reject(new Error(status || 'GEOCODE_FAILED'));
    });
  });
}

function mergeAddress(componentLists) {
  let pincode = '';
  let street = '';
  let localityRaw = '';
  for (const comps of componentLists) {
    const a = pickAddress(comps);
    if (!pincode && a.pincode) pincode = a.pincode;
    if (!street && a.street) street = a.street;
    if (!localityRaw && a.localityRaw) localityRaw = a.localityRaw;
    if (pincode && street && localityRaw) break;
  }
  return { pincode, street, localityRaw };
}

export async function reverseGeocode(lat, lng) {
  const empty = { pincode: '', street: '', localityRaw: '' };
  if (lat == null || lng == null) return empty;
  const center = { lat: Number(lat), lng: Number(lng) };

  const places = await getPlacesLib();
  if (places && places.Place && typeof places.Place.searchNearby === 'function') {
    try {
      const rank = (places.SearchNearbyRankPreference && places.SearchNearbyRankPreference.DISTANCE) || 'DISTANCE';
      const { places: found } = await places.Place.searchNearby({
        fields: ['addressComponents'],
        locationRestriction: { center, radius: 200 },
        maxResultCount: 5,
        rankPreference: rank,
      });
      if (found && found.length) {
        const res = mergeAddress(found.map((p) => normalizeComponents(p.addressComponents)));
        if (res.pincode || res.street || res.localityRaw) return res;
      }
    } catch {
    }
  }

  const geocoder = await getGeocoder();
  if (geocoder) {
    try {
      const results = await runGeocode(geocoder, { location: center });
      const best = results.find((r) =>
        (r.address_components || []).some((c) => c.types && c.types.includes('postal_code')),
      ) || results[0];
      return pickAddress(normalizeComponents(best.address_components));
    } catch {
    }
  }
  return empty;
}

export async function forwardGeocode(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  const { name: cityName, bounds: cityBounds } = getActiveCityGeo();

  const places = await getPlacesLib();
  if (places && places.Place && typeof places.Place.searchByText === 'function') {
    try {
      const { places: found } = await places.Place.searchByText({
        textQuery: `${q}, ${cityName}`,
        fields: ['location', 'addressComponents', 'displayName', 'types'],
        maxResultCount: 1,
        locationBias: cityBounds,
      });
      if (found && found.length && found[0].location) {
        const p = found[0];
        const a = pickAddress(normalizeComponents(p.addressComponents));
        return {
          lat: p.location.lat(),
          lng: p.location.lng(),
          pincode: a.pincode,
          street: a.street,
          localityRaw: a.localityRaw,
          name: p.displayName ? String(p.displayName) : '',
          isNamedPlace: isNamedSocietyPlace(p.types),
        };
      }
    } catch {
    }
  }

  const geocoder = await getGeocoder();
  if (geocoder) {
    try {
      const results = await runGeocode(geocoder, {
        address: `${q}, ${cityName}, India`,
        componentRestrictions: { country: 'IN' },
        bounds: cityBounds,
      });
      const best = results[0];
      const loc = best.geometry && best.geometry.location;
      if (loc) {
        const a = pickAddress(normalizeComponents(best.address_components));
        return {
          lat: loc.lat(),
          lng: loc.lng(),
          pincode: a.pincode,
          street: a.street,
          localityRaw: a.localityRaw,
          name: '',
          isNamedPlace: isNamedSocietyPlace(best.types),
        };
      }
    } catch {
    }
  }
  return null;
}

