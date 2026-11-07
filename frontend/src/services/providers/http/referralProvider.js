import { get, post } from '../../http.js';
import { toDecision, toInviteResult, toSummary, toViewModelPage } from './referralMapper.js';

export async function listReferralQueue({ status, risk, q, days, page = 0, size = 20, counts = false } = {}) {
  const query = { page, size };
  if (status) query.status = status;
  if (risk) query.risk = risk;
  if (q) query.q = q;
  if (days) query.days = days;
  if (counts) query.counts = true;
  return toViewModelPage(await get('/referrals', query), { page, size });
}

export async function approveReferral(id, reason) {
  return toDecision(await post(`/referrals/${encodeURIComponent(id)}/approve`, reasonBody(reason)));
}

export async function rejectReferral(id, reason) {
  return toDecision(await post(`/referrals/${encodeURIComponent(id)}/reject`, reasonBody(reason)));
}

export async function clawbackReferral(id, reason) {
  return toDecision(await post(`/referrals/${encodeURIComponent(id)}/clawback`, reasonBody(reason)));
}

function reasonBody(reason) {
  const text = String(reason || '').trim();
  return text ? { reason: text } : undefined;
}

export async function getMyReferralSummary() {
  return toSummary(await get('/me/referrals'));
}

export async function sendReferralInvite(mobile) {
  return toInviteResult(await post('/me/referrals/invites', { mobile }));
}

export async function redeemReferral(code, shareChannel) {
  const channel = String(shareChannel || '').trim();
  return post('/referrals/redeem', { code, ...(channel ? { shareChannel: channel } : {}) });
}
