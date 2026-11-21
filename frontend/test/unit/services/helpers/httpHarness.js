import { vi } from 'vitest';

export async function loadHttp() {
  vi.resetModules();
  const auth = await import('../../../../src/lib/auth.js');
  const http = await import('../../../../src/services/http.js');
  const { API_BASE } = await import('../../../../src/services/config.js');
  return { auth, http, API_BASE };
}

export function reply(status, body, headers = {}) {
  const noBody = status === 204 || body === undefined;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(noBody ? null : text, { status, headers });
}

export function installFetch() {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function clearBrowserState() {
  localStorage.clear();
  sessionStorage.clear();
  for (const name of ['__Host-draazy_session', 'draazy_session']) {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
  delete globalThis.__dzBootstrap;
  delete globalThis.__dzMeBootstrap;
}

export function stubLocks(impl) {
  Object.defineProperty(navigator, 'locks', { value: { request: vi.fn(impl) }, configurable: true });
  return navigator.locks;
}

export function removeLocks() {
  Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
}

export const headersOf = (call) => call[1].headers;
