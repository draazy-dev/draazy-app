import { PAGE_LOAD_TTL, get, patch, post, unwrapFullPage } from '../../http.js';
import { MAX_PAGE_SIZE } from '../../apiLimits.js';
import { slotFromParts, slotFromWhen, whenFromSlot } from '../../../lib/visitWhen.js';

function toViewModel(row) {
  const mode = row?.mode || 'in-person';
  const parties = Array.isArray(row?.parties) ? row.parties : [];
  const ownerParty = parties.find((p) => ['owner', 'host', 'listing_owner', 'property_owner'].includes(String(p.role || '').toLowerCase()));
  return {
    id: row.id,
    propertyId: row.propertyId || '',
    listingId: row.propertyId || '',
    propertySlug: row.propertySlug || '',
    listing: row.listing || row.propertyTitle || '',
    when: whenFromSlot(row.slot, mode),
    slot: row.slot || '',
    mode,
    status: row.status || 'scheduled',
    visitorName: row.visitor?.name || 'Visitor',
    visitorMobile: row.visitor?.mobile || '',
    visitorId: row.visitor?.id || '',
    note: row.note || '',
    ownerId: row.owner?.id || row.host?.id || ownerParty?.id || '',
    parties,
    createdAt: row.createdAt ? Date.parse(row.createdAt) : Date.now(),
  };
}

const paged = () => ({ size: MAX_PAGE_SIZE });

export async function listVisits({ propertyId, maxAge } = {}) {
  const query = propertyId ? { propertyId, ...paged() } : paged();
  const page = await get('/visits', query, maxAge ? { ttl: PAGE_LOAD_TTL, maxAge } : undefined);
  return unwrapFullPage(page, 'visit').map(toViewModel);
}

export async function myVisitRequests() {
  return unwrapFullPage(await get('/me/visit-requests', paged()), 'visit').map(toViewModel);
}

export async function scheduleVisit(req = {}) {
  const slot = req.slot || (req.dateIso ? slotFromParts(req.dateIso, req.time) : null);
  const vm = toViewModel(await post('/visits', {
    propertyId: req.propertyId,
    slot,
    mode: 'in-person',
    note: req.note || undefined,
  }));
  if (req.listing && !vm.listing) vm.listing = req.listing;
  return vm;
}

export async function updateVisitStatus(id, status) {
  await patch(`/visit-requests/${encodeURIComponent(id)}/status`, { status });
  return { id, status };
}

export async function rescheduleVisit(id, when) {
  await patch(`/visits/${encodeURIComponent(id)}/slot`, { slot: slotFromWhen(when) });
  return { id, when };
}
