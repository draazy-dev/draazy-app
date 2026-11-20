import { get, patch, post, unwrapFullPage } from '../../http.js';
import { MAX_PAGE_SIZE } from '../../apiLimits.js';

export async function requestPhotos(propertyIdOrSlug) {
  return post(`/properties/${encodeURIComponent(propertyIdOrSlug)}/photo-requests`);
}

export async function myPhotoRequests({ page = 0, size = MAX_PAGE_SIZE } = {}) {
  const res = await get('/me/photo-requests', { page, size });
  const items = unwrapFullPage(res, 'photo-request');
  return {
    items,
    page: res?.page ?? res?.number ?? page,
    size: res?.size ?? size,
    total: res?.totalElements ?? items.length,
    totalPages: res?.totalPages ?? 0,
  };
}

export async function decidePhotoRequest(reqId, decision) {
  return patch(`/me/photo-requests/${encodeURIComponent(reqId)}`, { decision });
}
