import { PROVIDER_LOAD_FAILED } from '../lib/seamErrors.js';

export const API_BASE = import.meta.env.VITE_API_BASE || '/api';

if (
  import.meta.env.DEV
  && typeof window !== 'undefined'
  && /^https?:\/\//.test(API_BASE)
  && !API_BASE.startsWith(window.location.origin)
) {
  console.warn(
    `[services] VITE_API_BASE="${API_BASE}" is cross-origin. In dev prefer the relative "/api", ` +
      'which the Vite proxy forwards to the backend, keeping requests same-origin (no CORS, and the ' +
      "page's connect-src 'self' CSP is satisfied).",
  );
}

const cache = new Map();

export function createProvider(domain) {
  return () => {
    let pending = cache.get(domain);
    if (!pending) {
      pending = loadProvider(domain).catch((err) => {
        cache.delete(domain);
        throw err;
      });
      cache.set(domain, pending);
    }
    return pending;
  };
}

function loadProvider(domain) {
  const load = registry[`./providers/http/${domain}Provider.js`];
  if (!load) {
    throw new Error(
      `[services] No provider for domain "${domain}" `
        + `(expected ./providers/http/${domain}Provider.js). Known domains: ${KNOWN_DOMAINS.join(', ')}.`,
    );
  }
  return load().catch((err) => {
    const failure = new Error(`[services] could not load the "${domain}" provider.`, { cause: err });
    failure.code = PROVIDER_LOAD_FAILED;
    throw failure;
  });
}

const registry = import.meta.glob('./providers/http/*Provider.js');

const KNOWN_DOMAINS = Object.keys(registry)
  .map((path) => path.match(/\/([^/]+)Provider\.js$/)?.[1])
  .filter(Boolean)
  .sort();
