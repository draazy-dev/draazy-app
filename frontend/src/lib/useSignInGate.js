import { useCallback, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useOpenSignInGate } from '../context/SignInGateContext.jsx';
import { gateReason, safeInAppPath } from './authIntent.js';

// `resume` runs after sign-in unless `next` is elsewhere (that URL carries the intent); it must not re-check
// render-time auth.
export function useSignInGate() {
  const { loading } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const openGate = useOpenSignInGate();
  return useCallback((reason, next, resume) => {
    if (loading) {
      toast(t('auth.gateChecking'), 'info');
      return false;
    }
    openGate({ reason: gateReason(reason), next: next == null ? null : safeInAppPath(next), resume });
    return true;
  }, [loading, openGate, t, toast]);
}

/** A `resume` that re-fires the tapped control, so its current handler runs with the signed-in state.
 *  Capture it synchronously: React clears `currentTarget` once the handler returns. */
export function replay(e) {
  const el = e?.currentTarget;
  return () => {
    if (!el?.isConnected) return;
    if (!(el instanceof HTMLFormElement)) el.click();
    else if (el.requestSubmit) el.requestSubmit();
    // Safari < 16 lacks requestSubmit; a cancelable submit event still reaches React's onSubmit.
    else el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  };
}

// Resumes with this render's handler, not the signed-out one; a layout effect so it is fresh before the gate's
// passive effect runs.
export function useLatest(value) {
  const ref = useRef(value);
  useLayoutEffect(() => { ref.current = value; });
  return ref;
}
