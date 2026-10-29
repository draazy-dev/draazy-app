import { del, get, patch, post, put } from '../../http.js';
import {
  toModerationViewModelPage,
  toReviewCreate,
  toSummaryViewModel,
  toViewModel,
  toViewModelPage,
} from './reviewMapper.js';

const PAGE_SIZE = 100;

const SHARED_READ_TTL_MS = 5_000;

function summaryOf(res) {
  if (!res?.summary) throw new Error('Review list response carried no summary.');
  return res.summary;
}

const propertyReviews = (propertyId) =>
  get(`/properties/${encodeURIComponent(propertyId)}/reviews`, undefined, { ttl: SHARED_READ_TTL_MS });

const entityReviews = (entityType, entityId, { page = 0, size = PAGE_SIZE } = {}) =>
  get(
    `/reviews/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
    { page, size },
    { ttl: SHARED_READ_TTL_MS },
  );

export async function listPropertyReviews(propertyId) {
  return toViewModelPage(await propertyReviews(propertyId));
}

export async function getPropertyReviewSummary(propertyId) {
  return toSummaryViewModel(summaryOf(await propertyReviews(propertyId)));
}

export async function createPropertyReview(propertyId, review) {
  const created = await post(
    `/properties/${encodeURIComponent(propertyId)}/reviews`,
    toReviewCreate(review),
  );
  return toViewModel(created);
}

export async function listEntityReviews(entityType, entityId, { page = 0, size = PAGE_SIZE } = {}) {
  const res = await entityReviews(entityType, entityId, { page, size });
  if (size === PAGE_SIZE) warnIfTruncated(res, `${entityType} ${entityId}`);
  return toViewModelPage(res, { page, size });
}

export async function createEntityReview(entityType, entityId, review) {
  const created = await post(
    `/reviews/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
    toReviewCreate(review),
  );
  return toViewModel(created);
}

export async function updateReview(id, review) {
  return toViewModel(await put(`/reviews/${encodeURIComponent(id)}`, toReviewCreate(review)));
}

export async function deleteReview(id) {
  await del(`/reviews/${encodeURIComponent(id)}`);
}

export async function getEntityReviewSummary(entityType, entityId, { size = PAGE_SIZE } = {}) {
  return toSummaryViewModel(summaryOf(await entityReviews(entityType, entityId, { size })), entityType);
}

export async function listReviewsForModeration({ status, q, days, page = 0, size = 20, counts = false } = {}) {
  const res = await get('/admin/reviews', { status: status || undefined, q: q || undefined, days: days || undefined, page, size, counts: counts || undefined });
  return toModerationViewModelPage(res, { page, size });
}

export async function setReviewStatus(id, status, reason) {
  await patch(`/reviews/${encodeURIComponent(id)}/status`, { status, reason: reason || undefined });
}

function warnIfTruncated(res, what) {
  const returned = Array.isArray(res?.content) ? res.content.length : 0;
  const total = res?.totalElements ?? returned;
  if (total > returned) {
    console.warn(
      `[reviews] ${what} has ${total} reviews but only ${returned} were fetched. The cards below ` +
        'are page one and this surface has no control to reach page two, so the rest are ' +
        'unreadable. Paging is needed here.',
    );
  }
}
