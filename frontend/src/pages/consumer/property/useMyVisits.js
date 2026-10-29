import { useCallback, useEffect, useRef, useState } from 'react';
import { listVisits } from '../../../services/visitService.js';

const LIVE = new Set(['scheduled', 'confirmed']);

function summarise(visits) {
  return { booked: visits.find((v) => LIVE.has(v.status)) || null, completed: visits.some((v) => v.status === 'completed') };
}

export function useMyVisits(propertyId, identity) {
  const [read, setRead] = useState(null);
  const latest = useRef(0);
  const key = identity && propertyId ? `${identity}|${propertyId}` : null;

  const refresh = useCallback(() => {
    const ask = ++latest.current;
    if (!key) return;
    listVisits({ propertyId })
      .then((rows) => { if (ask === latest.current) setRead({ key, visits: summarise(rows) }); })
      .catch(() => {});
  }, [key, propertyId]);

  useEffect(() => {
    refresh();
    return () => { latest.current += 1; };
  }, [refresh]);

  return { visits: read?.key === key ? read.visits : null, refresh };
}
