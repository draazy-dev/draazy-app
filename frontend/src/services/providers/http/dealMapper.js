
const LIVE_OFFER_STATUSES = ['pending', 'countered'];

export function lastActorOf(history) {
  const entries = Array.isArray(history) ? history : [];
  return entries.length ? entries[entries.length - 1].by || 'buyer' : 'buyer';
}

export function toOfferViewModel(row) {
  const history = Array.isArray(row?.history) ? row.history : [];
  return {
    id: row?.id || '',
    propId: row?.propertyId || '',
    propertyId: row?.propertyId || '',
    amount: Number(row?.amount) || 0,
    status: row?.status || 'pending',
    message: row?.message || '',
    from: lastActorOf(history),
    buyerId: row?.from?.id || '',
    buyerName: row?.from?.name || 'Buyer',
    buyerMobile: row?.from?.mobile || '',
    buyerVerified: row?.from?.verified === true,
    history: history.map((h) => ({
      amount: Number(h?.amount) || 0,
      by: h?.by || 'buyer',
      at: h?.at ? Date.parse(h.at) : null,
    })),
    createdAt: row?.createdAt ? Date.parse(row.createdAt) : Date.now(),
    moveIn: row?.moveIn || '',
  };
}

export const mayRespond = (action, isOwner) => action === 'counter' || !!isOwner;

export const isOfferLive = (status) => LIVE_OFFER_STATUSES.includes(status);

export function toDealViewModel(row) {
  const status = row?.status || 'active';
  return {
    id: row?.id || '',
    propId: row?.propertyId || '',
    propertyId: row?.propertyId || '',
    deal: row?.deal || 'buy',
    status,
    agreedPrice: row?.agreedPrice == null ? null : Number(row.agreedPrice),
    closedAt: row?.closedAt ? Date.parse(row.closedAt) : null,
    counterpartyName: row?.counterparty?.name || '',
    counterpartyMobile: row?.counterparty?.mobile || '',
    counterpartyId: row?.counterparty?.id || '',
  };
}

export const isClosed = (status) => status === 'closed';
export const isReserved = (status) => status === 'reserved';

export function toPartyViewModel(row) {
  return {
    id: row?.id || '',
    name: row?.name || 'Interested party',
    mobile: row?.mobile || '',
    note: row?.note || '',
    at: row?.at ? Date.parse(row.at) : Date.now(),
  };
}

export function toFinalizationViewModel(row) {
  if (!row || !row.id) return null;
  return {
    id: row.id,
    propId: row.propertyId || '',
    propertyId: row.propertyId || '',
    status: row.status || 'pending',
    agreedPrice: Number(row.agreedPrice) || 0,
    initiatorId: row.initiator?.id || '',
    buyerName: row.initiator?.name || 'Buyer',
    buyerMobile: row.initiator?.mobile || '',
    buyerVerified: row.initiator?.verified === true,
    counterpartyId: row.counterparty?.id || '',
    counterpartyName: row.counterparty?.name || '',
    createdAt: row.createdAt ? Date.parse(row.createdAt) : Date.now(),
  };
}

export const finalizeStatusOf = (row) => (row && row.id ? row.status || 'pending' : 'none');
