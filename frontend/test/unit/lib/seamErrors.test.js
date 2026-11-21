import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROVIDER_LOAD_FAILED, healStaleShell, isDefinitelyOffline, reloadOnceForStaleShell, updateWorkerThenReload,
} from '../../../src/lib/seamErrors.js';

const KEY = 'draazy:reloaded-for-stale-shell';
let reload;
let originalLocation;

function setOnline(value) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value);
}
function setServiceWorker(sw) {
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: sw });
}

beforeEach(() => {
  sessionStorage.clear();
  reload = vi.fn();
  originalLocation = window.location;
  Object.defineProperty(window, 'location', { configurable: true, value: { reload } });
  setServiceWorker(undefined);
});
afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  delete navigator.serviceWorker;
  vi.useRealTimers();
  sessionStorage.clear();
});

describe('isDefinitelyOffline', () => {
  it('is true only when the browser says offline', () => {
    setOnline(false);
    expect(isDefinitelyOffline()).toBe(true);
    vi.restoreAllMocks();
    setOnline(true);
    expect(isDefinitelyOffline()).toBe(false);
  });
});

describe('reloadOnceForStaleShell', () => {
  it('reloads once per session', async () => {
    expect(reloadOnceForStaleShell()).toBe(true);
    expect(sessionStorage.getItem(KEY)).toBe('1');
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(reloadOnceForStaleShell()).toBe(false);
  });

  it('never reloads while offline', () => {
    setOnline(false);
    expect(reloadOnceForStaleShell()).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('gives up when session storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(reloadOnceForStaleShell()).toBe(false);
  });
});

describe('healStaleShell', () => {
  it('reloads only for provider load failures', async () => {
    expect(healStaleShell(new Error('x'))).toBe(false);
    expect(healStaleShell(null)).toBe(false);
    expect(healStaleShell({ code: PROVIDER_LOAD_FAILED })).toBe(true);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });
});

describe('updateWorkerThenReload', () => {
  it('reloads straight away without a service worker', async () => {
    await updateWorkerThenReload();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('updates the registration and reloads when nothing is installing', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    setServiceWorker({ getRegistration: vi.fn().mockResolvedValue({ update }) });
    await updateWorkerThenReload();
    expect(update).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('waits for the new worker to activate', async () => {
    let onChange;
    const installing = { state: 'installing', addEventListener: (_e, cb) => { onChange = cb; } };
    setServiceWorker({ getRegistration: vi.fn().mockResolvedValue({ update: vi.fn(), installing }) });
    const done = updateWorkerThenReload();
    await vi.waitFor(() => expect(onChange).toBeTypeOf('function'));
    installing.state = 'installed';
    onChange();
    await Promise.resolve();
    expect(reload).not.toHaveBeenCalled();
    installing.state = 'activated';
    onChange();
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('also resolves when the new worker turns redundant', async () => {
    let onChange;
    const waiting = { state: 'waiting', addEventListener: (_e, cb) => { onChange = cb; } };
    setServiceWorker({ getRegistration: vi.fn().mockResolvedValue({ update: vi.fn(), waiting }) });
    const done = updateWorkerThenReload();
    await vi.waitFor(() => expect(onChange).toBeTypeOf('function'));
    waiting.state = 'redundant';
    onChange();
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('stops waiting after five seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const installing = { state: 'installing', addEventListener: vi.fn() };
    setServiceWorker({ getRegistration: vi.fn().mockResolvedValue({ update: vi.fn(), installing }) });
    const done = updateWorkerThenReload();
    await vi.waitFor(() => expect(installing.addEventListener).toHaveBeenCalled());
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads even when the update check throws', async () => {
    setServiceWorker({ getRegistration: vi.fn().mockRejectedValue(new Error('sw')) });
    await updateWorkerThenReload();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
