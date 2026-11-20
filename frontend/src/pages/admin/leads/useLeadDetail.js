import { useCallback, useEffect, useRef, useState } from 'react';
import { getLead } from '../../../services/leadService.js';
import { leadError } from './leadsFormat.js';

const STALE_CODES = ['lead-owned', 'lead-closed', 'lead-cooldown'];

export function useLeadDetail(id, { toast, onChanged }) {
  const [state, setState] = useState({ status: 'loading', lead: null });
  const [busy, setBusy] = useState(false);
  const working = useRef(false);

  const reload = useCallback(() => getLead(id)
    .then((lead) => setState({ status: 'ready', lead }))
    .catch((e) => setState((s) => (s.lead ? s : { status: 'error', lead: null, error: leadError(e) }))), [id]);

  useEffect(() => {
    let live = true;
    getLead(id)
      .then((lead) => live && setState({ status: 'ready', lead }))
      .catch((e) => live && setState({ status: 'error', lead: null, error: leadError(e) }));
    return () => { live = false; };
  }, [id]);

  const act = useCallback(async (fn, success) => {
    if (working.current) return false;
    working.current = true;
    setBusy(true);
    try {
      const next = await fn();
      if (next) setState({ status: 'ready', lead: next });
      else await reload();
      if (success) toast(success);
      onChanged();
      return true;
    } catch (e) {
      toast(leadError(e), 'error');
      if (STALE_CODES.includes(e?.code) || e?.status === 403) {
        await reload();
        onChanged();
      }
      return false;
    } finally {
      working.current = false;
      setBusy(false);
    }
  }, [onChanged, reload, toast]);

  return { ...state, busy, act };
}
