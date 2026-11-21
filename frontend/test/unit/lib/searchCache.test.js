import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearchCache } from '../../../src/lib/searchCache.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

const deferred = () => {
  const d = {};
  d.promise = new Promise((resolve, reject) => { d.resolve = resolve; d.reject = reject; });
  return d;
};

describe('createSearchCache', () => {
  it('serves repeat reads from the cache within the ttl', async () => {
    const cache = createSearchCache();
    const fetcher = vi.fn().mockResolvedValue('a');
    expect(await cache.read('k', fetcher)).toBe('a');
    expect(await cache.read('k', fetcher)).toBe('a');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refetches after the ttl expires', async () => {
    const cache = createSearchCache({ ttl: 1000 });
    const fetcher = vi.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new');
    await cache.read('k', fetcher);
    vi.setSystemTime(1000);
    expect(await cache.read('k', fetcher)).toBe('old');
    vi.setSystemTime(1001);
    expect(await cache.read('k', fetcher)).toBe('new');
  });

  it('bypasses the cache when fresh is requested', async () => {
    const cache = createSearchCache();
    const fetcher = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    await cache.read('k', fetcher);
    expect(await cache.read('k', fetcher, { fresh: true })).toBe(2);
    expect(await cache.read('k', fetcher)).toBe(2);
  });

  it('evicts the least recently used entry beyond max', async () => {
    const cache = createSearchCache({ max: 2 });
    const fetcher = vi.fn((signal) => Promise.resolve(Math.random()));
    await cache.read('a', fetcher);
    await cache.read('b', fetcher);
    await cache.read('a', fetcher);
    await cache.read('c', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3);
    await cache.read('a', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3);
    await cache.read('b', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('shares a single in-flight request between callers', async () => {
    const cache = createSearchCache();
    const d = deferred();
    const fetcher = vi.fn(() => d.promise);
    const first = cache.read('k', fetcher);
    const second = cache.read('k', fetcher);
    d.resolve('v');
    expect(await Promise.all([first, second])).toEqual(['v', 'v']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures', async () => {
    const cache = createSearchCache();
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('up');
    await expect(cache.read('k', fetcher)).rejects.toThrow('down');
    expect(await cache.read('k', fetcher)).toBe('up');
  });

  it('rejects immediately for an already aborted signal', async () => {
    const cache = createSearchCache();
    const fetcher = vi.fn();
    const ctl = new AbortController();
    ctl.abort();
    await expect(cache.read('k', fetcher, { signal: ctl.signal })).rejects.toMatchObject({ name: 'AbortError', message: 'Aborted' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('aborts the shared request only when every subscriber has left', async () => {
    const cache = createSearchCache();
    let sharedSignal;
    const d = deferred();
    const fetcher = (signal) => { sharedSignal = signal; return d.promise; };
    const a = new AbortController();
    const b = new AbortController();
    const first = cache.read('k', fetcher, { signal: a.signal }).catch((e) => e.name);
    const second = cache.read('k', fetcher, { signal: b.signal });
    a.abort();
    expect(await first).toBe('AbortError');
    expect(sharedSignal.aborted).toBe(false);
    d.resolve('done');
    expect(await second).toBe('done');
  });

  it('cancels the fetch when the last subscriber aborts and starts anew afterwards', async () => {
    const cache = createSearchCache();
    const signals = [];
    const fetcher = vi.fn((signal) => { signals.push(signal); return new Promise(() => {}); });
    const a = new AbortController();
    const pending = cache.read('k', fetcher, { signal: a.signal }).catch((e) => e.name);
    a.abort();
    expect(await pending).toBe('AbortError');
    expect(signals[0].aborted).toBe(true);
    cache.read('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('clear drops cached entries', async () => {
    const cache = createSearchCache();
    const fetcher = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    await cache.read('k', fetcher);
    cache.clear();
    expect(await cache.read('k', fetcher)).toBe(2);
  });
});
