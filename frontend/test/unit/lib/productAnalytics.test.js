import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const posthog = {
  init: vi.fn(),
  has_opted_out_capturing: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  capture: vi.fn(),
  reset: vi.fn(),
  stopSessionRecording: vi.fn(),
  startSessionRecording: vi.fn(),
};
vi.mock('posthog-js', () => ({ default: posthog }));

let analytics;
const consent = (analyticsOn) => localStorage.setItem('dz_cookie_consent_v1', JSON.stringify({ analytics: analyticsOn, version: 1 }));
const flush = () => new Promise((r) => setTimeout(r, 0));

const load = async (env = { VITE_POSTHOG_KEY: 'phc_key', VITE_DEPLOY_ENV: 'prod' }, prod = true) => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('PROD', prod);
  vi.stubEnv('VITE_POSTHOG_KEY', '');
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  analytics = await import('../../../src/lib/productAnalytics.js');
};

const listeners = [];

beforeAll(async () => { await import('../../../src/components/CookieConsent.jsx'); }, 60_000);

beforeEach(() => {
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, fn, opts) => {
    if (type === 'dz:consent-change') listeners.push(fn);
    add(type, fn, opts);
  });
  localStorage.clear();
  Object.values(posthog).forEach((f) => f.mockReset());
  posthog.has_opted_out_capturing.mockReturnValue(false);
  window.history.replaceState({}, '', '/');
});
afterEach(() => {
  vi.unstubAllEnvs();
  listeners.splice(0).forEach((fn) => window.removeEventListener('dz:consent-change', fn));
});

describe('initProductAnalytics', () => {
  it('does nothing without a PostHog key', async () => {
    await load({});
    consent(true);
    analytics.initProductAnalytics();
    await flush();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it('does nothing for local deployments', async () => {
    await load({ VITE_POSTHOG_KEY: 'k', VITE_DEPLOY_ENV: 'local' });
    consent(true);
    analytics.initProductAnalytics();
    await flush();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it('stays unloaded until analytics consent is given', async () => {
    await load();
    analytics.initProductAnalytics();
    await flush();
    expect(posthog.init).not.toHaveBeenCalled();
    consent(true);
    window.dispatchEvent(new Event('dz:consent-change'));
    await flush();
    expect(posthog.init).toHaveBeenCalledTimes(1);
  });

  it('initialises with privacy-first settings when consent exists', async () => {
    await load({ VITE_POSTHOG_KEY: 'phc_key', VITE_DEPLOY_ENV: 'prod', VITE_POSTHOG_HOST: 'https://eu.example' });
    consent(true);
    analytics.initProductAnalytics();
    await flush();
    const [key, cfg] = posthog.init.mock.calls[0];
    expect(key).toBe('phc_key');
    expect(cfg).toMatchObject({
      api_host: 'https://eu.example',
      person_profiles: 'identified_only',
      mask_all_text: true,
      disable_surveys: true,
      session_recording: { maskAllInputs: true },
    });
  });

  it('defaults the host and re-opts in a previously opted-out client', async () => {
    await load();
    posthog.has_opted_out_capturing.mockReturnValue(true);
    consent(true);
    analytics.initProductAnalytics();
    await flush();
    expect(posthog.init.mock.calls[0][1].api_host).toBe('https://us.i.posthog.com');
    expect(posthog.opt_in_capturing).toHaveBeenCalled();
  });

  it('is enabled in dev only when explicitly switched on', async () => {
    await load({ VITE_POSTHOG_KEY: 'k', VITE_POSTHOG_IN_DEV: 'on' }, false);
    consent(true);
    analytics.initProductAnalytics();
    await flush();
    expect(posthog.init).toHaveBeenCalled();
  });

  it('does not load inside the back office', async () => {
    await load();
    consent(true);
    window.history.replaceState({}, '', '/admin/users');
    analytics.initProductAnalytics();
    await flush();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it('retries loading after an init failure', async () => {
    await load();
    consent(true);
    posthog.init.mockImplementationOnce(() => { throw new Error('boom'); });
    analytics.initProductAnalytics();
    await flush();
    window.dispatchEvent(new Event('dz:consent-change'));
    await flush();
    expect(posthog.init).toHaveBeenCalledTimes(2);
  });
});

describe('consent changes', () => {
  it('opts out when consent is withdrawn and back in when granted again', async () => {
    await load();
    consent(true);
    analytics.initProductAnalytics();
    await flush();
    consent(false);
    window.dispatchEvent(new Event('dz:consent-change'));
    await flush();
    expect(posthog.opt_out_capturing).toHaveBeenCalled();
    posthog.has_opted_out_capturing.mockReturnValue(true);
    consent(true);
    window.dispatchEvent(new Event('dz:consent-change'));
    await flush();
    expect(posthog.opt_in_capturing).toHaveBeenCalled();
  });
});

describe('capture / resetAnalyticsIdentity', () => {
  it('are no-ops before the client loads', async () => {
    await load();
    expect(() => analytics.capture('x')).not.toThrow();
    expect(() => analytics.resetAnalyticsIdentity()).not.toThrow();
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it('forward to PostHog once loaded', async () => {
    await load();
    consent(true);
    analytics.initProductAnalytics();
    await flush();
    analytics.capture('listing_viewed', { id: 1 });
    analytics.resetAnalyticsIdentity();
    await flush();
    expect(posthog.capture).toHaveBeenCalledWith('listing_viewed', { id: 1 });
    expect(posthog.reset).toHaveBeenCalled();
  });
});

describe('before_send back-office filter', () => {
  const setup = async () => {
    await load();
    consent(true);
    analytics.initProductAnalytics();
    await flush();
    return posthog.init.mock.calls[0][1].before_send;
  };

  it('passes events through on public pages', async () => {
    const beforeSend = await setup();
    const evt = { event: 'e', properties: { $pathname: '/listings' } };
    expect(beforeSend(evt)).toBe(evt);
    expect(posthog.stopSessionRecording).not.toHaveBeenCalled();
  });

  it('drops events from back-office paths and pauses replay while there', async () => {
    const beforeSend = await setup();
    window.history.replaceState({}, '', '/ops/queue');
    expect(beforeSend({ event: 'e', properties: {} })).toBeNull();
    expect(posthog.stopSessionRecording).toHaveBeenCalledTimes(1);
    beforeSend({ event: 'e2', properties: {} });
    expect(posthog.stopSessionRecording).toHaveBeenCalledTimes(1);
    window.history.replaceState({}, '', '/listings');
    expect(beforeSend({ event: 'e3', properties: {} })).toMatchObject({ event: 'e3' });
    expect(posthog.startSessionRecording).toHaveBeenCalledTimes(1);
  });

  it('drops events whose recorded path is back office even from a public page', async () => {
    const beforeSend = await setup();
    expect(beforeSend({ event: 'e', properties: { $pathname: '/staff/home' } })).toBeNull();
    expect(beforeSend(null)).toBeNull();
  });
});
