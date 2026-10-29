function epoch(iso) {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

const STAFF_ROLES = new Set(['staff', 'manager', 'admin']);

export function toMessage(m) {
  if (!m) return null;
  return {
    id: m.id,
    by: STAFF_ROLES.has(m.authorRole) ? 'staff' : 'customer',
    name: m.author || (STAFF_ROLES.has(m.authorRole) ? 'Support' : 'You'),
    text: m.body || '',
    images: [],
    at: epoch(m.createdAt),
  };
}

export function toViewModel(t) {
  if (!t) return null;
  const messages = (Array.isArray(t.messages) ? t.messages : []).map(toMessage).filter(Boolean);
  const created = epoch(t.createdAt);
  return {
    id: t.id,
    subject: t.subject || '',
    category: t.category || 'other',
    status: t.status || 'open',
    priority: '',
    unread: !!t.unread,
    createdAt: created,
    updatedAt: messages.length ? Math.max(created, messages[messages.length - 1].at) : created,
    messages,
  };
}

export function toSummary(t) {
  if (!t) return null;
  const created = epoch(t.createdAt);
  const last = t.lastMessage ? { by: STAFF_ROLES.has(t.lastMessage.authorRole) ? 'staff' : 'customer', text: t.lastMessage.body || '', at: epoch(t.lastMessage.createdAt) } : null;
  return {
    id: t.id,
    subject: t.subject || '',
    category: t.category || 'other',
    status: t.status || 'open',
    unread: !!t.unread,
    createdAt: created,
    updatedAt: last ? Math.max(created, last.at) : created,
    lastMessage: last,
  };
}

export function toSummaryList(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(toSummary)
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function toQueueRow(t) {
  if (!t) return null;
  return {
    id: t.id,
    subject: t.subject || '',
    category: t.category || 'other',
    status: t.status || 'open',
    raiser: t.raiser || '',
    raiserMobile: t.raiserMobile || '',
    awaitingReply: !!t.awaitingReply,
    unread: !!t.unread,
    createdAt: epoch(t.createdAt),
  };
}

export function toQueuePage(res, fallback = {}) {
  const rows = Array.isArray(res?.content) ? res.content : [];
  return {
    items: rows.map(toQueueRow).filter(Boolean),
    total: res?.totalElements ?? rows.length,
    counts: res?.counts,
    page: res?.page ?? res?.number ?? fallback.page ?? 0,
    size: res?.size ?? fallback.size ?? rows.length,
  };
}

export function toTicketCreate(ticket) {
  return {
    subject: String(ticket?.subject || '').trim(),
    category: ticket?.category || 'other',
    body: String(ticket?.message || '').trim(),
  };
}
