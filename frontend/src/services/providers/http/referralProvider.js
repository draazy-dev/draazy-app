import { get, post } from '../../http.js';
import { toDecision, toViewModelPage } from './referralMapper.js';

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

const count = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function getMyReferralSummary() {
  const s = await get('/me/referrals');
  if (!s) return s;
  const earned = s.earned || {};
  const friend = s.friendReward || {};
  return {
    code: s.code || '',
    invited: count(s.invited),
    converted: count(s.converted),
    held: count(s.held),
    earnedContacts: count(earned.seeker?.contacts),
    earnedAgreements: count(earned.owner?.agreements),
    friendReward: {
      redeemed: !!friend.redeemed,
      status: friend.status || '',
      contacts: count(friend.contacts),
      featuredDays: count(friend.featuredDays),
    },
  };
}

export async function redeemReferral(code, shareChannel) {
  const channel = String(shareChannel || '').trim();
  return post('/referrals/redeem', { code, ...(channel ? { shareChannel: channel } : {}) });
}
