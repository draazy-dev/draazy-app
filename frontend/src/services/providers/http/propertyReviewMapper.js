
const list = (xs) => (Array.isArray(xs) ? xs : []);

const toMessage = (m) => ({
  id: String(m?.id ?? ''),
  from: m?.from === 'owner' ? 'owner' : 'ops',
  body: m?.body ?? '',
  at: m?.at ?? null,
  read: Boolean(m?.read),
  internal: Boolean(m?.internal),
});

const toChecklistItem = (c) => ({ item: c?.item ?? '', pass: Boolean(c?.pass) });

const toSignals =  (signals) => signals ? {
  possibleBroker: Boolean(signals.possibleBroker),
  hardBlock: Boolean(signals.hardBlock),
  conflict: Boolean(signals.conflict),
  items: list(signals.items).map((row) => ({
    code: row?.code || '',
    severity: row?.severity === 'hard' ? 'hard' : 'soft',
    detail: row?.detail || '',
  })),
} : null;

export function toCaseFile(res) {
  if (!res) return null;
  return {
    propertyId: res.propertyId ?? '',
    status: res.status ?? 'pending',
    propertyStatus: res.propertyStatus ?? '',
    reviewer: res.reviewer ?? null,
    checklist: list(res.checklist).map(toChecklistItem),
    messages: list(res.messages).map(toMessage),
    notes: res.notes ?? null,
    reasonCode: res.reasonCode ?? null,
    reasonNote: res.reasonNote ?? null,
    reraCheck: res.reraCheck ?? null,
    signals: toSignals(res.signals),
    decidedAt: res.decidedAt ?? null,
  };
}

export function toReviewBadge(row) {
  return {
    propertyId: row?.propertyId ?? '',
    status: row?.status ?? 'pending',
    unread: Number(row?.unread) || 0,
    updatedAt: row?.updatedAt ?? null,
    reasonCode: row?.reasonCode ?? null,
    reasonNote: row?.reasonNote ?? null,
    lastMessage: row?.lastMessage ?? '',
  };
}
