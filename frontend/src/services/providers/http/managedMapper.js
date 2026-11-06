import { readUser } from '../../../lib/auth.js';

const fmtIndian = (n) => Number(n || 0).toLocaleString('en-IN');

const toMillis = (iso) => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
};

export const bhkLabel = (n) => {
  const num = Number(n) || 0;
  if (!num) return '';
  return num >= 5 ? '5+ BHK' : `${num} BHK`;
};

export const toClientDeal = (deal) => (deal === 'rent' ? 'rent' : 'sale');

export const toWireDeal = (deal) => (deal === 'rent' ? 'rent' : 'buy');

export function toManaged(dto) {
  if (!dto) return null;
  const u = readUser() || {};
  const deal = toClientDeal(dto.deal);
  const price = Number(dto.price) || 0;
  const bhkNum = Number(dto.bhk) || 0;
  const locality = dto.locality || '';

  return {
    id: dto.id,
    visibility: dto.visibility || 'private',
    status: dto.status || 'managed',
    title: dto.title || '',
    type: dto.propertyType || '',
    bhk: bhkLabel(bhkNum),
    bhkNum,
    locality,
    localitySlug: dto.localitySlug || '',
    society: dto.society || '',
    loc: [dto.society, locality, 'Pune'].filter(Boolean).join(', '),
    area: Number(dto.area) || 0,
    areaUnit: dto.areaUnit || 'sqft',
    furnishing: dto.furnishing || '',
    deal,
    price,
    priceStr: deal === 'rent' ? `₹${fmtIndian(price)}/mo` : `₹${fmtIndian(price)}`,
    img: null,
    image: null,
    gallery: [],
    owner: u.name || '',
    ownerMobile: u.mobile || '',
    rented: !!dto.rented,
    tenantName: dto.tenantName || '',
    tenantMobile: dto.tenantMobile || '',
    monthlyRent: Number(dto.monthlyRent) || 0,
    dueDay: Number(dto.dueDay) || 5,
    leaseEnd: dto.leaseEnd || '',
    deposit: Number(dto.deposit) || 0,
    landlordPan: dto.landlordPan || '',
    policeIntimation: dto.policeIntimation || '',
    rentClaims: Array.isArray(dto.rentClaims) ? dto.rentClaims : [],
    valuation: dto.valuation || null,
    publishedListingId: dto.publishedListingId || '',
    sourceRoomId: dto.sourceRoomId || '',
    agreementVerified: !!dto.agreementVerified,
    createdAt: toMillis(dto.createdAt),
    updatedAt: toMillis(dto.updatedAt),
  };
}

export const toManagedList = (rows) => (Array.isArray(rows) ? rows.map(toManaged).filter(Boolean) : []);

export function toRentReceipt(dto) {
  if (!dto) return null;
  return {
    id: dto.id || '',
    ym: dto.rentMonth || '',
    amount: Number(dto.amount) || 0,
    tenantName: dto.tenantName || '',
    landlordName: dto.landlordName || '',
    propertyAddress: dto.propertyAddress || '',
    createdAt: toMillis(dto.createdAt),
  };
}

export const toRentReceiptList = (rows) =>
  (Array.isArray(rows) ? rows.map(toRentReceipt).filter(Boolean) : []);

export const toTrackedRent = (dto) => ({
  id: dto.id || '',
  title: dto.title || '',
  address: dto.address || '',
  landlordName: dto.landlordName || '',
  monthlyRent: Number(dto.monthlyRent) || 0,
  status: dto.status || 'due',
  dueOn: dto.dueOn || '',
  leaseEnd: dto.leaseEnd || '',
  deposit: Number(dto.deposit) || 0,
  landlordPan: dto.landlordPan || '',
  policeIntimation: dto.policeIntimation || '',
  receipts: toRentReceiptList(dto.receipts),
});

export const toTrackedRentList = (rows) => (Array.isArray(rows) ? rows : []).map(toTrackedRent);

export function toCreateRequest(data = {}) {
  const deal = toWireDeal(data.deal);
  const price = Number(data.price) || 0;
  return {
    title: data.title || null,
    deal,
    propertyType: data.type || data.propertyType || 'Flat',
    bhk: data.bhk == null || data.bhk === '' ? null : Number(data.bhk) || null,
    price,
    locality: data.locality || 'Pune',
    localitySlug: data.localitySlug || undefined,
    societyId: data.societyId || null,
    area: data.area == null || data.area === '' ? null : Number(data.area) || null,
    areaUnit: data.areaUnit || null,
    furnishing: data.furnishing || null,
    rented: !!data.rented,
    tenantName: data.tenantName || null,
    tenantMobile: data.tenantMobile || null,
    monthlyRent: deal === 'rent' ? price : (Number(data.monthlyRent) || null),
    dueDay: data.dueDay == null ? null : Number(data.dueDay) || null,
    valuation: data.valuation || null,
  };
}

export function toUpdateRequest(patch = {}) {
  const body = {};
  if ('deal' in patch) body.deal = toWireDeal(patch.deal);
  if ('type' in patch) body.propertyType = patch.type;
  if ('propertyType' in patch) body.propertyType = patch.propertyType;
  if ('title' in patch) body.title = patch.title;
  if ('bhk' in patch) body.bhk = Number(patch.bhk) || null;
  if ('price' in patch) body.price = Number(patch.price) || 0;
  if ('locality' in patch) body.locality = patch.locality;
  if ('localitySlug' in patch) body.localitySlug = patch.localitySlug;
  if ('societyId' in patch) body.societyId = patch.societyId;
  if ('area' in patch) body.area = Number(patch.area) || null;
  if ('areaUnit' in patch) body.areaUnit = patch.areaUnit;
  if ('furnishing' in patch) body.furnishing = patch.furnishing;
  if ('rented' in patch) body.rented = !!patch.rented;
  if ('tenantName' in patch) body.tenantName = patch.tenantName;
  if ('tenantMobile' in patch) body.tenantMobile = patch.tenantMobile;
  if ('monthlyRent' in patch) body.monthlyRent = Number(patch.monthlyRent) || null;
  if ('dueDay' in patch) body.dueDay = Number(patch.dueDay) || null;
  if ('landlordPan' in patch) body.landlordPan = (patch.landlordPan || '').toUpperCase();
  if ('valuation' in patch) body.valuation = patch.valuation;
  return body;
}
