import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROVIDER_LOAD_FAILED } from '../../../src/lib/seamErrors.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock('../../../src/services/providers/http/cityProvider.js');
  vi.resetModules();
});

describe('API_BASE', () => {
  it('defaults to the same-origin /api proxy', async () => {
    vi.stubEnv('VITE_API_BASE', '');
    vi.resetModules();
    const { API_BASE } = await import('../../../src/services/config.js');
    expect(API_BASE).toBe('/api');
  });

  it('warns in dev when the base is cross-origin', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://api.example.test');
    vi.resetModules();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { API_BASE } = await import('../../../src/services/config.js');
    expect(API_BASE).toBe('https://api.example.test');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('VITE_API_BASE="https://api.example.test" is cross-origin'));
  });

  it('stays quiet for a base on the page origin', async () => {
    vi.stubEnv('VITE_API_BASE', `${window.location.origin}/api`);
    vi.resetModules();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await import('../../../src/services/config.js');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('createProvider', () => {
  it('loads the provider module for a known domain and caches the load', async () => {
    vi.resetModules();
    const { createProvider } = await import('../../../src/services/config.js');
    const load = createProvider('city');
    const first = load();
    expect(load()).toBe(first);
    expect(createProvider('city')()).toBe(first);
    expect(await first).toHaveProperty('listCities');
  });

  it('throws immediately for an unknown domain, naming the known ones', async () => {
    vi.resetModules();
    const { createProvider } = await import('../../../src/services/config.js');
    expect(() => createProvider('nope')()).toThrow(/No provider for domain "nope"/);
    expect(() => createProvider('nope')()).toThrow(/Known domains: .*\bcity\b.*\bproperty\b/);
  });

  it('wraps an import failure with a stale-shell code and retries on the next call', async () => {
    vi.resetModules();
    vi.doMock('../../../src/services/providers/http/cityProvider.js', () => {
      throw new Error('chunk 404');
    });
    const { createProvider } = await import('../../../src/services/config.js');
    const load = createProvider('city');
    const err = await load().catch((e) => e);
    expect(err.code).toBe(PROVIDER_LOAD_FAILED);
    expect(err.message).toBe('[services] could not load the "city" provider.');
    expect(err.cause).toBeInstanceOf(Error);
    const again = load();
    await expect(again).rejects.toMatchObject({ code: PROVIDER_LOAD_FAILED });
  });
});
