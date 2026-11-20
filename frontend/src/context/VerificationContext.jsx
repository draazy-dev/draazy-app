import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { appealIdentityVerification, getAadhaarStatus, submitIdentityVerification, withdrawIdentityVerification } from '../services/verificationService.js';
import { NONE_VERIFICATION } from '../services/providers/http/verificationMapper.js';
import { useAuth } from './AuthContext.jsx';

const VerificationContext = createContext(null);

const NONE = { ...NONE_VERIFICATION };

const EMPTY = {
  ...NONE_VERIFICATION,
  loading: false,
  refresh: async () => NONE,
  submitVerification: async () => NONE,
  withdrawVerification: async () => NONE,
  appealVerification: async () => NONE,
};

export function VerificationProvider({ children }) {
  const { isIn } = useAuth();
  const [badge, setBadge] = useState(NONE);
  const [loading, setLoading] = useState(false);
  const [settled, setSettled] = useState(false);
  const [wanted, setWanted] = useState(false);
  const want = useCallback(() => setWanted(true), []);

  const refresh = useCallback(async () => {
    const next = await getAadhaarStatus();
    setBadge(next);
    return next;
  }, []);

  useEffect(() => {
    if (!isIn) {
      setBadge(NONE);
      setSettled(false);
      return undefined;
    }
    if (!wanted) return undefined;
    let alive = true;
    setLoading(true);
    getAadhaarStatus()
      .then((next) => { if (alive) setBadge(next); })
      .catch(() => { if (alive) setBadge(NONE); })
      .finally(() => { if (alive) { setLoading(false); setSettled(true); } });
    return () => { alive = false; };
  }, [isIn, wanted]);

  const submitVerification = useCallback(async (details) => {
    const next = await submitIdentityVerification(details);
    setBadge((current) => ({ ...current, ...next }));
    return next;
  }, []);

  const withdrawVerification = useCallback(async () => {
    const next = await withdrawIdentityVerification();
    setBadge(next);
    return next;
  }, []);

  const appealVerification = useCallback(async (details) => {
    await appealIdentityVerification(details);
    return refresh();
  }, [refresh]);

  const value = useMemo(() => ({
    verified: badge.verified,
    status: badge.status,
    docType: badge.docType,
    docLast4: badge.docLast4,
    maskedDocument: badge.maskedDocument,
    submittedAt: badge.submittedAt,
    decidedAt: badge.decidedAt,
    rejectionReason: badge.rejectionReason,
    rejectionNote: badge.rejectionNote,
    revokedAt: badge.revokedAt,
    revocationReason: badge.revocationReason,
    attemptsRemaining: badge.attemptsRemaining,
    retryAfter: badge.retryAfter,
    canRetry: badge.canRetry,
    source: badge.source,
    maskedAadhaar: badge.maskedAadhaar,
    mobileMatch: badge.mobileMatch,
    verifiedAt: badge.verifiedAt,
    aadhaarMobile: badge.aadhaarMobile,
    appeal: badge.appeal,
    canAppeal: badge.canAppeal,
    loading: loading || (isIn && !settled),
    want,
    refresh,
    submitVerification,
    withdrawVerification,
    appealVerification,
  }), [badge, loading, isIn, settled, want, refresh, submitVerification, withdrawVerification, appealVerification]);

  return <VerificationContext.Provider value={value}>{children}</VerificationContext.Provider>;
}

export function useVerification() {
  const ctx = useContext(VerificationContext);
  const want = ctx?.want;
  useEffect(() => { want?.(); }, [want]);
  return ctx ?? EMPTY;
}
