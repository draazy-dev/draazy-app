import { del, get, put, unwrapPage } from '../../http.js';
import { toViewModel } from './propertyMapper.js';

export async function listSaved({ page = 0, size = 20 } = {}) {
  const res = await get('/me/saved', { page, size });
  const { items, ...rest } = unwrapPage(res, { page, size });
  return { items: items.map((r) => ({ ...toViewModel(r), available: r.available !== false, savedAt: r.savedAt })), ...rest };
}

export async function listSavedKeys() {
  const rows = await get('/me/saved/keys');
  return (Array.isArray(rows) ? rows : []).map((r) => ({ token: r.slug || r.id, uuid: r.id }));
}

export async function saveProperty(propertyId) {
  await put(`/me/saved/${encodeURIComponent(propertyId)}`);
}

export async function unsaveProperty(propertyId) {
  await del(`/me/saved/${encodeURIComponent(propertyId)}`);
}
