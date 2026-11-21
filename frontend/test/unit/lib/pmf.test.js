import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hasAnalyticsConsent = vi.fn();
const capture = vi.fn();

vi.mock('../../../src/components/CookieConsent.jsx', () => ({
  CONSENT_CHANGE: 'dz-consent-change',
  hasAnalyticsConsent: (...a) => hasAnalyticsConsent(...a),
}));
vi.mock('../../../src/lib/productAnalytics.js', () => ({ capture: (...a) => capture(...a) }));

async function load({ mode = 'on', ga = 'G-TEST' } = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_PMF_MODE', mode);
  vi.stubEnv('VITE_GA_ID', ga);
  return import('../../../src/lib/pmf.js');
}

beforeEach(() => {
  hasAnalyticsConsent.mockReset();
  capture.mockReset();
  delete window.gtag;
  delete window.dataLayer;
  delete window['ga-disable-G-TEST'];
  document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('pmfEnabled', () => {
  it('mirrors VITE_PMF_MODE', async () => {
    expect((await load({ mode: 'on' })).pmfEnabled).toBe(true);
    expect((await load({ mode: 'off' })).pmfEnabled).toBe(false);
  });
});

describe('track', () => {
  it('always forwards to product analytics', async () => {
    const { track } = await load({ mode: 'off' });
    track('click', { a: 1 });
    expect(capture).toHaveBeenCalledWith('click', { a: 1 });
    expect(window.gtag).toBeUndefined();
  });

  it('does not send to GA without consent', async () => {
    hasAnalyticsConsent.mockReturnValue(false);
    const { track } = await load();
    track('click');
    expect(capture).toHaveBeenCalledWith('click', {});
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });

  it('loads GA once with consent and sends the event', async () => {
    hasAnalyticsConsent.mockReturnValue(true);
    const { track } = await load();
    track('signup', { plan: 'x' });
    track('signup2');
    const scripts = document.head.querySelectorAll('script[src*="googletagmanager"]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST');
    const calls = window.dataLayer.map((a) => Array.from(a));
    expect(calls[0][0]).toBe('js');
    expect(calls[1]).toEqual(['config', 'G-TEST']);
    expect(calls).toContainEqual(['event', 'signup', { plan: 'x' }]);
    expect(calls).toContainEqual(['event', 'signup2', {}]);
  });

  it('does not load GA without a measurement id', async () => {
    hasAnalyticsConsent.mockReturnValue(true);
    const { track } = await load({ ga: '' });
    track('x');
    expect(window.gtag).toBeUndefined();
  });

  it('swallows a failing gtag', async () => {
    hasAnalyticsConsent.mockReturnValue(true);
    const { track } = await load();
    window.gtag = () => { throw new Error('boom'); };
    expect(() => track('x')).not.toThrow();
  });
});

describe('initPmf', () => {
  it('does nothing when PMF mode is off', async () => {
    hasAnalyticsConsent.mockReturnValue(true);
    const { initPmf } = await load({ mode: 'off' });
    initPmf();
    window.dispatchEvent(new Event('dz-consent-change'));
    expect(window.gtag).toBeUndefined();
  });

  it('loads GA immediately when consent already exists', async () => {
    hasAnalyticsConsent.mockReturnValue(true);
    const { initPmf } = await load();
    initPmf();
    expect(typeof window.gtag).toBe('function');
  });

  it('updates consent mode and loads GA when consent is granted later', async () => {
    hasAnalyticsConsent.mockReturnValue(false);
    const { initPmf } = await load();
    initPmf();
    expect(window.gtag).toBeUndefined();
    hasAnalyticsConsent.mockReturnValue(true);
    window.dispatchEvent(new Event('dz-consent-change'));
    expect(window['ga-disable-G-TEST']).toBe(false);
    expect(window.gtag).toBeTypeOf('function');
    const calls = window.dataLayer.map((a) => Array.from(a));
    expect(calls.map((c) => c[0])).toEqual(['js', 'config']);
  });

  it('disables GA and denies storage when consent is withdrawn', async () => {
    hasAnalyticsConsent.mockReturnValue(true);
    const { initPmf } = await load();
    initPmf();
    hasAnalyticsConsent.mockReturnValue(false);
    window.dispatchEvent(new Event('dz-consent-change'));
    expect(window['ga-disable-G-TEST']).toBe(true);
    const calls = window.dataLayer.map((a) => Array.from(a));
    expect(calls).toContainEqual(['consent', 'update', { analytics_storage: 'denied' }]);
  });
});

describe('captureLead', () => {
  it('skips when PMF mode is off', async () => {
    const { captureLead } = await load({ mode: 'off' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(captureLead({ context: 'x' })).resolves.toEqual({ ok: false, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts a form-encoded lead', async () => {
    const { captureLead } = await load();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await expect(captureLead({ leadType: 'owner', propertyId: 'p1' })).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const body = new URLSearchParams(init.body);
    expect(body.get('form-name')).toBe('pmf-lead');
    expect(body.get('context')).toBe('owner');
    expect(body.get('property')).toBe('p1');
    expect(Number(body.get('ts'))).toBeGreaterThan(0);
  });

  it('prefers explicit context and property, and defaults to empty', async () => {
    const { captureLead } = await load();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    await expect(captureLead({ context: 'c', leadType: 'l', property: 'p', propertyId: 'i' })).resolves.toEqual({ ok: false });
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get('context')).toBe('c');
    expect(body.get('property')).toBe('p');
    await captureLead();
    expect(new URLSearchParams(fetchMock.mock.calls[1][1].body).get('context')).toBe('');
  });

  it('reports failure when the network call rejects', async () => {
    const { captureLead } = await load();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(captureLead({})).resolves.toEqual({ ok: false });
  });
});
