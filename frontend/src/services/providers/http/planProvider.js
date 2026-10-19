/** `listPlans` does not short-circuit without a session, because the pricing page
 * must render for the signed-out visitors it exists to convert. */
import { get, post } from '../../http.js';
import { bootstrapSection } from './bootstrap.js';
import { toPlanCatalogueEntry } from './planMapper.js';

/** The plan catalogue, newest-priced-last as the server orders it. Public. */
export async function listPlans() {
  const rows = await bootstrapSection('plans');
  return (Array.isArray(rows) ? rows : []).map(toPlanCatalogueEntry);
}

/** Does not grant the plan: a priced plan stays `pending` until the signature-verified webhook activates it.
 * `attemptId` is minted once per checkout attempt, so a double-tapped Pay returns the original order. */
export async function subscribe(slug, paymentMethod = 'upi', { propertyId, attemptId } = {}) {
  const plans = await listPlans();
  const plan = plans.find((p) => p.slug === slug);
  if (!plan) {
    // A slug with no catalogue row is a broken link or a plan that was withdrawn. Failing loudly
    // beats posting a `planId` of `undefined` and reading the 400 as a payment problem.
    throw new Error(`[plan] No catalogue plan for "${slug}". The pricing card and the server disagree.`);
  }
  const row = await post('/me/subscription', { planId: plan.id, paymentMethod, ...(propertyId ? { propertyId } : {}) }, {
    headers: { 'Idempotency-Key': `sub:${plan.id}:${propertyId || '-'}:${attemptId}` },
  });
  return {
    subscriptionId: row?.id ?? null,
    paymentRef: row?.paymentRef ?? null,
    paymentSessionId: row?.paymentSessionId ?? null,
  };
}

export async function cancelPending() {
  await post('/me/subscription/cancel', {});
}

/** `paid | pending | failed | closed`. `failed` is the newest attempt only: the order can still be paid. */
export async function orderStatus(orderId) {
  return (await get(`/me/subscription/orders/${encodeURIComponent(orderId)}`))?.status ?? 'pending';
}
