import { get, unwrapPage } from '../../http.js';

/** Coerce to a whole-rupee number. An absent figure is zero, never `NaN` and never a string. */
const rupees = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const count = (value) => Math.max(0, Math.round(rupees(value)));

export async function getFinanceOverview() {
  const res = (await get('/admin/finance')) || {};
  const month = res.month || {};
  const attention = res.attention || {};
  return {
    mrr: rupees(res.mrr),
    plans: Array.isArray(res.plans)
      ? res.plans.map((p) => ({
        name: p.name,
        audience: p.audience,
        billingCycle: p.billingCycle,
        termDays: p.termDays ?? null,
        price: rupees(p.price),
        active: count(p.active),
        monthlyValue: rupees(p.monthlyValue),
      }))
      : [],
    month: {
      collected: rupees(month.collected),
      refunded: rupees(month.refunded),
      passThrough: rupees(month.passThrough),
      net: rupees(month.net),
      payments: count(month.payments),
    },
    attention: {
      refundRequests: count(attention.refundRequests),
      refundRequestAmount: rupees(attention.refundRequestAmount),
      serviceRefunds: count(attention.serviceRefunds),
      serviceRefundAmount: rupees(attention.serviceRefundAmount),
      openDisputes: count(attention.openDisputes),
      openDisputeAmount: rupees(attention.openDisputeAmount),
    },
  };
}

export async function getFinanceSeries(months = 12) {
  const rows = await get('/admin/finance/series', { months });
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    month: r.month,
    subscriptions: rupees(r.subscriptions),
    services: rupees(r.services),
    refunds: rupees(r.refunds),
  }));
}

/** Empty filters are omitted: `?kind=` reaches the server as an empty string, which it answers with 400. */
export async function listFinanceTransactions({
  kind, days, q, page = 0, size = 20,
} = {}) {
  const query = { page, size };
  if (kind) query.kind = kind;
  if (days) query.days = days;
  if (q && q.trim()) query.q = q.trim();

  const res = await get('/admin/finance/transactions', query);
  const unwrapped = unwrapPage(res, { page, size });
  return {
    ...unwrapped,
    items: unwrapped.items.map((t) => ({
      id: t.id,
      date: t.date,
      number: t.number,
      party: t.party,
      kind: t.kind,
      amount: rupees(t.amount),
      fee: rupees(t.fee),
    })),
  };
}