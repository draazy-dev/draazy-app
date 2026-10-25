export const SAFE_LINK_RE = /^\/(?!\/)[a-zA-Z0-9\-_/?=&#%.:]*$/;

export const FILTERS = [
  { key: 'all', labelKey: 'notifications.filters.all', icon: 'inbox', emptyKey: 'notifications.caughtUp' },
  { key: 'leads', labelKey: 'notifications.filters.leads', icon: 'user-plus', emptyKey: 'notifications.noNewLeads' },
  { key: 'updates', labelKey: 'notifications.filters.updates', icon: 'info', emptyKey: 'notifications.noNewUpdates' },
];

export const STAFF_FILTERS = [
  { key: 'all', labelKey: 'notifications.filters.all', icon: 'inbox', emptyKey: 'notifications.caughtUp' },
  { key: 'escalations', labelKey: 'notifications.filters.escalations', icon: 'shield-alert', emptyKey: 'notifications.noEscalations' },
  { key: 'work', labelKey: 'notifications.filters.work', icon: 'timer', emptyKey: 'notifications.noNewWork' },
  { key: 'updates', labelKey: 'notifications.filters.updates', icon: 'info', emptyKey: 'notifications.noNewUpdates' },
];

const LEAD_TYPES = new Set(['enquiry', 'price', 'visit', 'share']);
// Refund and service rows reaching staff are requests to act (refund filed, amendment applied), not news.
const STAFF_WORK_TYPES = new Set(['queue', 'sla', 'refund', 'service']);

export const TYPE_META = {
  escalation: { icon: 'shield-alert', iconCls: 'text-rose-400', bgCls: 'bg-rose-400/15', plural: 'escalations' },
  queue: { icon: 'inbox', iconCls: 'text-teal-400', bgCls: 'bg-teal-400/15', plural: 'queue arrivals' },
  sla: { icon: 'timer', iconCls: 'text-amber-400', bgCls: 'bg-amber-400/15', plural: 'SLA reminders' },
  match: { icon: 'home', iconCls: 'text-teal-400', bgCls: 'bg-teal-400/15', plural: 'matches' },
  enquiry: { icon: 'messages-square', iconCls: 'text-teal-400', bgCls: 'bg-teal-400/15', plural: 'enquiries' },
  price: { icon: 'trending-down', iconCls: 'text-amber-400', bgCls: 'bg-amber-400/15', plural: 'price updates' },
  visit: { icon: 'calendar-check', iconCls: 'text-emerald-400', bgCls: 'bg-emerald-400/15', plural: 'visits' },
  share: { icon: 'users-round', iconCls: 'text-teal-400', bgCls: 'bg-teal-400/15', plural: 'flatmate leads' },
  document: { icon: 'folder-check', iconCls: 'text-teal-400', bgCls: 'bg-teal-400/15', plural: 'document updates' },
  service: { icon: 'file-signature', iconCls: 'text-teal-400', bgCls: 'bg-teal-400/15', plural: 'service updates' },
  referral: { icon: 'gift', iconCls: 'text-teal-400', bgCls: 'bg-teal-400/15', plural: 'referral updates' },
  refund: { icon: 'undo-2', iconCls: 'text-amber-400', bgCls: 'bg-amber-400/15', plural: 'refund updates' },
  contactReturned: { icon: 'rotate-ccw', iconCls: 'text-emerald-400', bgCls: 'bg-emerald-400/15', plural: 'returned contacts' },
  system: { icon: 'info', iconCls: 'text-gray-400', bgCls: 'bg-white/10', plural: 'updates' },
};

const DAY = 86_400_000;
const HOUR = 3_600_000;

export const safeNotificationLink = (link, fallback = '/notifications') =>
  (typeof link === 'string' && SAFE_LINK_RE.test(link) ? link : fallback);

export const notificationBucket = (n) => (LEAD_TYPES.has(n?.type) ? 'leads' : 'updates');

export const staffNotificationBucket = (n) => {
  if (n?.type === 'escalation') return 'escalations';
  return STAFF_WORK_TYPES.has(n?.type) ? 'work' : 'updates';
};

export const matchesNotificationFilter = (n, filter, bucket = notificationBucket) =>
  filter === 'all' || bucket(n) === filter;

export const hasUnreadInFilter = (rows, filter, bucket = notificationBucket) =>
  rows.some((n) => !n.read && matchesNotificationFilter(n, filter, bucket));

const dayKey = (at) => {
  const d = new Date(at || 0);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export const isToday = (at) => dayKey(at) === dayKey(Date.now());

export function collapseNotifications(rows) {
  const groups = new Map();
  rows.forEach((n) => {
    const key = `${n.type}|${safeNotificationLink(n.link)}|${dayKey(n.at)}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...n, ids: [n.id], count: 1 });
      return;
    }
    existing.ids.push(n.id);
    existing.count += 1;
    existing.read = existing.read && n.read;
    if ((n.at || 0) > (existing.at || 0)) {
      existing.at = n.at;
      existing.title = n.title;
      existing.desc = n.desc;
    }
  });
  return [...groups.values()].sort((a, b) => (b.at || 0) - (a.at || 0));
}

export function notificationTitle(n) {
  if ((n.count || 1) === 1) return n.title || '';
  const meta = TYPE_META[n.type] || TYPE_META.system;
  return `${n.count} new ${meta.plural}`;
}

export function relativeNotificationTime(at, t) {
  const diff = Math.max(0, Date.now() - (at || Date.now()));
  if (diff < 60_000) return t('notifications.time.justNow');
  if (diff < HOUR) return `${Math.round(diff / 60_000)} ${t('notifications.time.min')}`;
  if (diff < DAY) {
    const hours = Math.round(diff / HOUR);
    return `${hours} ${t(hours === 1 ? 'notifications.time.hour' : 'notifications.time.hours')}`;
  }
  const days = Math.round(diff / DAY);
  return `${days} ${t(days === 1 ? 'notifications.time.day' : 'notifications.time.days')}`;
}
