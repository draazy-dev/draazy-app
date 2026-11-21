import { beforeEach, afterEach, vi } from 'vitest';
import { API_BASE } from '../../../../src/services/config.js';
import { clearReads } from '../../../../src/services/http.js';
import { logoutUser, writeTokens } from '../../../../src/lib/auth.js';

const isSpec = (v) => v && typeof v === 'object' && '__spec' in v;

export const status = (code, body, headers) => ({ __spec: true, status: code, body, headers });

function respond({ status: code = 200, body, raw, headers = {} }) {
  if (code === 204) return new Response(null, { status: code, headers });
  let text = '';
  if (body !== undefined) text = raw ? body : JSON.stringify(body);
  return new Response(text, { status: code, headers });
}

// An empty reply queue answers 200 with no body; on(fn) routes by call instead of the queue.
export function setupFetch({ signedIn = false } = {}) {
  const net = { calls: [], queue: [], handler: null };

  net.reply = (body) => { net.queue.push(isSpec(body) ? body : { __spec: true, status: 200, body }); return net; };
  net.fail = (err) => { net.queue.push({ error: err }); return net; };
  net.on = (fn) => { net.handler = fn; return net; };
  net.last = () => net.calls[net.calls.length - 1];
  net.fresh = clearReads;

  beforeEach(() => {
    net.calls = [];
    net.queue = [];
    net.handler = null;
    clearReads();
    localStorage.clear();
    sessionStorage.clear();
    if (signedIn) writeTokens({ accessToken: 'tok-1' });
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      const [path, search = ''] = String(url).slice(API_BASE.length).split('?');
      const params = new URLSearchParams(search);
      let body = init.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { /* keep text */ }
      }
      const call = {
        path, search, params, query: Object.fromEntries(params), method: init.method, headers: init.headers || {}, body, init,
      };
      net.calls.push(call);
      let spec = net.handler ? net.handler(call) : net.queue.shift();
      if (spec?.error) throw spec.error;
      if (!isSpec(spec)) spec = { status: 200, body: spec ?? undefined };
      return respond(spec);
    }));
  });

  afterEach(() => {
    logoutUser();
    vi.unstubAllGlobals();
  });

  return net;
}
