export const GENERAL = 'general';

const TYPES = {
  [GENERAL]: { icon: 'help-circle', group: 'General' },
  property: { icon: 'building-2', group: 'Listing', card: 'property' },
  flatmate_room: { icon: 'users-round', group: 'Flatmate listing', card: 'room' },
  flatmate_group: { icon: 'users-round', group: 'Flatmate group', card: 'group' },
  flatmate_post: { icon: 'users-round', group: 'Flatmate post', card: 'post' },
  request: { icon: 'concierge-bell', group: 'Service request' },
  invoice: { icon: 'receipt-indian-rupee', group: 'Payment' },
  identity: { icon: 'shield-check', group: 'Identity check' },
};

export const supportLink = (type, id) =>
  `/messages?support=${encodeURIComponent(type && type !== GENERAL ? `${type}:${id}` : GENERAL)}`;

export const contextMeta = (type) => TYPES[type] || TYPES[GENERAL];
export const contextKey = (about) => (about?.type && about.type !== GENERAL && about.id ? `${about.type}:${about.id}` : GENERAL);

/** A `?support=` value as a chat context. Legacy `ticket:<id>` links land on the one chat, unscoped. */
export function parseContextKey(key) {
  const s = String(key || '');
  if (!s) return null;
  const at = s.indexOf(':');
  const type = s.slice(0, at);
  const id = s.slice(at + 1);
  if (at < 1 || !id || !TYPES[type]) return { type: GENERAL, id: null };
  return { type, id: type === 'invoice' ? id : id.toLowerCase() };
}
