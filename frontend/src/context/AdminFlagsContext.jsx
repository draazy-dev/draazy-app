import { createContext, useCallback, useContext, useEffect, useState, useMemo } from 'react';
import { getAdminFlags, updateSettings } from '../services/settingsService.js';

const AdminFlagsContext = createContext(null);

const DEFAULT_ADMIN_FLAGS = {
  tab: { analytics: true, finance: true, reports: true, support: true, flatmates: true },
  properties: { csvExport: true },
  users: { csvExport: true },
  services: { enabled: true },
  content: { enabled: true },
  staffActivity: { enabled: true },
};

export function AdminFlagsProvider({ children }) {
  const [adminFlags, setAdminFlags] = useState(DEFAULT_ADMIN_FLAGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () => getAdminFlags().then((flags) => {
      if (!alive) return;
      setAdminFlags((prev) => deepMerge(prev, flags));
      setLoading(false);
    }).catch(() => {
      if (alive) setLoading(false);
    });
    load();
    const onChange = () => load();
    window.addEventListener('draazy-settings-change', onChange);
    return () => { alive = false; window.removeEventListener('draazy-settings-change', onChange); };
  }, []);

  const setFlag = useCallback(async (section, key, value) => {
    setAdminFlags((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
    await updateSettings({ adminFlags: { [section]: { [key]: value } } });
  }, []);

  const tabEnabled = useCallback(
    (tabKey) => adminFlags.tab?.[tabKey] !== false,
    [adminFlags.tab],
  );

  const optionEnabled = useCallback((dotPath) => {
    const [section, option] = dotPath.split('.');
    if (section in DEFAULT_ADMIN_FLAGS.tab && adminFlags.tab?.[section] === false) {
      return false;
    }
    const sectionFlags = adminFlags[section];
    if (sectionFlags && 'enabled' in sectionFlags && !sectionFlags.enabled) {
      return false;
    }
    return sectionFlags?.[option] !== false;
  }, [adminFlags]);

  const value = useMemo(
    () => ({ adminFlags, tabEnabled, optionEnabled, setFlag, loading }),
    [adminFlags, tabEnabled, optionEnabled, setFlag, loading],
  );

  return (
    <AdminFlagsContext.Provider value={value}>
      {children}
    </AdminFlagsContext.Provider>
  );
}

export function useAdminFlags() {
  const ctx = useContext(AdminFlagsContext);
  if (!ctx) throw new Error('useAdminFlags must be used within AdminFlagsProvider');
  return ctx;
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'constructor') continue;
    if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
      result[key] = { ...(target[key] || {}), ...source[key] };
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
