export const TABS = [
  { tab: 'overview', label: 'Home', icon: 'layout-grid' },
  { tab: 'properties', label: 'My Properties', icon: 'home' },
  { tab: 'rental', label: 'Rental', icon: 'key-round', tenant: true },
  { tab: 'activity', label: 'Alerts & activity', icon: 'bell' },
  { tab: 'leads', label: 'Requests', icon: 'messages-square' },
  { tab: 'finances', label: 'Finances', icon: 'wallet' },
  { tab: 'documents', label: 'Documents', icon: 'folder-lock' },
  { tab: 'visits', label: 'Visits', icon: 'calendar-check' },
  { tab: 'billing', label: 'Plan & Billing', icon: 'receipt-indian-rupee' },
  { tab: 'profile', label: 'Profile', icon: 'user-cog' },
];
export const TAB_ALIAS = {
  'owner-hub': { tab: 'properties' },
  listings: { tab: 'properties' },
  enquiries: { tab: 'leads' },
  'leads-numbers': { tab: 'leads', sub: 'numbers' },
  'leads-photos': { tab: 'leads', sub: 'photos' },
  'leads-documents': { tab: 'leads', sub: 'documents' },
  'leads-flatmate': { tab: 'leads', sub: 'flatmate' },
  'leads-offers': { tab: 'leads', sub: 'offers' },
  saved: { link: '/saved' },
  messages: { link: '/messages' },
  'rent-agreement': { link: '/services/rent-agreement' },
  recent: { tab: 'activity', sub: 'recent' },
  alerts: { tab: 'activity', sub: 'alerts' },
  groups: { tab: 'activity', sub: 'groups' },
  'my-rental': { tab: 'rental' },
  tenancy: { tab: 'rental' },
};

const pickTabs = (byTab, ids) => ids.map((id) => byTab.get(id)).filter(Boolean);

export function buildDashboardGroups({ visibleTabs, isOwner, showRental, hasRentalGroup }) {
  const byTab = new Map(visibleTabs.map((tab) => [tab.tab, tab]));
  const rentalOwn = hasRentalGroup && byTab.has('rental');
  const group = (id, label, icon, sections) => ({ id, label, icon, sections: pickTabs(byTab, sections) });
  const accountRental = showRental && !rentalOwn ? ['rental'] : [];
  const groups = isOwner
    ? [
        group('home', 'Home', 'layout-grid', ['overview']),
        group('requests', 'Requests', 'messages-square', ['leads', 'visits']),
        group('properties', 'My Properties', 'home', ['properties', 'documents', 'finances']),
        rentalOwn ? group('rental', 'Rental', 'key-round', ['rental']) : null,
        group('account', 'Account', 'user-cog', ['profile', 'billing', 'activity', ...accountRental]),
      ]
    : [
        group('home', 'Home', 'layout-grid', ['overview']),
        group('alerts', 'Alerts', 'bell', ['activity']),
        group('requests', 'Requests', 'messages-square', ['leads', 'visits']),
        rentalOwn ? group('rental', 'Rental', 'key-round', ['rental']) : null,
        group('account', 'Account', 'user-cog', ['profile', 'billing', 'documents', 'finances', ...accountRental, 'properties']),
      ];
  return groups.filter((g) => g && g.sections.length);
}

export const REVIEW_STATUS_MAP = {
  in_review: { label: 'Under review', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/20', icon: 'clock' },
  pending: { label: 'Under review', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/20', icon: 'clock' },
  clarification: { label: 'Needs info', cls: 'text-rose-300 bg-rose-500/10 border-rose-500/20', icon: 'alert-circle' },
  needs_info: { label: 'Needs info', cls: 'text-rose-300 bg-rose-500/10 border-rose-500/20', icon: 'alert-circle' },
  approved: { label: 'Live', cls: 'text-brand-teal-3 bg-brand-teal/10 border-brand-teal/20', icon: 'check-circle' },
  verified: { label: 'Live', cls: 'text-brand-teal-3 bg-brand-teal/10 border-brand-teal/20', icon: 'check-circle' },
  rejected: { label: 'Not approved', cls: 'text-gray-300 bg-white/5 border-white/10', icon: 'x-circle' },
};
