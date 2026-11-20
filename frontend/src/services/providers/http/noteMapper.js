const WIRE_TYPES = {
  listing: 'property',
  property: 'property',
  user: 'user',
  review: 'review',
  report: 'report',
  service_request: 'service_request',
};

export function toWireType(entityType) {
  const wire = WIRE_TYPES[String(entityType || '').toLowerCase()];
  if (!wire) {
    throw new Error(
      `[note] unknown entity type "${entityType}". Expected one of: ${Object.keys(WIRE_TYPES).join(', ')}.`,
    );
  }
  return wire;
}

export function toNote(row) {
  const at = row?.createdAt || null;
  const updated = row?.updatedAt || null;
  return {
    id: String(row?.id || ''),
    entityType: row?.entityType || '',
    entityId: row?.entityId || '',
    author: row?.authorName || row?.authorId || '',
    action: row?.action || '',
    text: row?.text || '',
    at,
    editedAt: updated && at && updated > at ? updated : null,
  };
}

export function toNotes(rows) {
  return (Array.isArray(rows) ? rows : []).map(toNote);
}
