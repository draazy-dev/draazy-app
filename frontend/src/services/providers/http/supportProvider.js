import { get, post } from '../../http.js';
import { toMessage, toQueuePage, toSummaryList, toTicketCreate, toViewModel } from './supportMapper.js';

export async function listTickets() {
  return toSummaryList(await get('/support/tickets'));
}

export async function listSupportQueue({ awaitingReply, days, page = 0, size = 20, counts = false } = {}) {
  const query = { page, size };
  if (awaitingReply === true || awaitingReply === false) query.awaitingReply = awaitingReply;
  if (days) query.days = days;
  if (counts) query.counts = true;
  return toQueuePage(await get('/admin/support-tickets', query), { page, size });
}

export async function getTicket(id) {
  try {
    return toViewModel(await get(`/support/tickets/${encodeURIComponent(id)}`));
  } catch {
    return null;
  }
}

export async function createTicket(ticket) {
  return toViewModel(await post('/support/tickets', toTicketCreate(ticket)));
}

export async function replyToTicket(id, text) {
  return toMessage(
    await post(`/support/tickets/${encodeURIComponent(id)}/messages`, { body: String(text || '').trim() }),
  );
}

export async function closeTicket(id) {
  return toViewModel(await post(`/support/tickets/${encodeURIComponent(id)}/close`));
}

export async function markTicketRead(id) {
  await post(`/support/tickets/${encodeURIComponent(id)}/read`);
}
