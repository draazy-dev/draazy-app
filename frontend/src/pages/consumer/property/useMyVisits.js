import { useCallback, useEffect, useRef, useState } from 'react';
import { listVisits } from '../../../services/visitService.js';

const LIVE = new Set(['scheduled', 'confirmed']);

// Any live visit counts, lapsed slot or not: the server refuses a second booking until it is closed out.
function summarise(visits) {
  return { booked: visits.find((v) => LIVE.has(v.status)) || null, completed: visits.some((v) => v.status === 'completed') };
}

/** The signed-in caller's own visits on one listing; `null` until read or when `identity` is falsy. */
export function useMyVisits(propertyId, identity) {
  const [read, setRead] = useState(null);
  const latest = useRef(0);
  const key = identity && propertyId ? `${identity}|${propertyId}` : null;

  const refresh = useCallback(() => {
    const ask = ++latest.current;
    if (!key) return;
    listVisits({ propertyId })
      .then((rows) => { if (ask === latest.current) setRead({ key, visits: summarise(rows) }); })
      // Keeps the last good read: dropping it would re-offer booking a visit that is already booked.
      .catch(() => {});
  }, [key, propertyId]);

  useEffect(() => {
    refresh();
    return () => { latest.current += 1; };
  }, [refresh]);

  return { visits: read?.key === key ? read.visits : null, refresh };
}
