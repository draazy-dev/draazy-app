import { useCallback, useEffect, useState } from 'react';
import { listLeads } from '../../../services/leadService.js';
import { userMessage } from '../../../lib/userMessage.js';

export const PAGE_SIZE = 20;

export function useLeadList({ view, q, stage, type, page, enabled }) {
  const [state, setState] = useState({ status: 'loading', items: [], total: 0, counts: null, error: '' });
  const [reloading, setReloading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [lastCounts, setLastCounts] = useState(null);

  const load = useCallback(() => {
    if (!enabled) return undefined;
    let live = true;
    setReloading(true);
    listLeads({ view, q, stage, type, page, size: PAGE_SIZE })
      .then((res) => {
        if (!live) return;
        if (res.counts) setLastCounts(res.counts);
        setState({ status: 'ready', items: res.items, total: res.total, counts: res.counts, error: '' });
        setReloading(false);
      })
      .catch((e) => {
        if (!live) return;
        setState({ status: 'error', items: [], total: 0, counts: null, error: userMessage(e, 'Could not read the leads.') });
        setReloading(false);
      });
    return () => { live = false; };
  }, [enabled, view, q, stage, type, page]);

  useEffect(load, [load, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { state, counts: lastCounts, reloading, reload };
}
