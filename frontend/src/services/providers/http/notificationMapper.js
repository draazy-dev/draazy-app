
const TYPE_PREFIXES = [
  ['match.saved-search', 'match'],
  ['match.society-listing', 'match'],
  ['saved.search', 'match'],
  ['flatmate.interest', 'share'],
  ['flatmate.request', 'share'],
  ['flatmate.review', 'system'],
  ['flatmate.moderated', 'system'],
  ['flatmate.agreement', 'service'],
  ['flatmate', 'share'],
  ['contact.returned', 'contactReturned'],
  ['contact', 'enquiry'],
  ['photo', 'enquiry'],
  ['listing', 'system'],
  ['visit', 'visit'],
  ['offer', 'price'],
  ['document', 'document'],
  ['message', 'enquiry'],
  ['service', 'service'],
  ['tenancy', 'service'],
  ['referral', 'referral'],
  ['refund', 'refund'],
  ['subscription.refund', 'refund'],
  ['support', 'system'],
  ['queue', 'queue'],
  ['sla', 'sla'],
  ['escalation', 'escalation'],
  ['team', 'system'],
];

const PASSTHROUGH = new Set([
  'match', 'enquiry', 'price', 'visit', 'share', 'document', 'service', 'referral', 'refund', 'contactReturned', 'system',
]);

const warned = new Set();

export function toUiType(wireType) {
  if (!wireType) return 'system';
  if (PASSTHROUGH.has(wireType)) return wireType;
  const hit = TYPE_PREFIXES.find(([prefix]) => wireType === prefix || wireType.startsWith(`${prefix}.`));
  if (hit) return hit[1];
  if (!warned.has(wireType)) {
    warned.add(wireType);
    console.warn(
      `[notification] Unknown server type "${wireType}" — rendering as "system". It will not match ` +
        'the Updates filter. Add it to TYPE_PREFIXES in providers/http/notificationMapper.js.',
    );
  }
  return 'system';
}

export function toViewModel(n) {
  if (!n) return null;
  return {
    id: n.id,
    type: toUiType(n.type),
    wireType: n.type,
    title: n.title ?? '',
    desc: n.body ?? '',
    read: Boolean(n.read),
    link: n.link ?? undefined,
    at: n.createdAt ? Date.parse(n.createdAt) : Date.now(),
  };
}

export const toViewModelList = (payload) =>
  (Array.isArray(payload) ? payload : payload?.content ?? []).map(toViewModel).filter(Boolean);
