import { get, openEventStream, post } from '../../http.js';
import { toMessage, toSummaryList, toTicketCreate, toViewModel } from './supportMapper.js';
import { toChatMessage, toChatSend, toStaffSupportChat, toSupportChat, toSupportChatRow } from './supportChatMapper.js';

export async function getSupportChat() {
  return toSupportChat(await get('/support/chat'));
}

export async function sendSupportChatMessage(text, about) {
  return toChatMessage(await post('/support/chat/messages', toChatSend(text, about)), 'me');
}

export async function markSupportChatRead() {
  await post('/support/chat/read');
}

export async function listSupportChats({ view = 'awaiting', context, page = 0, size = 30 } = {}) {
  const query = { view, page, size };
  if (context) query.context = context;
  const res = await get('/admin/support/chats', query);
  const rows = Array.isArray(res?.content) ? res.content : [];
  return { items: rows.map(toSupportChatRow), total: res?.totalElements ?? rows.length, page, size };
}

export async function supportChatCounts() {
  const res = await get('/admin/support/chats/counts');
  const scope = res?.scope
    ? { full: !!res.scope.full, contexts: Array.isArray(res.scope.contexts) ? res.scope.contexts : [] }
    : null;
  return { awaiting: Number(res?.awaiting) || 0, mine: Number(res?.mine) || 0, all: Number(res?.all) || 0, scope };
}

const chatPath = (userId) => `/admin/support/chats/${encodeURIComponent(userId)}`;

export async function getStaffSupportChat(userId) {
  return toStaffSupportChat(await get(chatPath(userId)));
}

export async function replyToSupportChat(userId, text, about) {
  return toChatMessage(await post(`${chatPath(userId)}/messages`, toChatSend(text, about)), 'staff');
}

export async function assignSupportChat(userId, assigneeId = null) {
  await post(`${chatPath(userId)}/assign`, { assigneeId });
}

export async function resolveSupportChat(userId) {
  await post(`${chatPath(userId)}/resolve`);
}

export async function markStaffSupportChatRead(userId) {
  await post(`${chatPath(userId)}/read`);
}

export async function locateSupportChat({ type, id }) {
  const res = await get('/admin/support/chats/locate', { type, id: String(id) });
  return { userId: String(res.userId), name: res.name || 'Customer', count: Number(res.count) || 0 };
}

export async function createServiceTicketFromChat(userId, { team, subject, note, propertyId }) {
  const res = await post(`${chatPath(userId)}/service-ticket`, {
    team, subject: String(subject || '').trim(), note: String(note || '').trim() || null, propertyId: propertyId || null,
  });
  return { id: String(res.id), team: res.team };
}

export async function openSupportChatStream({ onEvent, ...opts }) {
  return openEventStream('/admin/support/chats/stream', {
    ...opts,
    onEvent: (event) => onEvent?.(event.type === 'chat' && event.data?.userId
      ? { ...event, data: toSupportChatRow(event.data) } : event),
  });
}

export async function listTickets() {
  return toSummaryList(await get('/support/tickets'));
}

export async function createTicket(ticket) {
  return toViewModel(await post('/support/tickets', toTicketCreate(ticket)));
}

export async function replyToTicket(id, text) {
  return toMessage(
    await post(`/support/tickets/${encodeURIComponent(id)}/messages`, { body: String(text || '').trim() }),
  );
}

export async function markTicketRead(id) {
  await post(`/support/tickets/${encodeURIComponent(id)}/read`);
}
