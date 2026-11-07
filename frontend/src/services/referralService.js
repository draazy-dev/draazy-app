import { createProvider } from './config.js';

const provider = createProvider('referral');

export async function listReferralQueue(params) {
  return (await provider()).listReferralQueue(params);
}

export async function approveReferral(id, reason) {
  return (await provider()).approveReferral(id, reason);
}

export async function rejectReferral(id, reason) {
  return (await provider()).rejectReferral(id, reason);
}

export async function clawbackReferral(id, reason) {
  return (await provider()).clawbackReferral(id, reason);
}

export async function getMyReferralSummary() {
  return (await provider()).getMyReferralSummary();
}

export async function redeemReferral(code, shareChannel) {
  return (await provider()).redeemReferral(code, shareChannel);
}

export async function sendInvite(mobile) {
  return (await provider()).sendReferralInvite(mobile);
}

export function referralLink(code, channel) {
  const c = String(code || '').trim();
  if (!c) return '';
  const origin =
    (typeof window !== 'undefined' && window.location && window.location.origin) || 'https://draazy.com';
  const ch = channel ? `&ch=${encodeURIComponent(channel)}` : '';
  return `${origin}/signup?ref=${encodeURIComponent(c)}${ch}`;
}
