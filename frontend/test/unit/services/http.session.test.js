import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearBrowserState, headersOf, installFetch, loadHttp, removeLocks, reply, stubLocks,
} from './helpers/httpHarness.js';

let fetchMock;
let auth;
let http;
let API_BASE;

const routes = (table) => fetchMock.mockImplementation(async (url, init) => {
  const path = url.slice(API_BASE.length);
  const key = `${init.method} ${path}`;
  const handler = table[key];
  if (!handler) throw new Error(`unexpected ${key}`);
  const next = typeof handler === 'function' ? handler(init) : handler;
  return Array.isArray(next) ? reply(...next) : next;
});

const paths = () => fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url.slice(API_BASE.length)}`);

beforeEach(async () => {
  clearBrowserState();
  removeLocks();
  fetchMock = installFetch();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  ({ auth, http, API_BASE } = await loadHttp());
});

afterEach(() => {
  vi.unstubAllGlobals();
  removeLocks();
  clearBrowserState();
});

describe('401 handling', () => {
  it('refreshes once and replays the request with the new token', async () => {
    auth.writeTokens({ accessToken: 'old' });
    auth.writeUser({ role: 'owner' });
    let calls = 0;
    routes({
      'GET /me': () => (++calls === 1 ? [401, { error: 'expired' }] : [200, { who: 'me' }]),
      'POST /auth/refresh': [200, { accessToken: 'new' }],
    });
    await expect(http.request('/me')).resolves.toEqual({ who: 'me' });
    expect(paths()).toEqual(['GET /me', 'POST /auth/refresh', 'GET /me']);
    expect(headersOf(fetchMock.mock.calls[2]).Authorization).toBe('Bearer new');
    expect(auth.readAccessToken()).toBe('new');
  });

  it('sends the remember choice and no auth header on the refresh call', async () => {
    auth.writeTokens({ accessToken: 'old' }, false);
    routes({
      'GET /me': () => (fetchMock.mock.calls.length === 1 ? [401, {}] : [200, {}]),
      'POST /auth/refresh': [200, { accessToken: 'new' }],
    });
    await http.request('/me');
    const [, init] = fetchMock.mock.calls[1];
    expect(JSON.parse(init.body)).toEqual({ remember: false });
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('ends the session and announces it when the refresh is refused', async () => {
    auth.writeTokens({ accessToken: 'old' });
    auth.writeUser({ role: 'owner' });
    const ended = vi.fn();
    globalThis.addEventListener(http.SESSION_ENDED_EVENT, ended);
    routes({
      'GET /me': [401, { error: 'expired', message: 'Expired' }],
      'POST /auth/refresh': [401, { error: 'no_session' }],
    });
    const err = await http.request('/me').catch((e) => e);
    globalThis.removeEventListener(http.SESSION_ENDED_EVENT, ended);
    expect(err).toBeInstanceOf(http.ApiError);
    expect(err.status).toBe(401);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(auth.readAccessToken()).toBeNull();
    expect(auth.readUser()).toBeNull();
  });

  it('ends the session silently when the failing call was the logout itself', async () => {
    auth.writeTokens({ accessToken: 'old' });
    const ended = vi.fn();
    globalThis.addEventListener(http.SESSION_ENDED_EVENT, ended);
    routes({
      'POST /auth/logout': [401, {}],
      'POST /auth/refresh': [401, {}],
    });
    await http.request('/auth/logout', { method: 'POST' }).catch(() => {});
    globalThis.removeEventListener(http.SESSION_ENDED_EVENT, ended);
    expect(ended).not.toHaveBeenCalled();
    expect(auth.readAccessToken()).toBeNull();
  });

  it('does not refresh when the 401 is a wrong-code answer carrying attemptsRemaining', async () => {
    auth.writeTokens({ accessToken: 'old' });
    routes({ 'POST /auth/verify': [401, { error: 'wrong_code', attemptsRemaining: 2 }] });
    const err = await http.request('/auth/verify', { method: 'POST', body: {} }).catch((e) => e);
    expect(err.attemptsRemaining).toBe(2);
    expect(paths()).toEqual(['POST /auth/verify']);
    expect(auth.readAccessToken()).toBe('old');
  });

  it('does not refresh for auth:false calls or the refresh endpoint itself', async () => {
    auth.writeTokens({ accessToken: 'old' });
    routes({ 'GET /public': [401, {}], 'POST /auth/refresh': [401, {}] });
    await expect(http.request('/public', { auth: false })).rejects.toMatchObject({ status: 401 });
    await expect(http.request('/auth/refresh', { method: 'POST' })).rejects.toMatchObject({ status: 401 });
    expect(paths()).toEqual(['GET /public', 'POST /auth/refresh']);
    expect(auth.readAccessToken()).toBe('old');
  });

  it('leaves a signed-out 401 alone', async () => {
    routes({ 'GET /me': [401, { error: 'nope' }] });
    await expect(http.request('/me')).rejects.toMatchObject({ status: 401, code: 'nope' });
    expect(paths()).toEqual(['GET /me']);
  });

  it('skips the refresh and ends the session for a stored user with no token and no session cookie', async () => {
    auth.writeUser({ role: 'owner' });
    routes({ 'GET /me': [401, {}] });
    await expect(http.request('/me')).rejects.toMatchObject({ status: 401 });
    expect(paths()).toEqual(['GET /me']);
    expect(auth.readUser()).toBeNull();
  });

  it('attempts a refresh for a stored user with no token when the session cookie hints at one', async () => {
    auth.writeUser({ role: 'owner' });
    document.cookie = 'draazy_session=1; Path=/';
    routes({
      'GET /me': () => (fetchMock.mock.calls.length === 1 ? [401, {}] : [200, { ok: true }]),
      'POST /auth/refresh': [200, { accessToken: 'minted' }],
    });
    await expect(http.request('/me')).resolves.toEqual({ ok: true });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ remember: true });
    expect(headersOf(fetchMock.mock.calls[2]).Authorization).toBe('Bearer minted');
  });

  it('returns the second 401 as an error when the replay is refused too', async () => {
    auth.writeTokens({ accessToken: 'old' });
    routes({
      'GET /me': [401, { error: 'still_no' }],
      'POST /auth/refresh': [200, { accessToken: 'new' }],
    });
    await expect(http.request('/me')).rejects.toMatchObject({ status: 401, code: 'still_no' });
    expect(paths()).toEqual(['GET /me', 'POST /auth/refresh', 'GET /me']);
  });

  it('treats a refresh answer without an access token as a refusal', async () => {
    auth.writeTokens({ accessToken: 'old' });
    routes({ 'GET /me': [401, {}], 'POST /auth/refresh': [200, {}] });
    await expect(http.request('/me')).rejects.toMatchObject({ status: 401 });
    expect(auth.readAccessToken()).toBeNull();
  });

  it('shares one refresh between concurrent 401s', async () => {
    auth.writeTokens({ accessToken: 'old' });
    const seen = {};
    routes({
      'GET /a': (init) => (init.headers.Authorization === 'Bearer old' ? [401, {}] : [200, { a: 1 }]),
      'GET /b': (init) => (init.headers.Authorization === 'Bearer old' ? [401, {}] : [200, { b: 1 }]),
      'POST /auth/refresh': () => { seen.refreshes = (seen.refreshes ?? 0) + 1; return [200, { accessToken: 'new' }]; },
    });
    const [a, b] = await Promise.all([http.request('/a'), http.request('/b')]);
    expect([a, b]).toEqual([{ a: 1 }, { b: 1 }]);
    expect(seen.refreshes).toBe(1);
  });

  it('wraps a network failure during refresh and keeps the session', async () => {
    auth.writeTokens({ accessToken: 'old' });
    auth.writeUser({ role: 'owner' });
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith('/auth/refresh')) throw new TypeError('offline');
      return reply(401, {});
    });
    const err = await http.request('/me').catch((e) => e);
    expect(err).toBeInstanceOf(http.NetworkError);
    expect(err.duringRefresh).toBe(true);
    expect(err.message).toMatch(/^Could not renew your session — Could not reach the server/);
    expect(auth.readAccessToken()).toBe('old');
    expect(auth.readUser()).toEqual({ role: 'owner' });
  });

  it('wraps a server failure during refresh but not a 401', async () => {
    auth.writeTokens({ accessToken: 'old' });
    routes({ 'GET /me': [401, {}], 'POST /auth/refresh': [503, { error: 'down', message: 'Down' }] });
    const err = await http.request('/me').catch((e) => e);
    expect(err).toBeInstanceOf(http.ApiError);
    expect(err).toMatchObject({ status: 503, duringRefresh: true, message: 'Could not renew your session — Down' });
    expect(auth.readAccessToken()).toBe('old');
  });

  it('does not clear cached reads when the refresh POST itself completes', async () => {
    auth.writeTokens({ accessToken: 'old' });
    let meCalls = 0;
    routes({
      'GET /warm': [200, { v: 1 }],
      'GET /me': () => (++meCalls === 1 ? [401, {}] : [200, {}]),
      'POST /auth/refresh': [200, { accessToken: 'old' }],
    });
    await http.get('/warm', undefined, { ttl: 60_000 });
    await http.get('/me');
    await http.get('/warm', undefined, { ttl: 60_000 });
    expect(paths()).toContain('POST /auth/refresh');
    expect(paths().filter((p) => p === 'GET /warm')).toHaveLength(1);
  });
});

describe('restoreSession and the refresh lock', () => {
  it('mints a token from the cookie without a prior token', async () => {
    document.cookie = 'draazy_session=0; Path=/';
    routes({ 'POST /auth/refresh': [200, { accessToken: 'fresh' }] });
    await expect(http.restoreSession()).resolves.toBe('fresh');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ remember: false });
    expect(auth.readAccessToken()).toBe('fresh');
  });

  it('resolves null when there is no session to restore', async () => {
    routes({ 'POST /auth/refresh': [401, {}] });
    await expect(http.restoreSession()).resolves.toBeNull();
  });

  it('warns and refreshes unserialised when navigator.locks is missing', async () => {
    routes({ 'POST /auth/refresh': [200, { accessToken: 't' }] });
    await http.restoreSession();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('navigator.locks unavailable'));
  });

  it('runs the refresh inside the cross-tab web lock', async () => {
    const locks = stubLocks((_name, fn) => fn());
    routes({ 'POST /auth/refresh': [200, { accessToken: 't' }] });
    await expect(http.restoreSession()).resolves.toBe('t');
    expect(locks.request).toHaveBeenCalledWith('draazy:auth-refresh', expect.any(Function));
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('falls back to an unserialised refresh when the lock request throws synchronously', async () => {
    stubLocks(() => { throw new Error('refused'); });
    routes({ 'POST /auth/refresh': [200, { accessToken: 't' }] });
    await expect(http.restoreSession()).resolves.toBe('t');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Web Lock request refused'), expect.any(Error));
  });

  it('adopts a token another tab stored while this tab waited for the lock', async () => {
    auth.writeTokens({ accessToken: 'stale' });
    stubLocks(async (_name, fn) => {
      auth.writeTokens({ accessToken: 'from-other-tab' });
      return fn();
    });
    routes({
      'GET /me': (init) => (init.headers.Authorization === 'Bearer stale' ? [401, {}] : [200, { ok: 1 }]),
    });
    await expect(http.request('/me')).resolves.toEqual({ ok: 1 });
    expect(paths()).toEqual(['GET /me', 'GET /me']);
    expect(headersOf(fetchMock.mock.calls[1]).Authorization).toBe('Bearer from-other-tab');
  });

  it('allows a new refresh after the previous one finished', async () => {
    routes({ 'POST /auth/refresh': [200, { accessToken: 't' }] });
    await http.restoreSession();
    await http.restoreSession();
    expect(paths()).toEqual(['POST /auth/refresh', 'POST /auth/refresh']);
  });
});
