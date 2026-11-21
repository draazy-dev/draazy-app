import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearBrowserState, headersOf, installFetch, loadHttp, reply } from './helpers/httpHarness.js';

let fetchMock;
let auth;
let http;
let API_BASE;

beforeEach(async () => {
  clearBrowserState();
  fetchMock = installFetch();
  ({ auth, http, API_BASE } = await loadHttp());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  clearBrowserState();
});

describe('ApiError', () => {
  it('prefers the server message, then the code, then the status', () => {
    expect(new http.ApiError({ message: 'm', code: 'c', status: 400 }).message).toBe('m');
    expect(new http.ApiError({ code: 'c', status: 400 }).message).toBe('c');
    expect(new http.ApiError({ status: 418 }).message).toBe('HTTP 418');
  });

  it('flags only parsed server messages as serverMessage', () => {
    expect(new http.ApiError({ message: 'm', status: 400 }).serverMessage).toBe(true);
    expect(new http.ApiError({ message: 'm', status: 400, unparsed: true }).serverMessage).toBe(false);
    expect(new http.ApiError({ status: 400 }).serverMessage).toBe(false);
  });

  it('normalises optional fields', () => {
    const err = new http.ApiError({
      status: 429, attemptsRemaining: 2, retryAfterSeconds: 30, reason: 'r', existingId: 'e', nextReminderAt: 'n',
    });
    expect(err).toMatchObject({
      name: 'ApiError', status: 429, code: null, traceId: null, fields: [], attemptsRemaining: 2,
      retryAfterSeconds: 30, reason: 'r', existingId: 'e', nextReminderAt: 'n',
    });
    const bad = new http.ApiError({
      status: 400, attemptsRemaining: '2', retryAfterSeconds: -1, reason: 5, existingId: 5, nextReminderAt: 5,
    });
    expect(bad).toMatchObject({
      attemptsRemaining: null, retryAfterSeconds: null, reason: null, existingId: null, nextReminderAt: null,
    });
    expect(new http.ApiError({ status: 400, retryAfterSeconds: Number.NaN }).retryAfterSeconds).toBeNull();
  });

  it('reports 422 as a validation error', () => {
    expect(new http.ApiError({ status: 422 }).isValidation).toBe(true);
    expect(new http.ApiError({ status: 400 }).isValidation).toBe(false);
  });
});

describe('NetworkError and isAbort', () => {
  it('wraps the cause with a user-facing message', () => {
    const cause = new TypeError('boom');
    const err = new http.NetworkError(cause);
    expect(err.name).toBe('NetworkError');
    expect(err.cause).toBe(cause);
    expect(err.message).toMatch(/Could not reach the server/);
  });

  it('recognises AbortError by name only', () => {
    expect(http.isAbort(new DOMException('x', 'AbortError'))).toBe(true);
    expect(http.isAbort(new Error('x'))).toBe(false);
    expect(http.isAbort(undefined)).toBe(false);
  });
});

describe('request: outgoing call', () => {
  it('sends a plain GET with JSON accept, cookies and no auth header when signed out', async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: 1 }));
    await expect(http.request('/things')).resolves.toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/things`);
    expect(init).toMatchObject({ method: 'GET', credentials: 'include', cache: 'default', body: undefined });
    expect(init.headers).toEqual({ Accept: 'application/json' });
  });

  it('adds a bearer token when signed in and omits it when auth is false', async () => {
    auth.writeTokens({ accessToken: 'tok' });
    fetchMock.mockImplementation(async () => reply(200, {}));
    await http.request('/a');
    await http.request('/b', { auth: false });
    expect(headersOf(fetchMock.mock.calls[0]).Authorization).toBe('Bearer tok');
    expect(headersOf(fetchMock.mock.calls[1]).Authorization).toBeUndefined();
  });

  it('serialises JSON bodies and sets content type, merging caller headers', async () => {
    fetchMock.mockResolvedValue(reply(200, {}));
    await http.post('/p', { a: 1 }, { headers: { 'If-Match': 'v1' } });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', 'If-Match': 'v1' });
  });

  it('passes FormData through untouched without a content type', async () => {
    fetchMock.mockResolvedValue(reply(200, {}));
    const form = new FormData();
    form.append('f', 'v');
    await http.postMultipart('/up', form);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(form);
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it.each([
    ['put', (h) => h.put('/x', { v: 1 }), 'PUT'],
    ['patch', (h) => h.patch('/x', { v: 1 }), 'PATCH'],
    ['del', (h) => h.del('/x'), 'DELETE'],
  ])('%s uses the matching verb', async (_name, call, verb) => {
    fetchMock.mockResolvedValue(reply(204));
    await expect(call(http)).resolves.toBeNull();
    expect(fetchMock.mock.calls[0][1].method).toBe(verb);
  });

  it('attaches a device id only on paths that need it', async () => {
    fetchMock.mockImplementation(async () => reply(200, {}));
    await http.request('/auth/send-otp', { method: 'POST', body: {} });
    await http.request('/referrals/x');
    await http.request('/me/payments');
    await http.request('/properties');
    expect(headersOf(fetchMock.mock.calls[0])['X-Device-Id']).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(headersOf(fetchMock.mock.calls[1])['X-Device-Id']).toBeDefined();
    expect(headersOf(fetchMock.mock.calls[2])['X-Device-Id']).toBeDefined();
    expect(headersOf(fetchMock.mock.calls[3])['X-Device-Id']).toBeUndefined();
    expect(headersOf(fetchMock.mock.calls[0])['X-Device-Id']).toBe(localStorage.getItem('dz_did'));
  });

  it('bypasses the HTTP cache for internal users only', async () => {
    fetchMock.mockImplementation(async () => reply(200, {}));
    await http.request('/a');
    auth.writeUser({ role: 'staff' });
    await http.request('/b');
    expect(fetchMock.mock.calls[0][1].cache).toBe('default');
    expect(fetchMock.mock.calls[1][1].cache).toBe('no-cache');
  });

  it('builds the query string, skipping empty values and repeating arrays', async () => {
    fetchMock.mockImplementation(async () => reply(200, {}));
    await http.request('/q', { query: { a: 1, b: '', c: null, d: undefined, e: ['x', 'y'], f: 0, g: false } });
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/q?a=1&e=x&e=y&f=0&g=false`);
    await http.request('/q', { query: { a: undefined } });
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE}/q`);
  });
});

describe('request: response mapping', () => {
  it('returns null for 204 and for an empty body', async () => {
    fetchMock.mockResolvedValueOnce(reply(204)).mockResolvedValueOnce(reply(200, ''));
    await expect(http.request('/a')).resolves.toBeNull();
    await expect(http.request('/b')).resolves.toBeNull();
  });

  it('returns status and etag when withStatus is set', async () => {
    fetchMock.mockResolvedValue(reply(201, { id: 1 }, { ETag: '"v2"' }));
    await expect(http.request('/a', { withStatus: true })).resolves.toEqual({ data: { id: 1 }, status: 201, etag: '"v2"' });
  });

  it('maps a JSON error body onto ApiError', async () => {
    fetchMock.mockResolvedValue(reply(422, {
      error: 'invalid', message: 'Bad', fields: [{ field: 'x' }], attemptsRemaining: 1, retryAfterSeconds: 9,
      reason: 'why', existingId: 'e1', nextReminderAt: 't', traceId: 'tr-1',
    }));
    const err = await http.request('/a', { method: 'POST', body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(http.ApiError);
    expect(err).toMatchObject({
      code: 'invalid', message: 'Bad', status: 422, traceId: 'tr-1', fields: [{ field: 'x' }], attemptsRemaining: 1,
      retryAfterSeconds: 9, reason: 'why', existingId: 'e1', nextReminderAt: 't', serverMessage: true, isValidation: true,
    });
  });

  it('keeps a non-JSON error page as an unparsed message, truncated', async () => {
    fetchMock.mockResolvedValue(reply(502, `<html>${'x'.repeat(500)}</html>`));
    const err = await http.request('/a').catch((e) => e);
    expect(err.status).toBe(502);
    expect(err.serverMessage).toBe(false);
    expect(err.message).toHaveLength(200);
  });

  it('falls back to the trace header and records 5xx trace ids', async () => {
    expect(http.lastFailedTraceId()).toBeNull();
    fetchMock.mockResolvedValueOnce(reply(404, { error: 'nf' }, { 'X-Trace-Id': 'h-404' }));
    const notFound = await http.request('/a').catch((e) => e);
    expect(notFound.traceId).toBe('h-404');
    expect(http.lastFailedTraceId()).toBeNull();
    fetchMock.mockResolvedValueOnce(reply(500, { error: 'boom' }, { 'X-Trace-Id': 'h-500' }));
    await http.request('/a').catch(() => {});
    expect(http.lastFailedTraceId()).toBe('h-500');
  });
});

describe('request: transport failures and observers', () => {
  it('turns a fetch rejection into NetworkError and notifies the reachability observer', async () => {
    const observer = vi.fn();
    http.observeReachability(observer);
    const cause = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValueOnce(cause);
    const err = await http.request('/a').catch((e) => e);
    expect(err).toBeInstanceOf(http.NetworkError);
    expect(err.cause).toBe(cause);
    expect(observer).toHaveBeenLastCalledWith(err);
    fetchMock.mockResolvedValueOnce(reply(200, {}));
    await http.request('/a');
    expect(observer).toHaveBeenLastCalledWith(null);
  });

  it('lets a caller abort pass through unwrapped', async () => {
    const abort = new DOMException('stop', 'AbortError');
    fetchMock.mockRejectedValue(abort);
    await expect(http.request('/a', { method: 'POST', body: {} })).rejects.toBe(abort);
    await expect(http.request('/a')).rejects.toBe(abort);
  });

  it('reports the build header to the observer and remembers the last stamp', async () => {
    const stamps = vi.fn();
    http.observeBuildStamp(stamps);
    expect(http.lastBuildStamp()).toBeNull();
    fetchMock.mockResolvedValueOnce(reply(200, {}, { 'X-Draazy-Build': 'b1' }));
    await http.request('/a');
    fetchMock.mockResolvedValueOnce(reply(200, {}));
    await http.request('/a');
    expect(stamps).toHaveBeenNthCalledWith(1, 'b1');
    expect(stamps).toHaveBeenNthCalledWith(2, null);
    expect(http.lastBuildStamp()).toBe('b1');
  });

  it('turns a GET that never settles into a NetworkError after 20s', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const pending = http.request('/slow').catch((e) => e);
    await vi.advanceTimersByTimeAsync(19_999);
    let settled = false;
    pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBeInstanceOf(http.NetworkError);
  });

  it('relays a caller abort on a GET as an AbortError, not a NetworkError', async () => {
    fetchMock.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const ctrl = new AbortController();
    const pending = http.request('/slow', { signal: ctrl.signal }).catch((e) => e);
    ctrl.abort();
    expect(http.isAbort(await pending)).toBe(true);
  });

  it('aborts immediately when the caller signal is already aborted', async () => {
    fetchMock.mockImplementation((_url, { signal }) => (signal.aborted
      ? Promise.reject(new DOMException('aborted', 'AbortError'))
      : Promise.resolve(reply(200, {}))));
    const ctrl = new AbortController();
    ctrl.abort();
    expect(http.isAbort(await http.request('/a', { signal: ctrl.signal }).catch((e) => e))).toBe(true);
  });
});

describe('early reads', () => {
  const early = (response, props) => Object.assign(Promise.resolve(response), props);

  it('serves the first matching bootstrap GET from the preloaded response', async () => {
    globalThis.__dzBootstrap = early(reply(200, { boot: true }), { token: null });
    await expect(http.request('/bootstrap')).resolves.toEqual({ boot: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(globalThis.__dzBootstrap).toBeUndefined();
    fetchMock.mockResolvedValue(reply(200, { boot: 'network' }));
    await expect(http.request('/bootstrap')).resolves.toEqual({ boot: 'network' });
  });

  it('ignores a preload made under a different token', async () => {
    auth.writeTokens({ accessToken: 'mine' });
    globalThis.__dzMeBootstrap = early(reply(200, { stale: true }), { token: 'other' });
    fetchMock.mockResolvedValue(reply(200, { fresh: true }));
    await expect(http.request('/me/bootstrap')).resolves.toEqual({ fresh: true });
    expect(globalThis.__dzMeBootstrap).toBeUndefined();
  });

  it('refuses a non-fresh preload for internal users', async () => {
    auth.writeUser({ role: 'admin' });
    globalThis.__dzBootstrap = early(reply(200, { stale: true }), { token: null });
    fetchMock.mockResolvedValue(reply(200, { fresh: true }));
    await expect(http.request('/bootstrap')).resolves.toEqual({ fresh: true });
    globalThis.__dzBootstrap = early(reply(200, { boot: true }), { token: null, fresh: true });
    await expect(http.request('/bootstrap')).resolves.toEqual({ boot: true });
  });

  it('falls back to the network when the preload resolves to nothing', async () => {
    globalThis.__dzBootstrap = early(undefined, { token: null });
    fetchMock.mockResolvedValue(reply(200, { net: true }));
    await expect(http.request('/bootstrap')).resolves.toEqual({ net: true });
  });
});

describe('unwrapPage', () => {
  it('treats an array as a single page', () => {
    expect(http.unwrapPage([1, 2])).toEqual({ items: [1, 2], page: 0, size: 2, total: 2, totalPages: 0 });
  });

  it('reads Spring page fields and falls back to the requested paging', () => {
    expect(http.unwrapPage({ content: ['a'], number: 3, size: 10, totalElements: 41, totalPages: 5 })).toEqual({
      items: ['a'], page: 3, size: 10, total: 41, totalPages: 5,
    });
    expect(http.unwrapPage({ content: ['a'], page: 2 }, { page: 9, size: 25 })).toMatchObject({ page: 2, size: 25 });
    expect(http.unwrapPage(undefined, { page: 4 })).toEqual({ items: [], page: 4, size: 0, total: 0, totalPages: 0 });
  });
});

describe('unwrapFullPage', () => {
  it('returns arrays and complete pages without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(http.unwrapFullPage([1], 'L')).toEqual([1]);
    expect(http.unwrapFullPage({ content: [1, 2], totalElements: 2 }, 'L')).toEqual([1, 2]);
    expect(http.unwrapFullPage(null, 'L')).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns with the label when rows are missing from a partial page', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(http.unwrapFullPage({ content: [1], totalElements: 5 }, 'MyList')).toEqual([1]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[MyList] 5 rows exist but only 1 were fetched'));
  });
});

describe('persistTokens', () => {
  it('stores the access token in memory only', () => {
    http.persistTokens({ accessToken: 'abc' }, true);
    expect(auth.readAccessToken()).toBe('abc');
    expect(localStorage.getItem('draazyTokens')).toBeNull();
    expect(auth.sessionRemembered()).toBe(true);
    http.persistTokens({ accessToken: 'def' }, false);
    expect(auth.readAccessToken()).toBe('def');
    expect(auth.sessionRemembered()).toBe(false);
  });
});
