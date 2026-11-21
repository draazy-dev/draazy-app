import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getListingPolicy = vi.fn();
vi.mock('../../../../src/services/settingsService.js', () => ({ getListingPolicy: (...a) => getListingPolicy(...a) }));

let usePhotoLimit;

beforeEach(async () => {
  vi.resetModules();
  getListingPolicy.mockReset();
  usePhotoLimit = (await import('../../../../src/lib/uploads/usePhotoLimit.js')).default;
});

afterEach(cleanup);

describe('usePhotoLimit', () => {
  it('starts at the default then adopts the configured limit', async () => {
    getListingPolicy.mockResolvedValue({ maxPhotos: 14 });
    const { result } = renderHook(() => usePhotoLimit());
    expect(result.current).toBe(10);
    await vi.waitFor(() => expect(result.current).toBe(14));
  });

  it('keeps the default when the policy cannot be loaded', async () => {
    getListingPolicy.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePhotoLimit());
    await vi.waitFor(() => expect(getListingPolicy).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current).toBe(10);
  });

  it('reuses the cached value for later mounts without refetching', async () => {
    getListingPolicy.mockResolvedValue({ maxPhotos: 12 });
    const first = renderHook(() => usePhotoLimit());
    await vi.waitFor(() => expect(first.result.current).toBe(12));
    const second = renderHook(() => usePhotoLimit());
    expect(second.result.current).toBe(12);
  });

  it('shares one in-flight request between hooks', async () => {
    getListingPolicy.mockResolvedValue({ maxPhotos: 8 });
    const a = renderHook(() => usePhotoLimit());
    const b = renderHook(() => usePhotoLimit());
    await vi.waitFor(() => expect(a.result.current).toBe(8));
    await vi.waitFor(() => expect(b.result.current).toBe(8));
    expect(getListingPolicy).toHaveBeenCalledTimes(1);
  });

  it('reloads when settings change and stops listening on unmount', async () => {
    getListingPolicy.mockResolvedValue({ maxPhotos: 8 });
    const { result, unmount } = renderHook(() => usePhotoLimit());
    await vi.waitFor(() => expect(result.current).toBe(8));
    getListingPolicy.mockResolvedValue({ maxPhotos: 16 });
    await act(async () => { window.dispatchEvent(new Event('draazy-settings-change')); });
    await vi.waitFor(() => expect(result.current).toBe(16));
    unmount();
    getListingPolicy.mockClear();
    window.dispatchEvent(new Event('draazy-settings-change'));
    expect(getListingPolicy).not.toHaveBeenCalled();
  });
});
