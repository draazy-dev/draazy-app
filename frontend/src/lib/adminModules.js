/* Admin tabs use server-resolved atoms from `user.permissions`; the console composes no union. */
import {
  BarChart3, BookOpen, Briefcase, Building2, Calculator, FileSignature, FileText, Gauge, Gift, Headset, Landmark, LayoutDashboard, LifeBuoy,
  Library, LineChart, MessageSquare, Paintbrush, Scale, Settings, ShieldCheck, Truck, Users, Flag, IndianRupee, UserPlus,
  MapPin, Plug, UsersRound, Eraser, ThumbsUp, Undo2, Bug, Wallet,
} from 'lucide-react';

// `value` is the server's desk slug (`desk:<value>` function); Home Loans has tickets, not service requests.
export const SERVICE_DESKS = [
  { value: 'rental', label: 'Rent Agreement', path: '/admin/rent-agreement', icon: FileSignature },
  { value: 'legal', label: 'Property & Legal', path: '/admin/legal', icon: Scale },
  { value: 'loans', label: 'Home Loans', path: '/admin/home-loans', icon: Landmark, atom: 'tickets:read', writeAtom: 'tickets:write' },
  { value: 'interior', label: 'Interior & Renovation', path: '/admin/interior', icon: Paintbrush },
  { value: 'packers', label: 'Packers & Movers', path: '/admin/packers', icon: Truck },
  { value: 'valuation', label: 'Property Valuation', path: '/admin/valuation', icon: Calculator },
];
export const DESK_BY_VALUE = Object.fromEntries(SERVICE_DESKS.map((d) => [d.value, d]));

// Home Loans is the ticket board itself; every other desk shows tickets under `?view=tickets`.
export const ticketPath = (ticket, open = false) => {
  const desk = DESK_BY_VALUE[ticket?.desk] || DESK_BY_VALUE.loans;
  const params = new URLSearchParams(desk.value === 'loans' ? {} : { view: 'tickets' });
  if (open && ticket?.id) params.set('open', ticket.id);
  const qs = params.toString();
  return qs ? `${desk.path}?${qs}` : desk.path;
};

const DESK_MODULES = SERVICE_DESKS.map(({ atom = 'services:read', writeAtom = 'services:write', ...d }) => ({
  key: `desk:${d.value}`, label: d.label, path: d.path, icon: d.icon, desk: d.value, atom, writeAtom, group: 'desks',
}));

// Sidebar dropdowns, in display order; a module without a `group` stays pinned above them.
export const NAV_GROUPS = [
  { key: 'listings', label: 'Listings & Users', icon: Building2 },
  { key: 'desks', label: 'Service Desks', icon: Briefcase },
  { key: 'support', label: 'Support', icon: Headset },
  { key: 'money', label: 'Money', icon: Wallet },
  { key: 'content', label: 'Content & Places', icon: Library },
  { key: 'insights', label: 'Insights', icon: LineChart },
  { key: 'admin', label: 'Administration', icon: ShieldCheck },
];

export const ADMIN_MODULES = [
  { key: 'dashboard', label: 'Dashboard', path: '/admin', icon: LayoutDashboard, end: true, base: true },
  { key: 'runbooks', label: 'Runbooks', path: '/admin/runbooks', icon: BookOpen, base: true },
  { key: 'properties', label: 'Properties', path: '/admin/properties', icon: Building2, group: 'listings', atom: 'properties:read', writeAtom: 'properties:moderate' },
  { key: 'postOnBehalf', label: 'Post on Behalf', path: '/admin/post-on-behalf', icon: UserPlus, group: 'listings', atom: 'postOnBehalf:write' },
  { key: 'kycReview', label: 'KYC Review', path: '/admin/kyc-review', icon: UserPlus, group: 'listings', atom: 'identity:write' },
  { key: 'users', label: 'Users', path: '/admin/users', icon: Users, group: 'listings', atom: 'users:read' },
  { key: 'flatmates', label: 'Flatmates', path: '/admin/flatmates', icon: Users, group: 'listings', flagKey: 'flatmates', atom: 'flatmates:read', writeAtom: 'flatmates:write' },
  ...DESK_MODULES,
  { key: 'support', label: 'Support queue', path: '/admin/support', icon: LifeBuoy, group: 'support', flagKey: 'support', atom: 'tickets:read', writeAtom: 'tickets:write' },
  { key: 'enquiries', label: 'Enquiries', path: '/admin/enquiries', icon: MessageSquare, group: 'support', atom: 'enquiries:read' },
  { key: 'reports', label: 'Reports', path: '/admin/reports', icon: Flag, group: 'support', flagKey: 'reports', atom: ['reports:read', 'reviews:read'], writeAtom: 'reports:write' },
  { key: 'finance', label: 'Finance', path: '/admin/finance', icon: IndianRupee, group: 'money', flagKey: 'finance', adminOnly: true, atom: 'finance:read' },
  { key: 'refunds', label: 'Refunds', path: '/admin/refunds', icon: Undo2, group: 'money', atom: 'refunds:read', writeAtom: 'refunds:write' },
  { key: 'referrals', label: 'Referrals', path: '/admin/referrals', icon: Gift, group: 'money', atom: 'referrals:read', writeAtom: 'referrals:write' },
  { key: 'content', label: 'Content', path: '/admin/content', icon: FileText, group: 'content', atom: 'content:read', writeAtom: 'content:write' },
  { key: 'places', label: 'Places', path: '/admin/places', icon: MapPin, group: 'content', atom: ['localities:read', 'societies:read'] },
  { key: 'helpFeedback', label: 'Help feedback', path: '/admin/help-feedback', icon: ThumbsUp, group: 'content', adminOnly: true, atom: 'settings:read' },
  { key: 'analytics', label: 'Analytics', path: '/admin/analytics', icon: BarChart3, group: 'insights', flagKey: 'analytics', atom: 'analytics:read' },
  { key: 'staffActivity', label: 'Team Activity', path: '/admin/staff-activity', icon: Gauge, group: 'insights', atom: 'audit:read' },
  { key: 'team', label: 'Team & Access', path: '/admin/team', icon: UsersRound, group: 'admin', atom: 'users:write' },
  { key: 'settings', label: 'Settings', path: '/admin/settings', icon: Settings, group: 'admin', adminOnly: true, atom: 'settings:read', writeAtom: 'settings:write' },
  { key: 'integrations', label: 'Integrations', path: '/admin/integrations', icon: Plug, group: 'admin', adminOnly: true, atom: 'settings:read' },
  { key: 'erasure', label: 'Erasure requests', path: '/admin/erasure-requests', icon: Eraser, group: 'admin', adminOnly: true, atom: 'settings:read' },
  { key: 'errorLog', label: 'Error log', path: '/admin/error-log', icon: Bug, group: 'admin', role: 'admin', atom: 'audit:read' },
];

export const MODULE_BY_KEY = Object.fromEntries(ADMIN_MODULES.map((m) => [m.key, m]));
export const MODULE_BY_PATH = Object.fromEntries(ADMIN_MODULES.map((m) => [m.path, m]));

// Keys that every admin-portal user always keeps (landing page).
export const BASE_MODULE_KEYS = ADMIN_MODULES.filter((m) => m.base).map((m) => m.key);

/* `user.permissions` is the server-resolved effective set; absent arrays grant nothing. */
export const hasPermission = (user, atom) =>
  !!atom && Array.isArray(user?.permissions) && user.permissions.includes(atom);

export function canAccessModule(user, key) {
  const mod = MODULE_BY_KEY[key];
  if (!mod) return false;
  if (mod.base) return true;
  // `audit:read` is also held by managers, so a module that is for administrators only names its role.
  if (mod.role && user?.role !== mod.role) return false;
  // Only staff are scoped to desks; the server lets admin and manager work every desk.
  if (mod.desk && user?.role === 'staff' && !(Array.isArray(user?.desks) && user.desks.includes(mod.desk))) return false;
  return [].concat(mod.atom).some((atom) => hasPermission(user, atom));
}

/** Can this caller act inside a module, as opposed to only reading it? */
export const canWriteModule = (user, key) =>
  hasPermission(user, MODULE_BY_KEY[key]?.writeAtom);

// Paths outside the module list (the public site) are always open.
export function canOpenPath(user, href) {
  const mod = MODULE_BY_PATH[portalPath({ role: 'admin' }, String(href).split(/[?#]/)[0])];
  return !mod || canAccessModule(user, mod.key);
}

export const DESK_FUNCTION_PREFIX = 'desk:';
export const deskFromFunction = (fn) => String(fn || '').startsWith(DESK_FUNCTION_PREFIX)
  ? String(fn).slice(DESK_FUNCTION_PREFIX.length)
  : null;

export const moduleLabel = (key) => MODULE_BY_KEY[key]?.label || key;

// Staff work under /staff, manager and admin under /admin; module paths are written once as /admin.
export const portalBase = (user) => (user?.role === 'staff' ? '/staff' : '/admin');
export const portalPath = (user, path) => String(path).replace(/^\/(admin|staff)(?=[/?#]|$)/, portalBase(user));

/** The module whose page `pathname` is on — the most specific path wins, so a desk beats the dashboard. */
export function moduleForPath(pathname) {
  const path = portalPath({ role: 'admin' }, pathname).replace(/\/+$/, '') || '/admin';
  return ADMIN_MODULES
    .filter((m) => path === m.path || (!m.end && path.startsWith(`${m.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0] || null;
}

/* A runbook with no `modules` is general guidance for everyone in the panel. */
export const runbooksFor = (articles, user) => articles.filter((a) => a.category === 'ops-playbook'
  && (!a.modules?.length || a.modules.some((key) => canAccessModule(user, key))));

/* Labels fall back to the raw atom when a grantable module has no readable shell entry. */
const ATOM_MODULE_LABELS = {
  dashboard: 'Dashboard',
  postOnBehalf: 'Post on Behalf',
  audit: 'Team Activity',
  tickets: 'Support Tickets',
  users: 'Users',
  identity: 'Identity Verification',
  registrations: 'Rent Agreement Registration Check',
};

export function permissionLabel({ module, action }) {
  const noun = ATOM_MODULE_LABELS[module]
    || MODULE_BY_KEY[module]?.label
    || module.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
  return `${noun} · ${action === 'write' ? 'Edit' : 'View'}`;
}
