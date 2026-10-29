import { useCallback, useEffect, useState } from 'react';
import { getEntitlements } from '../../../services/entitlementService.js';
import { fmtDate } from '../../../lib/format.js';

export function useEntitlements(enabled = true) {
  const [entitlements, setEntitlements] = useState(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setEntitlements(null);
      return null;
    }
    try {
      const next = await getEntitlements();
      setEntitlements(next);
      return next;
    } catch {
      setEntitlements(null);
      return null;
    }
  }, [enabled]);

  useEffect(() => {
    let alive = true;
    if (!enabled) {
      setEntitlements(null);
      return undefined;
    }
    getEntitlements()
      .then((next) => { if (alive) setEntitlements(next); })
      .catch(() => { if (alive) setEntitlements(null); });
    return () => { alive = false; };
  }, [enabled]);

  return { entitlements, refresh };
}

export const contactsLeft = (entitlements) => {
  const c = entitlements?.contacts;
  if (!c || c.unlimited) return null;
  return Number.isFinite(c.remaining) ? c.remaining : null;
};

export const freeContactsTill = (entitlements) => {
  const at = entitlements?.contacts?.freeWindowEndsAt;
  return at && new Date(at).getTime() > Date.now() ? fmtDate(at) : '';
};
