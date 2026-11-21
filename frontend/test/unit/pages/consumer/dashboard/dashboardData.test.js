import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attentionFromItems, buildActionItems, buildDocGroups, buildOwnerStats, buildSeekerStats, countUpcomingVisits,
  isVisitHost, listingTitleFor,
} from '../../../../../src/pages/consumer/dashboard/dashboardData.js';
import { profileCompletion } from '../../../../../src/pages/consumer/dashboard/retention.js';
import {
  CHIP_ACCENT, FRESHNESS_ICON, FURNISH_LABEL, LISTING_STATUS_CLS, STATUS_ICON, STATUS_LABEL,
} from '../../../../../src/pages/consumer/dashboard/myListings/helpers.js';

afterEach(() => vi.useRealTimers());

describe('listingTitleFor', () => {
  const listings = [{ id: 1, title: 'One' }, { uuid: 'u2', name: 'Two' }, { propertyId: 'p3' }];

  it('finds by any id field and compares as strings', () => {
    expect(listingTitleFor(listings, '1')).toBe('One');
    expect(listingTitleFor(listings, 'u2')).toBe('Two');
    expect(listingTitleFor(listings, 'p3', 'fb')).toBe('fb');
  });

  it('falls back when no id or no match', () => {
    expect(listingTitleFor(listings, '', 'fb')).toBe('fb');
    expect(listingTitleFor(listings, 'zz', 'fb')).toBe('fb');
    expect(listingTitleFor(undefined, 'zz')).toBe('');
  });
});

describe('buildDocGroups', () => {
  const reqs = [
    { id: 'r1', requesterId: 'b1', propId: 'p1', buyerName: 'Asha', buyerMobile: '99', categories: ['Index II', 'Sale Deed'], status: 'pending', requestedAt: 200 },
    { id: 'r2', requesterId: 'b1', propId: 'p1', docType: 'Index II', status: 'granted', requestedAt: 100 },
    { id: 'r3', requesterId: 'b2', propertyId: 'p2', docType: 'Tax', status: 'declined', requestedAt: 500 },
    { id: 'r4', buyerId: 'b3', propId: 'p2', docType: 'Tax', status: 'granted', requestedAt: 300 },
    { id: 'r5', docType: 'Other', status: 'pending' },
  ];

  it('groups requests per requester and property', () => {
    const groups = buildDocGroups(reqs, [{ id: 'p1', title: 'Flat One' }]);
    const g = groups.find((x) => x.key === 'b1|p1');
    expect(g).toMatchObject({
      buyerName: 'Asha', buyerMobile: '99', propLabel: 'Flat One', docTypes: ['Index II', 'Sale Deed'],
      pendingDocTypes: ['Index II', 'Sale Deed'], pendingIds: ['r1'], grantedIds: ['r2'], grantedCategoryCount: 1,
      requestedAt: 100, legacyKey: 'documents:99|p1',
    });
    expect(groups.find((x) => x.key === 'b2|p2').declinedIds).toEqual(['r3']);
    expect(groups.find((x) => x.key === 'request:r5')).toMatchObject({ buyerName: 'A buyer', requestedAt: Infinity });
  });

  it('puts groups with pending requests first, then newest first', () => {
    const keys = buildDocGroups(reqs, []).map((g) => g.key);
    expect(keys).toEqual(['request:r5', 'b1|p1', 'b2|p2', 'b3|p2']);
  });

  it('accepts a title resolver function and empty input', () => {
    const [g] = buildDocGroups([{ id: 1, requesterId: 'x', propId: 'P', status: 'pending' }], (id) => `T-${id}`);
    expect(g.propLabel).toBe('T-P');
    expect(buildDocGroups()).toEqual([]);
    expect(buildDocGroups(null)).toEqual([]);
  });
});

describe('visit helpers', () => {
  it('isVisitHost checks flag, ids and owner-role parties', () => {
    expect(isVisitHost(null, 1)).toBe(false);
    expect(isVisitHost({ hostedByMe: true })).toBe(true);
    expect(isVisitHost({ ownerId: 1 })).toBe(false);
    expect(isVisitHost({ ownerId: 1 }, '1')).toBe(true);
    expect(isVisitHost({ hostId: 2 }, 2)).toBe(true);
    expect(isVisitHost({ parties: [{ role: 'Owner', id: 9 }] }, 9)).toBe(true);
    expect(isVisitHost({ parties: [{ role: 'buyer', id: 9 }] }, 9)).toBe(false);
  });

  it('counts upcoming visits where the user is the visitor', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 15, 0));
    const visits = [
      { status: 'scheduled', visitorId: 7, when: '2026-06-10' },
      { status: 'confirmed', visitorId: 7, slot: new Date(2026, 5, 20).toISOString() },
      { status: 'confirmed', visitorId: 7, when: '2026-06-09' },
      { status: 'completed', visitorId: 7, when: '2026-06-12' },
      { status: 'scheduled', visitorId: 8, when: '2026-06-12' },
      { status: 'scheduled', visitorId: 7, ownerId: 7, when: '2026-06-12' },
      { status: 'scheduled', parties: [{ role: 'buyer', id: 7 }] },
      { status: 'scheduled', visitorId: 7, slot: 'garbage' },
    ];
    expect(countUpcomingVisits(visits, 7)).toBe(2);
    expect(countUpcomingVisits(visits)).toBe(0);
    expect(countUpcomingVisits(undefined, 7)).toBe(0);
  });
});

describe('attentionFromItems', () => {
  it('buckets items by kind', () => {
    const items = [
      { kind: 'contact' }, { kind: 'photo' }, { kind: 'doc' }, { kind: 'flatmate' }, { kind: 'app' }, { kind: 'offer' },
      { kind: 'visit' }, { kind: 'clarify' }, { kind: 'message' }, { kind: 'agreement' },
    ];
    expect(attentionFromItems(items)).toEqual({ leads: 6, visits: 1, properties: 2 });
    expect(attentionFromItems()).toEqual({ leads: 0, visits: 0, properties: 0 });
  });
});

describe('buildActionItems', () => {
  const now = Date.UTC(2026, 5, 10, 12);
  const base = () => ({
    isOwner: true,
    contactReqs: [{ id: 1, status: 'pending', buyerName: 'Asha', requestedAt: now - 1000 }, { id: 2, status: 'granted' }],
    flatmateReqs: [
      { id: 3, status: 'pending', kind: 'group', requesterName: 'Ravi', requestedAt: now - 2000 },
      { id: 4, status: 'pending', requestedAt: now - 3000 },
    ],
    apps: [{ id: 5, status: 'pending', groupTitle: 'Team', listingTitle: 'Flat', at: now - 4000 }, { id: 6, status: 'x' }],
    offers: [
      { id: 7, status: 'countered', from: 'buyer', buyerName: 'Kiran', createdAt: new Date(now - 5000).toISOString() },
      { id: 8, status: 'pending', from: 'owner' },
    ],
    photoReqs: [{ id: 9, buyerName: 'Mira', requestedAt: now - 6000 }, { id: 10, status: 'done' }],
    pendingDocGroups: [
      { key: 'k1', buyerName: 'Dev', pendingDocTypes: ['A', 'B'], docTypes: [], pendingIds: [], requestedAt: now - 7000 },
      { key: 'k2', buyerName: 'Eli', pendingDocTypes: [], docTypes: ['A'], pendingIds: [1], requestedAt: Infinity },
    ],
    scheduledVisits: [
      { id: 11, status: 'scheduled', hostedByMe: true, visitorName: 'Zed', listing: 'Flat', at: now - 8000 },
      { id: 12, status: 'scheduled', visitorId: 1 },
      { id: 13, status: 'confirmed', hostedByMe: true },
    ],
    serviceReqs: [
      { id: 14, status: 'action_required', attention: { forYou: true, askedAt: now - 9000 }, details: { property: 'Baner flat' } },
      { id: 15, status: 'action_required', attention: { forYou: false } },
    ],
    userId: 1,
  });

  it('builds items for each source, sorted oldest-first when fresh', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const items = buildActionItems(base());
    expect(items.map((i) => i.id)).toEqual([
      'agreement:14', 'visit:11', 'doc:k1', 'photo:9', 'offer:7', 'app:5', 'flatmate:4', 'flatmate:3', 'contact:1', 'doc:k2',
    ]);
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId['contact:1']).toMatchObject({ kind: 'contact', who: 'Asha', title: 'Asha wants to contact you', at: now - 1000 });
    expect(byId['flatmate:3'].title).toBe('Ravi wants to join your group');
    expect(byId['flatmate:4']).toMatchObject({ who: 'A seeker', title: 'A seeker is interested' });
    expect(byId['app:5'].title).toBe('Group wants to rent Flat');
    expect(byId['offer:7']).toMatchObject({ title: 'Offer from Kiran to answer', at: now - 5000 });
    expect(byId['photo:9'].title).toBe('Mira asked for more photos');
    expect(byId['doc:k1'].title).toBe('Dev wants 2 documents');
    expect(byId['doc:k2']).toMatchObject({ title: 'Eli wants 1 document', at: null });
    expect(byId['visit:11'].title.startsWith('Visit to confirm')).toBe(true);
    expect(byId['visit:11'].title.endsWith('Flat')).toBe(true);
    expect(byId['visit:11'].who).toBe('Zed');
    expect(byId['agreement:14'].who).toBe('Baner flat');
  });

  it('skips owner sources for non-owners but keeps visits and agreements', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const items = buildActionItems({ ...base(), isOwner: false });
    expect(items.map((i) => i.kind).sort()).toEqual(['agreement', 'visit']);
  });

  it('floats stale items (older than two days) to the top', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const stale = now - 3 * 86400000;
    const items = buildActionItems({
      isOwner: true,
      contactReqs: [{ id: 1, status: 'pending', requestedAt: now - 1000 }, { id: 2, status: 'pending', requestedAt: stale }],
    });
    expect(items.map((i) => i.id)).toEqual(['contact:2', 'contact:1']);
  });

  it('normalises string timestamps and drops invalid ones', () => {
    const items = buildActionItems({
      isOwner: true,
      contactReqs: [{ id: 1, status: 'pending', requestedAt: 'nope' }, { id: 2, status: 'pending', requestedAt: 0 }],
      offers: [{ id: 3, status: 'pending', from: 'buyer', createdAt: '2026-01-01T00:00:00Z' }],
    });
    expect(items.find((i) => i.id === 'offer:3').at).toBe(Date.parse('2026-01-01T00:00:00Z'));
    expect(items.find((i) => i.id === 'contact:1').at).toBeNull();
  });

  describe('unread review items', () => {
    const listings = [
      { id: 'a', uuid: 'ua', title: 'Alpha', status: 'approved' },
      { id: 'b', title: 'Beta', status: 'pending' },
      { id: 'c', title: 'Gamma', status: 'approved', flatmate: true },
    ];

    it('adds message items with an open handler for a Map or an object', () => {
      const openReview = vi.fn();
      const reviews = new Map([['a', { unread: 2, updatedAt: 5000 }], ['c', { unread: 1 }]]);
      const items = buildActionItems({ isOwner: true, listings, reviewsByProp: reviews, openReview });
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ id: 'message:a', kind: 'message', title: 'New message on "Alpha"', at: 5000 });
      items[0].open();
      expect(openReview).toHaveBeenCalledWith('ua');

      const asObject = buildActionItems({ isOwner: true, listings, reviewsByProp: { a: { unread: 1 } } });
      expect(asObject.map((i) => i.id)).toEqual(['message:a']);
    });

    it('falls back to go("properties") without an openReview handler', () => {
      const go = vi.fn();
      const [item] = buildActionItems({ isOwner: true, listings, reviewsByProp: { a: { unread: 1 } }, go });
      item.open();
      expect(go).toHaveBeenCalledWith('properties');
    });

    it('flags pending listings that need info as clarify items', () => {
      const [item] = buildActionItems({
        isOwner: true, listings, reviewsByProp: { b: { unread: 1, status: 'needs_info' } },
      });
      expect(item).toMatchObject({ id: 'clarify:b', kind: 'clarify', title: 'Needs info on "Beta"' });
    });
  });
});

describe('stats builders', () => {
  const go = vi.fn();

  it('builds owner stats from items and live listings', () => {
    const listings = [
      { status: 'approved', views: 1500 },
      { status: 'live', viewCount: 500 },
      { status: 'approved', stats: { views: 10 }, paused: true },
      { status: 'paused', views: 99 },
      { status: 'approved', flatmate: true, kind: 'post', views: 7 },
      { state: 'verified', views: 'x' },
    ];
    const stats = buildOwnerStats({ listings, items: [{ kind: 'contact' }, { kind: 'visit' }, { kind: 'visit' }], go });
    expect(stats.map((s) => s.value)).toEqual(['1', '2', '3', (2000).toLocaleString('en-IN')]);
    expect(stats[0].trend).toEqual({ dir: 'up', text: 'Needs a reply' });
    expect(stats[2].trend.text).toBe('3 listings');
    expect(stats[3].trend.text).toBe('across 3 live');
    stats[1].onClick();
    expect(go).toHaveBeenCalledWith('visits');
  });

  it('describes an owner with nothing going on', () => {
    const stats = buildOwnerStats({ go });
    expect(stats.map((s) => s.value)).toEqual(['0', '0', '0', '0']);
    expect(stats[0].trend).toEqual({ dir: 'flat', text: 'All handled' });
    expect(stats[2].trend.text).toBe('None live');
    expect(stats[3].trend.text).toBe('No live listings');
  });

  it('uses the singular for one live listing', () => {
    expect(buildOwnerStats({ listings: [{ status: 'approved' }], go })[2].trend.text).toBe('1 listing');
  });

  it('builds seeker stats', () => {
    const stats = buildSeekerStats({ savedCount: 2, alertCount: 0, followCount: 1, upcomingVisits: 3, go });
    expect(stats.map((s) => s.value)).toEqual(['2', '0', '3', '1']);
    expect(stats.map((s) => s.trend.text)).toEqual(['Saved homes', 'None yet', 'On your calendar', 'Followed societies']);
    stats[3].onClick();
    expect(go).toHaveBeenCalledWith('alerts');
    expect(buildSeekerStats({ go }).map((s) => s.trend.text)).toEqual(['None yet', 'None yet', 'None booked', 'None yet']);
  });
});

describe('profileCompletion', () => {
  it('scores filled fields and names the next step', () => {
    const r = profileCompletion({ name: 'A', email: '  ', city: 'Pune' }, false);
    expect(r).toMatchObject({ percent: 50, done: 2, total: 4 });
    expect(r.next).toMatchObject({ key: 'email' });
  });

  it('handles complete and empty profiles', () => {
    const full = profileCompletion({ name: 'A', email: 'a@b.c', city: 'Pune' }, true);
    expect(full).toMatchObject({ percent: 100, next: null });
    expect(profileCompletion(null, false)).toMatchObject({ percent: 0, done: 0 });
  });
});

describe('listing tables', () => {
  it('cover the listing statuses consistently', () => {
    expect(STATUS_LABEL.approved).toBe('Live');
    expect(STATUS_LABEL.pending).toBe('Under review');
    for (const key of Object.keys(STATUS_ICON)) expect(STATUS_LABEL[key]).toBeTruthy();
    for (const key of Object.keys(LISTING_STATUS_CLS)) expect(STATUS_LABEL[key]).toBeTruthy();
    expect(FURNISH_LABEL.semi).toBe(FURNISH_LABEL['semi-furnished']);
    expect(Object.keys(FRESHNESS_ICON)).toEqual(['active', 'aging', 'stale', 'dormant']);
    expect(CHIP_ACCENT.muted).toContain('gray');
  });
});
