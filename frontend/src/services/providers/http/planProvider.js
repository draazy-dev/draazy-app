import { get, post } from '../../http.js';
import { bootstrapSection } from './bootstrap.js';
import { toPlanCatalogueEntry } from './planMapper.js';

export async function listPlans() {
  const rows = await bootstrapSection('plans');
  return (Array.isArray(rows) ? rows : []).map(toPlanCatalogueEntry);
}

export async function subscribe(slug, paymentMethod = 'upi', { propertyId, attemptId } = {}) {
  const plans = await listPlans();
  const plan = plans.find((p) => p.slug === slug);
  if (!plan) {
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

export async function orderStatus(orderId) {
  return (await get(`/me/subscription/orders/${encodeURIComponent(orderId)}`))?.status ?? 'pending';
}
