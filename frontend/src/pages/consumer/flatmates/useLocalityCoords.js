import { useEffect, useState } from 'react';
import { searchLocalities } from '../../../services/localityService.js';

/* Localities are created on demand, so there is no list to read centres from: each area on screen is looked up by
   name, once per session. */
const lookups = new Map();
const centres = new Map();

const lookup = (name) => {
  if (!lookups.has(name)) {
    lookups.set(name, searchLocalities(name)
      .then((rows) => rows.find((r) => r.name.toLowerCase() === name.toLowerCase() && r.lat != null && r.lng != null))
      .then((r) => { if (r) centres.set(name, [r.lat, r.lng]); })
      .catch(() => { lookups.delete(name); }));
  }
  return lookups.get(name);
};

const known = (list) => Object.fromEntries(list.filter((n) => centres.has(n)).map((n) => [n, centres.get(n)]));

export function useLocalityCoords(names) {
  const key = [...new Set(names.filter(Boolean))].sort().join('|');
  const [coords, setCoords] = useState(() => known(key ? key.split('|') : []));
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    const list = key.split('|');
    Promise.all(list.map(lookup)).then(() => { if (live) setCoords(known(list)); });
    return () => { live = false; };
  }, [key]);
  return coords;
}
