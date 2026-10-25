import { del, get, post } from '../../http.js';

const PAGE_SIZE = 100;
const path = (kind, id) => `/me/requests/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`;

export async function listRequests(box) {
  const res = await get('/me/requests', { box, size: PAGE_SIZE });
  return Array.isArray(res?.content) ? res.content : [];
}

export async function remindRequest(kind, id) {
  return post(`${path(kind, id)}/reminders`);
}

export async function removeRequest(kind, id, box = 'sent') {
  await del(path(kind, id), { query: { box } });
}
