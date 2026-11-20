import { useCallback, useEffect, useRef, useState } from 'react';

export default function useAsyncList(loader, deps, enabled = true) {
  const [state, setState] = useState({ list: [], status: 'loading', error: null });
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  useEffect(() => {
    if (!enabled) { setState({ list: [], status: 'ready', error: null }); return undefined; }
    seq.current += 1;
    const ticket = seq.current;
    const current = () => mounted.current && seq.current === ticket;
    setState((s) => ({ list: s.list, status: 'loading', error: null }));
    loader()
      .then((d) => {
        if (current()) setState({ list: d || [], status: 'ready', error: null });
      })
      .catch((err) => {
        if (current()) setState({ list: [], status: 'error', error: err });
      });
    return () => { seq.current += 1; };
  }, [...deps, enabled, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const setList = useCallback(
    (u) => setState((s) => ({ list: typeof u === 'function' ? u(s.list) : u, status: 'ready', error: null })),
    [],
  );
  const retry = useCallback(() => setNonce((n) => n + 1), []);
  const refresh = useCallback(() => {
    seq.current += 1;
    const ticket = seq.current;
    return loaderRef.current()
      .then((d) => {
        if (mounted.current && seq.current === ticket) {
          setState({ list: d || [], status: 'ready', error: null });
        }
      })
      .catch(() => {});
  }, []);
  return [state.list, state.status, setList, retry, state.error, refresh];
}
