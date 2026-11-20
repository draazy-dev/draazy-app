import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { followSociety, listFollowedSocieties, unfollowSociety } from '../services/societyService.js';
import { useAuth } from './AuthContext.jsx';

const FollowContext = createContext(null);

const LOCAL_KEY = 'dzLocalSocietyFollows';

const readLocal = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
};

const writeLocal = (slugs) => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(slugs));
  } catch {
  }
};

export function FollowProvider({ children }) {
  const { isIn } = useAuth();
  const [slugs, setSlugs] = useState(() => new Set());
  const [rows, setRows] = useState(() => new Map());
  const [loading, setLoading] = useState(false);
  const [writes, setWrites] = useState(0);
  const settledWrites = useRef(0);
  const [wanted, setWanted] = useState(false);
  const want = useCallback(() => setWanted(true), []);

  const promote = useCallback(async (pending) => {
    if (!pending.length) return pending;
    const settled = await Promise.all(pending.map(async (slug) => {
      try {
        await followSociety(slug);
        return null;
      } catch {
        return slug;
      }
    }));
    const still = settled.filter(Boolean);
    if (still.length !== pending.length) writeLocal(still);
    return still;
  }, []);

  const loadAll = useCallback(async () => {
    const still = await promote(readLocal());
    let seen;
    let remote;
    do {
      seen = settledWrites.current;
      remote = await listFollowedSocieties();
    } while (seen !== settledWrites.current);
    const next = new Set([...remote.map((r) => r.slug), ...still]);
    setRows(new Map(remote.map((r) => [r.slug, r])));
    setSlugs(next);
    return next;
  }, [promote]);

  const refreshRows = useCallback(async () => {
    const remote = await listFollowedSocieties();
    setRows(new Map(remote.map((r) => [r.slug, r])));
  }, []);

  useEffect(() => {
    if (!isIn) {
      setSlugs(new Set());
      setRows(new Map());
      return undefined;
    }
    if (!wanted) return undefined;
    let alive = true;
    setLoading(true);
    loadAll()
      .catch(() => { if (alive) setSlugs(new Set()); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [isIn, wanted, loadAll]);

  const has = useCallback((slug) => slugs.has(slug), [slugs]);

  const toggle = useCallback(async (slug) => {
    if (!slug) return false;
    const wasFollowed = slugs.has(slug);
    const next = !wasFollowed;
    const mark = (on) => setSlugs((prev) => {
      const copy = new Set(prev);
      if (on) copy.add(slug); else copy.delete(slug);
      return copy;
    });

    mark(next);
    setWrites((n) => n + 1);
    try {
      if (next) await followSociety(slug); else await unfollowSociety(slug);
      settledWrites.current += 1;
      mark(next);
      const local = readLocal();
      if (local.includes(slug)) writeLocal(local.filter((s) => s !== slug));
      return next;
    } catch {
      const local = readLocal();
      if (local.includes(slug)) writeLocal(local.filter((s) => s !== slug));
      mark(!next);
      return !next;
    } finally {
      setWrites((n) => n - 1);
    }
  }, [slugs]);

  const value = useMemo(
    () => ({ slugs, rows, count: slugs.size, loading, busy: writes > 0, want, has, toggle, refresh: loadAll, refreshRows }),
    [slugs, rows, loading, writes, want, has, toggle, loadAll, refreshRows],
  );
  return <FollowContext.Provider value={value}>{children}</FollowContext.Provider>;
}

export function useFollows() {
  const ctx = useContext(FollowContext);
  const want = ctx?.want;
  useEffect(() => { want?.(); }, [want]);
  return ctx ?? EMPTY;
}

const EMPTY = {
  slugs: new Set(),
  rows: new Map(),
  count: 0,
  loading: false,
  busy: false,
  has: () => false,
  toggle: async () => false,
  refresh: async () => new Set(),
  refreshRows: async () => {},
};
