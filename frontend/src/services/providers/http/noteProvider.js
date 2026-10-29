import { get, post } from '../../http.js';
import { toNote, toNotes, toWireType } from './noteMapper.js';

const base = (entityType, entityId) =>
  `/admin/notes/${toWireType(entityType)}/${encodeURIComponent(entityId)}`;

export async function listNotes(entityType, entityId) {
  return toNotes(await get(base(entityType, entityId)));
}

export async function addNote(entityType, entityId, text, action) {
  const body = { text: String(text ?? '').trim() };
  const label = String(action ?? '').trim();
  if (label) body.action = label;
  return toNote(await post(base(entityType, entityId), body));
}
