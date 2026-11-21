import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const load = async (env = {}) => {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('../../../src/lib/mapsConfig.js');
};

beforeEach(() => {
  delete window.google;
  delete window.gm_authFailure;
  document.documentElement.className = '';
  document.head.innerHTML = '';
});
afterEach(() => { vi.unstubAllEnvs(); delete window.google; delete window.gm_authFailure; });

describe('config', () => {
  it('falls back to the demo map id without DDS', async () => {
    const m = await load({ VITE_GOOGLE_MAPS_API_KEY: '', VITE_GOOGLE_MAPS_MAP_ID: '' });
    expect(m.GOOGLE_MAPS_API_KEY).toBe('');
    expect(m.GOOGLE_MAPS_MAP_ID).toBe('DEMO_MAP_ID');
    expect(m.GOOGLE_MAPS_HAS_DDS).toBe(false);
  });

  it('enables DDS for a real map id', async () => {
    const m = await load({ VITE_GOOGLE_MAPS_API_KEY: 'k', VITE_GOOGLE_MAPS_MAP_ID: 'abc123' });
    expect(m.GOOGLE_MAPS_MAP_ID).toBe('abc123');
    expect(m.GOOGLE_MAPS_HAS_DDS).toBe(true);
  });

  it('follows the page theme for the map colour scheme', async () => {
    const m = await load();
    expect(m.mapColorScheme()).toBe('DARK');
    document.documentElement.classList.add('light');
    expect(m.mapColorScheme()).toBe('LIGHT');
  });
});

describe('installMapsLoader', () => {
  it('does nothing without an API key', async () => {
    const m = await load({ VITE_GOOGLE_MAPS_API_KEY: '' });
    m.installMapsLoader();
    expect(window.google).toBeUndefined();
    expect(window.gm_authFailure).toBeUndefined();
  });

  it('keeps an existing importLibrary', async () => {
    const m = await load({ VITE_GOOGLE_MAPS_API_KEY: 'k' });
    const existing = vi.fn();
    window.google = { maps: { importLibrary: existing } };
    m.installMapsLoader();
    expect(window.google.maps.importLibrary).toBe(existing);
    expect(typeof window.gm_authFailure).toBe('function');
  });

  it('lazily injects the SDK script once and resolves via the callback', async () => {
    const m = await load({ VITE_GOOGLE_MAPS_API_KEY: 'key 1' });
    m.installMapsLoader();
    expect(document.head.querySelector('script')).toBeNull();
    const import1 = window.google.maps.importLibrary;
    const lib = { Map: class {} };
    const calls = [];
    const stub = (name) => { calls.push(name); return lib; };
    const first = import1('maps');
    const scripts = document.head.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    const url = new URL(scripts[0].src);
    expect(url.origin + url.pathname).toBe('https://maps.googleapis.com/maps/api/js');
    expect(url.searchParams.get('key')).toBe('key 1');
    expect(url.searchParams.get('v')).toBe('weekly');
    expect(url.searchParams.get('callback')).toBe('google.maps.__ib__');
    const second = import1('places');
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
    window.google.maps.importLibrary = stub;
    window.google.maps.__ib__();
    expect(await first).toBe(lib);
    expect(await second).toBe(lib);
    expect(calls).toEqual(['maps', 'places']);
  });

  it('rejects and allows a retry when the script fails to load', async () => {
    const m = await load({ VITE_GOOGLE_MAPS_API_KEY: 'k' });
    m.installMapsLoader();
    const p = window.google.maps.importLibrary('maps');
    document.head.querySelector('script').onerror();
    await expect(p).rejects.toThrow('Google Maps JS could not load');
    window.google.maps.importLibrary('maps').catch(() => {});
    expect(document.head.querySelectorAll('script')).toHaveLength(2);
  });
});

describe('refusal tracking', () => {
  it('flags refusal, notifies subscribers and chains the previous handler', async () => {
    const m = await load({ VITE_GOOGLE_MAPS_API_KEY: 'k' });
    const prev = vi.fn();
    window.gm_authFailure = prev;
    m.installMapsLoader();
    const listener = vi.fn();
    const off = m.subscribeMapsRefusal(listener);
    expect(m.isMapsRefused()).toBe(false);
    window.gm_authFailure();
    expect(m.isMapsRefused()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(prev).toHaveBeenCalledTimes(1);
    off();
    window.gm_authFailure();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
