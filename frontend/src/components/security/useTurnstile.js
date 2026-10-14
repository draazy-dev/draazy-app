import { useCallback, useRef, useState } from 'react';

/** Turnstile tokens are single-use: `spend` hands the current one over and remounts the widget (`key={round}`)
 * for a fresh challenge, so a Resend never replays a token the server has already consumed. */
export function useTurnstile() {
  const token = useRef(null);
  const [round, setRound] = useState(0);
  const onToken = useCallback((tok) => { token.current = tok; }, []);
  const spend = useCallback(() => {
    const spent = token.current;
    token.current = null;
    setRound((n) => n + 1);
    return spent;
  }, []);
  return { round, onToken, spend };
}
