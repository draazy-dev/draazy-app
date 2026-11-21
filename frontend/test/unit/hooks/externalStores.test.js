import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const observers = vi.hoisted(() => ({ build: null, reach: null }));

vi.mock('../../../src/services/http.js', () => ({
  NetworkError: class NetworkError extends Error {},
  observeBuildStamp: (fn) => { observers.build = fn; },
  observeReachability: (fn) => { observers.reach = fn; },
}));

describe('useAppUpdate', () => {
  let mod;
  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../../../src/hooks/useAppUpdate.js');
  });

  it('adopts the first build stamp as the baseline', () => {
    const { result } = renderHook(() => mod.useAppUpdate());
    act(() => observers.build('v1'));
    act(() => observers.build('v1'));
    expect(result.current.updateReady).toBe(false);
  });

  it('ignores empty stamps', () => {
    const { result } = renderHook(() => mod.useAppUpdate());
    act(() => observers.build('v1'));
    act(() => observers.build(''));
    act(() => observers.build(null));
    expect(result.current.updateReady).toBe(false);
  });

  it('reports an update when a different build appears and keeps one snapshot per state', () => {
    const { result } = renderHook(() => mod.useAppUpdate());
    act(() => observers.build('v1'));
    act(() => observers.build('v2'));
    const ready = result.current;
    expect(ready.updateReady).toBe(true);
    act(() => observers.build('v2'));
    expect(result.current).toBe(ready);
  });

  it('stays quiet after dismissal until yet another build ships', () => {
    const { result } = renderHook(() => mod.useAppUpdate());
    act(() => observers.build('v1'));
    act(() => observers.build('v2'));
    act(() => mod.dismissUpdate());
    expect(result.current.updateReady).toBe(false);
    act(() => observers.build('v2'));
    expect(result.current.updateReady).toBe(false);
    act(() => observers.build('v3'));
    expect(result.current.updateReady).toBe(true);
  });

  it('stops notifying unmounted components', () => {
    const { result, unmount } = renderHook(() => mod.useAppUpdate());
    unmount();
    act(() => observers.build('v1'));
    act(() => observers.build('v2'));
    expect(result.current.updateReady).toBe(false);
  });
});

describe('useConnectivity', () => {
  let mod;
  let NetworkError;

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../../../src/hooks/useConnectivity.js');
    ({ NetworkError } = await import('../../../src/services/http.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('starts online', () => {
    const { result } = renderHook(() => mod.useConnectivity());
    expect(result.current.status).toBe('online');
  });

  it('recognises only network errors as reachability failures', () => {
    expect(mod.isReachabilityFailure(new NetworkError())).toBe(true);
    expect(mod.isReachabilityFailure(new Error('x'))).toBe(false);
    expect(mod.isReachabilityFailure(null)).toBe(false);
    expect(mod.noteNetworkFailure(new Error('x'))).toBe(false);
  });

  it('turns unreachable on a network failure and recovers on the next success', () => {
    const { result } = renderHook(() => mod.useConnectivity());
    act(() => { expect(mod.noteNetworkFailure(new NetworkError())).toBe(true); });
    expect(result.current.status).toBe('unreachable');
    act(() => mod.noteNetworkSuccess());
    expect(result.current.status).toBe('online');
  });

  it('ignores successes while reachable', () => {
    const { result } = renderHook(() => mod.useConnectivity());
    const before = result.current;
    act(() => mod.noteNetworkSuccess());
    expect(result.current).toBe(before);
  });

  it('is driven by the http reachability observer', () => {
    const { result } = renderHook(() => mod.useConnectivity());
    act(() => observers.reach(new NetworkError()));
    expect(result.current.status).toBe('unreachable');
    act(() => observers.reach(null));
    expect(result.current.status).toBe('online');
    act(() => observers.reach(new Error('not a network error')));
    expect(result.current.status).toBe('online');
  });

  it('follows the browser offline and online events', () => {
    const { result } = renderHook(() => mod.useConnectivity());
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(result.current.status).toBe('offline');
    spy.mockReturnValue(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(result.current.status).toBe('online');
  });

  it('clears an unreachable state when the browser comes back online', () => {
    const { result } = renderHook(() => mod.useConnectivity());
    act(() => mod.noteNetworkFailure(new NetworkError()));
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(result.current.status).toBe('online');
  });

  it('detaches window listeners when the last subscriber leaves', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const a = renderHook(() => mod.useConnectivity());
    const b = renderHook(() => mod.useConnectivity());
    expect(add.mock.calls.filter(([n]) => n === 'online')).toHaveLength(1);
    a.unmount();
    expect(remove).not.toHaveBeenCalled();
    b.unmount();
    expect(remove.mock.calls.map(([n]) => n).sort()).toEqual(['offline', 'online']);
  });
});
