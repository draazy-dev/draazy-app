/** HTTP refund provider: the customer's payment history and the staff Refunds desk. */
import { get, post } from '../../http.js';
import { toPayment, toPayments, toRefundPage, toRefundRow } from './refundMapper.js';

export async function listMyPayments() {
  return toPayments(await get('/me/payments'));
}

/** `attemptId` is minted once per open sheet, so a double-tapped Confirm returns the original request. */
export async function requestRefund(id, { reason, attemptId } = {}) {
  const text = String(reason || '').trim();
  const row = await post(`/me/payments/${encodeURIComponent(id)}/refund`, text ? { reason: text } : {}, {
    headers: { 'Idempotency-Key': `refund:${id}:${attemptId}` },
  });
  return toPayment(row);
}

/** `counts` asks for the whole-table tab totals, keyed by wire status. */
export async function listRefunds({ status, days, page = 0, size = 20, counts = false } = {}) {
  const query = { status, page, size };
  if (days) query.days = days;
  if (counts) query.counts = true;
  return toRefundPage(await get('/admin/refunds', query));
}

export async function approveRefund(id) {
  return toRefundRow(await post(`/admin/refunds/${encodeURIComponent(id)}/approve`));
}

export async function rejectRefund(id, reason) {
  return toRefundRow(await post(`/admin/refunds/${encodeURIComponent(id)}/reject`, { reason: String(reason || '').trim() }));
}
