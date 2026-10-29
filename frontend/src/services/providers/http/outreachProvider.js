import { get, post } from '../../http.js';

const toTemplate = (row) => ({
  id: String(row?.id || ''),
  channel: row?.channel || 'whatsapp',
  category: row?.category || null,
  name: row?.name || '',
  body: row?.body || '',
});

const toPrepared = (row) => ({
  id: row?.id ? String(row.id) : null,
  body: row?.body || '',
  status: row?.status || 'prepared',
  handoffLink: row?.handoffLink || null,
});

const toOutreachEntry = (row) => ({
  id: row?.id ? String(row.id) : null,
  templateId: row?.templateId || null,
  channel: row?.channel || 'whatsapp',
  body: row?.body || '',
  status: row?.status || 'prepared',
  preparedById: row?.preparedBy ? String(row.preparedBy) : null,
  preparedAt: row?.preparedAt || null,
});

export async function listOutreachTemplates(channel = 'whatsapp') {
  const rows = await get(`/admin/message-templates?channel=${encodeURIComponent(channel)}`);
  return (Array.isArray(rows) ? rows : []).map(toTemplate);
}

export async function chaseOwner(propertyId, templateId) {
  return toPrepared(await post(`/properties/${encodeURIComponent(propertyId)}/outreach`, { templateId }));
}

export async function listOwnerOutreach(propertyId) {
  const rows = await get(`/properties/${encodeURIComponent(propertyId)}/outreach`);
  return (Array.isArray(rows) ? rows : []).map(toOutreachEntry);
}

export async function markOutreachSent(propertyId, messageId) {
  return toOutreachEntry(await post(
    `/properties/${encodeURIComponent(propertyId)}/outreach/${encodeURIComponent(messageId)}/sent`));
}
