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

const BUILT_IN_DISTRICTS = {
  pune: { placeId: 'ChIJQ97RPE_AwjsR5zbDDbo3wHI', bounds: { north: 19.40, south: 17.89, east: 75.17, west: 73.32 } },
};

export const validBounds = (b) => !!b && [b.north, b.south, b.east, b.west].every(Number.isFinite)
  && b.north > b.south && b.east > b.west;

// Admin settings store entries as a name or {name, placeId, bounds};
// the public policy splits them into names + districtAreas.
export function servedDistrictAreasOf(geo) {
  const raw = Array.isArray(geo?.servedDistricts) ? geo.servedDistricts : [];
  const published = Array.isArray(geo?.districtAreas) ? geo.districtAreas : [];
  const out = [];
  for (const entry of raw) {
    const meta = entry && typeof entry === 'object' ? entry : {};
    const name = String(typeof entry === 'string' ? entry : meta.name || '').trim();
    const key = name.toLowerCase();
    if (!name || out.some((d) => d.name.toLowerCase() === key)) continue;
    const area = published.find((a) => String(a?.name || '').toLowerCase() === key) || meta;
    const builtIn = BUILT_IN_DISTRICTS[key] || {};
    out.push({
      name,
      placeId: area.placeId || builtIn.placeId || null,
      bounds: validBounds(area.bounds) ? area.bounds : builtIn.bounds || null,
    });
  }
  return out.length ? out : [{ name: 'Pune', ...BUILT_IN_DISTRICTS.pune }];
}

export const servedDistrictsOf = (geo) => servedDistrictAreasOf(geo).map((d) => d.name);

export function unionBounds(list) {
  const boxes = (list || []).filter(validBounds);
  if (!boxes.length) return null;
  return {
    north: Math.max(...boxes.map((b) => b.north)),
    south: Math.min(...boxes.map((b) => b.south)),
    east: Math.max(...boxes.map((b) => b.east)),
    west: Math.min(...boxes.map((b) => b.west)),
  };
}

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
  const base = CITY_GEO[name] || CITY_GEO[DEFAULT_CITY];
  return { name, center: base.center, bounds: base.bounds };
}

function cityLiveFrom(cities, name) {
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

export function servedBoundsList() {
  return servedDistrictAreasOf(readGeoSettings()).map((d) => d.bounds).filter(validBounds);
}

export const servedSearchBox = () => unionBounds(servedBoundsList());

const limitOn = () => readGeoSettings().enforceCityLimit !== false;

export function activeLocationConstraint() {
  const box = servedSearchBox();
  if (!box) return {};
  return limitOn() ? { locationRestriction: box } : { locationBias: box };
}

export const enforcedServedBounds = () => (limitOn() ? servedBoundsList() : null);

export function withinAnyBounds(lat, lng, boxes) {
  if (!boxes?.length || lat == null || lng == null) return true;
  return boxes.some((b) => lat <= b.north && lat >= b.south && lng <= b.east && lng >= b.west);
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
