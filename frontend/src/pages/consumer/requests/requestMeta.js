const KIND_LABEL = {
  contact: 'Number request',
  visit: 'Visit',
  photo: 'Photos',
  flatmate: 'Flatmate',
  group: 'Group application',
  document: 'Documents',
  offer: 'Price offer',
};

/** Kinds that connect two people, so they also show as a request thread in Messages. */
export const CONNECTION_KINDS = new Set(['contact', 'flatmate', 'group', 'visit', 'offer']);

const ACCEPTED_LABEL = { contact: 'Approved', visit: 'Confirmed', document: 'Granted', offer: 'Agreed' };

const STATE_LABEL = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
  countered: 'Countered',
};

const DEFAULT_MESSAGE = {
  contact: (title) => `Hi, I'm interested in ${title}. Could you share your contact details?`,
  visit: (title) => `Would like to visit ${title}.`,
  photo: (title) => `Could you add more photos of ${title}?`,
  flatmate: (title) => `Would like to connect about ${title}.`,
  group: (title) => `Would like to connect about ${title}.`,
  document: (title) => `Would like to see the papers for ${title}.`,
  offer: (title) => `Made an offer on ${title}.`,
};

export const requestKey = (item) => `${item.kind}:${item.id}`;

const SHARE_LABEL = { bring: 'Coming as 2', match: 'Wants a room-sharer' };

/** Only the non-default intents are worth a tag: `bring` fills two places on accept. */
export const shareLabel = (share) => SHARE_LABEL[share] || '';

export const threadId = (item) => `request:${requestKey(item)}`;

// Must match the keys the old leads panel minted, or existing notes disappear from their rows.
const LEAD_KEY = {
  contact: (item) => `number:${item.id}`,
  photo: (item) => `photo:${item.id}`,
  flatmate: (item) => `flatmate:${item.id}`,
  group: (item) => `app:${item.id}`,
  document: (item) => `documents:${item.party?.id || ''}|${item.target?.id || ''}`,
};

export const leadKey = (item) => LEAD_KEY[item.kind]?.(item) || requestKey(item);

export const isPending = (item) => item.state === 'pending';

/** A seeker asking into a flatmate group; `kind: 'group'` is a group applying to a listing. */
export const isGroupJoin = (item) => item.kind === 'flatmate' && item.target?.type === 'group';

export const stateLabel = (item) => (item.state === 'accepted' && ACCEPTED_LABEL[item.kind]) || STATE_LABEL[item.state] || item.state;

const STATE_TONE = { pending: 'pend', countered: 'pend', accepted: 'ok', declined: 'no', expired: 'muted', withdrawn: 'muted' };

export const stateTone = (item) => STATE_TONE[item.state] || 'muted';

export function kindLabel(item) {
  if (item.kind === 'visit' && item.slot) return `Visit · ${formatSlot(item.slot)}`;
  return KIND_LABEL[item.kind] || item.kind;
}

export function formatSlot(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return `${day}, ${time}`;
}

export const messageOf = (item) => item.message || (DEFAULT_MESSAGE[item.kind] || DEFAULT_MESSAGE.flatmate)(item.target?.title || 'your listing');

export const initialsOf = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

/** `null` hides the control; `{ enabled: false, label }` shows the wait. */
export function remindState(item, now) {
  const next = item.reminders?.nextAt ? Date.parse(item.reminders.nextAt) : NaN;
  if (!isPending(item) || Number.isNaN(next)) return null;
  if (next <= now) return { enabled: true, label: 'Remind' };
  const minutes = Math.max(1, Math.ceil((next - now) / 60000));
  if (minutes < 60) return { enabled: false, label: `Remind in ${minutes}m` };
  const hours = Math.ceil(minutes / 60);
  return { enabled: false, label: hours < 24 ? `Remind in ${hours}h` : 'Remind tomorrow' };
}

/** The slug or id a target link ends in, for matching staged chats keyed by slug. */
export const targetSlug = (item) => String(item.target?.link || '').split('?')[0].split('/').filter(Boolean).at(-1) || '';

export function withdrawCopy(item) {
  const base = "Withdraw this request? The owner won't see it any more.";
  return item.kind === 'contact'
    ? `${base} Your contact credit comes back. You can ask this owner again after 7 days.`
    : base;
}
