
export const MOD_PUBLIC = ['live', 'approved'];

export const MOD_PENDING = 'pending';

export const isPubliclyVisible = (modStatus) => MOD_PUBLIC.includes(modStatus || 'live');

export const CONFLICT_ALREADY_INTERESTED = 'already_interested';
export const CONFLICT_GROUP_FULL = 'group_full';
export const CONFLICT_GROUP_LIMIT = 'group_limit';

export const CONFLICT_MARKER = /\s*\(([a-z_]+)\)\s*$/;

export function conflictSubCode(err) {
  if (err?.status !== 409) return null;
  const hit = CONFLICT_MARKER.exec(err.message || '');
  return hit ? hit[1] : null;
}

export function seatsLeftOf(row) {
  if (row?.seatsOpen != null) return Math.max(0, Number(row.seatsOpen));
  const total = Number(row?.seatsTotal) || 0;
  const taken = Array.isArray(row?.members) ? row.members.length : Number(row?.occupants) || 0;
  return Math.max(0, total - taken);
}

export function perHeadOf(row) {
  if (row?.perHead != null) return Number(row.perHead);
  const rent = Number(row?.rent) || 0;
  const seats = Number(row?.seatsTotal) || 0;
  return seats > 0 ? Math.round(rent / seats) : rent;
}

export const initialsOf = (name) =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();

export function toRoomViewModel(row) {
  const modStatus = row?.modStatus || 'live';
  return {
    id: row?.id || '',
    kind: 'room',
    title: row?.title || '',
    propertyId: row?.propertyId || null,
    roomKind: row?.roomKind || 'bedroom',
    roomType: row?.roomType || 'Private room',
    attachedBath: row?.attachedBath || 'shared',
    furnishing: row?.furnishing || '',
    facing: row?.facing ?? null,
    overlooking: row?.overlooking ?? null,
    bhk: row?.bhk || '',
    flatType: row?.flatType || '',
    homeTypeLabel: row?.homeTypeLabel || '',
    gatedCommunity: !!row?.gatedCommunity,
    budget: Number(row?.budget) || 0,
    priceBasis: row?.priceBasis || null,
    deposit: Number(row?.deposit) || 0,
    noticePeriodDays: row?.noticePeriodDays == null ? null : Number(row.noticePeriodDays),
    lockInMonths: row?.lockInMonths == null ? null : Number(row.lockInMonths),
    maintenanceBilling: row?.maintenanceBilling || null,
    electricityBilling: row?.electricityBilling || null,
    occupancy: row?.occupancy || '',
    occupants: Number(row?.occupants) || 0,
    maxOccupants: Number(row?.maxOccupants) || 0,
    flatCommitted: Number(row?.flatCommitted) || 0,
    flatMax: row?.flatMax == null ? null : Number(row.flatMax),
    shareMax: Number(row?.shareMax) || 0,
    seatsTotal: row?.seatsTotal == null ? null : Number(row.seatsTotal),
    seatsOpen: row?.seatsOpen == null ? null : Number(row.seatsOpen),
    society: row?.society || '',
    societyId: row?.societyId || null,
    flatKey: row?.flatKey || null,
    flatNumber: row?.flatNumber || '',
    locality: row?.locality || '',
    localitySlug: row?.localitySlug || '',
    localities: row?.localities || [],
    lat: row?.lat == null ? null : Number(row.lat),
    lng: row?.lng == null ? null : Number(row.lng),
    hostRole: row?.hostRole || 'tenant',
    verificationTier: row?.verificationTier || null,
    verified: !!row?.verified,
    reviewStatus: row?.reviewStatus || null,
    agreementDeclared: !!row?.agreementDeclared,
    owner: row?.owner || '',
    ownerMobile: row?.ownerMobile || '',
    modStatus,
    publiclyVisible: isPubliclyVisible(modStatus),
    flagForReview: !!row?.flagForReview,
    addressFingerprint: row?.addressFingerprint || '',
    gender: row?.gender || 'any',
    food: row?.food || 'any',
    moveIn: row?.moveIn || '',
    availableFrom: row?.availableFrom || null,
    note: row?.note || '',
    cover: row?.cover || row?.photos?.[0] || null,
    photos: row?.photos || [],
    status: row?.status || 'active',
    createdAt: row?.createdAt ? Date.parse(row.createdAt) : Date.now(),
    host: row?.host || null,
  };
}

export function toSeekerPostViewModel(row) {
  const modStatus = row?.modStatus || 'live';
  return {
    id: row?.id || '',
    kind: 'post',
    title: row?.title || '',
    name: row?.name || '',
    gender: row?.gender || 'any',
    age: row?.age == null ? null : Number(row.age),
    occupation: row?.occupation || '',
    budget: Number(row?.budget) || 0,
    budgetMax: row?.budgetMax == null ? null : Number(row.budgetMax),
    localities: row?.localities || [],
    moveIn: row?.moveIn || '',
    flatPref: row?.flatPref || 'any',
    roomPref: row?.roomPref || 'any',
    furnishing: row?.furnishing || null,
    gatedOnly: !!row?.gatedOnly,
    attachedBath: !!row?.attachedBath,
    parking: row?.parking || null,
    note: row?.note || '',
    verifiedContactOnly: !!row?.verifiedContactOnly,
    verified: !!row?.verified,
    modStatus,
    publiclyVisible: isPubliclyVisible(modStatus),
    mobile: row?.mobile || '',
    lat: row?.lat == null ? null : Number(row.lat),
    lng: row?.lng == null ? null : Number(row.lng),
    createdAt: row?.createdAt ? Date.parse(row.createdAt) : Date.now(),
  };
}

export function toGroupViewModel(row) {
  const modStatus = row?.modStatus || 'live';
  const members = (row?.members || []).map((m) => ({
    id: m?.id || '',
    name: m?.name || '',
    initials: m?.initials || initialsOf(m?.name),
    verified: !!m?.verified,
    host: !!m?.host,
  }));
  return {
    id: row?.id || '',
    kind: 'group',
    title: row?.title || '',
    locality: row?.locality || '',
    localitySlug: row?.localitySlug || '',
    policy: row?.policy || 'any',
    rent: Number(row?.rent) || 0,
    deposit: Number(row?.deposit) || 0,
    noticePeriodDays: row?.noticePeriodDays == null ? null : Number(row.noticePeriodDays),
    lockInMonths: row?.lockInMonths == null ? null : Number(row.lockInMonths),
    maintenanceBilling: row?.maintenanceBilling || null,
    electricityBilling: row?.electricityBilling || null,
    perHead: perHeadOf(row),
    seatsTotal: Number(row?.seatsTotal) || 0,
    seatsOpen: Number(row?.seatsOpen) || 0,
    seatsLeft: seatsLeftOf(row),
    members,
    propertyId: row?.propertyId || null,
    hostRole: row?.hostRole || 'tenant',
    verificationTier: row?.verificationTier || null,
    reviewStatus: row?.reviewStatus || null,
    agreementDeclared: !!row?.agreementDeclared,
    ownerConsent: !!row?.ownerConsent,
    ownerConsentMobile: row?.ownerConsentMobile || '',
    addressFingerprint: row?.addressFingerprint || '',
    flagForReview: !!row?.flagForReview,
    modStatus,
    publiclyVisible: isPubliclyVisible(modStatus),
    note: row?.note || '',
    ownerName: row?.ownerName || '',
    ownerMobile: row?.ownerMobile || '',
    createdAt: row?.createdAt ? Date.parse(row.createdAt) : Date.now(),
    preferences: toGroupPreferences(row?.preferences),
    hunting: !!row?.preferences,
    localities: row?.preferences?.localities?.length ? [...row.preferences.localities] : (row?.locality ? [row.locality] : []),
  };
}

export function toRoomCardViewModel(row) {
  const modStatus = row?.modStatus || 'live';
  return {
    id: row?.id || '',
    kind: 'room',
    title: row?.title || '',
    propertyId: row?.propertyId || null,
    hostRole: row?.hostRole || null,
    verificationTier: row?.verificationTier || null,
    reviewStatus: row?.reviewStatus || null,
    society: row?.society || '',
    flatType: row?.flatType || '',
    locality: row?.locality || '',
    localities: row?.localities || [],
    budget: Number(row?.budget) || 0,
    shareMax: Number(row?.shareMax) || 0,
    occupants: Number(row?.occupants) || 0,
    cover: row?.cover || null,
    modStatus,
    publiclyVisible: isPubliclyVisible(modStatus),
    status: row?.status || 'active',
    createdAt: row?.createdAt ? Date.parse(row.createdAt) : Date.now(),
  };
}

export function toGroupCardViewModel(row) {
  const modStatus = row?.modStatus || 'live';
  return {
    id: row?.id || '',
    kind: 'group',
    title: row?.title || '',
    locality: row?.locality || '',
    localities: row?.localities || [],
    rent: Number(row?.rent) || 0,
    perHead: perHeadOf(row),
    seatsTotal: Number(row?.seatsTotal) || 0,
    seatsOpen: Number(row?.seatsOpen) || 0,
    seatsLeft: seatsLeftOf(row),
    memberCount: Number(row?.memberCount) || 0,
    propertyId: row?.propertyId || null,
    hostRole: row?.hostRole || null,
    hunting: !!row?.hunting,
    verificationTier: row?.verificationTier || null,
    reviewStatus: row?.reviewStatus || null,
    modStatus,
    publiclyVisible: isPubliclyVisible(modStatus),
    createdAt: row?.createdAt ? Date.parse(row.createdAt) : Date.now(),
  };
}

const moneyOrNull = (v) => (v == null || v === '' ? null : Number(v));

function toGroupPreferences(p) {
  if (!p) return null;
  return {
    localities: p.localities || [],
    bhk: p.bhk || [],
    rentMin: moneyOrNull(p.rentMin),
    rentMax: moneyOrNull(p.rentMax),
    depositMin: moneyOrNull(p.depositMin),
    depositMax: moneyOrNull(p.depositMax),
    gatedOnly: !!p.gatedOnly,
    bachelors: !!p.bachelors,
    furnishing: p.furnishing || null,
    parking: p.parking || null,
    moveInBy: p.moveInBy || null,
  };
}

export function toRequestViewModel(row) {
  const status = row?.status || 'pending';
  return {
    id: row?.id || '',
    kind: row?.kind || 'room',
    action: row?.action || 'request',
    share: row?.share || 'solo',
    targetId: row?.targetId || '',
    targetTitle: row?.targetTitle || '',
    locality: row?.locality || '',
    requesterName: row?.requesterName || '',
    requesterMobile: row?.requesterMobile || '',
    message: row?.message || '',
    status,
    awaitingDecision: status === 'pending',
    requestedAt: row?.requestedAt ? Date.parse(row.requestedAt) : Date.now(),
    decidedAt: row?.decidedAt ? Date.parse(row.decidedAt) : null,
  };
}

export const VOCAB = {
  gender: ['any', 'male', 'female'],
  food: ['any', 'veg', 'nonveg'],
  flatPref: ['any', 'women', 'men'],
  roomPref: ['any', 'private', 'shared'],
  policy: ['any', 'women', 'men'],
  roomKind: ['master', 'bedroom', 'living'],
  roomType: ['Private room', 'Shared room'],
  attachedBath: ['attached', 'shared'],
  priceBasis: ['room', 'person'],
  furnishing: ['unfurnished', 'semi', 'furnished'],
  bhk: ['1', '2', '3', '4'],
  homeType: ['Flat', 'Independent House', 'Villa', 'Row House'],
  hostRole: ['owner', 'tenant'],
  share: ['solo', 'bring', 'match'],
  tab: ['move-in', 'team-up', 'people', 'teams'],
};

export const vocab = (set, value) =>
  (value != null && VOCAB[set]?.includes(String(value)) ? String(value) : undefined);
