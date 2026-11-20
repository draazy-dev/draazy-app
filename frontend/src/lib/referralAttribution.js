import { getMyReferralSummary, redeemReferral } from '../services/referralService.js';

const KEY = 'dz_ref';
const TTL_MS = 30 * 86400000;
const CODE = /^[A-Za-z0-9_-]{3,32}$/;
const CHANNELS = new Set(['whatsapp', 'sms', 'email', 'copy', 'qr', 'other']);

export const isReferralCode = (code) => CODE.test(code ?? '');

const read = () => {
  try {
    const row = JSON.parse(localStorage.getItem(KEY));
    return row && CODE.test(row.code) && Date.now() - row.at < TTL_MS ? row : null;
  } catch {
    return null;
  }
};

export function captureReferral(search) {
  const params = new URLSearchParams(search);
  const code = params.get('ref')?.trim();
  if (!isReferralCode(code) || read()) return;
  const ch = params.get('ch')?.trim().toLowerCase();
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now(), ...(CHANNELS.has(ch) ? { ch } : {}) }));
  } catch { }
}

export const storedReferral = () => read()?.code || '';

export function clearReferral() {
  try {
    localStorage.removeItem(KEY);
  } catch { }
}

// 409/422 are final, so drop the code; a 409 after a WhatsApp invite already linked the account is 'linked'.
// Network and 5xx failures keep it so a later sign-in can retry.
export async function redeemOnNewAccount(code) {
  const stored = read();
  const wanted = String(code || stored?.code || '').trim();
  if (!wanted) return 'none';
  const channel = stored?.code === wanted && stored.ch ? stored.ch : 'link';
  try {
    await redeemReferral(wanted, channel);
    clearReferral();
    return 'applied';
  } catch (err) {
    if (err?.status === 409) { clearReferral(); return (await alreadyLinked()) ? 'linked' : 'refused'; }
    if (err?.status === 422) { clearReferral(); return 'invalid'; }
    return 'failed';
  }
}

async function alreadyLinked() {
  try {
    return (await getMyReferralSummary())?.friendReward?.redeemed === true;
  } catch {
    return false;
  }
}