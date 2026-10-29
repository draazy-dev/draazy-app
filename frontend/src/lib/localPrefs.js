import { myMobile } from './contact.js';

const read = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pn:store', { detail: { key } }));
  } catch {
  }
  return value;
};

const APP_PREF_KEY = 'dzAppPrefs';

export const getAppPrefs = () => ({ reduceMotion: false, theme: 'light', ...(read(APP_PREF_KEY, {}) || {}) });

export const setAppPrefs = (patch) => {
  const next = { ...getAppPrefs(), ...patch };
  write(APP_PREF_KEY, next);
  applyAppPrefs(next);
  return next;
};

export const applyAppPrefs = (prefs = getAppPrefs()) => {
  if (typeof document === 'undefined') return prefs;
  const root = document.documentElement;
  root.classList.toggle('dz-reduce-motion', !!prefs.reduceMotion);
  root.classList.toggle('light', prefs.theme === 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', prefs.theme === 'light' ? '#f3f7f6' : '#0f0d1a');
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', prefs.theme === 'light' ? 'light' : 'dark');
  const icon = document.querySelector('link[rel="icon"][data-light]');
  if (icon) {
    icon.dataset.dark ||= icon.href;
    icon.href = prefs.theme === 'light' ? icon.dataset.light : icon.dataset.dark;
  }
  return prefs;
};

const recentPropsKey = () => 'dzRecentProps:' + (myMobile() || 'anon');
export const getRecentProps = () => read(recentPropsKey(), []);
export const pushRecentProp = (id) => {
  if (!id) return getRecentProps();
  const arr = getRecentProps().filter((x) => x !== id);
  arr.unshift(id);
  return write(recentPropsKey(), arr.slice(0, 8));
};

const recentSearchKey = () => 'dzRecentSearches:' + (myMobile() || 'anon');
export const getRecentSearches = () => read(recentSearchKey(), []);
export const pushRecentSearch = (rec) => {
  if (!rec || !rec.label || !rec.url) return getRecentSearches();
  const arr = getRecentSearches().filter((s) => s.url !== rec.url);
  arr.unshift({ label: rec.label, url: rec.url, at: Date.now() });
  return write(recentSearchKey(), arr.slice(0, 6));
};

const LAST_SEARCH_KEY = 'draazyLastSearch';
export const setLastSearch = (ctx) => {
  try { sessionStorage.setItem(LAST_SEARCH_KEY, JSON.stringify(ctx)); } catch { }
};
export const getLastSearch = () => {
  try { return JSON.parse(sessionStorage.getItem(LAST_SEARCH_KEY)); } catch { return null; }
};
