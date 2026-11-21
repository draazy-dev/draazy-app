import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get, prime } from '../../../src/services/http.js';
import { readAccessToken } from '../../../src/lib/auth.js';
import { myTenancies } from '../../../src/services/rentService.js';
import { listMyServiceRequestInvites } from '../../../src/services/serviceRequestService.js';
import { primeMeBootstrap } from '../../../src/services/meBootstrapService.js';
import { dashboardCaps, primeMeDashboard } from '../../../src/services/meDashboardService.js';
import { MAX_PAGE_SIZE } from '../../../src/services/apiLimits.js';

vi.mock('../../../src/services/http.js', () => ({ get: vi.fn(), prime: vi.fn(), PAGE_LOAD_TTL: 1234 }));
vi.mock('../../../src/lib/auth.js', () => ({ readAccessToken: vi.fn() }));
vi.mock('../../../src/services/rentService.js', () => ({ myTenancies: vi.fn() }));
vi.mock('../../../src/services/serviceRequestService.js', () => ({ listMyServiceRequestInvites: vi.fn() }));

const primedFor = (path) => vi.mocked(prime).mock.calls.find(([p]) => p === path);

beforeEach(() => {
  vi.mocked(get).mockReset();
  vi.mocked(prime).mockReset();
});

describe('primeMeBootstrap', () => {
  it('fetches the bootstrap document once and primes each section from it', async () => {
    const doc = { me: { id: 1 }, subscription: 'pro', saved: ['k'], messagesUnread: 3 };
    vi.mocked(get).mockReturnValue(Promise.resolve(doc));
    primeMeBootstrap();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/me/bootstrap');
    expect(prime).toHaveBeenCalledTimes(7);
    await expect(primedFor('/auth/me')[2]).resolves.toEqual({ id: 1 });
    await expect(primedFor('/me/saved/keys')[2]).resolves.toEqual(['k']);
    await expect(primedFor('/messages/unread-count')[2]).resolves.toBe(3);
    await expect(primedFor('/support/chat/unread-count')[2]).resolves.toBeUndefined();
  });

  it('primes undefined sections when the document is empty', async () => {
    vi.mocked(get).mockReturnValue(Promise.resolve(null));
    primeMeBootstrap();
    await expect(primedFor('/me/subscription')[2]).resolves.toBeUndefined();
  });
});

describe('primeMeDashboard', () => {
  it('does nothing when signed out', () => {
    vi.mocked(readAccessToken).mockReturnValue(null);
    expect(primeMeDashboard()).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
    expect(prime).not.toHaveBeenCalled();
  });

  describe('signed in', () => {
    beforeEach(() => vi.mocked(readAccessToken).mockReturnValue('tok'));

    it('loads the dashboard and primes every section except entitlements', async () => {
      const doc = Promise.resolve({ listings: { content: [1] }, visits: [2] });
      vi.mocked(get).mockReturnValue(doc);
      expect(primeMeDashboard({ maxAge: 50 })).toBe(doc);
      expect(get).toHaveBeenCalledWith('/me/dashboard', undefined, { ttl: 1234, maxAge: 50 });
      expect(prime).toHaveBeenCalledTimes(15);
      expect(primedFor('/me/entitlements')).toBeUndefined();
      const [, listingsQuery, listingsValue, opts] = primedFor('/me/listings');
      expect(listingsQuery).toEqual({ size: MAX_PAGE_SIZE });
      expect(opts).toEqual({ ttl: 1234 });
      await expect(listingsValue).resolves.toEqual({ content: [1] });
      expect(primedFor('/me/flatmate-posts')[1]).toEqual({ page: 0, size: MAX_PAGE_SIZE });
      expect(primedFor('/me/recent-searches')[1]).toBeUndefined();
    });

    it('adds listing tools and entitlements on request', () => {
      vi.mocked(get).mockReturnValue(Promise.resolve(null));
      primeMeDashboard({ listingTools: true });
      expect(get).toHaveBeenCalledWith('/me/dashboard', { listingTools: true }, { ttl: 1234, maxAge: undefined });
      expect(prime).toHaveBeenCalledTimes(16);
      expect(primedFor('/me/entitlements')).toBeDefined();
    });
  });
});

describe('dashboardCaps', () => {
  beforeEach(() => {
    vi.mocked(myTenancies).mockReset().mockResolvedValue([]);
    vi.mocked(listMyServiceRequestInvites).mockReset().mockResolvedValue([]);
  });

  it('reads every capability from a complete dashboard without extra calls', async () => {
    const doc = Promise.resolve({ listings: { content: [{}] }, hasTenancy: false, hasRentalInvite: true });
    await expect(dashboardCaps(doc)).resolves.toEqual({ ownsProperty: true, hasTenancy: false, hasRentalInvite: true });
    expect(myTenancies).not.toHaveBeenCalled();
    expect(listMyServiceRequestInvites).not.toHaveBeenCalled();
  });

  it('reports no property when the listings page is empty', async () => {
    const caps = await dashboardCaps(Promise.resolve({ listings: { content: [] }, hasTenancy: true, hasRentalInvite: true }));
    expect(caps.ownsProperty).toBe(false);
  });

  it('falls back to the individual endpoints for missing flags', async () => {
    vi.mocked(myTenancies).mockResolvedValue([{ id: 1 }]);
    vi.mocked(listMyServiceRequestInvites).mockResolvedValue([]);
    await expect(dashboardCaps(Promise.resolve({}))).resolves.toEqual({ ownsProperty: null, hasTenancy: true, hasRentalInvite: false });
  });

  it('falls back when the dashboard request failed or was not made', async () => {
    vi.mocked(myTenancies).mockResolvedValue([{ id: 1 }]);
    await expect(dashboardCaps(Promise.reject(new Error('x')))).resolves.toEqual({ ownsProperty: null, hasTenancy: true, hasRentalInvite: false });
    await expect(dashboardCaps(undefined)).resolves.toEqual({ ownsProperty: null, hasTenancy: true, hasRentalInvite: false });
  });

  it('treats failing fallback calls and non-array answers as false', async () => {
    vi.mocked(myTenancies).mockRejectedValue(new Error('x'));
    vi.mocked(listMyServiceRequestInvites).mockResolvedValue(null);
    await expect(dashboardCaps(null)).resolves.toEqual({ ownsProperty: null, hasTenancy: false, hasRentalInvite: false });
  });
});
