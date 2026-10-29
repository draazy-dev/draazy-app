import { useCallback, useEffect, useRef, useState } from 'react';
import { feed } from '../../../services/flatmateService.js';
import { isAbort } from '../../../services/http.js';
import { createSearchCache } from '../../../lib/searchCache.js';
import { TAB_MOVE_IN } from './model.js';

const EMPTY = { items: [], total: 0, verifiedTotal: 0, pageCount: 0 };

const cache = createSearchCache({ max: 30, ttl: 60_000 });

const cacheKey = (viewer, tab, filters, page, size) => JSON.stringify([viewer, tab, filters, page, size]);

export default function useFlatmatesSearch({ tab = TAB_MOVE_IN, filters, page = 0, size = 24, viewer = null }) {
  const [state, setState] = useState({
    data: EMPTY, tab, otherCount: null, status: 'loading', error: null, loaded: false,
  });
  const [nonce, setNonce] = useState(0);

  const latest = useRef(filters);
  latest.current = filters;
  const key = JSON.stringify([viewer, tab, filters, page, size]);

  const seq = useRef(0);

  const forceFresh = useRef(false);

  useEffect(() => {
    const f = latest.current;
    if (!f) return undefined;
    const mine = ++seq.current;
    const fresh = forceFresh.current;
    forceFresh.current = false;
    let live = true;
    const ctl = new AbortController();
    setState((prev) => ({ ...prev, status: 'loading', error: null }));

    const run = (wireTab, wirePage, wireSize) => cache.read(
      cacheKey(viewer, wireTab, f, wirePage, wireSize),
      (signal) => feed(wireTab, f, wirePage, wireSize, { signal, auth: viewer == null ? undefined : !!viewer }),
      { signal: ctl.signal, fresh },
    );

    (async () => {
      try {
        const primary = await run(tab, page, size);
        if (!live || mine !== seq.current) return;
        setState({
          data: primary,
          tab,
          otherCount: primary.otherTabTotal ?? null,
          tabTotals: primary.tabTotals ?? null,
          status: 'ready',
          error: null,
          loaded: true,
        });
      } catch (err) {
        if (isAbort(err)) return;
        if (!live || mine !== seq.current) return;
        setState({ data: EMPTY, tab, otherCount: null, status: 'error', error: err, loaded: false });
      }
    })();

    return () => { live = false; ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the.
  }, [key, tab, page, size, nonce]);

  const rerun = useCallback(() => {
    forceFresh.current = true;
    cache.clear();
    setNonce((n) => n + 1);
  }, []);

  const sameTab = state.tab === tab;
  const data = sameTab ? state.data : EMPTY;

  return {
    ...data,
    otherCount: sameTab ? state.otherCount : null,
    tabTotals: state.tabTotals ?? null,
    status: sameTab ? state.status : 'loading',
    error: state.error,
    loaded: sameTab && state.loaded,
    retry: rerun,
    refresh: rerun,
  };
}
