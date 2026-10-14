import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { myReferralCode } from './referralShare.js';

/** Warms the sharer's code so share handlers can read it synchronously. */
export function usePrefetchReferralCode() {
  const { isIn } = useAuth();
  useEffect(() => { if (isIn) myReferralCode(); }, [isIn]);
}