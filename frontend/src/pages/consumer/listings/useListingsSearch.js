import { useCallback, useEffect, useRef, useState } from 'react';
import { searchListings } from '../../../services/propertyService.js';
import { isAbort } from '../../../services/http.js';
import { createSearchCache } from '../../../lib/searchCache.js';

const EMPTY = { items: [], total: 0, verifiedTotal: 0, unstatedTotal: 0, pageCount: 0 };

const cache = createSearchCache({ max: 30, ttl: 60_000 });

const cacheKey = (query, page, size) => JSON.stringify([query, page, size]);

export default function useListingsSearch({ query, relaxedQuery = null, page = 1, size = 24 }) {
  const [state, setState] = useState({ data: EMPTY, status: 'loading', error: null, relaxed: false });
  const [nonce, setNonce] = useState(0);

  const latest = useRef({ query, relaxedQuery });
  latest.current = { query, relaxedQuery };
  const key = JSON.stringify([query, relaxedQuery, page, size]);

  const seq = useRef(0);

  const forceFresh = useRef(false);

  useEffect(() => {
    const { query: q, relaxedQuery: relaxQ } = latest.current;
    if (!q) return undefined;
    const mine = ++seq.current;
    const fresh = forceFresh.current;
    forceFresh.current = false;
    let live = true;
    const ctl = new AbortController();
    setState((prev) => ({ ...prev, status: 'loading', error: null }));

    const run = (wire, wirePage) => cache.read(
      cacheKey(wire, wirePage, size),
      (signal) => searchListings(wire, { page: wirePage, size, signal }),
      { signal: ctl.signal, fresh },
    );

    (async () => {
      try {
        const primary = await run(q, page);
        if (primary.total === 0 && relaxQ) {
          const relaxed = await run(relaxQ, 1);
          if (!live || mine !== seq.current) return;
          if (relaxed.total > 0) {
            setState({ data: relaxed, status: 'ready', error: null, relaxed: true });
            return;
          }
        }
        if (!live || mine !== seq.current) return;
        setState({ data: primary, status: 'ready', error: null, relaxed: false });
      } catch (err) {
        if (isAbort(err)) return;
        if (!live || mine !== seq.current) return;
        setState({ data: EMPTY, status: 'error', error: err, relaxed: false });
      }
    })();

    return () => { live = false; ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` serialises the per-render query objects.
  }, [key, page, size, nonce]);

  const rerun = useCallback(() => {
    forceFresh.current = true;
    setNonce((n) => n + 1);
  }, []);
  return { ...state, retry: rerun, refresh: rerun };
}
