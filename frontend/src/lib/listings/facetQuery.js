import { sectionVisible } from './filterRelevance.js';
import { RANGE } from './filterState.js';
import { areaBounds, areaProfileForTypes } from './areaUnits.js';

const CONSTRUCTION_TO_WIRE = Object.assign(Object.create(null), {
  ready: 'ready-to-move',
  new: 'new-launch',
  under: 'under-construction',
});

const FURNISHING_TO_WIRE = Object.assign(Object.create(null), {
  unfurnished: 'unfurnished',
  semi: 'semi-furnished',
  furnished: 'furnished',
});

const list = (set) => (set && set.size ? [...set] : undefined);
const csv = (set) => (set && set.size ? [...set].join(',') : undefined);
const MIN_BATH_KEYS = new Set(['1', '2', '3', '4']);

function bounds(range, defaults) {
  if (!range) return [undefined, undefined];
  const [lo, hi] = range;
  const [dLo, dHi] = defaults;
  if (lo === dLo && hi === dHi) return [undefined, undefined];
  return [lo === dLo ? undefined : lo, hi === dHi ? undefined : hi];
}

export function toFacetQuery(df, opts = {}) {
  const { sort = 'relevance', q, dropLocalities = false } = opts;
  const rel = (section) => sectionVisible(section, df.types);
  const isBuy = df.deal === 'buy';

  const [minPrice, maxPrice] = isBuy
    ? bounds(df.budget, RANGE.budget)
    : bounds(df.rent, RANGE.rent);
  const [minArea, maxArea] = rel('area') ? areaBounds(df.area, areaProfileForTypes(df.types, df.areaUnit)) : [undefined, undefined];
  const [minDeposit, maxDeposit] = isBuy
    ? [undefined, undefined]
    : bounds(df.deposit, RANGE.deposit);
  const [minAge, maxAge] = rel('age') ? bounds(df.age, RANGE.age) : [undefined, undefined];
  const [minFloor, maxFloor] = rel('floor') ? bounds(df.floor, RANGE.floor) : [undefined, undefined];

  const types = list(df.types);

  const verified = df.verified || {};
  const near = nearParams(df);

  return {
    deal: df.deal,
    q: q || undefined,
    rank: sort === 'newest' ? 'newest' : sort === 'price-psf' ? 'pricePerSqft' : sort === 'verified' ? 'verified' : 'relevance',
    sort: sort === 'price-low' ? 'price,asc' : sort === 'price-high' ? 'price,desc' : undefined,

    types: types && types.length ? types : undefined,
    commercialUses: df.types?.has('commercial') ? list(df.commercialTypes) : undefined,
    bhks: rel('bhk') ? list(df.bhk) : undefined,
    furnishings: rel('furnishing') ? list(df.furnishing)?.map((f) => FURNISHING_TO_WIRE[f]).filter(Boolean) : undefined,
    facing: rel('facing') ? csv(df.facing) : undefined,
    minBaths: rel('baths') && MIN_BATH_KEYS.has(String(df.minBaths)) ? Number(df.minBaths) : undefined,
    localities: dropLocalities ? undefined : list(df.localities),
    societies: list(df.societies),
    amenities: rel('amenities') ? list(df.amenities) : undefined,
    landUse: rel('landUse') ? list(df.landUse) : undefined,
    shell: rel('shell') ? csv(df.shell) : undefined,
    preLeased: isBuy && rel('preLeased') && df.preLeased ? true : undefined,
    na: rel('na') ? csv(df.na) : undefined,
    room: !isBuy && rel('room') ? list(df.room) : undefined,
    tenants: !isBuy && rel('tenants') ? list(df.tenants) : undefined,
    construction: isBuy ? constructionFacet(df, rel) : undefined,
    availableFrom: !isBuy && rel('availFrom') ? df.availFrom || undefined : undefined,
    pets: !isBuy && df.pets && rel('amenities') ? true : undefined,
    food: !isBuy && df.food && rel('food') ? df.food : undefined,

    ownerVerified: verified.owner || undefined,
    ownershipVerified: verified.ownership || undefined,
    rera: verified.rera && rel('verifRera') ? true : undefined,

    minPrice,
    maxPrice,
    minArea,
    maxArea,
    minAge,
    maxAge,
    minFloor,
    maxFloor,
    minDeposit,
    maxDeposit,
    ...near,
  };
}

const UNMATCHABLE = Object.freeze(['no.such.possession']);

function constructionFacet(df, rel) {
  const fromChecks = df.constr?.size && rel('construction') ? [...df.constr] : null;
  if (!fromChecks) return undefined;
  const wire = fromChecks.map((k) => CONSTRUCTION_TO_WIRE[k]).filter(Boolean);
  return wire.length ? wire : UNMATCHABLE;
}

function nearParams(df) {
  if (!df.near) return {};
  const [lat, lng] = String(df.near).split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {};
  const radiusKm = df.nearMode === 'min' ? df.nearRadius * 0.4 : df.nearRadius;
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) return {};
  return { nearLat: lat, nearLng: lng, nearRadiusKm: radiusKm };
}
