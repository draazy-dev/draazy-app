import { PUBLIC_READ_TTL, del, get, patch, post, put, unwrapFullPage, unwrapPage } from '../../http.js';
import { toRatingIndex, toSociety, toSocietyBrief } from './societyMapper.js';

const FOLLOW_PAGE_SIZE = 500;

export async function listSocietiesPage({
  q = '', locality = '', sort = 'relevance', page = 0, size = 24,
} = {}) {
  const res = await get('/societies', {
    q: q || undefined,
    locality: locality || undefined,
    sort,
    page,
    size,
  });
  const content = Array.isArray(res?.content) ? res.content : [];
  return {
    rows: content.map(toSociety).filter(Boolean),
    ratings: toRatingIndex(content),
    total: Number(res?.totalElements) || 0,
  };
}

export const topSocieties = () => get('/societies/top', null, { auth: false, ttl: PUBLIC_READ_TTL });

const SEARCH_CANDIDATES = 20;

export async function searchSocieties(query, { mapped = false } = {}) {
  const res = await get('/societies', {
    q: query || undefined,
    mapped: mapped || undefined,
    page: 0,
    size: SEARCH_CANDIDATES,
  });
  const rows = Array.isArray(res?.content) ? res.content : [];
  return rows.map(toSociety).filter(Boolean);
}

export async function getSociety(slug) {
  try {
    return toSociety(await get(`/societies/${encodeURIComponent(slug)}`));
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

export async function getSocietyBrief(slug) {
  try {
    return toSocietyBrief(await get(`/societies/${encodeURIComponent(slug)}/brief`));
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

export async function listSocietyDirectory({ q = '', page = 0, size = 20 } = {}) {
  const res = await get('/admin/societies', { q: q || undefined, page, size });
  return unwrapPage(res, { page, size });
}

export async function listFollowedSocieties() {
  const res = await get('/me/societies/following', { page: 0, size: FOLLOW_PAGE_SIZE });
  return unwrapFullPage(res, 'society').filter((row) => row?.slug);
}

export async function followSociety(slug) {
  await put(`/me/societies/${encodeURIComponent(slug)}/follow`);
}

export async function unfollowSociety(slug) {
  await del(`/me/societies/${encodeURIComponent(slug)}/follow`);
}

export async function resolveSociety({ placeId, name, lat, lng }) {
  const res = await get('/societies/resolve', {
    placeId,
    name: name || undefined,
    lat: lat == null ? undefined : lat,
    lng: lng == null ? undefined : lng,
  });
  const candidates = (Array.isArray(res?.candidates) ? res.candidates : []).map(toSociety).filter(Boolean);
  return { society: toSociety(res?.society), candidates };
}

export async function mintSociety({
  placeId, name, lat, lng, localityLabel, localitySlug, mintOrigin = 'listing',
}) {
  const { data, status } = await post('/societies', {
    placeId, name, lat, lng, localityLabel, localitySlug, mintOrigin,
  }, { withStatus: true });
  return { society: toSociety(data), created: status === 201 };
}

export async function listSocietyCandidates({ q = '', page = 0, size = 10 } = {}) {
  const res = await get('/admin/society-candidates', { q: q || undefined, page, size });
  return unwrapPage(res, { page, size });
}

export async function listDuplicatesForCandidates(slugs, { limit } = {}) {
  const bySlug = await get('/admin/society-candidates/duplicates', { slugs, limit });
  return bySlug && typeof bySlug === 'object' && !Array.isArray(bySlug) ? bySlug : {};
}

export async function getSocietiesSummary() {
  return get('/admin/societies/summary');
}

export async function listSocietyMerges({ page, size } = {}) {
  const res = await get('/admin/society-merges', { page, size });
  return unwrapFullPage(res, 'society merges');
}

export async function mergeSocieties(from, into) {
  return post('/admin/society-merges', { from, into });
}

export async function undoSocietyMerge(slug) {
  await del(`/admin/society-merges/${encodeURIComponent(slug)}`);
}

export async function getSocietyAdminView(slug) {
  return get(`/admin/societies/${encodeURIComponent(slug)}`);
}

export async function editSociety(slug, body) {
  return patch(`/admin/societies/${encodeURIComponent(slug)}`, body);
}
