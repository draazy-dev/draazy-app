import { get, post } from '../../http.js';

const maybeNumber = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

const toLocality = (row) => {
  const liveListings = Number(row?.liveListings) || 0;
  return {
    slug: String(row?.slug || ''),
    name: String(row?.name || ''),
    city: String(row?.city || ''),
    liveListings,
    indexable: !!row?.indexable,
    archived: !!row?.archived,
    avgRent: maybeNumber(row?.avgRent),
    ratePerSqft: maybeNumber(row?.ratePerSqft),
    forSale: Number(row?.forSale) || 0,
    forRent: Number(row?.forRent) || 0,
    fromSale: maybeNumber(row?.fromSale),
    fromRent: maybeNumber(row?.fromRent),
    lat: maybeNumber(row?.lat),
    lng: maybeNumber(row?.lng),
  };
};

const toAdminRow = (row) => ({
  slug: String(row?.slug || ''),
  name: String(row?.name || ''),
  liveListings: Number(row?.liveListings) || 0,
  archived: !!row?.archived,
  lat: maybeNumber(row?.lat),
  lng: maybeNumber(row?.lng),
});

export async function listAdminLocalities() {
  const rows = await get('/admin/localities');
  return (Array.isArray(rows) ? rows : []).map(toAdminRow);
}

export const retireLocality = async (slug) => toAdminRow(await post(`/admin/localities/${encodeURIComponent(slug)}/retire`));

export const restoreLocality = async (slug) => toAdminRow(await post(`/admin/localities/${encodeURIComponent(slug)}/restore`));

export async function getLocality(slug) {
  return toLocality(await get(`/localities/${encodeURIComponent(slug)}`));
}

const toSummary = (row) => ({
  slug: String(row?.slug || ''),
  name: String(row?.name || ''),
  city: String(row?.city || ''),
  lat: maybeNumber(row?.lat),
  lng: maybeNumber(row?.lng),
});

export async function resolveLocality({ placeId, name, lat, lng, types }) {
  return toSummary(await post('/localities/resolve', { placeId, name, lat, lng, types }));
}

export async function searchLocalities(q) {
  const rows = await get('/localities/search', { q, limit: 10 });
  return (Array.isArray(rows) ? rows : []).map(toSummary);
}
