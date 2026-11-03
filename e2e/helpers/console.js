// Network noise is judged by whose server failed (location().url), not by wording.
const APP_ORIGIN = (() => {
  try {
    return new URL(process.env.BASE_URL || 'http://localhost:5173').origin;
  } catch {
    return 'http://localhost:5173';
  }
})();

// Hostnames or library banners only: bare words like `ERR_` or `maps` would hide real app errors.
export const IGNORE =
  /favicon|leaflet|unpkg\.com|tile\.|openstreetmap|maptiler|googleapis|gstatic|developers\.google\.com|unsplash|cdn\.|React DevTools/i;

/** Chromium's wording for "a resource did not load", including `net::ERR_*` causes. */
const RESOURCE_FAILURE = /^Failed to load resource|net::ERR_/i;

// HMR transport only: the socket drops when another session restarts the dev server; compile errors still fail.
const VITE_HMR = new RegExp(
  '\\[vite\\] (?:connecting|server connection lost|failed to connect to websocket)'
    + `|WebSocket connection to 'wss?://${APP_ORIGIN.replace(/^https?:\/\//, '').replace(/[.:]/g, '\\$&')}`,
  'i',
);

// A fetch rejection has no URL, so trackErrors attributes it via requestfailed bookkeeping.
const NETWORK_REJECTION =
  /^(?:Uncaught \(in promise\) )?(?:TypeError: )?(?:Failed to fetch|NetworkError when attempting to fetch resource\.?|Load failed)$/i;

const isAppOrigin = (url) => typeof url === 'string' && url.startsWith(APP_ORIGIN);

export function trackErrors(page) {
  const errors = [];

  let externalRequestFailures = 0;
  let appRequestFailures = 0;
  page.on('requestfailed', (r) => {
    if (isAppOrigin(r.url())) appRequestFailures += 1;
    else externalRequestFailures += 1;
  });

  page.on('pageerror', (e) => {
    const text = e.message;
    if (IGNORE.test(text) || VITE_HMR.test(text)) return;
    if (NETWORK_REJECTION.test(text) && externalRequestFailures > 0 && appRequestFailures === 0) return;
    errors.push(text);
  });

  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (IGNORE.test(text) || VITE_HMR.test(text)) return;
    if (RESOURCE_FAILURE.test(text)) {
      // Chromium names the failed resource only in location().url; IGNORE covers our own /favicon.ico.
      const url = m.location()?.url;
      if (!isAppOrigin(url) || IGNORE.test(url)) return;
    }
    errors.push(text);
  });

  return errors;
}
