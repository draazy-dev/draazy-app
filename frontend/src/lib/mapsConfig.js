/* Shared config for the Google Maps display components (PropertyMap, FlatmateMap).
   The key lives in .env (VITE_GOOGLE_MAPS_API_KEY), never hardcoded here. */

export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

// Advanced (HTML) markers require a Map ID. DEMO_MAP_ID is Google's public test
// id; set VITE_GOOGLE_MAPS_MAP_ID to a cloud-styled id in production.
export const GOOGLE_MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

// The public DEMO_MAP_ID lacks boundary feature layers, so callers check this before attempting the highlight.
export const GOOGLE_MAPS_HAS_DDS = !!GOOGLE_MAPS_MAP_ID && GOOGLE_MAPS_MAP_ID !== 'DEMO_MAP_ID';

// Pune fallback center, matching the old Leaflet BASE.
export const PUNE_CENTER = { lat: 18.553, lng: 73.86 };

// A map takes its scheme when constructed; the switch lives in Settings, which renders no map.
export const mapColorScheme = () => (document.documentElement.classList.contains('light') ? 'LIGHT' : 'DARK');

let mapsRefused = false;
const refusalListeners = new Set();
export const subscribeMapsRefusal = (fn) => { refusalListeners.add(fn); return () => refusalListeners.delete(fn); };
export const isMapsRefused = () => mapsRefused;

/* Google's dynamic-import bootstrap: the ~800 KB SDK loads on the first importLibrary call, not on every page.
   Each map's APIProvider finds importLibrary defined and reuses it. */
export function installMapsLoader() {
  if (!GOOGLE_MAPS_API_KEY) return;
  // Google calls this once per page when it refuses the key (referrer, billing, quota), then paints its own error box.
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
