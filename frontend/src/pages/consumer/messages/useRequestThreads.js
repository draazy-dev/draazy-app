import { useMemo } from 'react';
import { CONNECTION_KINDS, initialsOf, isPending, messageOf, threadId } from '../requests/requestMeta.js';
import { useRequestsInbox } from '../requests/useRequestsInbox.js';

const STATE_LINE = {
  accepted: (name) => `${name} accepted your request`,
  declined: () => 'Request declined',
  expired: () => 'This request expired',
  withdrawn: () => 'You withdrew this request',
};

// Once accepted, the live chat replaces the request thread; it only stays as a way in when no chat exists yet.
const hasChat = (convs, item) => convs.some((c) => !c.staged && !c.group && c.party?.id === item.party?.id
  && (item.kind === 'flatmate' ? !c.propertyId || c.propertyId === item.target?.id : c.propertyId === item.target?.id));
const awaitingChat = (convs, item) => item.state === 'accepted' && item.kind !== 'group' && !hasChat(convs, item);

function toThread(item, box) {
  const name = item.party?.name || 'Someone';
  const at = Date.parse(item.createdAt) || 0;
  const decidedAt = Date.parse(item.decidedAt) || at;
  const line = STATE_LINE[item.state];
  return {
    id: threadId(item),
    request: item,
    box,
    party: { id: item.party?.id, name, avatar: initialsOf(name) },
    property: { title: item.target?.title || '' },
    at: line ? decidedAt : at,
    messages: [
      { id: 'request', from: box === 'sent' ? 'me' : 'them', text: messageOf(item), at },
      ...(line ? [{ id: 'state', type: 'system', text: line(name), at: decidedAt }] : []),
    ],
  };
}

/** Contact, flatmate and group requests shown as locked chat threads, built from the requests feed. */
export function useRequestThreads(convs) {
  const inbox = useRequestsInbox();
  const { received, sent } = inbox.boxes;
  const threads = useMemo(() => [
    ...received.items
      .filter((it) => CONNECTION_KINDS.has(it.kind) && (isPending(it) || awaitingChat(convs, it)))
      .map((it) => toThread(it, 'received')),
    ...sent.items
      .filter((it) => CONNECTION_KINDS.has(it.kind) && !(it.state === 'accepted' && hasChat(convs, it)))
      .map((it) => toThread(it, 'sent')),
  ], [convs, received.items, sent.items]);
  return { inbox, threads };
}
