import { useCallback, useEffect, useRef, useState } from 'react';
import { useConversationUnread } from '../../../context/ConversationContext.jsx';
import { useNotifications } from '../../../context/NotificationContext.jsx';
import { listRequests } from '../../../services/requestInboxService.js';
import { CONNECTION_KINDS, isPending, requestKey } from './requestMeta.js';

const EMPTY = { items: [], status: 'loading' };
const LIVE_REFRESH_MS = 300000;

export function useNow(everyMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

export function useRequestsInbox({ refreshMs = 60000 } = {}) {
  const { pendingRequests, streamConnected } = useConversationUnread();
  const { unread: notificationsUnread, status: notificationsStatus } = useNotifications();
  const [boxes, setBoxes] = useState({ received: EMPTY, sent: EMPTY });
  const seq = useRef({ received: 0, sent: 0 });
  const seen = useRef({ pendingRequests, notificationsUnread: notificationsStatus === 'ready' ? notificationsUnread : null });

  const load = useCallback(async (box, { quiet = false } = {}) => {
    const mine = ++seq.current[box];
    const latest = () => seq.current[box] === mine;
    if (!quiet) setBoxes((cur) => ({ ...cur, [box]: { items: cur[box].items, status: 'loading' } }));
    try {
      const items = await listRequests(box);
      if (latest()) setBoxes((cur) => ({ ...cur, [box]: { items, status: 'ready' } }));
    } catch {
      if (!latest()) return;
      setBoxes((cur) => (quiet && cur[box].status === 'ready' ? cur : { ...cur, [box]: { items: [], status: 'error' } }));
    }
  }, []);

  useEffect(() => {
    load('received');
    load('sent');
  }, [load]);

  const pollMs = streamConnected ? Math.max(refreshMs, LIVE_REFRESH_MS) : refreshMs;
  useEffect(() => {
    const poll = setInterval(() => {
      if (document.hidden) return;
      load('received', { quiet: true });
      load('sent', { quiet: true });
    }, pollMs);
    return () => clearInterval(poll);
  }, [load, pollMs]);

  // Rises count only from a settled reading and past what the box already shows, so the badges
  // settling after a cold mount or recovering from an error don't re-read a fresh box.
  const shownPending = boxes.received.status === 'loading'
    ? null
    : boxes.received.items.filter((it) => CONNECTION_KINDS.has(it.kind) && isPending(it)).length;
  useEffect(() => {
    const before = seen.current;
    const notesKnown = notificationsStatus === 'ready';
    seen.current = {
      pendingRequests: shownPending === null ? before.pendingRequests : pendingRequests,
      notificationsUnread: notesKnown ? notificationsUnread : before.notificationsUnread,
    };
    const noted = notesKnown && before.notificationsUnread !== null && notificationsUnread > before.notificationsUnread;
    const newRequest = pendingRequests > before.pendingRequests && shownPending !== null && pendingRequests > shownPending;
    if (noted || newRequest) load('received', { quiet: true });
    if (noted) load('sent', { quiet: true });
  }, [load, pendingRequests, notificationsUnread, notificationsStatus, shownPending]);

  const patchItem = useCallback((box, item, patch) => {
    const key = requestKey(item);
    seq.current[box] += 1;
    setBoxes((cur) => ({
      ...cur,
      [box]: { ...cur[box], items: cur[box].items.map((it) => (requestKey(it) === key ? patch(it) : it)) },
    }));
  }, []);

  const removeItem = useCallback((box, item) => {
    const key = requestKey(item);
    seq.current[box] += 1;
    setBoxes((cur) => ({ ...cur, [box]: { ...cur[box], items: cur[box].items.filter((it) => requestKey(it) !== key) } }));
  }, []);

  return { boxes, load, patchItem, removeItem };
}
