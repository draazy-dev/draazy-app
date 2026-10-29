import { get, put } from '../../http.js';

const toRow = (dto) => ({
  label: dto?.label || '',
  url: dto?.url || '',
  at: dto?.at && !Number.isNaN(Date.parse(dto.at)) ? Date.parse(dto.at) : null,
});

const toRows = (rows) => (Array.isArray(rows) ? rows.map(toRow).filter((r) => r.url && r.label) : []);

export async function listRecentSearches() {
  return toRows(await get('/me/recent-searches'));
}

export async function recordRecentSearch({ label, url }) {
  return toRows(await put('/me/recent-searches', { label, url }));
}
