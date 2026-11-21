import { describe, expect, it } from 'vitest';
import { setupFetch } from '../net.js';
import * as a from '../../../../../src/services/providers/http/analyticsProvider.js';

describe('analyticsProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('localityPricing', async () => {
    net.reply([{ slug: 's', name: 'N', avgActualRatePerSqft: '9', avgRent: 'x', rentalYieldPct: 3, buyCount: '2', rentCount: 1, totalListings: 3 }, {}]);
    expect(await a.localityPricing()).toEqual([
      { slug: 's', name: 'N', avgActualRatePerSqft: 9, avgRent: null, rentalYieldPct: 3, buyCount: 2, rentCount: 1, totalListings: 3 },
      { slug: '', name: '', avgActualRatePerSqft: null, avgRent: null, rentalYieldPct: null, buyCount: 0, rentCount: 0, totalListings: 0 },
    ]);
    expect(net.last().path).toBe('/admin/analytics/pricing');
    net.fresh();
    net.reply({});
    expect(await a.localityPricing()).toEqual([]);
  });

  it('reviewSla maps every track and filters unranked pending listings', async () => {
    const track = { targetHours: 4, completedCount: '2', avgHours: 1.5, medianHours: 1, breachedCount: 0, slaRatePct: 100, outstandingCount: 3, outstandingBreachingCount: 1 };
    net.reply({
      targetHours: 24, reviewedCount: 5, avgHoursToReview: 2, medianHoursToReview: 1, breachedCount: 1, slaRatePct: 80, pendingCount: 2, pendingBreachingCount: 1,
      worstPending: [{ id: 1, title: 'T', hoursWaiting: 30 }, { id: 2, title: 'U' }, null],
      ticketPickup: track, ticketDelivery: null, flatmateReview: {},
    });
    const sla = await a.reviewSla({ days: 7 });
    expect(net.last()).toMatchObject({ path: '/admin/analytics/sla', query: { days: '7' } });
    expect(sla).toMatchObject({
      targetHours: 24, reviewedCount: 5, slaRatePct: 80, pendingBreachingCount: 1,
      worstPending: [{ id: '1', title: 'T', hoursWaiting: 30 }],
      ticketPickup: { targetHours: 4, completedCount: 2, outstandingBreachingCount: 1 },
      ticketDelivery: null, conciergeToLive: null,
      flatmateReview: { targetHours: null, completedCount: 0, avgHours: null, outstandingCount: 0, outstandingBreachingCount: null },
    });
    net.fresh();
    expect(await a.reviewSla()).toMatchObject({ targetHours: null, reviewedCount: 0, worstPending: [] });
    expect(net.last().search).toBe('');
    net.fresh();
    await a.reviewSla(null);
    expect(net.last().search).toBe('');
  });

  it('adminDashboard maps kpis, flatmates and ticket desks', async () => {
    net.reply({
      extra: 1,
      kpis: { totalListings: '5', activeListings: 4, pendingModeration: 1, openReports: 2, totalUsers: 9, newUsers7d: 3, dealsClosed30d: 1, revenue30d: '100' },
      flatmates: { awaitingReview: 1, openReports: 2, unansweredRequests: 3, liveRooms: 4, liveGroups: 5, activeSeekers: 6, newSeekers7d: 7, matches30d: 8, replyRatePct: 50, medianReplyHours: 'x' },
      tickets: { open: 2, latest: [{ id: 't', team: 'support' }] },
    });
    const d = await a.adminDashboard();
    expect(d.extra).toBe(1);
    expect(d.kpis).toEqual({ totalListings: 5, activeListings: 4, pendingModeration: 1, openReports: 2, totalUsers: 9, newUsers7d: 3, dealsClosed30d: 1, revenue30d: 100 });
    expect(d.flatmates).toMatchObject({ awaitingReview: 1, matches30d: 8, replyRatePct: 50, medianReplyHours: null });
    expect(d.tickets).toEqual({ open: 2, latest: [{ id: 't', team: 'support', desk: 'support' }] });
    net.fresh();
    net.reply({ tickets: {} });
    expect((await a.adminDashboard()).tickets.latest).toEqual([]);
    net.fresh();
    net.reply(null);
    expect(await a.adminDashboard()).toEqual({ kpis: undefined, flatmates: undefined, tickets: undefined });
  });

  it('adminBell adds the desk to each ticket', async () => {
    net.reply({ unread: 2, openTickets: { total: 1, items: [{ id: 't', team: 'sales' }] } });
    expect(await a.adminBell()).toEqual({ unread: 2, openTickets: { total: 1, items: [{ id: 't', team: 'sales', desk: 'sales' }] } });
    expect(net.last().path).toBe('/admin/bell');
    net.fresh();
    net.reply({ openTickets: {} });
    expect((await a.adminBell()).openTickets.items).toEqual([]);
    net.fresh();
    net.reply(null);
    expect(await a.adminBell()).toEqual({ openTickets: undefined });
  });

  it('traffic', async () => {
    net.reply({
      days: 7, from: 'a', to: 'b',
      series: [{ date: 'd', sessions: 1, pageviews: 2, signups: 3 }],
      sources: [{ channel: 'seo', sessions: 4, sharePct: 40 }],
      devices: { mobile: 5, tablet: 1, desktop: 2 },
      identity: [{ week: 'w', anonymous: 3, signedIn: 4 }],
    });
    expect(await a.traffic({ days: 7 })).toEqual({
      days: 7, from: 'a', to: 'b',
      series: [{ date: 'd', sessions: 1, pageviews: 2, signups: 3 }],
      sources: [{ channel: 'seo', sessions: 4, sharePct: 40 }],
      devices: { mobile: 5, tablet: 1, desktop: 2 },
      identity: [{ week: 'w', anonymous: 3, signedIn: 4 }],
    });
    expect(net.last()).toMatchObject({ path: '/admin/analytics/traffic', query: { days: '7' } });
    net.fresh();
    net.reply({ series: [{}], sources: [{}], identity: [{}] });
    expect(await a.traffic()).toEqual({
      days: 0, from: '', to: '',
      series: [{ date: '', sessions: 0, pageviews: 0, signups: 0 }],
      sources: [{ channel: '', sessions: 0, sharePct: null }],
      devices: { mobile: 0, tablet: 0, desktop: 0 },
      identity: [{ week: '', anonymous: 0, signedIn: 0 }],
    });
    expect(net.last().search).toBe('');
  });

  it('engagement', async () => {
    net.reply({ days: 30, from: 'a', to: 'b', weeks: [{ week: 'w', sessions: 3, avgSessionMinutes: 2.5, bounceRatePct: 40 }, {}], topPages: [{ path: '/x', views: 3, anonViews: 1 }, {}] });
    expect(await a.engagement({ days: 30 })).toEqual({
      days: 30, from: 'a', to: 'b',
      weeks: [{ week: 'w', sessions: 3, avgSessionMinutes: 2.5, bounceRatePct: 40 }, { week: '', sessions: 0, avgSessionMinutes: null, bounceRatePct: null }],
      topPages: [{ path: '/x', views: 3, anonViews: 1 }, { path: '', views: 0, anonViews: 0 }],
    });
    expect(net.last().path).toBe('/admin/analytics/engagement');
    net.fresh();
    net.reply(null);
    expect(await a.engagement()).toEqual({ days: 0, from: '', to: '', weeks: [], topPages: [] });
  });

  it('funnel', async () => {
    net.reply({ days: 7, weeks: [{ week: 'w', posted: 1, approved: 2, contacts: 3, visits: 4, deals: 5 }, {}] });
    expect(await a.funnel({ days: 7 })).toEqual({
      days: 7, from: '', to: '',
      weeks: [{ week: 'w', posted: 1, approved: 2, contacts: 3, visits: 4, deals: 5 }, { week: '', posted: 0, approved: 0, contacts: 0, visits: 0, deals: 0 }],
    });
    expect(net.last().path).toBe('/admin/analytics/funnel');
    net.fresh();
    net.reply(null);
    expect((await a.funnel()).weeks).toEqual([]);
  });

  it('flatmates', async () => {
    net.reply({
      days: 7,
      weeks: [{ week: 'w', rooms: 1, groups: 2, seekers: 3, requests: 4, matches: 5, replyRatePct: 60 }, {}],
      replies: { sent: 4, replyRatePct: 50, acceptRatePct: 25, medianReplyHours: 3, unansweredNow: 1 },
      localities: [{ locality: 'Baner', supply: 2, demand: 3 }, {}],
    });
    expect(await a.flatmates({ days: 7 })).toEqual({
      days: 7, from: '', to: '',
      weeks: [{ week: 'w', rooms: 1, groups: 2, seekers: 3, requests: 4, matches: 5, replyRatePct: 60 }, { week: '', rooms: 0, groups: 0, seekers: 0, requests: 0, matches: 0, replyRatePct: null }],
      replies: { sent: 4, replyRatePct: 50, acceptRatePct: 25, medianReplyHours: 3, unansweredNow: 1 },
      localities: [{ locality: 'Baner', supply: 2, demand: 3 }, { locality: '', supply: 0, demand: 0 }],
    });
    expect(net.last().path).toBe('/admin/analytics/flatmates');
    net.fresh();
    net.reply(null);
    expect(await a.flatmates()).toMatchObject({ weeks: [], localities: [], replies: { sent: 0, replyRatePct: null, unansweredNow: 0 } });
  });

  it('surfers', async () => {
    net.reply({
      days: 7, from: 'a', to: 'b', totalSessions: 10, anonSessions: 6, signedInSessions: 4, signups: 2, anonSharePct: 60, conversionRatePct: 'x',
      pages: [{ path: '/p', views: 3, anonViews: 2 }], dropOff: [{ path: '/q', exits: 4, sharePct: 20 }, {}],
    });
    expect(await a.surfers({ days: 7 })).toEqual({
      days: 7, from: 'a', to: 'b', totalSessions: 10, anonSessions: 6, signedInSessions: 4, signups: 2, anonSharePct: 60, conversionRatePct: null,
      pages: [{ path: '/p', views: 3, anonViews: 2 }],
      dropOff: [{ path: '/q', exits: 4, sharePct: 20 }, { path: '', exits: 0, sharePct: null }],
    });
    expect(net.last().path).toBe('/admin/analytics/surfers');
    net.fresh();
    net.reply(null);
    expect(await a.surfers()).toMatchObject({ totalSessions: 0, anonSharePct: null, pages: [], dropOff: [] });
  });
});
