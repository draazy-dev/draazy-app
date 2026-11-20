export const ADDRESS_PARTS = ['flatNumber', 'tower', 'society', 'street'];

export const DETAIL_KEYS = new Set([
  ...ADDRESS_PARTS, 'landmark', 'commercialType', 'ownership', 'agreementDuration',
  'lockIn', 'noticePeriod', 'foodPref', 'petsPolicy', 'availableFrom', 'possession',
  'transactionType', 'rentMaintMode', 'plotArea', 'floorsInHouse', 'washrooms', 'shellType', 'camCharges',
  'plotLength', 'plotWidth', 'openSides', 'roadWidth', 'plotZone', 'waterSource',
  'plottedProject', 'loanAvailable', 'powerBackup', 'pantry', 'cornerPlot', 'boundaryWall',
  'naStatus', 'otherRights', 'buyerEligibility',
  'naSanctioned', 'electricity', 'roadAccess', 'satbara',
  'furniture', 'fixtures', 'suitableFor', 'preferredTenants',
  'fitOutMonths', 'escalationPct', 'tenancyStatus', 'inPlaceRent', 'leaseExpiry',
  'seatCount', 'frontage', 'floorLoad', 'clearHeight', 'sanctionedPower', 'dockCount', 'bestTimeToCall',
  'listerRelation',
]);

export function pickListingFormDetails(form = {}) {
  return Object.fromEntries(Object.entries(form ?? {})
    .filter(([key, value]) => DETAIL_KEYS.has(key) && value != null));
}

export const canStateBuyerEligibility = (form = {}) => form.propertyType === 'farmland' && form.deal === 'buy';

export function hasStoredAddress(form = {}) {
  return Boolean(String(form.existingAddress ?? '').trim())
    && !ADDRESS_PARTS.some((key) => String(form[key] ?? '').trim());
}

const PART_LIMITS = { flatNumber: 20, tower: 30, society: 60, street: 60 };
const SHAPES = {
  property: [null, ['society'], ['flatNumber', 'society'],
    ['flatNumber', 'society', 'street'], ['flatNumber', 'tower', 'society', 'street']],
  land: [null, ['society'], ['society', 'street']],
};

export function splitStoredAddress(address, { land = false } = {}) {
  const line = String(address ?? '');
  if (/[\r\n]/.test(line)) return null;
  const segments = line.split(',').map((part) => part.trim()).filter(Boolean);
  const shape = (land ? SHAPES.land : SHAPES.property)[segments.length];
  if (!shape || shape.some((key, i) => segments[i].length > PART_LIMITS[key])) return null;
  return Object.fromEntries(shape.map((key, i) => [key, segments[i]]));
}