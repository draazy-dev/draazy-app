import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const recordPageViews = vi.fn();
let consent = false;
vi.mock('../../../../src/services/pageViewService.js', () => ({ recordPageViews: (...a) => recordPageViews(...a) }));
vi.mock('../../../../src/components/CookieConsent.jsx', () => ({
  CONSENT_CHANGE: 'test:consent-change',
  hasAnalyticsConsent: () => consent,
}));

let beacon;
let stop;

const setWidth = (width) => Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  vi.resetModules();
  recordPageViews.mockReset();
  recordPageViews.mockResolvedValue(undefined);
  consent = false;
  sessionStorage.clear();
  setWidth(1280);
  beacon = await import('../../../../src/lib/telemetry/pageViewBeacon.js');
  stop = null;
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const lastCall = () => recordPageViews.mock.calls.at(-1)[0];

describe('recordPageView', () => {
  it('queues route patterns, not raw paths, and flushes them on stop', () => {
    stop = beacon.startPageViewBeacon();
    beacon.recordPageView('/property/abc-123');
    vi.advanceTimersByTime(2500);
    beacon.recordPageView('/listings');
    stop();
    stop = null;
    const call = lastCall();
    expect(call.events.map((e) => e.path)).toEqual(['/property/:id', '/listings']);
    expect(call.events.map((e) => e.agoMs)).toEqual([2500, 0]);
    expect(call.attributed).toBe(false);
  });

  it('ignores back-office routes', () => {
    stop = beacon.startPageViewBeacon();
    ['/admin', '/admin/users', '/ops', '/ops/legal', '/staff/x'].forEach((p) => beacon.recordPageView(p));
    stop();
    stop = null;
    expect(recordPageViews).not.toHaveBeenCalled();
  });

  it('classifies the device from the viewport width', () => {
    setWidth(500);
    beacon.recordPageView('/');
    setWidth(800);
    beacon.recordPageView('/');
    setWidth(1400);
    beacon.recordPageView('/');
    setWidth(0);
    beacon.recordPageView('/');
    stop = beacon.startPageViewBeacon();
    stop();
    stop = null;
    expect(lastCall().events.map((e) => e.device)).toEqual(['mobile', 'tablet', 'desktop', 'desktop']);
  });

  it('records the referrer host only when it is another site', () => {
    const referrer = vi.spyOn(document, 'referrer', 'get');
    referrer.mockReturnValue('https://www.google.com/search?q=x');
    beacon.recordPageView('/');
    referrer.mockReturnValue(`${window.location.origin}/previous`);
    beacon.recordPageView('/');
    referrer.mockReturnValue('not a url');
    beacon.recordPageView('/');
    referrer.mockReturnValue('');
    beacon.recordPageView('/');
    stop = beacon.startPageViewBeacon();
    stop();
    stop = null;
    expect(lastCall().events.map((e) => e.referrerHost)).toEqual(['www.google.com', undefined, undefined, undefined]);
  });

  it('flushes immediately at 40 queued views', () => {
    for (let i = 0; i < 39; i += 1) beacon.recordPageView('/');
    expect(recordPageViews).not.toHaveBeenCalled();
    beacon.recordPageView('/');
    expect(recordPageViews).toHaveBeenCalledTimes(1);
    expect(lastCall().events).toHaveLength(40);
  });
});

describe('session identity', () => {
  it('mints a 32 character id and keeps it in sessionStorage', () => {
    beacon.recordPageView('/');
    stop = beacon.startPageViewBeacon();
    stop();
    stop = null;
    const id = lastCall().sessionId;
    expect(id).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(sessionStorage.getItem('pn.pv.sid')).toBe(id);
  });

  it('reuses a stored id', () => {
    sessionStorage.setItem('pn.pv.sid', 'stored-session');
    beacon.recordPageView('/');
    stop = beacon.startPageViewBeacon();
    stop();
    stop = null;
    expect(lastCall().sessionId).toBe('stored-session');
  });

  it('falls back to a stable in-memory id when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    beacon.recordPageView('/');
    stop = beacon.startPageViewBeacon();
    stop();
    const first = lastCall().sessionId;
    stop = beacon.startPageViewBeacon();
    beacon.recordPageView('/');
    stop();
    stop = null;
    expect(first).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(lastCall().sessionId).toBe(first);
  });

  it('mints ids with Math.random when crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    beacon.recordPageView('/');
    stop = beacon.startPageViewBeacon();
    stop();
    stop = null;
    expect(lastCall().sessionId).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});

describe('consent handling', () => {
  it('marks batches attributed when analytics consent is given', () => {
    consent = true;
    beacon.recordPageView('/');
    stop = beacon.startPageViewBeacon();
    stop();
    stop = null;
    expect(lastCall().attributed).toBe(true);
  });

  it('flushes the old batch and starts a fresh session when consent changes', () => {
    stop = beacon.startPageViewBeacon();
    beacon.recordPageView('/');
    const before = sessionStorage.getItem('pn.pv.sid');
    consent = true;
    window.dispatchEvent(new Event('test:consent-change'));
    expect(recordPageViews).toHaveBeenCalledTimes(1);
    expect(lastCall()).toMatchObject({ attributed: false, sessionId: expect.any(String) });
    expect(sessionStorage.getItem('pn.pv.sid')).toBeNull();
    beacon.recordPageView('/map');
    stop();
    stop = null;
    expect(lastCall().attributed).toBe(true);
    expect(lastCall().sessionId).not.toBe(before);
  });

  it('does nothing when consent is unchanged', () => {
    stop = beacon.startPageViewBeacon();
    beacon.recordPageView('/');
    window.dispatchEvent(new Event('test:consent-change'));
    expect(recordPageViews).not.toHaveBeenCalled();
  });
});

describe('startPageViewBeacon', () => {
  it('flushes every minute', () => {
    stop = beacon.startPageViewBeacon();
    beacon.recordPageView('/');
    vi.advanceTimersByTime(59_000);
    expect(recordPageViews).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(recordPageViews).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(recordPageViews).toHaveBeenCalledTimes(1);
  });

  it('flushes when the tab is hidden but not when visible', () => {
    stop = beacon.startPageViewBeacon();
    beacon.recordPageView('/');
    const state = vi.spyOn(document, 'visibilityState', 'get');
    state.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(recordPageViews).not.toHaveBeenCalled();
    state.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(recordPageViews).toHaveBeenCalledTimes(1);
  });

  it('only starts once and stops cleanly', () => {
    stop = beacon.startPageViewBeacon();
    const second = beacon.startPageViewBeacon();
    expect(second()).toBeUndefined();
    beacon.recordPageView('/');
    stop();
    expect(recordPageViews).toHaveBeenCalledTimes(1);
    stop = null;
    beacon.recordPageView('/');
    vi.advanceTimersByTime(120_000);
    expect(recordPageViews).toHaveBeenCalledTimes(1);
    stop = beacon.startPageViewBeacon();
    expect(stop).toEqual(expect.any(Function));
  });
});
