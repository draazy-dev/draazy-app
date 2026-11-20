import { useCallback, useEffect, useRef, useState } from 'react';
import { listVisits } from '../../../services/visitService.js';
import { REVISIT_MAX_AGE } from '../../../services/http.js';

const LIVE = new Set(['scheduled', 'confirmed']);

function summarise(visits) {
  return { booked: visits.find((v) => LIVE.has(v.status)) || null, completed: visits.some((v) => v.status === 'completed') };
}

export function useMyVisits(propertyId, identity) {
  const [read, setRead] = useState(null);
  const latest = useRef(0);
  const key = identity && propertyId ? `${identity}|${propertyId}` : null;

  const refresh = useCallback((opts) => {
    const ask = ++latest.current;
    if (!key) return;
    listVisits({ propertyId, ...opts })
      .then((rows) => { if (ask === latest.current) setRead({ key, visits: summarise(rows) }); })
      .catch(() => {});
  }, [key, propertyId]);

  useEffect(() => {
    refresh({ maxAge: REVISIT_MAX_AGE });
    return () => { latest.current += 1; };
  }, [refresh]);

  return { visits: read?.key === key ? read.visits : null, refresh };
}
