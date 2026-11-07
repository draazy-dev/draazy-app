import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSupportChat, markSupportChatRead, sendSupportChatMessage, supportChatUnreadCount } from '../services/supportService.js';
import { useAuth } from './AuthContext.jsx';
import { useConversationUnread } from './ConversationContext.jsx';

const SupportChatContext = createContext(null);
const STAFF_ROLES = new Set(['admin', 'manager', 'staff']);
const LIVE_POLL_MS = 20000;
const EMPTY = { status: 'none', unread: 0, assignee: null, messages: [], cases: [], at: 0, last: '' };
export const DOCK_QUERY = '(min-width: 1024px)';

export function SupportChatProvider({ children }) {
  const { isIn, role } = useAuth();
  const enabled = isIn && !STAFF_ROLES.has(role);
  const { subscribe } = useConversationUnread();
  const [chat, setChat] = useState(EMPTY);
  const [status, setStatus] = useState('idle');
  const [watchers, setWatchers] = useState(0);
  const [dock, setDock] = useState(null);
  const [unread, setUnreadState] = useState(0);
  const seq = useRef(0);
  const unreadSeq = useRef(0);
  const marking = useRef(false);

  const setUnread = useCallback((n) => {
    unreadSeq.current += 1;
    setUnreadState(n);
  }, []);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const next = await getSupportChat();
      if (mine === seq.current) {
        setChat(next);
        setUnread(next.unread);
        setStatus('ready');
      }
      return next;
    } catch (err) {
      console.warn('[support] could not load the support chat', err);
      if (mine === seq.current) setStatus((s) => (s === 'ready' ? s : 'error'));
      return null;
    }
  }, [setUnread]);

  useEffect(() => {
    if (enabled) return;
    seq.current += 1;
    setChat(EMPTY);
    setUnread(0);
    setStatus('idle');
    setDock(null);
  }, [enabled, setUnread]);

  const watched = enabled && watchers > 0;
  useEffect(() => {
    if (!enabled || watched) return undefined;
    const refreshUnread = () => {
      if (document.hidden) return;
      const mine = ++unreadSeq.current;
      supportChatUnreadCount()
        .then((n) => { if (mine === unreadSeq.current) setUnreadState(n); })
        .catch((err) => console.warn('[support] unread count failed', err));
    };
    refreshUnread();
    window.addEventListener('focus', refreshUnread);
    document.addEventListener('visibilitychange', refreshUnread);
    return () => {
      unreadSeq.current += 1;
      window.removeEventListener('focus', refreshUnread);
      document.removeEventListener('visibilitychange', refreshUnread);
    };
  }, [enabled, watched]);

  useEffect(() => {
    if (!watched) return undefined;
    setStatus((s) => (s === 'idle' ? 'loading' : s));
    reload();
    const timer = setInterval(() => { if (!document.hidden) reload(); }, LIVE_POLL_MS);
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [watched, reload]);

  // A staff reply on desktop surfaces as a minimised dock tab, like any chat app.
  useEffect(() => subscribe((event) => {
    if (event.type !== 'support' || !enabled) return;
    reload();
    if (window.matchMedia?.(DOCK_QUERY).matches) setDock((d) => d || { key: null, minimized: true });
  }), [subscribe, enabled, reload]);

  const watch = useCallback(() => {
    setWatchers((n) => n + 1);
    return () => setWatchers((n) => n - 1);
  }, []);

  const send = useCallback(async (text, about) => {
    const msg = await sendSupportChatMessage(text, about);
    setChat((c) => ({ ...c, status: 'awaiting', messages: [...c.messages, msg], at: msg.at, last: msg.text }));
    reload();
    return msg;
  }, [reload]);

  const markRead = useCallback(async () => {
    if (marking.current) return;
    marking.current = true;
    try {
      await markSupportChatRead();
      setChat((c) => ({ ...c, unread: 0 }));
      setUnread(0);
    } catch (err) {
      console.warn('[support] mark read failed', err);
    } finally {
      marking.current = false;
    }
  }, [setUnread]);

  const openDock = useCallback((key) => setDock({ key: key || null, minimized: false, opened: Date.now() }), []);
  const closeDock = useCallback(() => setDock(null), []);
  const minimizeDock = useCallback((minimized) => setDock((d) => (d ? { ...d, minimized } : d)), []);

  const value = useMemo(() => ({
    enabled, chat, unread, status, reload, watch, send, markRead, dock, openDock, closeDock, minimizeDock,
  }), [enabled, chat, unread, status, reload, watch, send, markRead, dock, openDock, closeDock, minimizeDock]);
  return <SupportChatContext.Provider value={value}>{children}</SupportChatContext.Provider>;
}

/** The user's support chat; `live` keeps it polled while a view of it is on screen. */
export function useSupportChat(live = false) {
  const ctx = useContext(SupportChatContext);
  if (!ctx) throw new Error('useSupportChat must be used within a SupportChatProvider');
  const { watch } = ctx;
  useEffect(() => (live ? watch() : undefined), [live, watch]);
  return ctx;
}
