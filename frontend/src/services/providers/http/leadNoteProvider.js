import { get, put } from '../../http.js';

const toInstant = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return new Date(v).toISOString();
  return v;
};

export async function myLeadNotes() {
  return (await get('/me/lead-notes')) || [];
}

export async function saveLeadNote(leadKey, { note = null, followUpAt = null } = {}) {
  return put(`/me/lead-notes/${encodeURIComponent(leadKey)}`, { note, followUpAt: toInstant(followUpAt) });
}
