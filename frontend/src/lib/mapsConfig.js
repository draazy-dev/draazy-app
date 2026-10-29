export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export const GOOGLE_MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

export const GOOGLE_MAPS_HAS_DDS = !!GOOGLE_MAPS_MAP_ID && GOOGLE_MAPS_MAP_ID !== 'DEMO_MAP_ID';

export const PUNE_CENTER = { lat: 18.553, lng: 73.86 };

export const mapColorScheme = () => (document.documentElement.classList.contains('light') ? 'LIGHT' : 'DARK');

let mapsRefused = false;
const refusalListeners = new Set();
export const subscribeMapsRefusal = (fn) => { refusalListeners.add(fn); return () => refusalListeners.delete(fn); };
export const isMapsRefused = () => mapsRefused;

export function installMapsLoader() {
  if (!GOOGLE_MAPS_API_KEY) return;
  const prevAuthFailure = window.gm_authFailure;
  window.gm_authFailure = () => {
    mapsRefused = true;
    refusalListeners.forEach((fn) => fn());
    if (typeof prevAuthFailure === 'function') prevAuthFailure();
  };
  const maps = ((window.google ||= {}).maps ||= {});
  if (maps.importLibrary) return;
  let sdk;
  maps.importLibrary = (...args) => {
    sdk ||= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?' +
        new URLSearchParams({ key: GOOGLE_MAPS_API_KEY, v: 'weekly', callback: 'google.maps.__ib__' });
      maps.__ib__ = resolve;
      s.onerror = () => { sdk = null; reject(new Error('Google Maps JS could not load')); };
      document.head.append(s);
    });
    return sdk.then(() => maps.importLibrary(...args));
  };
}
