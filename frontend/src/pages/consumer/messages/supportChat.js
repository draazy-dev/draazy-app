import { listMyPayments } from '../../../services/refundService.js';
import { flatmateKindOf, loadMyListings } from '../../../lib/data/myListings.js';

const SERVICE_PATH = {
  rental: '/services/rent-agreement',
  legal: '/services/property-legal',
  interior: '/services/interior-renovation',
  packers: '/services/packers-movers',
  valuation: '/services/property-valuation',
};

export const servicePath = (request) => SERVICE_PATH[request?.type] || '/services';

/** Things the user may ask about that have no open case: their listings and paid invoices. */
export async function loadSupportChoices(user) {
  const [listings, payments] = await Promise.all([
    loadMyListings(user).catch(() => []),
    listMyPayments().catch(() => []),
  ]);
  return [
    ...listings.map((l) => (l.flatmate
      ? { type: `flatmate_${flatmateKindOf(l)}`, id: String(l.id).toLowerCase(), label: l.title }
      : { type: 'property', id: String(l.uuid || l.id).toLowerCase(), label: l.title })),
    ...payments.filter((p) => p.invoiceNo).map((p) => ({ type: 'invoice', id: p.invoiceNo, label: `${p.label || 'Payment'} · ${p.invoiceNo}` })),
  ];
}
