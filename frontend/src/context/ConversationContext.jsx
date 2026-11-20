import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { openMessageStream, unreadCount as fetchUnreadCount } from '../services/conversationService.js';
import { pendingRequestCount } from '../services/requestInboxService.js';
import { getAppFlags } from '../services/settingsService.js';
import { browserAlertsOn } from '../lib/browserAlerts.js';
import { useAuth } from './AuthContext.jsx';

const ConversationContext = createContext(null);
const STAFF_ROLES = new Set(['admin', 'manager', 'staff']);
// The server writes a heartbeat every 25s, so a silent stream past this is presumed dead.
const STREAM_SILENT_MS = 35_000;
// Reads on another device push no event here, so tab-return re-reads are only skipped for data this recent.
const FRESH_WHILE_LIVE_MS = 60_000;

export function ConversationProvider({ children }) {
  const { isIn, role } = useAuth();
  const hasInbox = isIn && !STAFF_ROLES.has(role);
  const [unread, setUnread] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [streamConnected, setStreamConnected] = useState(false);
  const [messagingEnabled, setMessagingEnabled] = useState(true);
  const subscribers = useRef(new Set());
  const streamHeardAt = useRef(0);
  const streamOpenedAt = useRef(0);
  const unreadAt = useRef(0);
  const requestsAt = useRef(0);

  // Data read before a reconnect may have missed events sent while the stream was down.
  const freshWhileLive = useCallback((at) => Date.now() - streamHeardAt.current < STREAM_SILENT_MS
    && at >= streamOpenedAt.current
    && Date.now() - at < FRESH_WHILE_LIVE_MS, []);

  const refresh = useCallback(async () => {
    unreadAt.current = Date.now();
    if (!isIn) {
      setUnread(0);
      return 0;
    }
    try {
      const n = await fetchUnreadCount();
      setUnread(n);
      return n;
    } catch {
      setUnread(0);
      return 0;
    }
  }, [isIn]);

  const refreshRequests = useCallback(async () => {
    requestsAt.current = Date.now();
    if (!hasInbox) {
      setPendingRequests(0);
      return;
    }
    try {
      setPendingRequests(await pendingRequestCount());
    } catch {
      setPendingRequests(0);
    }
  }, [hasInbox]);

  useEffect(() => {
    refreshRequests();
  }, [refreshRequests]);

  useEffect(() => {
    let alive = true;
    if (!isIn) {
      setUnread(0);
      return undefined;
    }
    unreadAt.current = Date.now();
    fetchUnreadCount()
      .then((n) => { if (alive) setUnread(n); })
      .catch(() => { if (alive) setUnread(0); });
    return () => { alive = false; };
  }, [isIn]);

  useEffect(() => {
    if (!isIn) return undefined;
    let last = 0;
    const onChange = (event) => {
      if (document.hidden || Date.now() - last < 1000) return;
      last = Date.now();
      const wake = event.type === 'focus' || event.type === 'visibilitychange';
      if (!wake || !freshWhileLive(unreadAt.current)) refresh();
      if (!wake || !freshWhileLive(requestsAt.current)) refreshRequests();
    };
    window.addEventListener('storage', onChange);
    window.addEventListener('focus', onChange);
    window.addEventListener('online', onChange);
    document.addEventListener('visibilitychange', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('focus', onChange);
      window.removeEventListener('online', onChange);
      document.removeEventListener('visibilitychange', onChange);
    };
  }, [isIn, refresh, refreshRequests, freshWhileLive]);

  useEffect(() => {
    let alive = true;
    const sync = () => getAppFlags()
      .then((flags) => { if (alive) setMessagingEnabled(flags?.inAppMessaging !== false); })
      .catch(() => { if (alive) setMessagingEnabled(true); });
    sync();
    window.addEventListener('draazy-settings-change', sync);
    window.addEventListener('storage', sync);
    return () => {
      alive = false;
      window.removeEventListener('draazy-settings-change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const subscribe = useCallback((fn) => {
    subscribers.current.add(fn);
    return () => subscribers.current.delete(fn);
  }, []);

  useEffect(() => {
    if (!isIn || !messagingEnabled) {
      setStreamConnected(false);
      return undefined;
    }
    let stopped = false;
    let retry = 1000;
    let controller = null;
    let timer = null;
    let initial = true;
    const start = () => {
      if (stopped || (document.hidden && !browserAlertsOn())) return;
      const reconnect = !initial;
      controller = new AbortController();
      openMessageStream({
        signal: controller.signal,
        onOpen: () => {
          retry = 1000;
          streamHeardAt.current = Date.now();
          if (reconnect) streamOpenedAt.current = streamHeardAt.current;
          setStreamConnected(true);
        },
        onActivity: () => { streamHeardAt.current = Date.now(); },
        onEvent: (event) => {
          if (event.type === 'message') refresh();
          if (event.type === 'notification') refreshRequests();
          subscribers.current.forEach((fn) => fn(event));
        },
      }).catch((err) => {
        if (err?.name !== 'AbortError') setStreamConnected(false);
      }).finally(() => {
        controller = null;
        streamHeardAt.current = 0;
        if (stopped) return;
        setStreamConnected(false);
        timer = window.setTimeout(start, retry);
        retry = Math.min(retry * 2, 30000);
      });
    };
    const visible = () => {
      if (document.hidden) return;
      if (!controller) start();
    };
    start();
    initial = false;
    document.addEventListener('visibilitychange', visible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', visible);
    };
  }, [isIn, messagingEnabled, refresh, refreshRequests]);

  const value = useMemo(
    () => ({ unread, pendingRequests, refresh, refreshRequests, subscribe, streamConnected, freshWhileLive }),
    [unread, pendingRequests, refresh, refreshRequests, subscribe, streamConnected, freshWhileLive],
  );
  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
}

export function useConversationUnread() {
  const ctx = useContext(ConversationContext);
  if (!ctx) throw new Error('useConversationUnread must be used within a ConversationProvider');
  return ctx;
}
