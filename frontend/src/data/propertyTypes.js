export const SEARCH_TYPES = [
  { key: 'flat', label: 'Flat', icon: 'building', buy: true, rent: true, matches: ['flat', 'apartment', 'studio', 'penthouse'] },
  { key: 'house', label: 'Independent House', icon: 'home', buy: true, rent: true, matches: ['independent house', 'row house'] },
  { key: 'villa', label: 'Villa', icon: 'building-2', buy: true, rent: true, matches: ['villa'] },
  { key: 'flatmates', label: 'Shared Room', icon: 'door-open', buy: false, rent: true, matches: null },
  { key: 'commercial', label: 'Commercial', icon: 'briefcase', buy: true, rent: true, matches: ['office', 'shop', 'showroom', 'retail', 'commercial', 'warehouse', 'godown', 'industrial', 'co-working', 'coworking'] },
  { key: 'plot', label: 'Open Plot', icon: 'map', buy: true, rent: true, matches: ['open plot', 'plot'] },
  { key: 'farmland', label: 'Farm Land', icon: 'trees', buy: true, rent: true, matches: ['farm land', 'farmland'] },
];

const BY_KEY = Object.fromEntries(SEARCH_TYPES.map((t) => [t.key, t]));

export const BUY_TYPES = SEARCH_TYPES.filter((t) => t.buy).map((t) => [t.key, t.label]);
export const RENT_TYPES = SEARCH_TYPES.filter((t) => t.rent).map((t) => [t.key, t.label]);

export const HOME_TYPE_OPTS = {
  buy: SEARCH_TYPES.filter((t) => t.buy).map((t) => [t.key, t.label, t.icon]),
  rent: SEARCH_TYPES.filter((t) => t.rent).map((t) => [t.key, t.label, t.icon]),
};

export const isTypeKey = (k) => k in BY_KEY;

const ALIASES = {
  'villa / house': 'house',
  'plot / land': 'plot',
  'plot / plot': 'plot',
  penthouse: 'flat',
  apartment: 'flat',
  studio: 'flat',
  'independent house': 'house',
  'row house': 'house',
  'open plot': 'plot',
  'farm land': 'farmland',
};

export const canonicalTypeKey = (raw) => {
  const s = (raw || '').trim().toLowerCase();
  if (!s || isTypeKey(s)) return s;
  return ALIASES[s] || '';
};

export const matchTypeKey = (key, typeStr) => {
  const def = BY_KEY[key];
  if (!def || !def.matches) return false;
  const x = (typeStr || '').toLowerCase();
  return def.matches.some((m) => x.includes(m));
};

export const RESIDENTIAL_KEYS = ['flat', 'house', 'villa'];
export const isResidentialHome = (typeStr) => RESIDENTIAL_KEYS.some((k) => matchTypeKey(k, typeStr));

export const COMMERCIAL_SUBTYPES = [
  { key: 'office', label: 'Office Space', matches: ['office'] },
  { key: 'shop', label: 'Shop / Showroom', matches: ['shop', 'showroom'] },
  { key: 'retail', label: 'Retail / Mall Unit', matches: ['retail', 'mall'] },
  { key: 'warehouse', label: 'Warehouse / Godown', matches: ['warehouse', 'godown'] },
  { key: 'industrial', label: 'Industrial / Factory', matches: ['industrial', 'factory'] },
  { key: 'coworking', label: 'Co-working Space', matches: ['co-working', 'coworking'] },
];

const COMM_BY_KEY = Object.fromEntries(COMMERCIAL_SUBTYPES.map((t) => [t.key, t]));

export const COMMERCIAL_TYPES = COMMERCIAL_SUBTYPES.map((t) => [t.key, t.label]);

export const matchCommercialKey = (key, typeStr) => {
  const def = COMM_BY_KEY[key];
  if (!def) return false;
  const x = (typeStr || '').toLowerCase();
  return def.matches.some((m) => x.includes(m));
};

export const LAND_USE = [
  ['residential', 'Residential'],
  ['commercial', 'Commercial'],
  ['industrial', 'Industrial'],
  ['agricultural', 'Agricultural'],
  ['mixed', 'Mixed-Use'],
];
export const LANDUSE_LBL = Object.fromEntries(LAND_USE);
