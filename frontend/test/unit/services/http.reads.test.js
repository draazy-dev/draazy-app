import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearBrowserState, installFetch, loadHttp, reply } from './helpers/httpHarness.js';

let fetchMock;
let auth;
let http;

const countFor = (path) => fetchMock.mock.calls.filter(([url]) => url.endsWith(path)).length;

beforeEach(async () => {
  clearBrowserState();
  fetchMock = installFetch();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  ({ auth, http } = await loadHttp());
  fetchMock.mockImplementation(async (url) => reply(200, { url, n: fetchMock.mock.calls.length }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  clearBrowserState();
});

describe('get: de-duplication', () => {
  it('shares one in-flight request between concurrent callers', async () => {
    const [a, b] = await Promise.all([http.get('/x'), http.get('/x')]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches once settled when no ttl was given', async () => {
    await http.get('/x');
    await http.get('/x');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keys reads by path, query and token', async () => {
    await Promise.all([http.get('/x'), http.get('/x', { a: 1 }), http.get('/y')]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const pending = http.get('/x');
    auth.writeTokens({ accessToken: 't' });
    await Promise.all([pending, http.get('/x')]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('serves a settled read until its ttl runs out', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(0);
    await http.get('/x', undefined, { ttl: 1000 });
    vi.setSystemTime(999);
    await http.get('/x', undefined, { ttl: 1000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(1001);
    await http.get('/x', undefined, { ttl: 1000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves an expired read while it is younger than maxAge', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(0);
    const opts = { ttl: 1000, maxAge: 5000 };
    await http.get('/x', undefined, opts);
    vi.setSystemTime(4000);
    await http.get('/x', undefined, opts);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(5001);
    await http.get('/x', undefined, opts);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed read', async () => {
    fetchMock.mockImplementationOnce(async () => reply(500, { error: 'boom' }));
    await expect(http.get('/x', undefined, { ttl: 60_000 })).rejects.toMatchObject({ status: 500 });
    await expect(http.get('/x', undefined, { ttl: 60_000 })).resolves.toMatchObject({ n: 2 });
  });

  it('bypasses the cache for withStatus and custom-header reads', async () => {
    await http.get('/x', undefined, { ttl: 60_000 });
    await http.get('/x', undefined, { ttl: 60_000, withStatus: true });
    await http.get('/x', undefined, { ttl: 60_000, headers: { 'If-None-Match': 'v' } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].headers['If-None-Match']).toBe('v');
  });

  it('keeps signed-out reads apart from signed-in ones when auth is false', async () => {
    auth.writeTokens({ accessToken: 't' });
    await Promise.all([http.get('/x', undefined, { auth: false }), http.get('/x', undefined, { auth: false })]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
});

describe('get: invalidation', () => {
  const warm = () => http.get('/x', undefined, { ttl: 60_000 });

  it('drops cached reads after any write', async () => {
    await warm();
    await http.post('/things', {});
    await warm();
    expect(countFor('/x')).toBe(2);
  });

  it('keeps cached reads after a write that opts out with keepReads', async () => {
    await warm();
    await http.post('/things', {}, { keepReads: true });
    await warm();
    expect(countFor('/x')).toBe(1);
  });

  it('drops cached reads when a write fails', async () => {
    await warm();
    fetchMock.mockImplementationOnce(async () => reply(400, { error: 'bad' }));
    await http.del('/things').catch(() => {});
    await warm();
    expect(countFor('/x')).toBe(2);
  });

  it('does not let a read that was in flight across a clear be cached', async () => {
    const pending = warm();
    http.clearReads();
    await pending;
    await warm();
    expect(countFor('/x')).toBe(2);
  });

  it('clears on the settings-change event', async () => {
    await warm();
    globalThis.dispatchEvent(new Event('draazy-settings-change'));
    await warm();
    expect(countFor('/x')).toBe(2);
  });
});

describe('get: abort signals', () => {
  it('rejects at once with AbortError for an already aborted signal', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const err = await http.get('/x', undefined, { signal: ctrl.signal }).catch((e) => e);
    expect(http.isAbort(err)).toBe(true);
  });

  it('detaches one aborting caller without disturbing the shared request', async () => {
    const ctrl = new AbortController();
    const aborted = http.get('/x', undefined, { signal: ctrl.signal }).catch((e) => e);
    const other = http.get('/x');
    ctrl.abort();
    expect(http.isAbort(await aborted)).toBe(true);
    await expect(other).resolves.toMatchObject({ n: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resolves normally when the signal never fires', async () => {
    const ctrl = new AbortController();
    await expect(http.get('/x', undefined, { signal: ctrl.signal })).resolves.toMatchObject({ n: 1 });
    ctrl.abort();
  });

  it('passes the signal to fetch for withStatus reads', async () => {
    const ctrl = new AbortController();
    await http.get('/x', undefined, { withStatus: true, signal: ctrl.signal });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('prime and prefetch', () => {
  it('hands a seeded read to the first reader without a request', async () => {
    http.prime('/x', undefined, Promise.resolve({ seeded: true }));
    await expect(http.get('/x')).resolves.toEqual({ seeded: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shares the seed with a second reader in the same tick, then refetches', async () => {
    http.prime('/x', undefined, Promise.resolve({ seeded: true }));
    const both = await Promise.all([http.get('/x'), http.get('/x')]);
    expect(both).toEqual([{ seeded: true }, { seeded: true }]);
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    await http.get('/x');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a seed with an explicit ttl for repeat readers', async () => {
    http.prime('/x', undefined, Promise.resolve({ seeded: true }), { ttl: 60_000 });
    await http.get('/x');
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    await expect(http.get('/x')).resolves.toEqual({ seeded: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches for a reader when the seed resolves to nothing', async () => {
    http.prime('/x', undefined, Promise.resolve(undefined));
    await expect(http.get('/x')).resolves.toMatchObject({ n: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('swallows an unread empty seed and lets a later reader fetch', async () => {
    http.prime('/x', undefined, Promise.resolve(null));
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    await expect(http.get('/x')).resolves.toMatchObject({ n: 1 });
  });

  it('swallows a rejected seed', async () => {
    http.prime('/x', undefined, Promise.reject(new Error('seed failed')));
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    await expect(http.get('/x')).resolves.toMatchObject({ n: 1 });
  });

  it('warms a read once and lets the page take it', async () => {
    http.prefetch('/x', { a: 1 });
    http.prefetch('/x', { a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(http.get('/x', { a: 1 })).resolves.toMatchObject({ n: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores a failed prefetch', async () => {
    fetchMock.mockImplementationOnce(async () => reply(500, {}));
    http.prefetch('/x');
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    await expect(http.get('/x')).resolves.toMatchObject({ n: 2 });
  });

  it('exposes the revisit read policy as frozen constants', () => {
    expect(http.REVISIT_READ).toEqual({ ttl: http.PAGE_LOAD_TTL, maxAge: http.REVISIT_MAX_AGE });
    expect(Object.isFrozen(http.REVISIT_READ)).toBe(true);
    expect(http.PUBLIC_READ_TTL).toBeGreaterThan(http.PAGE_LOAD_TTL);
  });
});
