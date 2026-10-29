import { readUser } from './auth.js';
import { getMyReferralSummary } from '../services/referralService.js';

let held = null;
let pending = null;

const owner = () => { const u = readUser(); return u ? String(u.id ?? u.mobile ?? '') : ''; };

export async function myReferralCode() {
  const who = owner();
  if (!who) return '';
  if (held?.who === who) return held.code;
  if (pending?.who !== who) {
    const p = getMyReferralSummary()
      .then((s) => String(s?.code || ''))
      .catch(() => '')
      .then((code) => { if (code) held = { who, code }; return code; })
      .finally(() => { if (pending?.p === p) pending = null; });
    pending = { who, p };
  }
  return pending.p;
}

export function withReferral(url, code) {
  if (!code) return url;
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin) return url;
    u.searchParams.set('ref', code);
    return u.toString();
  } catch {
    return url;
  }
}

export function referralShareUrlNow(url) {
  return withReferral(url, held?.who === owner() ? held.code : '');
}