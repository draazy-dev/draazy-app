/* Owner tabs show only with real inventory. */
export const TABS = [
  // Not owner-gated: Property Tools (Rent-o-meter) is the "value your home" acquisition entry, reachable by any
  // signed-in user (old /owner-hub route).
  { tab: 'overview', label: 'Home', icon: 'layout-grid' },
  { tab: 'properties', label: 'My Properties', icon: 'home' },
  // Tenant mirror of My Properties — "the home you rent". Shown to buyers/tenants
  // and anyone with a finalised tenancy; a pure owner with no rental won't see it.
  { tab: 'rental', label: 'Rental', icon: 'key-round', tenant: true },
  { tab: 'activity', label: 'Alerts & activity', icon: 'bell' },
  // Role-aware (like Documents): owners see a property P&L, tenants see the Rent
  // Wallet, and a user who is both can switch.
  { tab: 'leads', label: 'Requests', icon: 'messages-square' },
  { tab: 'finances', label: 'Finances', icon: 'wallet' },
  { tab: 'documents', label: 'Documents', icon: 'folder-lock' },
  { tab: 'visits', label: 'Visits', icon: 'calendar-check' },
  // Account-level and universal (every user has a plan — buyers included), so it
  // lives in its own section rather than buried in Profile & Settings.
  { tab: 'billing', label: 'Plan & Billing', icon: 'receipt-indian-rupee' },
  { tab: 'profile', label: 'Profile', icon: 'user-cog' },
];
/* Back-compat: legacy tab hashes/?tab= values map onto the new tab (+ optional sub-section) so existing deep-links
   keep landing; `link` sends the ones the top bar already owns to that page. */
export const TAB_ALIAS = {
  'owner-hub': { tab: 'properties' },
  listings: { tab: 'properties' },
  enquiries: { tab: 'leads' },
  saved: { link: '/saved' },
  messages: { link: '/messages' },
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

export const CAL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const CAL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const CAL_HOURS = Array.from({ length: 13 }, (_, i) => i + 7);
export const DOC_SALE = ['Sale Deed / Agreement', 'Index II', 'Property Tax Receipt', 'Encumbrance Certificate', 'Society NOC', 'Completion Certificate', 'Occupancy Certificate', 'Building Plan Approval'];
export const REVIEW_STATUS_MAP = {
  in_review: { label: 'Under review', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/20', icon: 'clock' },
  pending: { label: 'Under review', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/20', icon: 'clock' },
  clarification: { label: 'Needs info', cls: 'text-rose-300 bg-rose-500/10 border-rose-500/20', icon: 'alert-circle' },
  needs_info: { label: 'Needs info', cls: 'text-rose-300 bg-rose-500/10 border-rose-500/20', icon: 'alert-circle' },
  approved: { label: 'Live', cls: 'text-brand-teal-3 bg-brand-teal/10 border-brand-teal/20', icon: 'check-circle' },
  verified: { label: 'Live', cls: 'text-brand-teal-3 bg-brand-teal/10 border-brand-teal/20', icon: 'check-circle' },
  rejected: { label: 'Not approved', cls: 'text-gray-300 bg-white/5 border-white/10', icon: 'x-circle' },
};

export const SAVED_SEED = [
  { id: 'P5000', title: '3 BHK Flat, Baner', price: '₹1.25 Cr', bhk: '3 BHK', area: '1,850 sq.ft', img: null },
  { id: 'P5008', title: '4 BHK Villa, Koregaon Park', price: '₹2.8 Cr', bhk: '4 BHK', area: '3,200 sq.ft', img: null },
  { id: 'P5015', title: '4 BHK Penthouse, Kalyani Nagar', price: '₹3.5 Cr', bhk: '4 BHK', area: '4,500 sq.ft', img: null },
];

export const VISIT_STATUS_CLS = {
  scheduled: 'bg-amber-500/15 text-amber-300',
  confirmed: 'bg-emerald-500/15 text-emerald-300',
  'no-show': 'bg-rose-500/15 text-rose-300',
  rescheduled: 'bg-indigo-500/15 text-indigo-300',
};
