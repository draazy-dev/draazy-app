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

const toOutsideRow = (row) => ({
  kind: row?.kind === 'society' ? 'society' : 'locality',
  slug: String(row?.slug || ''),
  name: String(row?.name || ''),
  district: row?.district ? String(row.district) : null,
});

export async function getServedAreaReport() {
  const r = await get('/admin/served-area');
  return {
    servedDistricts: Array.isArray(r?.servedDistricts) ? r.servedDistricts.map(String) : [],
    outside: (Array.isArray(r?.outside) ? r.outside : []).map(toOutsideRow),
    unchecked: Number(r?.unchecked) || 0,
  };
}

export async function recheckServedArea() {
  const r = await post('/admin/served-area/recheck');
  return { checked: Number(r?.checked) || 0, remaining: Number(r?.remaining) || 0 };
}

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
