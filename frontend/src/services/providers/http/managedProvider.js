import { PAGE_LOAD_TTL, get, post, patch, del } from '../../http.js';
import {
  toManaged, toManagedList, toCreateRequest, toUpdateRequest, toRentReceiptList, toRentReceipt, toTrackedRent,
  toTrackedRentList,
} from './managedMapper.js';

export async function listTrackedRent() {
  return toTrackedRentList(await get('/me/tracked-rent'));
}

export async function claimRentPaid(id) {
  return toTrackedRent(await post(`/me/tracked-rent/${encodeURIComponent(id)}/paid`, {}));
}

export async function rejectRentClaim(id, rentMonth) {
  await del(`/me/managed-properties/${encodeURIComponent(id)}/rent-claims/${encodeURIComponent(rentMonth)}`);
}

export async function listManaged() {
  const res = await get('/me/managed-properties', undefined, { ttl: PAGE_LOAD_TTL });
  return toManagedList(res?.content ?? (Array.isArray(res) ? res : []));
}

export async function getManaged(id) {
  try {
    return toManaged(await get(`/me/managed-properties/${encodeURIComponent(id)}`));
  } catch (e) {
    if (e?.status === 404) return null;
    throw e;
  }
}

export async function registerManaged(data) {
  return toManaged(await post('/me/managed-properties', toCreateRequest(data)));
}

export async function updateManaged(id, changes) {
  return toManaged(await patch(`/me/managed-properties/${encodeURIComponent(id)}`, toUpdateRequest(changes)));
}

export async function deleteManaged(id) {
  await del(`/me/managed-properties/${encodeURIComponent(id)}`);
}

export async function stopRentTracking(id) {
  return toManaged(await del(`/me/managed-properties/${encodeURIComponent(id)}/rent-tracking`));
}

const receiptsPath = (id) => `/me/managed-properties/${encodeURIComponent(id)}/rent-receipts`;

export async function listRentReceipts(id, months = 6) {
  return toRentReceiptList(await get(receiptsPath(id), { months }));
}

export async function recordRentReceipt(id, rentMonth) {
  const receipt = toRentReceipt(await post(receiptsPath(id), { rentMonth }));
  if (!receipt) throw new Error('the server accepted the receipt but returned nothing to show');
  return receipt;
}

export async function publishManaged(id, { published = false } = {}) {
  const after = toManaged(await post(`/me/managed-properties/${encodeURIComponent(id)}/publish`, {}));
  return { id: after?.publishedListingId || '', already: published, record: after };
}

export async function ensureManagedForListing(listing) {
  if (!listing || !listing.id) return null;
  if (listing.flatmate || listing.flatmatePost || listing.flatmateGroup) return null;
  const body = toCreateRequest({
    title: listing.title,
    deal: listing.deal === 'buy' || listing.deal === 'sale' ? 'sale' : 'rent',
    type: listing.type,
    bhk: listing.bhkNum || listing.bhk,
    price: listing.price,
    locality: listing.locality,
    localitySlug: listing.localitySlug,
    societyId: listing.societyId,
    area: listing.area,
    areaUnit: listing.areaUnit,
    furnishing: listing.furnishing,
  });
  body.publishedListingId = listing.id;
  try {
    return toManaged(await post('/me/managed-properties', body));
  } catch (e) {
    if (e?.status === 409 || e?.status === 404) return null;
    throw e;
  }
}
