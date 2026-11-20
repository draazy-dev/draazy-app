const epoch = (iso) => {
  const t = Date.parse(iso || '');
  return Number.isNaN(t) ? 0 : t;
};

export const toChatAbout = (a) => ({
  type: a?.type || 'general',
  id: a?.id == null ? null : String(a.id),
  label: a?.label || null,
});

// Consumer replies arrive as 'me', staff timelines call the customer 'user'; both map to the viewer's side.
export function toChatMessage(m, mine) {
  if (!m) return null;
  return {
    id: m.id,
    from: m.from === mine ? 'me' : 'them',
    staffName: m.staffName || null,
    text: m.text || '',
    at: epoch(m.at),
    about: toChatAbout(m.about),
  };
}

const toCase = (c) => ({
  type: c.type, id: String(c.id), label: c.label || '', status: c.status || '', replyable: c.replyable !== false,
});

const toAssignee = (a) => (a ? { id: a.id ? String(a.id) : null, name: a.name || 'Draazy support' } : null);

function toTimeline(raw, mine) {
  const messages = (Array.isArray(raw?.messages) ? raw.messages : []).map((m) => toChatMessage(m, mine)).filter(Boolean);
  const last = messages[messages.length - 1];
  return {
    status: raw?.status || 'none',
    assignee: toAssignee(raw?.assignee),
    messages,
    cases: (Array.isArray(raw?.cases) ? raw.cases : []).map(toCase),
    at: last?.at || 0,
    last: last?.text || '',
  };
}

export const toSupportChat = (raw) => ({ ...toTimeline(raw, 'me'), unread: Number(raw?.unread) || 0 });

export const toStaffSupportChat = (raw) => ({
  ...toTimeline(raw, 'staff'),
  user: {
    id: String(raw?.user?.id || ''),
    name: raw?.user?.name || 'Customer',
    mobile: raw?.user?.mobile || '',
    idVerified: !!raw?.user?.idVerified,
    roles: Array.isArray(raw?.user?.roles) ? raw.user.roles : [],
  },
});

export const toSupportChatRow = (r) => ({
  userId: String(r.userId),
  name: r.name || 'Customer',
  status: r.status || 'awaiting',
  assignee: toAssignee(r.assignee),
  staffUnread: !!r.staffUnread,
  lastAt: epoch(r.lastAt),
  lastPreview: r.lastPreview || '',
  lastFrom: r.lastFrom === 'staff' ? 'staff' : 'user',
  lastAbout: toChatAbout(r.lastAbout),
});

export const toChatSend = (text, about) => ({
  text: String(text || '').trim(),
  about: about && about.type && about.type !== 'general' ? { type: about.type, id: String(about.id) } : null,
});
