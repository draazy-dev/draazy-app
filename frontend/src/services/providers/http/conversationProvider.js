import { del, get, openEventStream, patch, post, postMultipart } from '../../http.js';
import { readUser } from '../../../lib/auth.js';
import { fmtINR } from '../../../lib/format.js';
import {
  stagedToViewModel,
  toConversationCreate,
  toMessage,
  toViewModel,
  toViewModelList,
} from './conversationMapper.js';

const PAGE_SIZE = 100;

const QUEUE_KEY = 'dzPendingRequests';

export async function listConversations() {
  const page = await get('/messages', { size: PAGE_SIZE });
  warnIfTruncated(page);
  const live = toViewModelList(page);
  const livePropIds = new Set(live.flatMap((c) => [c.propertyId, c.propertySlug].filter(Boolean)));
  const staged = readQueue()
    .filter((q) => !livePropIds.has(q.propertyId) && (!q.propertySlug || !livePropIds.has(q.propertySlug)))
    .map(stagedToViewModel);
  return [...live, ...staged].sort((a, b) => (b.at || 0) - (a.at || 0));
}

export async function getConversation(id) {
  if (String(id).startsWith('staged:')) {
    return readQueue().map(stagedToViewModel).find((c) => c.id === id) ?? null;
  }
  try {
    return toViewModel(await get(`/messages/${encodeURIComponent(id)}`));
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

export async function startConversation({ counterpartyMobile, propertyId, firstMessage, clientId } = {}) {
  const body = toConversationCreate({ counterpartyMobile, propertyId, body: firstMessage, clientId });
  return toViewModel(await post('/messages', body));
}

export async function replyToConversation(id, body) {
  const input = typeof body === 'string' ? { body } : body;
  return toMessage(await post(`/messages/${encodeURIComponent(id)}/reply`, {
    body: input.body,
    clientId: input.clientId,
    replyToId: input.replyToId,
  }));
}

export async function sendConversationPhoto(id, { file, caption, clientId }) {
  const form = new FormData();
  form.set('file', file);
  if (clientId) form.set('clientId', clientId);
  if (caption) form.set('caption', caption);
  return toMessage(await postMultipart(`/messages/${encodeURIComponent(id)}/photos`, form));
}

export async function updateConversationState(id, state) {
  if (String(id).startsWith('staged:')) return;
  await patch(`/messages/${encodeURIComponent(id)}/state`, state);
}

export async function deleteMessageForMe(id, messageId) {
  await del(`/messages/${encodeURIComponent(id)}/items/${encodeURIComponent(messageId)}`);
}

export async function setConversationBlocked(id, blocked) {
  const path = `/messages/${encodeURIComponent(id)}/block`;
  if (blocked) await post(path, {});
  else await del(path);
}

export async function openGroupConversation(groupId) {
  try {
    return toViewModel(await post(`/messages/flatmate-groups/${encodeURIComponent(groupId)}`, {}));
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

export async function openFlatmateRequestConversation(requestId) {
  return toViewModel(await post(`/messages/flatmate-requests/${encodeURIComponent(requestId)}`, {}));
}

export async function openLeadRequestConversation(kind, requestId) {
  return toViewModel(await post(`/messages/requests/${encodeURIComponent(kind)}/${encodeURIComponent(requestId)}`, {}));
}

export async function markConversationRead(id) {
  if (String(id).startsWith('staged:')) return;
  await post(`/messages/${encodeURIComponent(id)}/read`, {});
}

export async function sendTyping(id) {
  if (String(id).startsWith('staged:')) return;
  await post(`/messages/${encodeURIComponent(id)}/typing`, {});
}

export async function openMessageStream(opts) {
  return openEventStream('/messages/stream', opts);
}

export async function unreadCount() {
  const res = await get('/messages/unread-count');
  return Number(res?.count) || 0;
}

export async function queuePendingChat(property, { firstMessage, active = false } = {}) {
  if (!property?.id) return;
  if (active && await openNow(property, firstMessage)) return;
  const queue = readQueue();
  const idStr = String(property.uuid || property.id);
  const slugStr = property.slug || (property.uuid ? String(property.id) : null);
  const staged = queue.find((q) => q.propertyId === idStr || (slugStr && (q.propertySlug === slugStr || q.propertyId === slugStr)));
  if (staged) {
    if (firstMessage) { staged.firstMessage = firstMessage; writeQueue(queue); }
    return;
  }
  queue.push({
    kind: 'chat',
    userId: viewerId(),
    propertyId: idStr,
    propertySlug: slugStr,
    clientId: newClientId(),
    at: Date.now(),
    property: {
      title: property.title || 'Property',
      price: property.priceStr || (property.price ? (property.deal === 'rent' ? `${fmtINR(property.price)}/mo` : fmtINR(property.price)) : ''),
      loc: property.locality ? `${property.locality}, Pune` : 'Pune',
      img: property.image || property.img || '',
    },
    party: { name: property.owner || 'Owner', role: 'Owner' },
    firstMessage: firstMessage || greeting(property),
  });
  writeQueue(queue);
}

export function dropPendingChat(...keys) {
  const wanted = new Set(keys.filter(Boolean).map(String));
  if (!wanted.size) return;
  const mine = viewerId();
  try {
    const arr = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    if (!Array.isArray(arr)) return;
    writeQueue(arr.filter((q) => q?.userId !== mine || !(wanted.has(q.propertyId) || wanted.has(q.propertySlug))));
  } catch {
  }
}

const greeting = (property) =>
  `Hi, I'm interested in "${property.title || 'this property'}" on Draazy. Is it still available?`;

const newClientId = () => `q${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

async function openNow(property, firstMessage) {
  try {
    await post('/messages', toConversationCreate({
      propertyId: String(property.id),
      body: firstMessage || greeting(property),
      clientId: firstMessage ? newClientId() : `open:${property.id}`,
    }));
    return true;
  } catch {
    return false;
  }
}

let draining = null;

export function drainPendingChats() {
  draining ??= drain().finally(() => { draining = null; });
  return draining;
}

async function drain() {
  const queue = readQueue();
  if (!queue.length) return { sent: 0, blocked: 0 };

  if (queue.some((item) => !item.clientId)) {
    queue.forEach((item) => { item.clientId ??= newClientId(); });
    writeQueue(queue);
  }
  const delivered = new Set();
  for (const item of queue) {
    try {
      await post('/messages', toConversationCreate({
        propertyId: item.propertyId,
        body: item.firstMessage,
        clientId: item.clientId,
      }));
      delivered.add(item.propertyId);
    } catch {
    }
  }
  writeQueue(readQueue().filter((item) => !delivered.has(item.propertyId)));
  return { sent: delivered.size, blocked: queue.length - delivered.size };
}

const viewerId = () => readUser()?.id ?? null;

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    const mine = viewerId();
    return arr.filter((item) => item?.userId === mine);
  } catch {
    return [];
  }
}

export function clearConversationDeviceState() {
  try {
    const mine = viewerId();
    const raw = localStorage.getItem(QUEUE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) writeQueue(arr.filter((item) => item?.userId && item.userId !== mine));
    localStorage.removeItem('dzDismissedNotifs');
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('dzMsgDraft:'))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
  }
}

function writeQueue(next) {
  try {
    if (next.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {
  }
}

function warnIfTruncated(page) {
  const returned = page?.content?.length ?? 0;
  if ((page?.totalElements ?? 0) > returned) {
    console.warn(
      `[conversation] ${page.totalElements} threads exist but only ${returned} were fetched. ` +
        'The unread badge and the inbox search are now reading a partial list — the page needs ' +
        'real paging.',
    );
  }
}
