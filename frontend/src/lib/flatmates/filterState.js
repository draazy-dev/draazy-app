import { clampNearRadius, nearMaxFor } from '../nearParams.js';

const STORAGE_KEY = 'draazy.flatmates.lastSearch.v1';
const DEFAULT_SORT = 'verified';
const VALID_SORTS = new Set(['match', 'verified', 'newest', 'budget-low', 'budget-high']);
const VALID_GENDERS = new Set(['male', 'female']);
const VALID_SHARING = new Set(['2', '3', '4', '5', '6']);
export const VIBE_FILTER_KEYS = ['food', 'smoking', 'pets', 'drinks', 'visitors', 'sleep'];
const VIBE_TOKEN_RE = new RegExp(`^(${VIBE_FILTER_KEYS.join('|')}):[0-2]$`);
const LEGACY_HABITS = { 'non-smoker': ['smoking:0'], vegetarian: ['food:0'], 'pet-friendly': ['pets:1', 'pets:2'] };
const VALID_ROOM_TYPES = new Set(['private', 'shared']);
const VALID_FURNISHINGS = new Set(['furnished', 'semi']);
const VALID_NEAR_MODES = new Set(['km', 'min']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NEAR_RE = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;

const FILTER_PARAM_KEYS = [
  'q', 'loc', 'g', 'gonly', 'room', 'furn', 'budget', 'movein', 'sharing', 'v', 'gated', 'bath', 'vibe',
  'near', 'nearlabel', 'nearr', 'nearmode',
];
const STATE_PARAM_KEYS = [...FILTER_PARAM_KEYS, 'habits', 'sort', 'view', '__proto__', 'prototype', 'constructor'];

const fieldByParam = Object.assign(Object.create(null), {
  q: 'q',
  loc: 'locality',
  g: 'gender',
  sharing: 'sharing',
});

const cloneFilters = (defaults) => ({
  ...defaults,
  budget: [...defaults.budget],
  vibe: [...(defaults.vibe || [])],
});

const parseBudget = (value, defaults) => {
  if (!value) return [...defaults.budget];
  const parts = value.split('-');
  if (parts.length !== 2) return [...defaults.budget];
  const lo = Number(parts[0]);
  const hi = Number(parts[1]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) return [...defaults.budget];
  return [Math.max(defaults.budget[0], lo), Math.min(defaults.budget[1], hi)];
};

const budgetsEqual = (a, b) => a[0] === b[0] && a[1] === b[1];
const budgetChanged = (value, defaults) => !budgetsEqual(value, defaults.budget);
const splitCsv = (value) => (value ? value.split(',').map((item) => item.trim()).filter(Boolean) : []);
const findLocality = (value) => value.trim();

/** Valid, de-duplicated `key:answer` tokens in a stable order, so the URL and the saved alert never churn. */
export function normalizeVibe(tokens) {
  const valid = new Set((tokens || []).filter((token) => typeof token === 'string' && VIBE_TOKEN_RE.test(token)));
  return [...valid].sort((a, b) => VIBE_FILTER_KEYS.indexOf(a.split(':')[0]) - VIBE_FILTER_KEYS.indexOf(b.split(':')[0]) || a.localeCompare(b));
}

const vibeFromLegacyHabits = (habits) => (habits || []).flatMap((habit) => LEGACY_HABITS[String(habit).toLowerCase()] || []);

export const hasFlatmateSearchParams = (params) => params.toString() !== '';

export function flatmateFiltersFromParams(params, defaults) {
  const filters = cloneFilters(defaults);
  const get = (key) => params.get(key) || '';

  Object.entries(fieldByParam).forEach(([param, field]) => {
    const value = field === 'q' ? get(param) : get(param).trim();
    if (!value) return;
    if (field === 'locality') {
      const locality = findLocality(value);
      if (locality) filters.locality = locality;
    } else if (field === 'gender') {
      if (VALID_GENDERS.has(value)) filters.gender = value;
    } else if (field === 'sharing') {
      if (VALID_SHARING.has(value)) filters.sharing = value;
    } else {
      filters[field] = value;
    }
  });

  filters.budget = parseBudget(get('budget'), defaults);
  const moveIn = get('movein');
  if (moveIn === 'now' || DATE_RE.test(moveIn)) filters.moveIn = moveIn;
  if (get('v') === '1') filters.verifiedOnly = true;
  if (get('bath') === '1') filters.attachedBath = true;
  if (get('gated') === '1') filters.gated = true;
  if (filters.gender && get('gonly') === '1') filters.genderOnly = true;
  if (VALID_ROOM_TYPES.has(get('room'))) filters.roomType = get('room');
  if (VALID_FURNISHINGS.has(get('furn'))) filters.furnishing = get('furn');
  filters.vibe = normalizeVibe([...splitCsv(get('vibe')), ...vibeFromLegacyHabits(splitCsv(get('habits')))]);

  const near = get('near').trim();
  if (NEAR_RE.test(near)) {
    filters.near = near;
    filters.nearLabel = get('nearlabel') || 'Selected place';
    const mode = get('nearmode');
    if (VALID_NEAR_MODES.has(mode)) filters.nearMode = mode;
    const radius = Number(get('nearr'));
    if (Number.isFinite(radius) && radius > 0) filters.nearRadius = clampNearRadius(radius, nearMaxFor(filters.nearMode));
  }

  return filters;
}

export function flatmateFiltersToParams(filters, defaults) {
  const params = Object.create(null);
  if (filters.q) params.q = filters.q;
  if (filters.locality) params.loc = filters.locality;
  if (filters.gender) params.g = filters.gender;
  if (filters.gender && filters.genderOnly) params.gonly = '1';
  if (filters.roomType) params.room = filters.roomType;
  if (filters.furnishing) params.furn = filters.furnishing;
  if (budgetChanged(filters.budget, defaults)) params.budget = `${filters.budget[0]}-${filters.budget[1]}`;
  if (filters.moveIn) params.movein = filters.moveIn;
  if (filters.sharing) params.sharing = String(filters.sharing);
  if (filters.verifiedOnly) params.v = '1';
  if (filters.gated) params.gated = '1';
  if (filters.attachedBath) params.bath = '1';
  if (filters.vibe.length) params.vibe = filters.vibe.join(',');
  if (filters.near) {
    params.near = filters.near;
    if (filters.nearLabel) params.nearlabel = filters.nearLabel;
    params.nearr = String(filters.nearRadius || defaults.nearRadius);
    params.nearmode = filters.nearMode || defaults.nearMode;
  }
  return params;
}

export function flatmateFiltersEqual(a, b) {
  return a.q === b.q
    && a.locality === b.locality
    && budgetsEqual(a.budget, b.budget)
    && a.moveIn === b.moveIn
    && a.gender === b.gender
    && a.genderOnly === b.genderOnly
    && a.roomType === b.roomType
    && a.furnishing === b.furnishing
    && a.sharing === b.sharing
    && a.verifiedOnly === b.verifiedOnly
    && a.gated === b.gated
    && a.attachedBath === b.attachedBath
    && a.near === b.near
    && a.nearLabel === b.nearLabel
    && a.nearRadius === b.nearRadius
    && a.nearMode === b.nearMode
    && a.vibe.length === b.vibe.length
    && a.vibe.every((token, index) => token === b.vibe[index]);
}

export function flatmateFiltersActive(filters, defaults) {
  return Object.keys(flatmateFiltersToParams(filters, defaults)).length > 0;
}

export function applyFlatmateStateToSearchParams(params, filters, defaults, { sort = DEFAULT_SORT, tab }) {
  const next = new URLSearchParams(params);
  STATE_PARAM_KEYS.forEach((key) => next.delete(key));
  Object.entries(flatmateFiltersToParams(filters, defaults)).forEach(([key, value]) => next.set(key, value));
  if (sort && sort !== DEFAULT_SORT) next.set('sort', sort);
  if (tab && tab !== 'move-in') next.set('view', tab);
  return next;
}

export function sortFromParams(params) {
  const sort = params.get('sort');
  return VALID_SORTS.has(sort) ? sort : DEFAULT_SORT;
}

export function readRememberedFlatmateSearch(defaults) {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const source = stored && typeof stored === 'object' && stored.filters && typeof stored.filters === 'object'
      ? stored.filters
      : null;
    if (!source) return null;
    const filters = cloneFilters(defaults);
    ['q', 'moveIn', 'near', 'nearLabel', 'nearMode'].forEach((key) => {
      if (Object.hasOwn(source, key) && typeof source[key] === 'string') filters[key] = source[key];
    });
    if (Object.hasOwn(source, 'locality') && typeof source.locality === 'string') {
      filters.locality = findLocality(source.locality);
    }
    if (Object.hasOwn(source, 'gender') && VALID_GENDERS.has(source.gender)) filters.gender = source.gender;
    if (Object.hasOwn(source, 'sharing') && VALID_SHARING.has(String(source.sharing))) filters.sharing = String(source.sharing);
    if (Object.hasOwn(source, 'budget') && Array.isArray(source.budget)) filters.budget = parseBudget(source.budget.join('-'), defaults);
    if (Object.hasOwn(source, 'verifiedOnly')) filters.verifiedOnly = source.verifiedOnly === true;
    if (Object.hasOwn(source, 'attachedBath')) filters.attachedBath = source.attachedBath === true;
    if (Object.hasOwn(source, 'gated')) filters.gated = source.gated === true;
    if (filters.gender && Object.hasOwn(source, 'genderOnly')) filters.genderOnly = source.genderOnly === true;
    if (VALID_ROOM_TYPES.has(source.roomType)) filters.roomType = source.roomType;
    if (VALID_FURNISHINGS.has(source.furnishing)) filters.furnishing = source.furnishing;
    filters.vibe = normalizeVibe([
      ...(Array.isArray(source.vibe) ? source.vibe : []),
      ...vibeFromLegacyHabits(Array.isArray(source.habits) ? source.habits : []),
    ]);
    if (!NEAR_RE.test(filters.near)) {
      filters.near = '';
      filters.nearLabel = '';
      filters.nearRadius = defaults.nearRadius;
      filters.nearMode = defaults.nearMode;
    }
    if (!VALID_NEAR_MODES.has(filters.nearMode)) filters.nearMode = defaults.nearMode;
    const radius = Number(source.nearRadius);
    if (Number.isFinite(radius) && radius > 0) filters.nearRadius = clampNearRadius(radius, nearMaxFor(filters.nearMode));
    return flatmateFiltersActive(filters, defaults) ? filters : null;
  } catch {
    return null;
  }
}

export function saveRememberedFlatmateSearch(filters, defaults) {
  try {
    if (!flatmateFiltersActive(filters, defaults)) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      filters: {
        q: filters.q,
        locality: filters.locality,
        budget: [...filters.budget],
        moveIn: filters.moveIn,
        gender: filters.gender,
        genderOnly: filters.genderOnly,
        roomType: filters.roomType,
        furnishing: filters.furnishing,
        sharing: filters.sharing,
        verifiedOnly: filters.verifiedOnly,
        gated: filters.gated,
        attachedBath: filters.attachedBath,
        vibe: [...filters.vibe],
        near: filters.near,
        nearLabel: filters.nearLabel,
        nearRadius: filters.nearRadius,
        nearMode: filters.nearMode,
      },
      savedAt: Date.now(),
    }));
  } catch {
    /* ignore */
  }
}

export function clearRememberedFlatmateSearch() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
