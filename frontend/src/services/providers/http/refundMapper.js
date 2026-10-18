const epoch = (iso) => (iso ? Date.parse(iso) || 0 : 0);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function toPayment(dto) {
  if (!dto) return null;
  const refund = dto.refund || {};
  return {
    id: dto.id,
    kind: dto.kind || '',
    label: dto.label || '',
    amount: num(dto.amount),
    paidAt: epoch(dto.paidAt),
    invoiceNo: dto.invoiceNo || '',
    status: dto.status || 'paid',
    creditNoteNo: dto.creditNoteNo || '',
    propertyId: dto.propertyId ?? null,
    serviceRequestId: dto.serviceRequestId ?? null,
    refund: {
      eligible: refund.eligible === true,
      reason: refund.reason || '',
      until: epoch(refund.until),
      from: epoch(refund.from),
      amount: num(refund.amount ?? dto.amount),
    },
  };
}

export const toPayments = (payload) => (Array.isArray(payload) ? payload : []).map(toPayment).filter(Boolean);

export function toRefundRow(dto) {
  if (!dto) return null;
  return {
    id: dto.id,
    orderRef: dto.orderRef || '',
    kind: dto.kind || '',
    label: dto.label || '',
    amount: num(dto.amount),
    customerId: dto.customerId ?? null,
    customerName: dto.customerName || '',
    customerMobile: dto.customerMobile || '',
    at: epoch(dto.requestedAt),
    decidedAt: epoch(dto.decidedAt),
    status: dto.status || 'pending_review',
    basis: dto.basis || '',
    customerReason: dto.customerReason || '',
    decisionReason: dto.decisionReason || '',
    creditNoteNo: dto.creditNoteNo || '',
    propertyId: dto.propertyId ?? null,
    signals: dto.signals
      ? {
        refunds12m: num(dto.signals.refunds12m),
        linkedAccounts: num(dto.signals.linkedAccounts),
        contactsUsed: num(dto.signals.contactsUsed),
        enquiries: num(dto.signals.enquiries),
        pausedDuringWindow: dto.signals.pausedDuringWindow === true,
      }
      : null,
  };
}

export function toRefundPage(res) {
  const rows = Array.isArray(res?.content) ? res.content : [];
  return {
    items: rows.map(toRefundRow).filter(Boolean),
    total: res?.totalElements ?? rows.length,
    counts: res?.counts ?? null,
  };
}
