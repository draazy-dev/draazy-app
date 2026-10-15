import { useCallback, useRef } from 'react';

/* Drops a second call while the first is still running, so a double-tap fires one request. */
export function useSingleFlight() {
  const busy = useRef(false);
  return useCallback(async (fn) => {
    if (busy.current) return undefined;
    busy.current = true;
    try {
      return await fn();
    } finally {
      busy.current = false;
    }
  }, []);
}
