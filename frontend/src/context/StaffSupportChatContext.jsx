import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { openSupportChatStream, supportChatCounts } from '../services/supportService.js';

const StaffSupportChatContext = createContext(null);
const COUNTS_POLL_MS = 60000;
const MAX_WINDOWS = 3;

/** Staff side of support chats: live counts, the change pulse every open chat listens to, and the dock windows. */
export function StaffSupportChatProvider({ enabled, children }) {
  const [counts, setCounts] = useState({ awaiting: 0, mine: 0, all: 0, scope: null });
  const [pulse, setPulse] = useState({ n: 0, userId: null, row: null });
  const [windows, setWindows] = useState([]);
  const alive = useRef(true);

  const refreshCounts = useCallback(async () => {
    try {
      const next = await supportChatCounts();
      if (alive.current) setCounts(next);
    } catch (err) {
      console.warn('[support-chats] could not read counts', err);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return () => { alive.current = false; };
    refreshCounts();
    const timer = setInterval(() => { if (!document.hidden) refreshCounts(); }, COUNTS_POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [enabled, refreshCounts]);

  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    let retry = 1000;
    let timer = null;
    let controller = null;
    const start = () => {
      if (stopped) return;
      controller = new AbortController();
      openSupportChatStream({
        signal: controller.signal,
        onOpen: () => { retry = 1000; },
        onEvent: (event) => {
          if (event.type !== 'chat') return;
          const row = event.data?.userId ? event.data : null;
          setPulse((p) => ({ n: p.n + 1, userId: row?.userId || null, row }));
          refreshCounts();
        },
      }).catch(() => {}).finally(() => {
        controller = null;
        if (stopped) return;
        timer = window.setTimeout(start, retry);
        retry = Math.min(retry * 2, 30000);
      });
    };
    start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [enabled, refreshCounts]);

  const openWindow = useCallback((userId, name, about = null) => {
    const id = String(userId);
    setWindows((ws) => {
      const rest = ws.filter((w) => w.userId !== id);
      return [{ userId: id, name: name || 'Customer', about, minimized: false }, ...rest].slice(0, MAX_WINDOWS);
    });
  }, []);
  const closeWindow = useCallback((userId) => setWindows((ws) => ws.filter((w) => w.userId !== String(userId))), []);
  const toggleWindow = useCallback((userId) => setWindows((ws) => ws.map((w) => (w.userId === String(userId) ? { ...w, minimized: !w.minimized } : w))), []);

  const value = useMemo(() => ({
    enabled, counts, refreshCounts, pulse, windows, openWindow, closeWindow, toggleWindow,
  }), [enabled, counts, refreshCounts, pulse, windows, openWindow, closeWindow, toggleWindow]);
  return <StaffSupportChatContext.Provider value={value}>{children}</StaffSupportChatContext.Provider>;
}

export function useStaffSupportChats() {
  const ctx = useContext(StaffSupportChatContext);
  if (!ctx) throw new Error('useStaffSupportChats must be used within a StaffSupportChatProvider');
  return ctx;
}
