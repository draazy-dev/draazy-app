import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useAsyncList from '../../../src/hooks/useAsyncList.js';
import { useSingleFlight } from '../../../src/hooks/useSingleFlight.js';
import useScrollLock from '../../../src/hooks/useScrollLock.js';

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('useAsyncList', () => {
  it('starts loading and then exposes the loaded list', async () => {
    const { result } = renderHook(() => useAsyncList(() => Promise.resolve([1, 2]), []));
    expect(result.current[0]).toEqual([]);
    expect(result.current[1]).toBe('loading');
    await vi.waitFor(() => expect(result.current[1]).toBe('ready'));
    expect(result.current[0]).toEqual([1, 2]);
    expect(result.current[4]).toBeNull();
  });

  it('treats a falsy answer as an empty list', async () => {
    const { result } = renderHook(() => useAsyncList(() => Promise.resolve(null), []));
    await vi.waitFor(() => expect(result.current[1]).toBe('ready'));
    expect(result.current[0]).toEqual([]);
  });

  it('reports a failed load with its error', async () => {
    const err = new Error('boom');
    const { result } = renderHook(() => useAsyncList(() => Promise.reject(err), []));
    await vi.waitFor(() => expect(result.current[1]).toBe('error'));
    expect(result.current[4]).toBe(err);
    expect(result.current[0]).toEqual([]);
  });

  it('does not load while disabled', async () => {
    const loader = vi.fn(() => Promise.resolve([1]));
    const { result } = renderHook(() => useAsyncList(loader, [], false));
    await vi.waitFor(() => expect(result.current[1]).toBe('ready'));
    expect(loader).not.toHaveBeenCalled();
    expect(result.current[0]).toEqual([]);
  });

  it('reloads when a dependency changes and drops the stale response', async () => {
    const first = deferred();
    const second = deferred();
    const loader = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ dep }) => useAsyncList(loader, [dep]), { initialProps: { dep: 'a' } });
    rerender({ dep: 'b' });
    await act(async () => { second.resolve(['new']); });
    await act(async () => { first.resolve(['old']); });
    expect(loader).toHaveBeenCalledTimes(2);
    expect(result.current[0]).toEqual(['new']);
  });

  it('retries after a failure', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(['ok']);
    const { result } = renderHook(() => useAsyncList(loader, []));
    await vi.waitFor(() => expect(result.current[1]).toBe('error'));
    act(() => result.current[3]());
    await vi.waitFor(() => expect(result.current[1]).toBe('ready'));
    expect(result.current[0]).toEqual(['ok']);
    expect(result.current[4]).toBeNull();
  });

  it('lets the caller set the list with a value or an updater', async () => {
    const { result } = renderHook(() => useAsyncList(() => Promise.resolve([1]), []));
    await vi.waitFor(() => expect(result.current[1]).toBe('ready'));
    act(() => result.current[2]((list) => [...list, 2]));
    expect(result.current[0]).toEqual([1, 2]);
    act(() => result.current[2]([9]));
    expect(result.current[0]).toEqual([9]);
  });

  it('refreshes quietly with the latest loader and swallows failures', async () => {
    let value = ['a'];
    const { result, rerender } = renderHook(({ fn }) => useAsyncList(fn, []), { initialProps: { fn: () => Promise.resolve(value) } });
    await vi.waitFor(() => expect(result.current[1]).toBe('ready'));
    value = ['b'];
    rerender({ fn: () => Promise.resolve(value) });
    await act(async () => { await result.current[5](); });
    expect(result.current[0]).toEqual(['b']);
    rerender({ fn: () => Promise.reject(new Error('x')) });
    await act(async () => { await result.current[5](); });
    expect(result.current[0]).toEqual(['b']);
    expect(result.current[1]).toBe('ready');
  });

  it('ignores a response that arrives after unmount', async () => {
    const pending = deferred();
    const { result, unmount } = renderHook(() => useAsyncList(() => pending.promise, []));
    unmount();
    await act(async () => { pending.resolve([1]); });
    expect(result.current[1]).toBe('loading');
  });
});

describe('useSingleFlight', () => {
  it('runs a task and returns its result', async () => {
    const { result } = renderHook(() => useSingleFlight());
    await expect(result.current(async () => 42)).resolves.toBe(42);
  });

  it('ignores calls made while another one is running', async () => {
    const { result } = renderHook(() => useSingleFlight());
    const gate = deferred();
    const first = result.current(() => gate.promise);
    const fn = vi.fn();
    await expect(result.current(fn)).resolves.toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
    gate.resolve('done');
    await expect(first).resolves.toBe('done');
    await expect(result.current(async () => 'again')).resolves.toBe('again');
  });

  it('releases the guard after a failure', async () => {
    const { result } = renderHook(() => useSingleFlight());
    await expect(result.current(async () => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(result.current(async () => 'ok')).resolves.toBe('ok');
  });

  it('keeps the same function between renders', () => {
    const { result, rerender } = renderHook(() => useSingleFlight());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe('useScrollLock', () => {
  const root = document.documentElement;
  afterEach(() => {
    root.style.overflowY = '';
    delete root.dataset.scrollLocked;
  });

  it('locks the page while mounted and restores the previous overflow', () => {
    root.style.overflowY = 'scroll';
    const { unmount } = renderHook(() => useScrollLock());
    expect(root.style.overflowY).toBe('hidden');
    expect(root.dataset.scrollLocked).toBe('true');
    unmount();
    expect(root.style.overflowY).toBe('scroll');
    expect(root.dataset.scrollLocked).toBeUndefined();
  });

  it('does nothing while inactive and reacts to toggling', () => {
    const { rerender, unmount } = renderHook(({ on }) => useScrollLock(on), { initialProps: { on: false } });
    expect(root.dataset.scrollLocked).toBeUndefined();
    rerender({ on: true });
    expect(root.dataset.scrollLocked).toBe('true');
    rerender({ on: false });
    expect(root.dataset.scrollLocked).toBeUndefined();
    unmount();
  });

  it('keeps the lock until the last nested user unlocks', () => {
    const a = renderHook(() => useScrollLock());
    const b = renderHook(() => useScrollLock());
    a.unmount();
    expect(root.dataset.scrollLocked).toBe('true');
    expect(root.style.overflowY).toBe('hidden');
    b.unmount();
    expect(root.dataset.scrollLocked).toBeUndefined();
    expect(root.style.overflowY).toBe('');
  });
});
