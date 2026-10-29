import { useCallback, useRef, useState } from 'react';

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
