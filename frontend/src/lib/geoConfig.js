import { listCities as fetchCities } from '../services/cityService.js';
import { getGeo } from '../services/settingsService.js';

export const CITY_GEO = {
  Pune: {
    center: { lat: 18.553, lng: 73.86 },
    bounds: { north: 18.72, south: 18.38, east: 74.02, west: 73.68 },
    live: true,
    hasData: true,
  },
  Mumbai: {
    center: { lat: 19.076, lng: 72.877 },
    bounds: { north: 19.30, south: 18.89, east: 73.03, west: 72.77 },
    live: false,
  },
  Bengaluru: {
    center: { lat: 12.9716, lng: 77.5946 },
    bounds: { north: 13.14, south: 12.83, east: 77.74, west: 77.46 },
    live: false,
  },
  'Delhi NCR': {
    center: { lat: 28.6139, lng: 77.209 },
    bounds: { north: 28.88, south: 28.40, east: 77.35, west: 76.84 },
    live: false,
  },
  Hyderabad: {
    center: { lat: 17.385, lng: 78.4867 },
    bounds: { north: 17.56, south: 17.29, east: 78.60, west: 78.32 },
    live: false,
  },
};

export const DEFAULT_CITY = 'Pune';

export const PUNE_CENTER = CITY_GEO.Pune.center;
export const PUNE_BOUNDS = CITY_GEO.Pune.bounds;
export const PUNE_REGION_BOUNDS = { north: 18.95, south: 18.25, east: 74.35, west: 73.30 };

export function getActiveCity() {
  try {
    return localStorage.getItem('draazyCity') || DEFAULT_CITY;
  } catch {
    return DEFAULT_CITY;
  }
}

let geoPolicy = {};

let cityRoster = defaultCityRoster();

function defaultCityRoster() {
  return Object.keys(CITY_GEO).map((name) => ({ name, live: !!CITY_GEO[name]?.live }));
}

function normaliseCityRoster(rows) {
  if (!Array.isArray(rows)) return defaultCityRoster();
  return rows
    .filter((row) => row && typeof row.name === 'string')
    .map((row) => ({
      slug: typeof row.slug === 'string' ? row.slug : undefined,
      name: row.name,
      live: row.live === true,
      listingCount: Number.isFinite(row.listingCount) ? row.listingCount : undefined,
    }));
}

const listeners = new Set();

let published = 0;
let started = 0;

export function onGeoChange(fn) {
  listeners.add(fn);
  if (published) fn();
  return () => listeners.delete(fn);
}

export function geoPolicySettled() {
  return started ? readyPromise : Promise.resolve();
}

let settleReady;
const readyPromise = new Promise((resolve) => { settleReady = resolve; });

export async function loadGeoPolicy() {
  const mine = ++started;
  try {
    const [geoResult, citiesResult] = await Promise.allSettled([getGeo(), fetchCities()]);
    if (mine === started) {
      const geo = geoResult.status === 'fulfilled' ? geoResult.value : null;
      if (geo && typeof geo === 'object') geoPolicy = geo;
      if (citiesResult.status === 'fulfilled') {
        cityRoster = normaliseCityRoster(citiesResult.value);
      }
      published += 1;
      listeners.forEach((fn) => fn());
    }
  } catch {
  } finally {
    settleReady();
  }
}

function readGeoSettings() {
  return geoPolicy;
}

export function getActiveCityGeo() {
  const name = getActiveCity();
  const geo = readGeoSettings();
  const base = CITY_GEO[name] || CITY_GEO[DEFAULT_CITY];
  const override = (geo.cities && geo.cities[name]) || {};
  return {
    name,
    center: override.center || base.center,
    bounds: override.bounds || base.bounds,
    enforce: geo.enforceCityLimit !== false,
  };
}

export function cityLiveFrom(cities, name) {
  const city = (Array.isArray(cities) ? cities : []).find(
    (row) => String(row?.name || '').toLowerCase() === String(name || '').toLowerCase(),
  );
  if (city && typeof city.live === 'boolean') return city.live;
  return !!(CITY_GEO[name] && CITY_GEO[name].live);
}

export function getCityLive(name) {
  return cityLiveFrom(cityRoster, name);
}

export function cityHasData(name) {
  return !!(CITY_GEO[name] && CITY_GEO[name].hasData);
}

export function getCities() {
  return cityRoster.map((city) => ({ ...city }));
}

export function cityLabelFor(listing) {
  const c = listing && (listing.city || listing.cityName);
  return c ? String(c) : getActiveCity();
}

export function activeLocationConstraint() {
  const { bounds, enforce } = getActiveCityGeo();
  if (!bounds) return {};
  return enforce ? { locationRestriction: bounds } : { locationBias: bounds };
}

export function enforcedCityBounds() {
  const { bounds, enforce } = getActiveCityGeo();
  return enforce && bounds ? bounds : null;
}

export function withinBounds(lat, lng, b) {
  if (!b || lat == null || lng == null) return true;
  return lat <= b.north && lat >= b.south && lng <= b.east && lng >= b.west;
}

export function getBlacklist() {
  const list = readGeoSettings().blacklist;
  return Array.isArray(list) ? list : [];
}

export function isBlacklisted(place) {
  if (!place) return false;
  const list = getBlacklist();
  if (!list.length) return false;
  const hay = `${place.mainText || place.name || ''} ${place.secondaryText || ''}`.toLowerCase();
  const id = place.placeId || place.id || '';
  return list.some((b) => {
    if (b.placeId && id && b.placeId === id) return true;
    const term = String(b.term || '').trim().toLowerCase();
    return term.length >= 2 && hay.includes(term);
  });
}

export function filterSuggestions(list) {
  if (!Array.isArray(list) || !list.length) return list || [];
  const blk = getBlacklist();
  return blk.length ? list.filter((s) => !isBlacklisted(s)) : list;
}
