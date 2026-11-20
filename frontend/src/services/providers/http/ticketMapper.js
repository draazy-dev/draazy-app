const epoch = (iso) => (iso ? Date.parse(iso) || 0 : 0);

export const toWireStatus = (status) => (status === 'in_progress' ? 'in-progress' : status || undefined);

function toNoteRow(n) {
  if (!n) return null;
  return { by: n.by || 'Ops', text: n.text || '', at: n.at || null };
}

export const toNote = (dto) => toNoteRow(dto);

export function toViewModel(dto) {
  if (!dto) return null;
  return {
    id: dto.id,
    subject: dto.subject || '',
    desk: dto.team || null,
    priority: dto.priority || 'medium',
    status: dto.status || 'open',
    propertyId: dto.propertyId || null,
    assignedTo: dto.assignee || null,
    service: dto.service || null,
    customer: dto.customer || '',
    mobile: dto.mobile || '',
    value: dto.value ?? null,
    quotedValue: dto.quotedValue ?? null,
    detail: dto.detail || '',
    notes: (Array.isArray(dto.notes) ? dto.notes : []).map(toNoteRow).filter(Boolean),
    createdAt: epoch(dto.createdAt),
  };
}

export function toViewModelPage(res, fallback = {}) {
  const rows = Array.isArray(res?.content) ? res.content : [];
  return {
    items: rows.map(toViewModel).filter(Boolean),
    total: res?.totalElements ?? rows.length,
    page: res?.page ?? fallback.page ?? 0,
    size: res?.size ?? fallback.size ?? rows.length,
  };
}

export const toClaim = (userId) => ({ assigneeId: String(userId || '') });

export function toCreate(data) {
  const body = { subject: String(data?.subject || '').trim() };
  if (data?.desk) body.team = data.desk;
  if (data?.priority) body.priority = data.priority;
  if (data?.propertyId) body.propertyId = data.propertyId;
  if (data?.body) body.body = String(data.body).trim();
  const quoted = data?.quotedValue;
  if (quoted !== null && quoted !== undefined && quoted !== '' && Number.isFinite(Number(quoted))) {
    body.quotedValue = Number(quoted);
  }
  return body;
}
