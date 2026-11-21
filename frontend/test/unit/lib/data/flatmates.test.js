import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { digits, hashToken, norm, pin } from '../../../../src/lib/data/identityNorm.js';
import {
  MAX_ACTIVE_HOST_SHARES, addressFingerprint, countCappedActiveFlatmatePosts, evaluateHostEligibility, findAddressClaims,
  getFlatmateGroups, isPubliclyVisible, pushPendingRequest, recordAskLocally, rememberAsk,
} from '../../../../src/lib/data/flatmates.js';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('identityNorm', () => {
  it('normalises digits, text and pincodes', () => {
    expect(digits('+91 98765-43210')).toBe('919876543210');
    expect(digits(null)).toBe('');
    expect(norm('  Baner   ROAD ')).toBe('baner road');
    expect(pin('411 045')).toBe('411045');
    expect(pin('4110')).toBe('');
  });

  it('hashes deterministically to a base-36 token', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
    expect(hashToken('abc')).toMatch(/^[0-9a-z]+$/);
    expect(hashToken(123)).toBe(hashToken('123'));
  });
});

const seed = (groups = [], rooms = []) => {
  localStorage.setItem('draazyFlatmateGroups', JSON.stringify(groups));
  localStorage.setItem('draazyRoomListings', JSON.stringify(rooms));
};

describe('pending requests', () => {
  it('queues a request with the current user id', () => {
    localStorage.setItem('draazyUser', JSON.stringify({ id: 'u1' }));
    expect(pushPendingRequest({ propertyId: 'p1' })).toBe(true);
    expect(JSON.parse(localStorage.getItem('dzPendingRequests'))).toEqual([{ propertyId: 'p1', userId: 'u1' }]);
  });

  it('records an ask once per property', () => {
    expect(recordAskLocally({ request: { propertyId: 'p1' } })).toBe(true);
    expect(recordAskLocally({ request: { propertyId: 'p1' } })).toBe(false);
    expect(recordAskLocally({ request: {} })).toBe(false);
    expect(recordAskLocally({})).toBe(false);
    expect(JSON.parse(localStorage.getItem('dzPendingRequests'))[0].userId).toBeNull();
  });

  it('tolerates a corrupt queue', () => {
    localStorage.setItem('dzPendingRequests', '{bad');
    expect(recordAskLocally({ request: { propertyId: 'p2' } })).toBe(true);
  });
});

describe('visibility', () => {
  it('treats live and approved (or unset) posts as public', () => {
    expect(isPubliclyVisible({})).toBe(true);
    expect(isPubliclyVisible({ modStatus: 'approved' })).toBe(true);
    expect(isPubliclyVisible({ modStatus: 'pending' })).toBe(false);
    expect(isPubliclyVisible(null)).toBe(true);
  });
});

describe('active post counting', () => {
  it('counts open groups and active rooms of the host, excluding owner-tier', () => {
    seed(
      [
        { id: 'g1', ownerMobile: '9876543210', seatsTotal: 3, members: [1] },
        { id: 'g2', ownerMobile: '9876543210', seatsTotal: 2, members: [1, 2] },
        { id: 'g3', ownerMobile: '9876543210', seatsTotal: 3, seatsOpen: 1, verificationTier: 'owner' },
        { id: 'g4', ownerMobile: '1111111111', seatsTotal: 3 },
      ],
      [
        { id: 'r1', ownerMobile: '9876543210' },
        { id: 'r2', ownerMobile: '9876543210', status: 'filled' },
        { id: 'r3', ownerMobile: '9876543210', status: 'closed' },
        { id: 'r4', ownerMobile: '9876543210', seatsOpen: 0 },
      ],
    );
    expect(countCappedActiveFlatmatePosts('9876543210')).toBe(2);
    expect(countCappedActiveFlatmatePosts('+91 9876543210')).toBe(0);
    expect(countCappedActiveFlatmatePosts('')).toBe(0);
  });

  it('uses seatsOpen clamped to the seat total when present', () => {
    seed([{ id: 'g', ownerMobile: '9876543210', seatsTotal: 2, seatsOpen: 9 }, { id: 'h', ownerMobile: '9876543210', seatsTotal: 2, seatsOpen: 0 }]);
    expect(countCappedActiveFlatmatePosts('9876543210')).toBe(1);
  });

  it('ignores non-array stored rooms', () => {
    localStorage.setItem('draazyRoomListings', JSON.stringify({ bad: true }));
    expect(countCappedActiveFlatmatePosts('9876543210')).toBe(0);
    expect(getFlatmateGroups()).toEqual([]);
  });
});

describe('addressFingerprint / findAddressClaims', () => {
  it('prefers property id, then society, then title', () => {
    expect(addressFingerprint({ propertyId: 7 })).toBe('prop:7');
    expect(addressFingerprint({ society: ' Park  View ', locality: 'Baner' })).toBe('addr:park view|baner');
    expect(addressFingerprint({ title: 'Cozy 2BHK', locality: 'Baner' })).toBe('addr:cozy 2bhk|baner');
    expect(addressFingerprint({ locality: 'Baner' })).toBe('');
    expect(addressFingerprint()).toBe('');
  });

  it('finds open group and room claims on a fingerprint', () => {
    seed(
      [{ id: 'g1', ownerMobile: '9876543210', propertyId: 'p1', seatsTotal: 2, verificationTier: 'basic' }, { id: 'g2', ownerMobile: '1', propertyId: 'p1', seatsTotal: 2, members: [1, 2] }],
      [{ id: 'r1', ownerMobile: '+91 90000 00000', propertyId: 'p1' }, { id: 'r2', ownerMobile: '2', society: 'Sun', localities: ['Aundh'] }],
    );
    expect(findAddressClaims('prop:p1')).toEqual([
      { kind: 'group', id: 'g1', mobile: '9876543210', tier: 'basic' },
      { kind: 'room', id: 'r1', mobile: '919000000000', tier: undefined },
    ]);
    expect(findAddressClaims('addr:sun|aundh').map((c) => c.id)).toEqual(['r2']);
    expect(findAddressClaims('')).toEqual([]);
  });
});

describe('evaluateHostEligibility', () => {
  it('blocks a host at the cap unless they are a verified owner', () => {
    seed(Array.from({ length: MAX_ACTIVE_HOST_SHARES }, (_, i) => ({ id: `g${i}`, ownerMobile: '9876543210', seatsTotal: 2 })));
    const blocked = evaluateHostEligibility({ mobile: '9876543210', tier: 'basic', address: { propertyId: 'new' } });
    expect(blocked).toMatchObject({ overCap: true, blocked: true });
    expect(blocked.reason).toMatch(/already have 3 live flatmate posts/);
    expect(evaluateHostEligibility({ mobile: '9876543210', tier: 'owner' }).overCap).toBe(false);
  });

  it('blocks a duplicate address by the same host and flags one claimed by someone else', () => {
    seed([{ id: 'g1', ownerMobile: '9876543210', propertyId: 'p1', seatsTotal: 2 }]);
    const dup = evaluateHostEligibility({ mobile: '9876543210', address: { propertyId: 'p1' } });
    expect(dup).toMatchObject({ duplicate: true, blocked: true, flagForReview: false, fingerprint: 'prop:p1' });
    expect(dup.reason).toBe('You already have a live flatmate for this address.');
    const other = evaluateHostEligibility({ mobile: '9999999999', address: { propertyId: 'p1' } });
    expect(other).toMatchObject({ duplicate: false, flagForReview: true, blocked: false, reason: '' });
  });

  it('is clean with no arguments', () => {
    expect(evaluateHostEligibility()).toMatchObject({ blocked: false, fingerprint: '', reason: '' });
  });
});

describe('rememberAsk', () => {
  it('remembers asks per mobile and merges keys', () => {
    rememberAsk('+91 98765 43210', 'room1');
    rememberAsk('+91 98765 43210', 'room2');
    rememberAsk('', 'ignored');
    expect(JSON.parse(localStorage.getItem('draazyFlatmateInterests'))).toEqual({ 919876543210: { room1: true, room2: true } });
  });
});
