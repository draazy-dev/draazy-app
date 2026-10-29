export const FRESH_DAYS = 7;
export const AGING_DAYS = 14;
export const STALE_DAYS = 30;

const DAY_MS = 86400000;

export function createdMs(v) {
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function daysSinceFresh(listing, now = Date.now()) {
  const src = (listing && (listing.freshenedAt || listing.createdAt)) || null;
  if (!src) return 0;
  const t = new Date(src).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

export function freshnessState(listing, now = Date.now()) {
  const d = daysSinceFresh(listing, now);
  if (d <= FRESH_DAYS) return 'active';
  if (d <= AGING_DAYS) return 'aging';
  if (d <= STALE_DAYS) return 'stale';
  return 'dormant';
}

export function isDormant(listing, now = Date.now()) {
  return freshnessState(listing, now) === 'dormant';
}

export function needsAttention(listing, now = Date.now()) {
  return freshnessState(listing, now) !== 'active';
}

function sinceLabel(days) {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function listingFreshness(listing, now = Date.now()) {
  const state = freshnessState(listing, now);
  const days = daysSinceFresh(listing, now);
  const since = sinceLabel(days);

  const OWNER = {
    active: { label: 'Active', tone: 'emerald', cta: null },
    aging: { label: 'Confirm soon', tone: 'amber', cta: 'confirm' },
    stale: { label: 'Stale', tone: 'rose', cta: 'confirm' },
    dormant: { label: 'Paused', tone: 'gray', cta: 'reactivate' },
  }[state];

  const BUYER = {
    active: {
      show: true,
      tone: 'emerald',
      icon: 'shield-check',
      label: 'Owner confirmed available — actively managed',
      short: 'Confirmed available',
    },
    aging: {
      show: true,
      tone: 'gray',
      icon: 'clock',
      label: `Owner last confirmed availability ${since}`,
      short: `Updated ${since}`,
    },
    stale: {
      show: true,
      tone: 'amber',
      icon: 'alert-triangle',
      label: `Availability not confirmed in ${days} days — ask the owner if it's still available`,
      short: 'Availability not recently confirmed',
    },
    dormant: {
      show: false,
      tone: 'gray',
      icon: 'moon',
      label: '',
      short: '',
    },
  }[state];

  return { state, days, since, owner: OWNER, buyer: BUYER };
}
