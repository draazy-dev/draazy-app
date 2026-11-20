import { useCallback, useLayoutEffect, useRef, useState } from 'react';

const COALESCE_MS = 450;

export function useCommitOnRelease(value, onCommit) {
  const [live, setLive] = useState(null);
  const [seen, setSeen] = useState(value);
  if (!Object.is(seen, value)) {
    setSeen(value);
    setLive(null);
  }

  const commitRef = useRef(null);
  useLayoutEffect(() => {
    commitRef.current = () => { if (live !== null) onCommit(live); };
  });

  const timerRef = useRef(0);
  const flush = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = 0;
    commitRef.current?.();
  }, []);

  const ref = useCallback((el) => {
    if (!el) return undefined;
    const onNativeChange = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, COALESCE_MS);
    };
    el.addEventListener('change', onNativeChange);
    return () => { el.removeEventListener('change', onNativeChange); flush(); };
  }, [flush]);

  return [live ?? value, setLive, {
    ref,
    onBlur: flush,
    onPointerCancel: () => setLive(null),
  }];
}
