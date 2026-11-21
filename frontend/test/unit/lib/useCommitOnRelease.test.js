import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useCommitOnRelease } from '../../../src/lib/useCommitOnRelease.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useCommitOnRelease', () => {
  it('shows the committed value until a live value is set', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useCommitOnRelease(5, onCommit));
    expect(result.current[0]).toBe(5);
    act(() => result.current[1](9));
    expect(result.current[0]).toBe(9);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits the live value on blur', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useCommitOnRelease(5, onCommit));
    act(() => result.current[1](9));
    act(() => result.current[2].onBlur());
    expect(onCommit).toHaveBeenCalledWith(9);
  });

  it('does not commit when nothing changed', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useCommitOnRelease(5, onCommit));
    act(() => result.current[2].onBlur());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('discards the live value when the pointer is cancelled', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useCommitOnRelease(5, onCommit));
    act(() => result.current[1](9));
    act(() => result.current[2].onPointerCancel());
    expect(result.current[0]).toBe(5);
    act(() => result.current[2].onBlur());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('drops the live value once the upstream value changes', () => {
    const { result, rerender } = renderHook(({ v }) => useCommitOnRelease(v, vi.fn()), { initialProps: { v: 5 } });
    act(() => result.current[1](9));
    rerender({ v: 7 });
    expect(result.current[0]).toBe(7);
  });

  it('coalesces native change events and flushes on detach', () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    const { result } = renderHook(() => useCommitOnRelease(5, onCommit));
    const el = document.createElement('input');
    const detach = result.current[2].ref(el);
    act(() => result.current[1](9));
    el.dispatchEvent(new Event('change'));
    el.dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(449);
    expect(onCommit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(9);

    onCommit.mockClear();
    detach();
    expect(onCommit).toHaveBeenCalledWith(9);
    el.dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(1000);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('ignores a null element in the ref callback', () => {
    const { result } = renderHook(() => useCommitOnRelease(5, vi.fn()));
    expect(result.current[2].ref(null)).toBeUndefined();
  });
});
