
const amount = (s) => parseInt(String(s == null ? '' : s).replace(/[^\d]/g, ''), 10) || 0;

export const TIER_A_FIELDS = [
  { key: 'deal', label: 'Listing type (Sale / Rent)' },
  { key: 'propertyType', label: 'Property type' },
  { key: 'commercialType', label: 'Commercial type' },
  { key: 'bhk', label: 'Bedrooms (BHK)' },
  { key: 'carpetArea', label: 'Carpet area' },
  { key: 'builtUp', label: 'Built-up area' },
  { key: 'plotArea', label: 'Plot area' },
  { key: 'plotZone', label: 'Plot zone' },
  { key: 'floor', label: 'Floor' },
  { key: 'totalFloors', label: 'Total floors' },
  { key: 'facing', label: 'Facing' },
  { key: 'overlooking', label: 'Overlooking' },
  { key: 'age', label: 'Property age' },
  { key: 'construction', label: 'Possession status' },
  { key: 'ownership', label: 'Ownership type' },
  { key: 'locality', label: 'Locality' },
  { key: 'society', label: 'Society / project' },
  { key: 'electricityMeterNo', label: 'Electricity meter number' },
  { key: 'flatNumber', label: 'Flat / unit no.' },
  { key: 'tower', label: 'Tower / wing' },
  { key: 'street', label: 'Street' },
  { key: 'pincode', label: 'PIN code' },
];

export const PHOTO_FIELD = { key: 'photos', label: 'Listing photos' };

export const IDENTITY_FIELDS = ['propertyType', 'commercialType', 'locality'];

export const TIER_B_FIELDS = [
  { key: 'price', label: 'Sale price' },
  { key: 'monthlyRent', label: 'Monthly rent' },
  { key: 'deposit', label: 'Deposit' },
  { key: 'priceNegotiable', label: 'Price negotiable' },
  { key: 'transactionType', label: 'Transaction type' },
  { key: 'loanAvailable', label: 'Loan availability' },
  { key: 'monthlyMaintenance', label: 'Maintenance' },
  { key: 'camCharges', label: 'Maintenance / CAM' },
  { key: 'rentMaintMode', label: 'Maintenance terms' },
  { key: 'rentMaintenance', label: 'Maintenance amount' },
  { key: 'description', label: 'Description' },
  { key: 'amenities', label: 'Amenities' },
  { key: 'furniture', label: 'Furniture' },
  { key: 'furnishing', label: 'Furnishing' },
  { key: 'availableFrom', label: 'Available from' },
  { key: 'preferredTenants', label: 'Preferred tenants' },
  { key: 'vegOnly', label: 'Food preference' },
  { key: 'petsPolicy', label: 'Pets policy' },
  { key: 'foodPref', label: 'Food preference' },
  { key: 'agreementDuration', label: 'Agreement duration' },
  { key: 'lockIn', label: 'Lock-in period' },
  { key: 'noticePeriod', label: 'Notice period' },
  { key: 'bestTimeToCall', label: 'Best time to call' },
  { key: 'reraId', label: 'MahaRERA ID' },
  { key: 'suitableFor', label: 'Suitable for' },
  { key: 'fixtures', label: 'Fixtures & fittings' },
  { key: 'washrooms', label: 'Washrooms' },
  { key: 'shellType', label: 'Fit-out (shell)' },
  { key: 'parkingSpaces', label: 'Parking spaces' },
  { key: 'powerBackup', label: 'Power backup' },
  { key: 'pantry', label: 'Pantry' },
  { key: 'fitOutMonths', label: 'Rent-free / fit-out period' },
  { key: 'escalationPct', label: 'Annual escalation' },
  { key: 'tenancyStatus', label: 'Tenancy status' },
  { key: 'inPlaceRent', label: 'In-place rent' },
  { key: 'leaseExpiry', label: 'Lease expiry' },
  { key: 'seatCount', label: 'Seating capacity' },
  { key: 'frontage', label: 'Frontage' },
  { key: 'floorLoad', label: 'Floor load' },
  { key: 'clearHeight', label: 'Clear height' },
  { key: 'sanctionedPower', label: 'Sanctioned power' },
  { key: 'dockCount', label: 'Loading docks' },
  { key: 'waterSource', label: 'Water source' },
];

export const FOUNDATION_OFF_SEARCH_KEYS = {
  bhk: ['bhk'],
  propertyType: ['propertyType'],
  locality: ['locality'],
  deal: ['deal'],
  landUse: ['plotZone'],
};

export const FOUNDATION_STAYS_LIVE_KEYS = {
  price: ['price', 'monthlyRent'],
  furnishing: ['furnishing'],
  possession: ['construction'],
  address: ['street'],
  societyId: ['society'],
  electricityMeterNo: ['electricityMeterNo'],
  carpetArea: ['carpetArea'],
  images: ['photos'],
  description: ['description'],
  amenities: ['amenities'],
  reraId: ['reraId'],
};

export const FOUNDATION_FORM_KEYS = {
  ...FOUNDATION_OFF_SEARCH_KEYS,
  ...FOUNDATION_STAYS_LIVE_KEYS,
};

const OFF_SEARCH_KEYS = new Set(Object.values(FOUNDATION_OFF_SEARCH_KEYS).flat());
const STAYS_LIVE_KEYS = new Set(Object.values(FOUNDATION_STAYS_LIVE_KEYS).flat());

export const PRICE_REDUCED_PCT = 0.15;
export const PRICE_JUMP_FLAG_PCT = 0.20;
export const MATERIAL_EDIT_WINDOW_DAYS = 30;
export const MATERIAL_EDIT_CAP = 3;

const norm = (v) => {
  if (Array.isArray(v)) return v.map((x) => String(x)).sort().join('|');
  if (v == null) return '';
  return String(v).trim();
};

export const photosRemoved = (oldUrls = [], newUrls = []) => {
  if (!oldUrls.length) return false;
  const kept = new Set(newUrls);
  return oldUrls.some((u) => !kept.has(u));
};

export const priceSwing = (oldForm = {}, newForm = {}) => {
  const rent = (newForm.deal || oldForm.deal) === 'rent';
  const oldP = amount(rent ? oldForm.monthlyRent : oldForm.price);
  const newP = amount(rent ? newForm.monthlyRent : newForm.price);
  if (!oldP || !newP || oldP === newP) return null;
  const pct = (newP - oldP) / oldP;
  return { from: oldP, to: newP, pct, abs: Math.abs(pct), dir: pct < 0 ? 'down' : 'up' };
};

export const classifyChanges = (oldForm = {}, newForm = {}, oldPhotoUrls = [], newPhotoUrls = []) => {
  const changed = (list) =>
    list
      .filter((f) => norm(oldForm[f.key]) !== norm(newForm[f.key]))
      .map((f) => ({ key: f.key, label: f.label, from: oldForm[f.key], to: newForm[f.key] }));

  const tierA = changed(TIER_A_FIELDS);
  const removedPhotos = photosRemoved(oldPhotoUrls, newPhotoUrls);
  const gallery = (urls) => (urls || []).map(String).join('|');
  if (removedPhotos || gallery(oldPhotoUrls) !== gallery(newPhotoUrls)) {
    tierA.push({ key: PHOTO_FIELD.key, label: PHOTO_FIELD.label, from: 'Original photos', to: 'Edited' });
  }
  const tierB = changed(TIER_B_FIELDS);

  const remoderation = [...tierA, ...tierB].filter((c) => OFF_SEARCH_KEYS.has(c.key));
  const remoderationKeys = new Set(remoderation.map((c) => c.key));
  const staysLive = [...tierA, ...tierB].filter(
    (c) => STAYS_LIVE_KEYS.has(c.key) && !remoderationKeys.has(c.key),
  );
  const staysLiveKeys = new Set(staysLive.map((c) => c.key));

  return {
    tierA,
    tierB,
    remoderation,
    staysLive,
    recheck: [
      ...remoderation,
      ...staysLive,
      ...tierA.filter((c) => !remoderationKeys.has(c.key) && !staysLiveKeys.has(c.key)),
    ],
    instant: tierB.filter((c) => !remoderationKeys.has(c.key) && !staysLiveKeys.has(c.key)),
    identityChanged: IDENTITY_FIELDS.some((k) => norm(oldForm[k]) !== norm(newForm[k])),
    photosRemoved: removedPhotos,
    priceSwing: priceSwing(oldForm, newForm),
  };
};

export const recentMaterialEdits = (editLog = [], now = Date.now()) => {
  const cutoff = now - MATERIAL_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return editLog.filter((e) => e && e.at >= cutoff && (e.tierA || 0) > 0).length;
};

export const displayValue = (v) => {
  if (Array.isArray(v)) return v.length ? v.join(', ') : '\u2014';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  const s = String(v == null ? '' : v).trim();
  return s === '' ? '\u2014' : s;
};
