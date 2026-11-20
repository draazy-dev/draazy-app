import { PAGE_LOAD_TTL, get } from '../../http.js';

const num = (v) => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const count = (v) => Number(v) || 0;

const toPricingRow = (row) => ({
  slug: String(row?.slug || ''),
  name: String(row?.name || ''),
  avgActualRatePerSqft: num(row?.avgActualRatePerSqft),
  avgRent: num(row?.avgRent),
  rentalYieldPct: num(row?.rentalYieldPct),
  buyCount: count(row?.buyCount),
  rentCount: count(row?.rentCount),
  totalListings: count(row?.totalListings),
});

export async function localityPricing() {
  const rows = await get('/admin/analytics/pricing');
  return (Array.isArray(rows) ? rows : []).map(toPricingRow);
}

const toTrack = (t) => (t == null ? null : {
  targetHours: num(t.targetHours),
  completedCount: count(t.completedCount),
  avgHours: num(t.avgHours),
  medianHours: num(t.medianHours),
  breachedCount: num(t.breachedCount),
  slaRatePct: num(t.slaRatePct),
  outstandingCount: count(t.outstandingCount),
  outstandingBreachingCount: num(t.outstandingBreachingCount),
});

export async function reviewSla(opts = {}) {
  const s = await get('/admin/analytics/sla', opts?.days ? { days: opts.days } : undefined);
  return {
    targetHours: num(s?.targetHours),
    reviewedCount: count(s?.reviewedCount),
    avgHoursToReview: num(s?.avgHoursToReview),
    medianHoursToReview: num(s?.medianHoursToReview),
    breachedCount: num(s?.breachedCount),
    slaRatePct: num(s?.slaRatePct),
    pendingCount: count(s?.pendingCount),
    pendingBreachingCount: count(s?.pendingBreachingCount),
    worstPending: (Array.isArray(s?.worstPending) ? s.worstPending : [])
      .map((p) => ({
        id: String(p?.id || ''),
        title: String(p?.title || ''),
        hoursWaiting: num(p?.hoursWaiting),
      }))
      .filter((p) => p.hoursWaiting != null),
    ticketPickup: toTrack(s?.ticketPickup),
    ticketDelivery: toTrack(s?.ticketDelivery),
    conciergeToLive: toTrack(s?.conciergeToLive),
    flatmateReview: toTrack(s?.flatmateReview),
  };
}

export async function adminDashboard() {
  const d = (await get('/admin/dashboard')) || {};
  const k = d.kpis;
  const f = d.flatmates;
  return {
    ...d,
    kpis: k && {
      totalListings: count(k.totalListings),
      activeListings: count(k.activeListings),
      pendingModeration: count(k.pendingModeration),
      openReports: count(k.openReports),
      totalUsers: count(k.totalUsers),
      newUsers7d: count(k.newUsers7d),
      dealsClosed30d: count(k.dealsClosed30d),
      revenue30d: num(k.revenue30d),
    },
    flatmates: f && {
      awaitingReview: count(f.awaitingReview),
      openReports: count(f.openReports),
      unansweredRequests: count(f.unansweredRequests),
      liveRooms: count(f.liveRooms),
      liveGroups: count(f.liveGroups),
      activeSeekers: count(f.activeSeekers),
      newSeekers7d: count(f.newSeekers7d),
      matches30d: count(f.matches30d),
      replyRatePct: num(f.replyRatePct),
      medianReplyHours: num(f.medianReplyHours),
    },
    tickets: d.tickets && { ...d.tickets, latest: (d.tickets.latest || []).map((t) => ({ ...t, desk: t.team })) },
  };
}

export async function adminBell() {
  const b = (await get('/admin/bell', undefined, { ttl: PAGE_LOAD_TTL })) || {};
  return {
    ...b,
    openTickets: b.openTickets && { ...b.openTickets, items: (b.openTickets.items || []).map((t) => ({ ...t, desk: t.team })) },
  };
}

const window_ = (opts) => (opts?.days ? { days: opts.days } : undefined);

const toDay = (d) => ({
  date: String(d?.date || ''),
  sessions: count(d?.sessions),
  pageviews: count(d?.pageviews),
  signups: count(d?.signups),
});

const toPage = (p) => ({
  path: String(p?.path || ''),
  views: count(p?.views),
  anonViews: count(p?.anonViews),
});

export async function traffic(opts = {}) {
  const t = await get('/admin/analytics/traffic', window_(opts));
  return {
    days: count(t?.days),
    from: String(t?.from || ''),
    to: String(t?.to || ''),
    series: (Array.isArray(t?.series) ? t.series : []).map(toDay),
    sources: (Array.isArray(t?.sources) ? t.sources : []).map((s) => ({
      channel: String(s?.channel || ''),
      sessions: count(s?.sessions),
      sharePct: num(s?.sharePct),
    })),
    devices: {
      mobile: count(t?.devices?.mobile),
      tablet: count(t?.devices?.tablet),
      desktop: count(t?.devices?.desktop),
    },
    identity: (Array.isArray(t?.identity) ? t.identity : []).map((w) => ({
      week: String(w?.week || ''),
      anonymous: count(w?.anonymous),
      signedIn: count(w?.signedIn),
    })),
  };
}

export async function engagement(opts = {}) {
  const e = await get('/admin/analytics/engagement', window_(opts));
  return {
    days: count(e?.days),
    from: String(e?.from || ''),
    to: String(e?.to || ''),
    weeks: (Array.isArray(e?.weeks) ? e.weeks : []).map((w) => ({
      week: String(w?.week || ''),
      sessions: count(w?.sessions),
      avgSessionMinutes: num(w?.avgSessionMinutes),
      bounceRatePct: num(w?.bounceRatePct),
    })),
    topPages: (Array.isArray(e?.topPages) ? e.topPages : []).map(toPage),
  };
}

export async function funnel(opts = {}) {
  const f = await get('/admin/analytics/funnel', window_(opts));
  return {
    days: count(f?.days),
    from: String(f?.from || ''),
    to: String(f?.to || ''),
    weeks: (Array.isArray(f?.weeks) ? f.weeks : []).map((w) => ({
      week: String(w?.week || ''),
      posted: count(w?.posted),
      approved: count(w?.approved),
      contacts: count(w?.contacts),
      visits: count(w?.visits),
      deals: count(w?.deals),
    })),
  };
}

export async function flatmates(opts = {}) {
  const f = await get('/admin/analytics/flatmates', window_(opts));
  const r = f?.replies;
  return {
    days: count(f?.days),
    from: String(f?.from || ''),
    to: String(f?.to || ''),
    weeks: (Array.isArray(f?.weeks) ? f.weeks : []).map((w) => ({
      week: String(w?.week || ''),
      rooms: count(w?.rooms),
      groups: count(w?.groups),
      seekers: count(w?.seekers),
      requests: count(w?.requests),
      matches: count(w?.matches),
      replyRatePct: num(w?.replyRatePct),
    })),
    replies: {
      sent: count(r?.sent),
      replyRatePct: num(r?.replyRatePct),
      acceptRatePct: num(r?.acceptRatePct),
      medianReplyHours: num(r?.medianReplyHours),
      unansweredNow: count(r?.unansweredNow),
    },
    localities: (Array.isArray(f?.localities) ? f.localities : []).map((l) => ({
      locality: String(l?.locality || ''),
      supply: count(l?.supply),
      demand: count(l?.demand),
    })),
  };
}

export async function surfers(opts = {}) {
  const s = await get('/admin/analytics/surfers', window_(opts));
  return {
    days: count(s?.days),
    from: String(s?.from || ''),
    to: String(s?.to || ''),
    totalSessions: count(s?.totalSessions),
    anonSessions: count(s?.anonSessions),
    signedInSessions: count(s?.signedInSessions),
    signups: count(s?.signups),
    anonSharePct: num(s?.anonSharePct),
    conversionRatePct: num(s?.conversionRatePct),
    pages: (Array.isArray(s?.pages) ? s.pages : []).map(toPage),
    dropOff: (Array.isArray(s?.dropOff) ? s.dropOff : []).map((d) => ({
      path: String(d?.path || ''),
      exits: count(d?.exits),
      sharePct: num(d?.sharePct),
    })),
  };
}
