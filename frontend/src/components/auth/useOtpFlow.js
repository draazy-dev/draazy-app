import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyOtpSendError } from '../../lib/otpSendError.js';
import { healStaleShell } from '../../lib/seamErrors.js';

const inertDispatch = () => new Promise((resolve) => {
  setTimeout(() => resolve({ resendAfterSeconds: 30 }), 700);
});

const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

export function useOtpFlow(dispatch = inertDispatch) {
  const [otpSent, setOtpSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef(null);
  const deadline = useRef(0);
  const session = useRef(0);

  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  const tick = useCallback(() => {
    const left = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
    setSeconds(left);
    if (left === 0) clearInterval(timer.current);
  }, []);

  const startTimer = useCallback((cooldownSeconds) => {
    clearInterval(timer.current);
    const total = Number.isFinite(cooldownSeconds) && cooldownSeconds >= 0
      ? Math.round(cooldownSeconds)
      : DEFAULT_RESEND_COOLDOWN_SECONDS;
    deadline.current = Date.now() + total * 1000;
    setSeconds(total);
    if (total === 0) return;
    timer.current = setInterval(tick, 1000);
  }, [tick]);

  const send = useCallback(async (mobile) => {
    const mine = session.current;
    setSending(true);
    setSendError(null);
    try {
      const ack = await dispatchRef.current(mobile);
      if (session.current !== mine) return false;
      setOtpSent(true);
      startTimer(ack?.resendAfterSeconds);
      return true;
    } catch (err) {
      if (session.current !== mine) return false;
      setSendError(classifyOtpSendError(err));
      healStaleShell(err);
      if (Number.isFinite(err?.retryAfterSeconds)) startTimer(err.retryAfterSeconds);
      return false;
    } finally {
      if (session.current === mine) setSending(false);
    }
  }, [startTimer]);

  const resend = useCallback(async (mobile) => {
    const sent = await send(mobile);
    if (sent) {
      setOtp('');
      setOtpError(false);
    }
    return sent;
  }, [send]);

  const reset = useCallback(() => {
    session.current += 1;
    clearInterval(timer.current);
    deadline.current = 0;
    setOtpSent(false);
    setSending(false);
    setOtp('');
    setOtpError(false);
    setSendError(null);
    setSeconds(0);
  }, []);

  useEffect(() => {
    const resync = () => {
      if (document.visibilityState === 'visible' && deadline.current) tick();
    };
    document.addEventListener('visibilitychange', resync);
    return () => document.removeEventListener('visibilitychange', resync);
  }, [tick]);

  useEffect(() => () => clearInterval(timer.current), []);

  return {
    otpSent, sending, otp, setOtp, otpError, setOtpError, sendError,
    send, resend, reset, seconds, canResend: otpSent && seconds === 0,
  };
}
