/** HTTP referral provider — the fraud desk (`/ops/referrals`) and the referrer's own view. */
import { get, post } from '../../http.js';
import { toDecision, toViewModelPage } from './referralMapper.js';

/** Errors propagate: "no referrals here" would be worse than "could not look". `counts` asks for the tab totals. */
export async function listReferralQueue({ status, risk, q, page = 0, size = 20, counts = false } = {}) {
  const query = { page, size };
  if (status) query.status = status;
  if (risk) query.risk = risk;
  if (q) query.q = q;
  if (counts) query.counts = true;
  return toViewModelPage(await get('/referrals', query), { page, size });
}

/** A 409 means the row cannot be approved from its state; its message is the sentence to show. */
export async function approveReferral(id, reason) {
  return toDecision(await post(`/referrals/${encodeURIComponent(id)}/approve`, reasonBody(reason)));
}

/** Reject — `POST /referrals/{id}/reject`. The reason is audit context, not a gate. */
export async function rejectReferral(id, reason) {
  return toDecision(await post(`/referrals/${encodeURIComponent(id)}/reject`, reasonBody(reason)));
}

/** Result is `clawed-back`, not `rejected`: a fraud desk must tell "never paid" from "paid then recovered". */
export async function clawbackReferral(id, reason) {
  return toDecision(await post(`/referrals/${encodeURIComponent(id)}/clawback`, reasonBody(reason)));
}

/** The body is optional in the contract, so a blank reason is sent as no body rather than as `""`. */
function reasonBody(reason) {
  const text = String(reason || '').trim();
  return text ? { reason: text } : undefined;
}

const count = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Tolerant of a missing counter: the page renders zeros rather than failing on a half-deployed server. */
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

/** `shareChannel` is deliberately unvalidated; one generic 409 covers every refusal and is shown as a neutral line. */
export async function redeemReferral(code, shareChannel) {
  const channel = String(shareChannel || '').trim();
  return post('/referrals/redeem', { code, ...(channel ? { shareChannel: channel } : {}) });
}
