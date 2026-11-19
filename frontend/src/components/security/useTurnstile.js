import { useCallback, useRef, useState } from 'react';
import { createTokenSlot, sendWithToken } from './turnstileToken.js';

const SITE_KEY = import.meta.env?.VITE_TURNSTILE_SITE_KEY;

export function useTurnstile() {
  const slot = useRef(null);
  if (!slot.current) slot.current = createTokenSlot();
  const [round, setRound] = useState(0);

  const onToken = useCallback((tok) => slot.current.put(tok), []);

  const remount = useCallback(() => {
    slot.current.restarted();
    setRound((n) => n + 1);
  }, []);

  const spend = useCallback(async () => {
    if (!SITE_KEY) return null;
    if (slot.current.needsRestart()) remount();
    const tok = await slot.current.take();
    remount();
    return tok;
  }, [remount]);

  const withToken = useCallback((request) => sendWithToken(spend, request), [spend]);

  return { round, onToken, withToken };
}
