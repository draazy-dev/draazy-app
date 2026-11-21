import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOtpFlow } from '../../../../src/components/auth/useOtpFlow.js';
import { classifyOtpSendError } from '../../../../src/lib/otpSendError.js';
import { healStaleShell } from '../../../../src/lib/seamErrors.js';

vi.mock('../../../../src/lib/otpSendError.js', () => ({ classifyOtpSendError: vi.fn((e) => ({ messageKey: `k:${e.code}` })) }));
vi.mock('../../../../src/lib/seamErrors.js', () => ({ healStaleShell: vi.fn() }));

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('useOtpFlow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts idle', () => {
    const { result } = renderHook(() => useOtpFlow(vi.fn()));
    expect(result.current).toMatchObject({
      otpSent: false, sending: false, otp: '', otpError: false, sendError: null, seconds: 0, canResend: false,
    });
  });

  it('sends the code and counts down the server-provided cooldown', async () => {
    const dispatch = vi.fn().mockResolvedValue({ resendAfterSeconds: 3 });
    const { result } = renderHook(() => useOtpFlow(dispatch));
    let ok;
    await act(async () => { ok = await result.current.send('9876543210'); });
    expect(ok).toBe(true);
    expect(dispatch).toHaveBeenCalledWith('9876543210');
    expect(result.current).toMatchObject({ otpSent: true, sending: false, seconds: 3, canResend: false });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.seconds).toBe(2);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.seconds).toBe(0);
    expect(result.current.canResend).toBe(true);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.seconds).toBe(0);
  });

  it('falls back to a 60 second cooldown when the ack has none', async () => {
    const { result } = renderHook(() => useOtpFlow(vi.fn().mockResolvedValue(undefined)));
    await act(async () => { await result.current.send('1'); });
    expect(result.current.seconds).toBe(60);
  });

  it('does not run a timer for a zero cooldown', async () => {
    const { result } = renderHook(() => useOtpFlow(vi.fn().mockResolvedValue({ resendAfterSeconds: 0 })));
    await act(async () => { await result.current.send('1'); });
    expect(result.current).toMatchObject({ seconds: 0, canResend: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rounds fractional cooldowns and rejects negative ones', async () => {
    const dispatch = vi.fn().mockResolvedValueOnce({ resendAfterSeconds: 4.6 }).mockResolvedValueOnce({ resendAfterSeconds: -5 });
    const { result } = renderHook(() => useOtpFlow(dispatch));
    await act(async () => { await result.current.send('1'); });
    expect(result.current.seconds).toBe(5);
    await act(async () => { await result.current.send('1'); });
    expect(result.current.seconds).toBe(60);
  });

  it('shows a busy flag while the send is in flight', async () => {
    const gate = deferred();
    const { result } = renderHook(() => useOtpFlow(() => gate.promise));
    let pending;
    act(() => { pending = result.current.send('1'); });
    expect(result.current.sending).toBe(true);
    await act(async () => { gate.resolve({ resendAfterSeconds: 1 }); await pending; });
    expect(result.current.sending).toBe(false);
  });

  it('classifies a failure, heals a stale shell and applies the retry-after cooldown', async () => {
    const err = Object.assign(new Error('x'), { code: 'rate', retryAfterSeconds: 30 });
    const { result } = renderHook(() => useOtpFlow(vi.fn().mockRejectedValue(err)));
    let ok;
    await act(async () => { ok = await result.current.send('1'); });
    expect(ok).toBe(false);
    expect(classifyOtpSendError).toHaveBeenCalledWith(err);
    expect(healStaleShell).toHaveBeenCalledWith(err);
    expect(result.current).toMatchObject({ otpSent: false, sending: false, sendError: { messageKey: 'k:rate' }, seconds: 30 });
  });

  it('leaves the cooldown alone when a failure carries no retry-after', async () => {
    const { result } = renderHook(() => useOtpFlow(vi.fn().mockRejectedValue(new Error('x'))));
    await act(async () => { await result.current.send('1'); });
    expect(result.current.seconds).toBe(0);
    expect(result.current.sendError).not.toBeNull();
  });

  it('clears an earlier send error on the next attempt', async () => {
    const dispatch = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ resendAfterSeconds: 1 });
    const { result } = renderHook(() => useOtpFlow(dispatch));
    await act(async () => { await result.current.send('1'); });
    await act(async () => { await result.current.send('1'); });
    expect(result.current.sendError).toBeNull();
    expect(result.current.otpSent).toBe(true);
  });

  it('resend clears the typed code and its error only when it succeeds', async () => {
    const dispatch = vi.fn().mockResolvedValueOnce({ resendAfterSeconds: 0 }).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ resendAfterSeconds: 0 });
    const { result } = renderHook(() => useOtpFlow(dispatch));
    await act(async () => { await result.current.send('1'); });
    act(() => { result.current.setOtp('123'); result.current.setOtpError(true); });
    await act(async () => { await result.current.resend('1'); });
    expect(result.current).toMatchObject({ otp: '123', otpError: true });
    await act(async () => { expect(await result.current.resend('1')).toBe(true); });
    expect(result.current).toMatchObject({ otp: '', otpError: false });
  });

  it('reset returns to idle and discards a send that was still in flight', async () => {
    const gate = deferred();
    const { result } = renderHook(() => useOtpFlow(() => gate.promise));
    let pending;
    act(() => { pending = result.current.send('1'); });
    act(() => result.current.reset());
    expect(result.current.sending).toBe(false);
    let ok;
    await act(async () => { gate.resolve({ resendAfterSeconds: 9 }); ok = await pending; });
    expect(ok).toBe(false);
    expect(result.current).toMatchObject({ otpSent: false, seconds: 0 });
  });

  it('ignores a failure that arrives after reset', async () => {
    const gate = deferred();
    const { result } = renderHook(() => useOtpFlow(() => gate.promise));
    let pending;
    act(() => { pending = result.current.send('1'); });
    act(() => result.current.reset());
    await act(async () => { gate.reject(new Error('late')); await pending; });
    expect(result.current.sendError).toBeNull();
    expect(healStaleShell).not.toHaveBeenCalled();
  });

  it('reset clears a running cooldown and any error state', async () => {
    const { result } = renderHook(() => useOtpFlow(vi.fn().mockResolvedValue({ resendAfterSeconds: 10 })));
    await act(async () => { await result.current.send('1'); });
    act(() => { result.current.setOtp('1'); result.current.setOtpError(true); });
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ otpSent: false, otp: '', otpError: false, seconds: 0, sendError: null });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resyncs the countdown when the tab becomes visible again', async () => {
    const { result } = renderHook(() => useOtpFlow(vi.fn().mockResolvedValue({ resendAfterSeconds: 60 })));
    await act(async () => { await result.current.send('1'); });
    vi.setSystemTime(Date.now() + 40_000);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current.seconds).toBe(20);
  });

  it('does not resync before any send', () => {
    const { result } = renderHook(() => useOtpFlow(vi.fn()));
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current.seconds).toBe(0);
  });

  it('stops its timer when unmounted', async () => {
    const { result, unmount } = renderHook(() => useOtpFlow(vi.fn().mockResolvedValue({ resendAfterSeconds: 10 })));
    await act(async () => { await result.current.send('1'); });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the inert dispatch when none is given', async () => {
    const { result } = renderHook(() => useOtpFlow());
    let pending;
    act(() => { pending = result.current.send('1'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(700); await pending; });
    expect(result.current).toMatchObject({ otpSent: true, seconds: 30 });
  });

  it('calls the latest dispatch passed on rerender', async () => {
    const first = vi.fn().mockResolvedValue({});
    const second = vi.fn().mockResolvedValue({});
    const { result, rerender } = renderHook(({ d }) => useOtpFlow(d), { initialProps: { d: first } });
    rerender({ d: second });
    await act(async () => { await result.current.send('1'); });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
