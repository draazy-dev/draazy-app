// Field names already match `LeadNoteResponse`, so no mapper; dates arrive as ISO and every reader accepts either form.
import { get, put } from '../../http.js';

// The server's `Instant` reads a bare JSON number as epoch seconds, so the sheet's millis would land ~50,000 years out.
const toInstant = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return new Date(v).toISOString();
  return v;
};

export async function myLeadNotes() {
  return (await get('/me/lead-notes')) || [];
}

// Whole annotation via PUT: JSON can't tell an omitted field from a cleared one.
// A 204 (null) means the row was deleted.
export async function saveLeadNote(leadKey, { note = null, followUpAt = null } = {}) {
  return put(`/me/lead-notes/${encodeURIComponent(leadKey)}`, { note, followUpAt: toInstant(followUpAt) });
}
