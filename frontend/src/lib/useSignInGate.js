import { useCallback, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useOpenSignInGate } from '../context/SignInGateContext.jsx';
import { gateReason, safeInAppPath } from './authIntent.js';

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

export function replay(e) {
  const el = e?.currentTarget;
  return () => {
    if (!el?.isConnected) return;
    if (!(el instanceof HTMLFormElement)) el.click();
    else if (el.requestSubmit) el.requestSubmit();
    else el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  };
}

export function useLatest(value) {
  const ref = useRef(value);
  useLayoutEffect(() => { ref.current = value; });
  return ref;
}
