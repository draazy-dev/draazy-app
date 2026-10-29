function displayDate(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
}

const PROPERTY_CATEGORY_ORDER = ['locality', 'condition', 'value', 'owner', 'accuracy'];
const SOCIETY_CATEGORY_ORDER = ['Safety', 'Maintenance', 'Management', 'Amenities', 'Connectivity'];
const categoryOrderFor = (entityType) =>
  (entityType === 'society' ? SOCIETY_CATEGORY_ORDER : PROPERTY_CATEGORY_ORDER);

export function toViewModel(r) {
  if (!r) return null;
  return {
    id: r.id,
    user: r.author || 'User',
    rating: Number(r.rating) || 0,
    text: r.body || '',
    categories: r.categories || {},
    recommend: r.recommend ?? null,
    context: r.context ?? null,
    at: displayDate(r.createdAt),
    mine: r.mine === true,
  };
}

export function toViewModelPage(res, fallback = {}) {
  const rows = Array.isArray(res?.content) ? res.content : [];
  return {
    items: rows.map(toViewModel).filter(Boolean),
    total: res?.totalElements ?? rows.length,
    page: res?.page ?? res?.number ?? fallback.page ?? 0,
    size: res?.size ?? fallback.size ?? rows.length,
  };
}

export function toSummaryViewModel(s, entityType) {
  const dist = ['1', '2', '3', '4', '5'].map((star) => Number(s?.distribution?.[star]) || 0);
  const catAvg = {};
  categoryOrderFor(entityType).forEach((k) => {
    const n = Number(s?.categoryAverages?.[k]);
    if (Number.isFinite(n)) catAvg[k] = n;
  });
  const avg = s?.avgRating == null ? null : Number(s.avgRating);
  const rawCount = Number(s?.reviewCount) || 0;
  const count = rawCount > 0 && !Number.isFinite(avg) ? 0 : rawCount;
  return { count, avg: count === 0 ? null : avg, dist, catAvg };
}

export function toModerationViewModel(r) {
  const base = toViewModel(r);
  if (!base) return null;
  const type = r.targetType ? String(r.targetType) : '';
  const label = type ? type.charAt(0).toUpperCase() + type.slice(1) : '';
  return {
    ...base,
    status: r.status || 'pending',
    authorMobile: r.authorMobile || '',
    target: label && r.targetId ? `${label}: ${r.targetId}` : label || null,
  };
}

export function toModerationViewModelPage(res, fallback = {}) {
  const rows = Array.isArray(res?.content) ? res.content : [];
  return {
    items: rows.map(toModerationViewModel).filter(Boolean),
    total: res?.totalElements ?? rows.length,
    page: res?.page ?? res?.number ?? fallback.page ?? 0,
    size: res?.size ?? fallback.size ?? rows.length,
    counts: res?.counts || null,
  };
}

export function toReviewCreate(review) {
  const out = { rating: Number(review?.rating) || 0 };
  const text = String(review?.text || '').trim();
  if (text) out.body = text;
  if (review?.categories && Object.keys(review.categories).length) out.categories = review.categories;
  if (review?.recommend != null) out.recommend = review.recommend;
  return out;
}
