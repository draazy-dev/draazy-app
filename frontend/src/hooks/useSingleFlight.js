import { useCallback, useRef } from 'react';

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
