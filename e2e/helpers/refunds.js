import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { ACTORS } from '../fixtures/live.js';
import { API, authHeaders } from './liveAuth.js';
import { call, openOrder, settleOrder, sql, CONTACT_PACK_PLAN, LISTING_PASS_PLAN } from './monetisation.js';

const UUID = /^[0-9a-f-]{36}$/i;
const uuid = (value) => {
  if (!UUID.test(value)) throw new Error(`not an id: ${value}`);
  return value;
};
const digits = (value) => String(value).replace(/\D/g, '');

async function paidOrder(mobile, planId, propertyId, ageDays) {
  const order = await openOrder(mobile, planId, propertyId);
  settleOrder(order.id, 30);
  if (ageDays) ageOrder(order.id, ageDays);
  return order.id;
}

export const paidPack = (mobile, { ageDays = 0 } = {}) => paidOrder(mobile, CONTACT_PACK_PLAN, undefined, ageDays);

export const paidPass = (mobile, propertyId, { ageDays = 0 } = {}) =>
  paidOrder(mobile, LISTING_PASS_PLAN, propertyId, ageDays);

export function ageOrder(orderId, days) {
  sql(
    `update subscriptions set started_at = started_at - interval '${Number(days)} days', renews_at = renews_at - interval '${Number(days)} days'`
    + ` where id = '${uuid(orderId)}'`,
  );
}

export const paymentsOf = async (mobile) => {
  const res = await call('GET', '/me/payments', mobile);
  expect(res.status, JSON.stringify(res.json)).toBe(200);
  return res.json;
};

export const paymentOf = async (mobile, orderId) => {
  const row = (await paymentsOf(mobile)).find((p) => p.id === orderId);
  expect(row, `payment ${orderId} is listed`).toBeTruthy();
  return row;
};

/** The raw answer, so a refusal can be asserted as well as a success. */
export async function requestRefund(mobile, orderId, { reason = 'Changed my mind', key = randomUUID() } = {}) {
  const res = await fetch(`${API}/me/payments/${uuid(orderId)}/refund`, {
    method: 'POST',
    headers: { ...(await authHeaders(mobile)), 'idempotency-key': key },
    body: JSON.stringify({ reason }),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

export function refundIdOf(orderId) {
  return uuid(sql(`select id from refund_requests where subscription_id = '${uuid(orderId)}' order by created_at desc limit 1`).split(/\r?\n/)[0]);
}

export const staffCall = (method, path, body) => call(method, path, ACTORS.admin, body);

export const decide = (refundId, action, reason) =>
  staffCall('POST', `/admin/refunds/${uuid(refundId)}/${action}`, reason === undefined ? undefined : { reason });

/** Stand in for the signed gateway webhooks, which issue an invoice at payment and a credit note once the
 *  money is back; their secret is machine-local. */
export function seedInvoice(mobile, orderId, number = 'INV-FY2627-900001') {
  sql(
    'insert into invoices (number, user_id, source_type, source_id, order_ref, amount, taxable_amount, issued_at)'
    + ` select '${number}', s.user_id, 'subscription', s.id, s.payment_ref, 199, 199, now() from subscriptions s`
    + ` join users u on u.id = s.user_id where s.id = '${uuid(orderId)}' and u.mobile = '${digits(mobile)}'`,
  );
  return number;
}

export function seedCreditNote(orderId, number = 'CN-FY2627-900001', invoiceNo = 'INV-FY2627-900001') {
  sql(
    'insert into credit_notes (number, user_id, source_type, source_id, order_ref, amount, taxable_amount, invoice_no, issued_at)'
    + ` select '${number}', s.user_id, 'subscription', s.id, s.payment_ref, 199, 199, '${invoiceNo}', now() from subscriptions s`
    + ` where s.id = '${uuid(orderId)}'`,
  );
  return number;
}

/** The fee and officer keys a spec may change, read back so the spec can put them back. */
export async function settingsSnapshot() {
  const res = await call('GET', '/admin/settings', ACTORS.admin);
  expect(res.status).toBe(200);
  return { fees: res.json.fees, legal: res.json.legal };
}

export const putSettings = (patch) => call('PUT', '/admin/settings', ACTORS.admin, patch);
