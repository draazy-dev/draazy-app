import { canonicalTypeKey, matchTypeKey, COMMERCIAL_SUBTYPES } from '../../../data/propertyTypes.js';
import { ADDRESS_PARTS, pickListingFormDetails, splitStoredAddress } from '../../../lib/listingFormDetails.js';
import { istToday } from '../../../lib/availability.js';
import { bhkLabel } from '../../../lib/listingSeo.js';

const CONSTRUCTION_FROM_WIRE = {
  'ready-to-move': 'ready',
  'new-launch': 'new',
  'under-construction': 'under',
};
const CONSTRUCTION_TO_WIRE = Object.fromEntries(
  Object.entries(CONSTRUCTION_FROM_WIRE).map(([wire, ui]) => [ui, wire]),
);
const FURNISHING_FROM_WIRE = {
  unfurnished: 'unfurnished',
  'semi-furnished': 'semi',
  furnished: 'furnished',
};
const FURNISHING_TO_WIRE = Object.fromEntries(
  Object.entries(FURNISHING_FROM_WIRE).map(([wire, ui]) => [ui, wire]),
);

function translateFurnishing(table, value, direction) {
  if (value === undefined || value === null || value === '') return undefined;
  if (value instanceof Set || Array.isArray(value)) {
    const mapped = [...value].map((v) => translateFurnishing(table, v, direction)).filter(Boolean);
    return mapped.length ? mapped : undefined;
  }
  const mapped = table[value];
  if (!mapped) {
    console.warn(
      `[propertyMapper] unrecognised furnishing value "${value}" ${direction}; treating it as not ` +
      'stated. The contract vocabulary has probably changed — update FURNISHING_FROM_WIRE.',
    );
  }
  return mapped;
}

function translateConstruction(table, value, direction) {
  if (value === undefined || value === null || value === '') return undefined;
  const mapped = table[value];
  if (!mapped) {
    console.warn(
      `[propertyMapper] unrecognised possession value "${value}" ${direction}; ` +
      'treating it as not stated. The contract vocabulary has probably changed — update ' +
      'CONSTRUCTION_FROM_WIRE.',
    );
  }
  return mapped;
}

function writePossession(listing) {
  const fromUi = CONSTRUCTION_TO_WIRE[listing.construction];
  if (fromUi) return fromUi;
  if (CONSTRUCTION_FROM_WIRE[listing.possession]) return listing.possession;
  if (listing.construction || listing.possession) {
    const err = new Error(
      `[propertyMapper] cannot map possession for write (construction="${listing.construction}", `
      + `possession="${listing.possession}"). Update CONSTRUCTION_FROM_WIRE.`,
    );
    err.internal = true;
    throw err;
  }
  return undefined;
}

export function toViewModel(p) {
  if (!p) return null;
  const signals = p.signals || null;
  return {
    id: p.slug || p.id,
    uuid: p.id,
    type: p.propertyType,
    image: p.coverImage,
    gallery: p.images ?? [],
    video: p.video ?? null,
    desc: p.description,
    bhkNum: bhkLabel(p.bhk, p.propertyType) ? p.bhk : null,
    bhk: bhkLabel(p.bhk, p.propertyType),
    rera: Boolean(p.reraId),
    reraId: p.reraId ?? '',
    deposit: p.deposit ?? null,
    maintenance: p.maintenance ?? null,
    negotiable: p.negotiable ?? null,
    ownership: p.ownership ?? null,
    loanAvailable: p.loanAvailable ?? null,
    agreementDuration: p.agreementDuration ?? null,
    lockin: p.lockIn ?? null,
    notice: p.noticePeriod ?? null,
    food: p.foodPref ?? p.food ?? null,
    bestTimeToCall: p.bestTimeToCall ?? null,
    furniture: Array.isArray(p.furniture) ? p.furniture : null,
    ...(p.commercial ?? {}),
    ...(p.land ?? {}),
    address: p.address ?? '',
    pincode: p.pincode ?? '',
    electricityConsumerNo: p.electricityMeterNo ?? undefined,
    formDetails: p.formDetails ?? null,
    createdAt: p.createdAt ? String(p.createdAt).slice(0, 10) : undefined,
    submittedAt: p.createdAt ?? null,
    resubmittedAt: p.resubmittedAt ?? null,
    freshenedAt: p.lastConfirmedAt ? String(p.lastConfirmedAt).slice(0, 10) : undefined,
    confirmedAt: p.lastConfirmedAt ?? null,
    flagReason: p.flagReason ?? '',
    recheckPending: p.recheckPending ?? false,
    recheckReason: p.recheckReason ?? '',
    recheckRequestedAt: p.recheckRequestedAt ?? '',
    recheckChanges: Array.isArray(p.recheckChanges) ? p.recheckChanges : [],
    ownerReplied: p.ownerReplied ?? false,
    owner: p.owner?.name,
    ownerId: p.owner?.id,
    ownerMobile: p.owner?.mobile,
    slug: p.slug,
    title: p.title,
    deal: p.deal,
    price: p.price,
    priceUnit: p.priceUnit,
    area: p.area,
    areaUnit: p.areaUnit,
    furnishing: translateFurnishing(FURNISHING_FROM_WIRE, p.furnishing, 'from the server') ?? null,
    locality: p.locality,
    localitySlug: p.localitySlug,
    societySlug: p.societySlug,
    societyName: p.societyName ?? null,
    societyId: p.societyId ?? null,
    city: p.city,
    lat: p.lat,
    lng: p.lng,
    status: p.status,
    progress: p.progress ?? null,
    signals: signals ? {
      possibleBroker: Boolean(signals.possibleBroker),
      hardBlock: Boolean(signals.hardBlock),
      conflict: Boolean(signals.conflict),
      items: Array.isArray(signals.items) ? signals.items.map((row) => ({
        code: row?.code || '',
        severity: row?.severity === 'hard' ? 'hard' : 'soft',
        detail: row?.detail || '',
      })) : [],
    } : null,
    dealStatus: p.dealStatus ?? 'active',
    featured: p.featured ?? false,
    verified: p.verified ?? false,
    ownerVerified: p.ownerVerified ?? false,
    ownershipVerified: p.ownershipVerified ?? false,
    ownershipRequestedAt: p.ownershipRequestedAt ?? null,
    ownershipDeclinedReason: p.ownershipDeclinedReason ?? '',
    views: p.views ?? 0,
    enquiries: p.enquiries ?? 0,
    docsCount: p.docsCount ?? 0,
    pendingLeads: p.pendingLeads ?? 0,
    photoCount: p.photoCount ?? null,
    descLength: p.descLength ?? null,
    amenityCount: p.amenityCount ?? null,
    qualityScore: p.qualityScore ?? null,
    amenities: p.amenities ?? [],
    archived: p.archived ?? false,
    archivedNote: p.archivedNote ?? '',
    postedByAdmin: p.adminPipeline?.postedByAdmin ?? false,
    postedByStaff: p.adminPipeline?.postedByStaff ?? null,
    reminderCount: p.adminPipeline?.reminderCount ?? 0,
    construction: translateConstruction(CONSTRUCTION_FROM_WIRE, p.possession, 'from the server'),
    landUse: p.landUse ?? null,
    ageYears: p.ageYears ?? null,
    floor: p.floor ?? null,
    totalFloors: p.totalFloors ?? null,
    facing: p.facing ?? null,
    overlooking: p.overlooking ?? null,
    bath: p.bathrooms ?? null,
    parkingSpaces: p.parking ?? null,
    balconies: p.balconies ?? null,
    carpetArea: p.carpetArea ?? null,
    builtUpArea: p.builtUpArea ?? null,
    superBuiltUpArea: p.superBuiltUpArea ?? null,
    floorPlan: p.floorPlan ?? null,
    youtubeId: p.video ?? '',
    room: p.room ?? null,
    tenants: Array.isArray(p.tenants) ? p.tenants : [],
    availableFrom: p.availableFrom ?? null,
    availableOn: p.availableOn ?? p.availableDate ?? null,
    availableDate: p.availableOn ?? p.availableDate ?? null,
    pets: p.pets ?? null,
    shareType: p.room ? 'flatmates' : null,
  };
}

export function toWriteResult(r) {
  if (!r) return r;
  return {
    id: r.slug || r.id,
    uuid: r.id,
    status: r.status,
    archived: r.archived ?? false,
    recheckPending: r.recheckPending ?? false,
    recheckReason: r.recheckReason ?? '',
    recheckRequestedAt: r.recheckRequestedAt ?? '',
  };
}

export const toViewModelList = (payload) =>
  (Array.isArray(payload) ? payload : payload?.content ?? []).map(toViewModel);

export function toQuery(filters = {}, sort = 'newest') {
  return {
    deal: filters.deal,
    type: filters.type,
    locality: filters.locality,
    societies: filters.society,
    bhk: filters.bhk,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    furnishing: translateFurnishing(FURNISHING_TO_WIRE, filters.furnishing, 'in a filter'),
    possession: translateConstruction(CONSTRUCTION_TO_WIRE, filters.construction, 'in a filter'),
    q: filters.q,
    status: filters.status,
    sort: SORTS[sort] ?? SORTS.newest,
  };
}

const SORTS = {
  newest: 'createdAt,desc',
  oldest: 'createdAt,asc',
  'price-asc': 'price,asc',
  'price-desc': 'price,desc',
  'area-desc': 'area,desc',
  'recheck-newest': 'recheckRequestedAt,desc',
  'badge-newest': 'ownershipRequestedAt,desc',
  'confirmed-newest': 'lastConfirmedAt,desc',
};

const UNSUPPORTED = ['includeArchived', 'includeAllStatuses', 'real'];
export const unsupportedFilters = (filters = {}) =>
  UNSUPPORTED.filter((k) => filters[k] !== undefined && filters[k] !== false);

export function toModerationQuery(filters = {}, sort = 'newest') {
  return {
    ...toQuery(filters, sort),
    ...Object.fromEntries(['archived', 'recheck', 'featured', 'postedByAdmin', 'unconfirmed', 'progress', 'badge', 'days']
      .filter((key) => filters[key] !== undefined).map((key) => [key, filters[key]])),
  };
}

const WIZARD_TYPES = { flat: 'flat', house: 'independent', villa: 'villa', commercial: 'commercial', plot: 'openplot', farmland: 'farmland' };
const formString = (value) => value == null ? '' : String(value);

export function toEditForm(vm = {}) {
  const isRent = vm.deal === 'rent';
  const price = formString(vm.price);
  const type = (vm.type ?? '').toLowerCase();
  const commercialType = COMMERCIAL_SUBTYPES.find((subtype) => subtype.matches.some((part) => type.includes(part)))?.key ?? '';
  const typeKey = canonicalTypeKey(type) || Object.keys(WIZARD_TYPES).find((key) => matchTypeKey(key, type));
  const stored = pickListingFormDetails(vm.formDetails);
  const land = typeKey === 'plot' || typeKey === 'farmland';
  const recovered = ADDRESS_PARTS.some((key) => String(stored[key] ?? '').trim())
    ? null
    : splitStoredAddress(vm.address, { land });
  return {
    deal: vm.deal ?? '',
    propertyType: WIZARD_TYPES[typeKey] ?? (Object.values(WIZARD_TYPES).includes(type) ? type : commercialType ? 'commercial' : ''),
    commercialType,
    bhk: vm.bhkNum == null ? '' : String(vm.bhkNum),
    carpetArea: formString(land ? vm.area : (vm.carpetArea ?? vm.area)),
    builtUp: formString(vm.builtUpArea),
    superBuiltUp: formString(vm.superBuiltUpArea),
    areaUnit: vm.areaUnit ?? '',
    furnishing: vm.furnishing ?? '',
    locality: vm.locality ?? '',
    localitySlug: vm.localitySlug ?? '',
    ...(isRent ? { monthlyRent: price, price: '' } : { price, monthlyRent: '' }),
    deposit: formString(vm.deposit),
    rentMaintenance: isRent ? formString(vm.maintenance) : '',
    monthlyMaintenance: isRent ? '' : formString(vm.maintenance),
    rentMaintMode: isRent && vm.maintenance > 0 ? 'extra' : '',
    priceNegotiable: vm.negotiable ?? '',
    reraId: vm.reraId ?? '',
    title: vm.title ?? '',
    description: vm.desc ?? '',
    amenities: vm.amenities ?? [],
    floor: vm.floor === 0 ? 'Ground' : formString(vm.floor),
    totalFloors: formString(vm.totalFloors),
    facing: vm.facing ?? '',
    overlooking: vm.overlooking ?? '',
    age: yearsToAgeBand(vm.ageYears),
    bathrooms: formString(vm.bath),
    parkingSpaces: formString(vm.parkingSpaces),
    balconies: formString(vm.balconies),
    electricityConsumerNo: vm.electricityConsumerNo ?? '',
    pincode: vm.pincode ?? '',
    societyId: vm.societyId ?? '',
    propLat: vm.lat ?? '',
    propLng: vm.lng ?? '',
    existingAddress: vm.address ?? '',
    flatNumber: '', tower: '', society: '', street: '', landmark: '',
    ...recovered,
    ownership: '', agreementDuration: '', lockIn: '', noticePeriod: '', foodPref: '',
    petsPolicy: vm.pets === true ? 'yes' : vm.pets === false ? 'no' : '',
    construction: vm.construction ?? '',
    plotArea: '', floorsInHouse: '', washrooms: '', shellType: '', camCharges: '',
    fitOutMonths: '', escalationPct: '', tenancyStatus: '', inPlaceRent: '', leaseExpiry: '',
    seatCount: '', frontage: '', floorLoad: '', clearHeight: '', sanctionedPower: '', dockCount: '',
    plotLength: '', plotWidth: '', openSides: '', roadWidth: '', plotZone: '', waterSource: '',
    naStatus: '', otherRights: '', buyerEligibility: '', bestTimeToCall: '',
    loanAvailable: undefined, powerBackup: undefined, pantry: undefined, cornerPlot: undefined,
    boundaryWall: undefined, naSanctioned: undefined, electricity: undefined, roadAccess: undefined, satbara: undefined,
    furniture: [], fixtures: [], suitableFor: [],
    preferredTenants: (vm.tenants ?? []).filter((value) => ['family', 'company', 'bachelors', 'bachelor-male', 'bachelor-female', 'anyone'].includes(value)),
    ...stored,
    availableFrom: vm.availableOn ? (vm.availableOn > istToday() ? vm.availableOn : istToday()) : '',
  };
}

const int = (v) => (v !== '' && v != null && Number.isFinite(Number(v)) ? Number(v) : undefined);
const posInt = (v) => (int(v) || undefined);
const positiveArea = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : undefined;

const AGE_BAND_TO_YEARS = {
  new: 0, '1-5': 1, '5-10': 5, '10-15': 10, '15+': 15,
};
const ageToYears = (band) => (band === 'under-construction' ? undefined : AGE_BAND_TO_YEARS[band]);

export function yearsToAgeBand(years) {
  if (years == null || years === '' || !Number.isFinite(Number(years))) return '';
  const y = Number(years);
  if (y >= 15) return '15+';
  if (y >= 10) return '10-15';
  if (y >= 5) return '5-10';
  if (y >= 1) return '1-5';
  return 'new';
}

export function petsFromPolicy(policy) {
  if (policy === 'yes') return true;
  if (policy === 'no') return false;
  return undefined;
}

export function toListingCreate(listing = {}) {
  const composed = ADDRESS_PARTS.map((key) => String(listing[key] ?? '').trim()).filter(Boolean).join(', ');
  return {
    title: listing.title,
    deal: listing.deal,
    propertyType: listing.type ?? listing.propertyType,
    price: listing.price,
    locality: listing.locality,
    localitySlug: listing.localitySlug || undefined,
    city: listing.city ?? 'Pune',
    bhk: listing.bhkNum ?? listing.bhk ?? undefined,
    area: listing.area,
    areaUnit: listing.areaUnit,
    landUse: listing.landUse,
    carpetArea: positiveArea(listing.carpetArea),
    builtUpArea: positiveArea(listing.builtUpArea ?? listing.builtUp),
    superBuiltUpArea: positiveArea(listing.superBuiltUpArea ?? listing.superBuiltUp),
    availableOn: listing.available || undefined,
    pets: typeof listing.pets === 'boolean' ? listing.pets : petsFromPolicy(listing.petsPolicy),
    furnishing: translateFurnishing(FURNISHING_TO_WIRE, listing.furnishing, 'for write'),
    deposit: listing.deposit,
    maintenance: listing.maintenance,
    negotiable: listing.negotiable,
    lat: listing.lat,
    lng: listing.lng,
    reraId: listing.reraId,
    possession: writePossession(listing),
    tenants: listing.tenants,
    amenities: listing.amenities,
    images: listing.gallery ?? listing.images,
    floorPlan: listing.floorPlan ?? undefined,
    video: listing.video ?? undefined,
    description: listing.desc ?? listing.description,
    address: listing.address || composed || undefined,
    pincode: listing.pincode,
    formDetails: listing.formDetails == null ? undefined : pickListingFormDetails(listing.formDetails),
    floor: int(listing.floor),
    societyId: listing.societyId || undefined,
    electricityMeterNo: listing.electricityConsumerNo || undefined,
    bathrooms: int(listing.bathrooms),
    parking: int(listing.parkingSpaces ?? listing.parking),
    balconies: int(listing.balconies),
    facing: listing.facing || undefined,
    overlooking: listing.overlooking || undefined,
    totalFloors: posInt(listing.totalFloors),
    ageYears: ageToYears(listing.age),
  };
}

export function toListingUpdate(patch = {}) {
  return Object.fromEntries(Object.entries({
    ...toListingCreate(patch),
    clearMaintenance: patch.clearMaintenance === true ? true : undefined,
    clearLandUse: patch.clearLandUse === true ? true : undefined,
    ...('available' in patch && !patch.available ? { availableOn: '' } : {}),
    ...('pets' in patch && typeof patch.pets !== 'boolean' ? { clearPets: true } : {}),
    ...('societyId' in patch && !patch.societyId ? { societyId: '' } : {}),
  }).filter(([key, value]) =>
    value !== undefined && (key !== 'city' || patch.city !== undefined)
      && (key !== 'address' || patch.address !== undefined)));
}
