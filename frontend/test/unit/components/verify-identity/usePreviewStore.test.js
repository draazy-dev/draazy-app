import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import usePreviewStore from '../../../../src/components/verify-identity/usePreviewStore.js';
import { capturePreviewUrl, releasePreviewUrl } from '../../../../src/lib/identity-verification/capture.js';

vi.mock('../../../../src/lib/identity-verification/capture.js', () => ({
  capturePreviewUrl: vi.fn((file) => `blob:${file}`),
  releasePreviewUrl: vi.fn(),
}));

describe('usePreviewStore', () => {
  it('starts with empty captures', () => {
    const { result } = renderHook(() => usePreviewStore());
    expect(result.current.captures).toEqual({ front: null, back: null, selfie: null });
  });

  it('stores a file with its preview url', () => {
    const { result } = renderHook(() => usePreviewStore());
    act(() => result.current.setCapture('front', 'f1'));
    expect(result.current.captures.front).toEqual({ file: 'f1', url: 'blob:f1' });
    expect(result.current.captures.back).toBeNull();
    expect(capturePreviewUrl).toHaveBeenCalledWith('f1');
  });

  it('releases the previous preview when a capture is replaced', () => {
    const { result } = renderHook(() => usePreviewStore());
    act(() => result.current.setCapture('front', 'f1'));
    vi.mocked(releasePreviewUrl).mockClear();
    act(() => result.current.setCapture('front', 'f2'));
    expect(result.current.captures.front.url).toBe('blob:f2');
    expect(releasePreviewUrl).toHaveBeenCalledWith('blob:f1');
  });

  it('clears a single capture and releases its preview', () => {
    const { result } = renderHook(() => usePreviewStore());
    act(() => { result.current.setCapture('front', 'f1'); });
    act(() => { result.current.setCapture('selfie', 's1'); });
    vi.mocked(releasePreviewUrl).mockClear();
    act(() => result.current.resetCapture('front'));
    expect(result.current.captures).toEqual({ front: null, back: null, selfie: { file: 's1', url: 'blob:s1' } });
    expect(releasePreviewUrl).toHaveBeenCalledWith('blob:f1');
  });

  it('clears everything and releases every preview', () => {
    const { result } = renderHook(() => usePreviewStore());
    act(() => { result.current.setCapture('front', 'f1'); });
    act(() => { result.current.setCapture('back', 'b1'); });
    vi.mocked(releasePreviewUrl).mockClear();
    act(() => result.current.clearCaptures());
    expect(result.current.captures).toEqual({ front: null, back: null, selfie: null });
    const released = vi.mocked(releasePreviewUrl).mock.calls.map(([u]) => u);
    expect(released).toEqual(expect.arrayContaining(['blob:f1', 'blob:b1']));
  });

  it('releases any remaining previews on unmount', () => {
    const { result, unmount } = renderHook(() => usePreviewStore());
    act(() => result.current.setCapture('back', 'b1'));
    vi.mocked(releasePreviewUrl).mockClear();
    unmount();
    expect(releasePreviewUrl).toHaveBeenCalledWith('blob:b1');
  });
});
