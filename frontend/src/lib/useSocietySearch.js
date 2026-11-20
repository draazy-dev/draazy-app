import { useEffect, useState } from 'react';
import { searchSocieties } from '../services/societyService.js';

const DEBOUNCE_MS = 250;

export function useSocietySearch(query, localityLabel = '', enabled = true) {
  const [rows, setRows] = useState([]);
  const [settledFor, setSettledFor] = useState(null);
  const key = `${query}\u0000${localityLabel}`;

  useEffect(() => {
    if (!enabled) {
      setSettledFor(null);
      return undefined;
    }
    let alive = true;
    const t = setTimeout(() => {
      searchSocieties(query, localityLabel)
        .then((next) => {
          if (!alive) return;
          setRows(Array.isArray(next) ? next : []);
          setSettledFor(key);
        })
        .catch(() => { if (alive) setSettledFor(key); });
    }, DEBOUNCE_MS);
    return () => { alive = false; clearTimeout(t); };
  }, [key, query, localityLabel, enabled]);

  return { rows, loading: settledFor !== key };
}
