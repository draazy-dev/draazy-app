import { PAGE_LOAD_TTL, PUBLIC_READ_TTL, del, get, patch, post, prefetch } from '../../http.js';
import {
  toEditForm,
  toListingCreate,
  toListingUpdate,
  toModerationQuery,
  toQuery,
  toViewModel,
  toViewModelList,
  toWriteResult,
  unsupportedFilters,
} from './propertyMapper.js';
import { bootstrapSection } from './bootstrap.js';

const PAGE_SIZE = 100;

export async function listProperties(filters = {}, sort = 'newest') {
  warnUnsupported(filters);
  const page = await get('/properties', { ...toQuery(filters, sort), size: PAGE_SIZE }, { auth: false });
  warnIfTruncated(page);
  return toViewModelList(page);
}

export async function searchListings(query = {}, { page = 1, size = 24, signal, ttl } = {}) {
  const res = await get(
    '/properties',
    { ...query, page: Math.max(0, page - 1), size },
    { auth: false, signal, ttl },
  );
  return {
    items: toViewModelList(res),
    total: res?.totalElements ?? 0,
    verifiedTotal: res?.verifiedElements ?? 0,
    unstatedTotal: res?.unstatedElements ?? 0,
    pageCount: res?.totalPages ?? 0,
  };
}

export async function searchForModeration(filters = {}, sort = 'newest', { page = 1, size = PAGE_SIZE } = {}) {
  const res = await get('/admin/properties', {
    ...toModerationQuery(filters, sort),
    page: Math.max(0, page - 1),
    size,
  });
  return {
    items: toViewModelList(res),
    total: res?.totalElements ?? 0,
    pageCount: res?.totalPages ?? 0,
  };
}

export async function lookupForModeration(q, { size = 6 } = {}) {
  const res = await get('/admin/properties/lookup', { q, page: 0, size });
  return {
    items: (res?.content ?? []).map((l) => ({ id: l.slug || l.id, title: l.title, locality: l.locality, owner: l.owner, ownerMobile: l.ownerMobile, status: l.status })),
    total: res?.totalElements ?? 0,
  };
}
export async function moderationSummary() {
  return get('/admin/properties/summary');
}

export async function getModerationProperty(id) {
  try {
    return toViewModel(await get(`/admin/properties/${encodeURIComponent(id)}`));
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

export async function getProperty(id, { maxAge } = {}) {
  try {
    const opts = maxAge ? { ttl: PAGE_LOAD_TTL, maxAge } : undefined;
    return toViewModel(await get(`/properties/${encodeURIComponent(id)}`, undefined, opts));
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

export async function featuredProperties(limit = 6) {
  return toViewModelList(await get('/properties/featured', null, { auth: false, ttl: PUBLIC_READ_TTL })).slice(0, limit);
}

export async function trustStats() {
  return bootstrapSection('trustStats');
}

export async function propertyCounts() {
  return bootstrapSection('counts');
}

export async function ownerProfile(id) {
  try {
    return await get(`/owners/${encodeURIComponent(id)}`, null, { auth: false });
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

export async function ownerListings(id) {
  const page = await get('/properties', { owner: id, sort: 'createdAt,desc', size: 12 }, { auth: false });
  return toViewModelList(page);
}

export async function getPropertiesByIds(ids = []) {
  const found = await Promise.all(ids.map((id) => getProperty(id)));
  return found.filter(Boolean);
}

function inAskedOrder(wanted, rows) {
  const byId = new Map(rows.flatMap((p) => [[p.id, p], [p.uuid, p]]));
  return wanted.map((id) => byId.get(id)).filter(Boolean);
}

export async function listPropertiesByIds(ids = []) {
  const wanted = ids.slice(0, 16);
  if (!wanted.length) return [];
  return inAskedOrder(wanted, toViewModelList(await get('/properties/cards', { ids: wanted }, { auth: false, ttl: PUBLIC_READ_TTL })));
}

export async function compareProperties(ids = []) {
  const wanted = ids.slice(0, 4);
  if (!wanted.length) return [];
  return inAskedOrder(wanted, toViewModelList(await get('/properties/compare', { ids: wanted }, { auth: false })));
}

export const searchIndex = () => get('/properties/search-index', null, { auth: false });

export const propertyReels = (query) => get('/properties/reels', query, { auth: false });

export async function similarProperties(query) {
  const rows = await get('/properties/similar', query, { auth: false });
  return (rows || []).map((r) => ({ ...toViewModel(r), _km: r.distanceKm }));
}

export async function myListings(user, { maxAge } = {}) {
  const page = await get('/me/listings', { size: PAGE_SIZE }, { ttl: PAGE_LOAD_TTL, maxAge });
  warnIfTruncated(page);
  return toViewModelList(page);
}

export async function myListingCard(id) {
  return toViewModel(await get(`/me/listings/${encodeURIComponent(id)}/card`));
}

const myListingPath = (id) => `/me/listings/${encodeURIComponent(id)}`;

export function prefetchMyListing(id) {
  if (id) prefetch(myListingPath(id));
}

export async function myListing(id) {
  if (!id) return null;
  try {
    const vm = toViewModel(await get(myListingPath(id)));
    if (!vm) return vm;
    const form = toEditForm(vm);
    if (vm.societyId && vm.societyName) form.society = vm.societyName;
    return { ...vm, form };
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

export async function addListing(listing, { homeId } = {}) {
  const path = homeId ? `/me/managed-properties/${encodeURIComponent(homeId)}/listing` : '/me/listings';
  return toWriteResult(await post(path, toListingCreate(listing)));
}

export const listingSlots = () => get('/me/listings/quota');

export async function checkOwnDuplicate({ fields } = {}) {
  const f = fields || {};
  const address = [f.flatNumber, f.tower, f.society, f.street]
    .map((part) => String(part ?? '').trim()).filter(Boolean).join(', ');
  const verdict = await post('/me/listings/duplicate-check', {
    address: address || undefined,
    locality: f.locality || undefined,
    city: f.city || 'Pune',
    lat: f.propLat ?? undefined,
    lng: f.propLng ?? undefined,
    electricityMeterNo: f.electricityConsumerNo || undefined,
  });
  return { found: !!verdict?.found, existingId: verdict?.existingId ?? null };
}

export async function createListingOnBehalf(ownerMobile, ownerName, listing) {
  return toViewModel(await post('/admin/properties', {
    ownerMobile,
    ownerName: ownerName || undefined,
    listing: toListingCreate(listing),
  }));
}

export async function ownerListingStanding(mobile) {
  return get(`/admin/properties/owner-standing?mobile=${encodeURIComponent(mobile)}`);
}

const DUPLICATE_REASON_FROM_WIRE = {
  address: 'same address / electricity meter',
  image: 'matching photos',
  'address+image': 'same address and matching photos',
};

export async function listDuplicateClusters() {
  const res = await get('/admin/properties/duplicates');
  return {
    clusters: (res?.clusters ?? []).map((c) => ({
      id: c.id,
      reason: c.reason,
      reasonLabel: duplicateReasonLabel(c.reason),
      sameOwner: !!c.sameOwner,
      hints: (c.hints ?? []).map((h) => ({
        code: h?.code || '',
        severity: h?.severity === 'hard' ? 'hard' : 'soft',
        detail: h?.detail || '',
      })),
      listings: toViewModelList(c.listings ?? []),
    })),
    scanned: res?.scanned ?? 0,
    truncated: !!res?.truncated,
  };
}

function duplicateReasonLabel(reason) {
  if (!reason) return undefined;
  const label = DUPLICATE_REASON_FROM_WIRE[reason];
  if (!label) {
    console.warn(
      `[propertyProvider] unknown duplicate reason "${reason}" — add it to DUPLICATE_REASON_FROM_WIRE`,
    );
    return undefined;
  }
  return label;
}

export async function mergeDuplicateCluster(keepId, dropIds) {
  await post('/admin/properties/duplicates/merge', { keepId, dropIds });
}

export async function dismissDuplicateCluster(ids) {
  await post('/admin/properties/duplicates/dismiss', { ids });
}

export async function updateListingFields(id, patchBody) {
  return toWriteResult(await patch(`/me/listings/${encodeURIComponent(id)}`, toListingUpdate(patchBody)));
}

export async function takeListingDown(id) {
  return toWriteResult(await del(`/me/listings/${encodeURIComponent(id)}`));
}

export async function pauseListing(id) {
  return toViewModel(await post(`/me/listings/${encodeURIComponent(id)}/pause`, {}));
}

export async function resumeListing(id) {
  return toViewModel(await post(`/me/listings/${encodeURIComponent(id)}/resume`, {}));
}

export async function updateListingAsModerator(id, patchBody) {
  return toViewModel(await patch(`/properties/${encodeURIComponent(id)}/admin`, toListingUpdate(patchBody)));
}

export async function removeListingPhoto(id, photo, reason) {
  return toViewModel(await post(`/properties/${encodeURIComponent(id)}/photos/takedown`, { photo, reason }));
}

export async function confirmListingFresh(id) {
  return toViewModel(await post(`/me/listings/${encodeURIComponent(id)}/confirm-available`, {}));
}

export async function recordClaimLinkOpened(id) {
  await post(`/me/listings/${encodeURIComponent(id)}/opened`, {});
}

export async function confirmOwnerListing(id) {
  await post(`/me/listings/${encodeURIComponent(id)}/confirm`, {});
}

export async function archiveListing(id, reason) {
  const body = reason ? { reason } : {};
  return toViewModel(await patch(`/properties/${encodeURIComponent(id)}/archive`, body));
}

export async function restoreListing(id) {
  return toViewModel(await patch(`/properties/${encodeURIComponent(id)}/restore`, {}));
}

export async function setListingStatus(id, status, reason) {
  const opts = typeof reason === 'object' && reason !== null ? reason : { reason };
  const body = Object.fromEntries(Object.entries({
    status,
    reason: opts.reason,
    reasonCode: opts.reasonCode,
    expectedStatus: opts.expectedStatus,
  }).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  await patch(`/properties/${encodeURIComponent(id)}/status`, body);
}

export async function flagListing(id, reason) {
  await post(`/properties/${encodeURIComponent(id)}/flag`, { reason });
}

export async function clearFlag(id) {
  await del(`/properties/${encodeURIComponent(id)}/flag`);
}

function warnUnsupported(filters) {
  const dropped = unsupportedFilters(filters);
  if (dropped.length) {
    console.warn(
      `[property] Filter(s) ${dropped.join(', ')} have no server-side equivalent and were not ` +
        'applied. Freshness/dormancy is not modelled server-side yet.',
    );
  }
}

function warnIfTruncated(page) {
  const returned = page?.content?.length ?? 0;
  if ((page?.totalElements ?? 0) > returned) {
    console.error(
      `[property] ${page.totalElements} listings matched but only ${returned} were fetched. ` +
        'Every client-side aggregate over this result is now reading a partial catalogue and is ' +
        'silently wrong — counts, sums, "is X in the list" checks and any admin table that pages ' +
        'itself. See register item 33 in tasks/DECISIONS-NEEDED.md; the fix is server-side ' +
        'aggregates or real paging, not a larger page size.',
    );
  }
}
