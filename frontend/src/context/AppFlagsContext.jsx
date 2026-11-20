import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getAppFlags } from '../services/settingsService.js';

const AppFlagsContext = createContext(null);

export function AppFlagsProvider({ children }) {
  const [flags, setFlags] = useState({});

  useEffect(() => {
    let generation = 0;

    const sync = async () => {
      const mine = ++generation;
      try {
        const next = await getAppFlags();
        if (mine === generation) setFlags(next && typeof next === 'object' ? next : {});
      } catch {
      }
    };

    sync();
    window.addEventListener('draazy-settings-change', sync);
    window.addEventListener('storage', sync);
    return () => {
      generation += 1;
      window.removeEventListener('draazy-settings-change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const flagEnabled = useCallback((key) => flags[key] !== false, [flags]);

  const value = useMemo(() => ({ flagEnabled, flags }), [flagEnabled, flags]);

  return (
    <AppFlagsContext.Provider value={value}>
      {children}
    </AppFlagsContext.Provider>
  );
}

export function useAppFlags() {
  const ctx = useContext(AppFlagsContext);
  if (!ctx) throw new Error('useAppFlags must be used within AppFlagsProvider');
  return ctx;
}
