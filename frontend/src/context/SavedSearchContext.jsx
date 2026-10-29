import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createSavedSearch,
  deleteSavedSearch,
  editSavedSearch,
  listSavedSearches,
  setAlertFrequency,
} from '../services/savedSearchService.js';
import { useAuth } from './AuthContext.jsx';

const SavedSearchContext = createContext(null);
const FOREGROUND_RELOAD_MS = 30000;

export function SavedSearchProvider({ children }) {
  const { isIn } = useAuth();
  const [searches, setSearches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(isIn ? 'loading' : 'ready');
  const [error, setError] = useState(null);
  const lastForegroundReload = useRef(0);
  const [wanted, setWanted] = useState(false);
  const want = useCallback(() => setWanted(true), []);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!isIn) {
      setSearches([]);
      setError(null);
      setStatus('ready');
      return [];
    }
    if (!silent) {
      setLoading(true);
      setStatus('loading');
    }
    const next = await listSavedSearches();
    setSearches(next);
    setError(null);
    setStatus('ready');
    if (!silent) setLoading(false);
    return next;
  }, [isIn]);

  useEffect(() => {
    if (!isIn) {
      setSearches([]);
      setError(null);
      setStatus('ready');
      return undefined;
    }
    if (!wanted) return undefined;
    let alive = true;
    setLoading(true);
    setStatus('loading');
    listSavedSearches()
      .then((next) => {
        if (!alive) return;
        setSearches(next);
        setError(null);
        setStatus('ready');
      })
      .catch((err) => {
        if (!alive) return;
        setError(err);
        setStatus('error');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [isIn, wanted]);

  useEffect(() => {
    if (!isIn || !wanted) return undefined;
    const maybeReload = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastForegroundReload.current < FOREGROUND_RELOAD_MS) return;
      lastForegroundReload.current = now;
      refresh({ silent: true }).catch(() => {});
    };
    document.addEventListener('visibilitychange', maybeReload);
    window.addEventListener('focus', maybeReload);
    return () => {
      document.removeEventListener('visibilitychange', maybeReload);
      window.removeEventListener('focus', maybeReload);
    };
  }, [isIn, wanted, refresh]);

  const create = useCallback(async (record) => {
    const created = await createSavedSearch(record);
    if (created) {
      setSearches((prev) => [created, ...prev.filter((s) => s.id !== created.id)]);
      setError(null);
      setStatus('ready');
    }
    return created;
  }, []);

  const edit = useCallback(async (id, record) => {
    const updated = await editSavedSearch(id, record);
    setSearches((prev) => prev.map((s) => (s.id === id ? updated : s)));
    return updated;
  }, []);

  const reload = useCallback(async () => {
    try {
      return await refresh();
    } catch (err) {
      setError(err);
      setStatus('error');
      setLoading(false);
      throw err;
    }
  }, [refresh]);

  const setFrequency = useCallback(async (id, frequency) => {
    let previous;
    setSearches((prev) => prev.map((s) => {
      if (s.id !== id) return s;
      previous = s;
      return { ...s, alertFrequency: frequency, alerts: frequency !== 'off' };
    }));
    try {
      await setAlertFrequency(id, frequency);
    } catch {
      setSearches((prev) => prev.map((s) => (s.id === id && previous ? previous : s)));
    }
  }, []);

  const remove = useCallback(async (id) => {
    const snapshot = searches;
    setSearches((prev) => prev.filter((s) => s.id !== id));
    try {
      await deleteSavedSearch(id);
    } catch {
      setSearches(snapshot);
    }
  }, [searches]);

  const value = useMemo(
    () => ({ searches, count: searches.length, loading, status, error, want, create, edit, setFrequency, remove, reload, refresh: reload }),
    [searches, loading, status, error, want, create, edit, setFrequency, remove, reload],
  );
  return <SavedSearchContext.Provider value={value}>{children}</SavedSearchContext.Provider>;
}

export function useSavedSearches() {
  const ctx = useContext(SavedSearchContext);
  const want = ctx?.want;
  useEffect(() => { want?.(); }, [want]);
  return ctx ?? EMPTY;
}

export function useSavedSearchCreate() {
  return (useContext(SavedSearchContext) ?? EMPTY).create;
}

const EMPTY = {
  searches: [],
  count: 0,
  loading: false,
  status: 'ready',
  error: null,
  create: async () => null,
  edit: async () => null,
  setFrequency: async () => {},
  remove: async () => {},
  reload: async () => [],
  refresh: async () => [],
};
