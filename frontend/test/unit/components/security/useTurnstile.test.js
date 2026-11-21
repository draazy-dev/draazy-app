import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ key: 'key' }));

vi.mock('../../../../src/components/security/turnstileToken.js', async (orig) => {
  const real = await orig();
  return { ...real, createTokenSlot: vi.fn(() => h.slot) };
});

const loadHook = async (siteKey) => {
  vi.resetModules();
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', siteKey);
  return import('../../../../src/components/security/useTurnstile.js');
};

const makeSlot = (over = {}) => ({
  put: vi.fn(), restarted: vi.fn(), needsRestart: vi.fn(() => false), take: vi.fn(async () => 'tok'), ...over,
});

describe('useTurnstile', () => {
  beforeEach(() => { h.slot = makeSlot(); });
  afterEach(() => vi.unstubAllEnvs());

  it('feeds widget tokens into the slot', async () => {
    const { useTurnstile } = await loadHook('k');
    const { result } = renderHook(() => useTurnstile());
    result.current.onToken('t');
    expect(h.slot.put).toHaveBeenCalledWith('t');
    expect(result.current.round).toBe(0);
  });

  it('sends a request with a fresh token and remounts the widget after spending it', async () => {
    const { useTurnstile } = await loadHook('k');
    const { result } = renderHook(() => useTurnstile());
    const request = vi.fn(async (tok) => `sent:${tok}`);
    let out;
    await act(async () => { out = await result.current.withToken(request); });
    expect(out).toBe('sent:tok');
    expect(h.slot.restarted).toHaveBeenCalledTimes(1);
    expect(result.current.round).toBe(1);
  });

  it('restarts a stuck widget before waiting for its token', async () => {
    const { useTurnstile } = await loadHook('k');
    h.slot.needsRestart.mockReturnValue(true);
    const { result } = renderHook(() => useTurnstile());
    await act(async () => { await result.current.withToken(async () => 'x'); });
    expect(h.slot.restarted).toHaveBeenCalledTimes(2);
    expect(result.current.round).toBe(2);
  });

  it('sends without a token when no site key is configured', async () => {
    const { useTurnstile } = await loadHook('');
    const { result } = renderHook(() => useTurnstile());
    const request = vi.fn(async (tok) => tok);
    await act(async () => { await result.current.withToken(request); });
    expect(request).toHaveBeenCalledWith(null);
    expect(h.slot.take).not.toHaveBeenCalled();
    expect(result.current.round).toBe(0);
  });

  it('creates a single slot per component instance', async () => {
    const { useTurnstile } = await loadHook('k');
    const { createTokenSlot } = await import('../../../../src/components/security/turnstileToken.js');
    const { rerender } = renderHook(() => useTurnstile());
    rerender();
    expect(createTokenSlot).toHaveBeenCalledTimes(1);
  });
});
