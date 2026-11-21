// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../../../functions/api/[[path]].js';

const ENV = { API_ORIGIN: 'https://api.example.com', ORIGIN_SHARED_SECRET: 'shh' };

const call = (path, { env = ENV, init = {}, ip = '1.2.3.4', waitUntil = vi.fn() } = {}) => {
  const headers = new Headers(init.headers);
  if (ip) headers.set('CF-Connecting-IP', ip);
  const request = new Request(`https://draazy.com${path}`, { ...init, headers });
  return onRequest({ request, env, waitUntil });
};

const stubUpstream = (answer = () => new Response('{"ok":true}', { status: 200 })) => {
  const fetchMock = vi.fn(async () => answer());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api proxy configuration guards', () => {
  it.each([
    ['unset', undefined],
    ['http scheme', 'http://api.example.com'],
    ['with a path', 'https://api.example.com/v1'],
    ['with a userinfo', 'https://user@api.example.com'],
    ['not a url', 'api.example.com'],
  ])('returns 502 when API_ORIGIN is %s', async (_label, origin) => {
    const fetchMock = stubUpstream();
    const res = await call('/api/x', { env: { ...ENV, API_ORIGIN: origin } });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('api_proxy_misconfigured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts an origin with a port and trailing slashes', async () => {
    const fetchMock = stubUpstream();
    const res = await call('/api/x', { env: { ...ENV, API_ORIGIN: ' https://api.example.com:8443// ' } });
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.example.com:8443/api/x');
  });

  it.each([undefined, '', '   '])('returns 502 when ORIGIN_SHARED_SECRET is %j', async (secret) => {
    const fetchMock = stubUpstream();
    const res = await call('/api/x', { env: { ...ENV, ORIGIN_SHARED_SECRET: secret } });
    expect(res.status).toBe(502);
    expect((await res.json()).message).toContain('ORIGIN_SHARED_SECRET');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses requests without CF-Connecting-IP', async () => {
    const fetchMock = stubUpstream();
    const res = await call('/api/x', { ip: null });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('api_proxy_no_client_ip');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('api proxy path handling', () => {
  it.each(['/apiary', '/other/api/x', '/apix'])('returns 404 for %s', async (path) => {
    const fetchMock = stubUpstream();
    const res = await call(path);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxies /api itself', async () => {
    const fetchMock = stubUpstream();
    await call('/api');
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.example.com/api');
  });

  it('preserves the path and query string and never follows redirects', async () => {
    const fetchMock = stubUpstream();
    await call('/api/properties/42?size=10&page=2');
    const [target, init] = fetchMock.mock.calls[0];
    expect(String(target)).toBe('https://api.example.com/api/properties/42?size=10&page=2');
    expect(init.redirect).toBe('manual');
    expect(init.method).toBe('GET');
  });

  it('does not let a crafted path escape to another host', async () => {
    const fetchMock = stubUpstream();
    await call('/api//evil.com/x');
    expect(new URL(fetchMock.mock.calls[0][0]).host).toBe('api.example.com');
  });
});

describe('api proxy request headers', () => {
  it('strips spoofable forwarding headers and sets trusted ones', async () => {
    const fetchMock = stubUpstream();
    await call('/api/x', {
      init: {
        headers: {
          Forwarded: 'for=6.6.6.6',
          'X-Real-IP': '6.6.6.6',
          'True-Client-IP': '6.6.6.6',
          'X-Client-IP': '6.6.6.6',
          'X-Forwarded-Port': '1',
          'X-Forwarded-Prefix': '/evil',
          'X-Forwarded-SSL': 'off',
          'X-Original-URL': '/admin',
          'X-Rewrite-URL': '/admin',
          'CF-IPCountry': 'XX',
          'CF-Ray': 'abc',
          'CF-Visitor': '{"scheme":"http"}',
          'CF-Worker': 'evil.example',
          'X-Forwarded-For': '6.6.6.6',
          'X-Forwarded-Host': 'evil.example',
          'X-Forwarded-Proto': 'http',
          'X-Proxy-Auth': 'guessed-secret',
          Accept: 'application/json',
          Authorization: 'Bearer t',
          Cookie: 'sid=1',
        },
      },
    });
    const sent = fetchMock.mock.calls[0][1].headers;
    for (const name of ['forwarded', 'x-real-ip', 'true-client-ip', 'x-client-ip', 'x-forwarded-port', 'x-forwarded-prefix',
      'x-forwarded-ssl', 'x-original-url', 'x-rewrite-url', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'cf-worker']) {
      expect(sent.has(name), name).toBe(false);
    }
    expect(sent.get('x-forwarded-for')).toBe('1.2.3.4');
    expect(sent.get('x-forwarded-proto')).toBe('https');
    expect(sent.get('x-forwarded-host')).toBe('draazy.com');
    expect(sent.get('x-proxy-auth')).toBe('shh');
    expect(sent.get('accept')).toBe('application/json');
    expect(sent.get('authorization')).toBe('Bearer t');
    expect(sent.get('cookie')).toBe('sid=1');
  });

  it('trims the shared secret before sending it', async () => {
    const fetchMock = stubUpstream();
    await call('/api/x', { env: { ...ENV, ORIGIN_SHARED_SECRET: '  shh \n' } });
    expect(fetchMock.mock.calls[0][1].headers.get('x-proxy-auth')).toBe('shh');
  });
});

describe('api proxy request bodies', () => {
  it('forwards the body for POST', async () => {
    const fetchMock = stubUpstream();
    await call('/api/x', { init: { method: 'POST', body: '{"a":1}', headers: { 'Content-Type': 'application/json' } } });
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.body).toBeDefined();
    expect(await new Response(init.body).text()).toBe('{"a":1}');
  });

  it('sends no body for HEAD', async () => {
    const fetchMock = stubUpstream();
    await call('/api/x', { init: { method: 'HEAD' } });
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });
});

describe('api proxy response headers', () => {
  it('removes upstream CORS and server fingerprint headers but keeps the rest', async () => {
    stubUpstream(() => new Response('hi', {
      status: 201,
      headers: {
        Server: 'nginx',
        'X-Powered-By': 'Spring',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Expose-Headers': 'X-A',
        'Content-Type': 'text/plain',
        'X-Custom': 'kept',
      },
    }));
    const res = await call('/api/x');
    expect(res.status).toBe(201);
    expect(await res.text()).toBe('hi');
    for (const name of ['server', 'x-powered-by', 'access-control-allow-origin', 'access-control-allow-credentials',
      'access-control-allow-methods', 'access-control-allow-headers', 'access-control-expose-headers', 'content-length']) {
      expect(res.headers.has(name), name).toBe(false);
    }
    expect(res.headers.get('x-custom')).toBe('kept');
    expect(res.headers.get('content-type')).toBe('text/plain');
  });

  it('passes upstream redirects through untouched', async () => {
    stubUpstream(() => new Response(null, { status: 302, headers: { Location: 'https://evil.example/' } }));
    const res = await call('/api/x');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://evil.example/');
  });
});

describe('api proxy edge cache', () => {
  let cache;
  beforeEach(() => {
    cache = { match: vi.fn(async () => undefined), put: vi.fn(async () => undefined) };
    vi.stubGlobal('caches', { default: cache });
  });

  const publicResponse = (extra = {}) => new Response('{"a":1}', { status: 200, headers: { 'Cache-Control': 'public, max-age=60', ...extra } });

  it('returns a cache hit without calling the origin', async () => {
    const hit = new Response('cached');
    cache.match.mockResolvedValue(hit);
    const fetchMock = stubUpstream();
    const res = await call('/api/x');
    expect(res).toBe(hit);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stores shareable public GET responses through waitUntil', async () => {
    stubUpstream(() => publicResponse());
    const waitUntil = vi.fn();
    await call('/api/x', { waitUntil });
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['private', { 'Cache-Control': 'private, max-age=60' }],
    ['no-store', { 'Cache-Control': 'public, max-age=60, no-store' }],
    ['max-age=0', { 'Cache-Control': 'public, max-age=0' }],
    ['no cache-control', { 'Cache-Control': '' }],
    ['set-cookie', { 'Set-Cookie': 'a=b' }],
  ])('does not cache a response that is %s', async (_label, headers) => {
    stubUpstream(() => publicResponse(headers));
    await call('/api/x');
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('does not cache a non-200 response', async () => {
    stubUpstream(() => new Response('x', { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } }));
    await call('/api/x');
    expect(cache.put).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', { method: 'POST', body: 'x' }],
    ['an Authorization header', { headers: { Authorization: 'Bearer t' } }],
    ['Cache-Control: no-cache', { headers: { 'Cache-Control': 'no-cache' } }],
    ['Cache-Control: max-age=0', { headers: { 'Cache-Control': 'max-age=0' } }],
  ])('bypasses the cache for %s', async (_label, init) => {
    stubUpstream(() => publicResponse());
    await call('/api/x', { init });
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });
});
