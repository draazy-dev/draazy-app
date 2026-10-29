import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { myReferralCode } from './referralShare.js';

export function usePrefetchReferralCode() {
  const { isIn } = useAuth();
  useEffect(() => { if (isIn) myReferralCode(); }, [isIn]);
}