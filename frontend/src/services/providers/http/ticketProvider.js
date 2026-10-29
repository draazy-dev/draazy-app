import { get, patch, post } from '../../http.js';
import { toClaim, toCreate, toNote, toViewModel, toViewModelPage, toWireStatus } from './ticketMapper.js';

export async function listTicketQueue({ status, team, priority, q, days, page = 0, size = 20 } = {}) {
  const query = { page, size };
  const wire = toWireStatus(status);
  if (wire) query.status = wire;
  if (team) query.team = team;
  if (priority) query.priority = priority;
  if (q) query.q = q;
  if (days) query.days = days;
  return toViewModelPage(await get('/tickets', query), { page, size });
}

export async function getTicketSummary(team) {
  return get('/tickets/summary', team ? { team } : {});
}

export async function getTicket(id) {
  return toViewModel(await get(`/tickets/${encodeURIComponent(id)}`));
}

export async function claimTicket(id, userId) {
  return toViewModel(await patch(`/tickets/${encodeURIComponent(id)}`, toClaim(userId)));
}

export async function setTicketStatus(id, status) {
  return toViewModel(await patch(`/tickets/${encodeURIComponent(id)}`, { status: toWireStatus(status) }));
}

export async function addTicketNote(id, text) {
  return toNote(
    await post(`/tickets/${encodeURIComponent(id)}/notes`, { body: String(text || '').trim() }),
  );
}

export async function createTicket(data) {
  return toViewModel(await post('/tickets', toCreate(data)));
}

export async function joinServiceWaitlist({ service, name, mobile, turnstileToken }) {
  await post('/service-waitlist', { service, name: name || undefined, mobile }, {
    headers: turnstileToken ? { 'CF-Turnstile-Response': turnstileToken } : undefined,
  });
}
