import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';

vi.mock('../../../../../src/services/refundService.js', () => ({ listMyPayments: vi.fn() }));
vi.mock('../../../../../src/lib/data/myListings.js', () => ({ flatmateKindOf: vi.fn(() => 'room'), loadMyListings: vi.fn() }));
vi.mock('../../../../../src/pages/consumer/requests/useRequestsInbox.js', () => ({ useRequestsInbox: vi.fn() }));
vi.mock('../../../../../src/services/flatmateService.js', () => ({ getFlatmateDetail: vi.fn() }));
vi.mock('../../../../../src/services/propertyService.js', () => ({ getProperty: vi.fn() }));
vi.mock('../../../../../src/pages/consumer/flatmates/helpers.js', () => ({ toSavedCard: vi.fn() }));

import { listMyPayments } from '../../../../../src/services/refundService.js';
import { loadMyListings } from '../../../../../src/lib/data/myListings.js';
import { useRequestsInbox } from '../../../../../src/pages/consumer/requests/useRequestsInbox.js';
import { getFlatmateDetail } from '../../../../../src/services/flatmateService.js';
import { getProperty } from '../../../../../src/services/propertyService.js';
import { toSavedCard } from '../../../../../src/pages/consumer/flatmates/helpers.js';
import { quickReplies } from '../../../../../src/pages/consumer/messages/quickReplies.js';
import { servicePath, loadSupportChoices } from '../../../../../src/pages/consumer/messages/supportChat.js';
import { useRequestThreads } from '../../../../../src/pages/consumer/messages/useRequestThreads.js';
import { useTargetCard } from '../../../../../src/pages/consumer/messages/useTargetCard.js';

afterEach(cleanup);

const ready = (items = []) => ({ items, status: 'ready' });
const boxes = (sent = [], received = []) => ({ sent: ready(sent), received: ready(received) });
const NOW = Date.parse('2026-03-10T10:00:00Z');

const listingConv = (extra = {}) => ({
  propertyId: 'p1',
  party: { id: 'u2' },
  youAre: 'seeker',
  property: { deal: 'rent', available: true },
  messages: [],
  ...extra,
});

const accepted = (kind, extra = {}) => ({ kind, state: 'accepted', target: { id: 'p1' }, party: { id: 'u2' }, ...extra });

describe('quickReplies', () => {
  it('returns nothing for unsuitable conversations', () => {
    const b = boxes();
    expect(quickReplies(null, b)).toEqual([]);
    ['request', 'group', 'staged', 'blocked', 'blockedYou', 'listingDeleted'].forEach((flag) => {
      expect(quickReplies(listingConv({ [flag]: true }), b, NOW)).toEqual([]);
    });
  });

  it('waits for the boxes to load', () => {
    const loading = { sent: { items: [], status: 'loading' }, received: ready() };
    expect(quickReplies(listingConv(), loading, NOW)).toEqual([]);
  });

  it('offers nothing when the listing is unavailable', () => {
    expect(quickReplies(listingConv({ property: { available: false } }), boxes(), NOW)).toEqual([]);
  });

  it('suggests seeker openers for a rent or buy enquiry', () => {
    const rent = quickReplies(listingConv(), boxes(), NOW);
    expect(rent).toContain('What are the deposit and maintenance?');
    const buy = quickReplies(listingConv({ property: { deal: 'buy', available: true } }), boxes(), NOW);
    expect(buy).toContain('Is the price negotiable?');
  });

  it('suggests owner replies', () => {
    const replies = quickReplies(listingConv({ youAre: 'owner', messages: [{ from: 'them', text: 'hi' }] }), boxes(), NOW);
    expect(replies).toContain("Yes, it's still available");
  });

  it('switches to visit, visited and offer cases', () => {
    const future = accepted('visit', { slot: new Date(NOW + 3600000).toISOString() });
    const past = accepted('visit', { slot: new Date(NOW - 3600000).toISOString() });
    expect(quickReplies(listingConv(), boxes([future]), NOW)).toContain('Please share the location pin');
    expect(quickReplies(listingConv({ youAre: 'owner' }), boxes([], [future]), NOW)).toContain('See you then');
    expect(quickReplies(listingConv(), boxes([past]), NOW)).toContain('When can I move in?');
    expect(quickReplies(listingConv({ property: { deal: 'buy', available: true } }), boxes([past]), NOW)).toContain('Can I get a home loan on this property?');
    expect(quickReplies(listingConv({ youAre: 'owner' }), boxes([], [past]), NOW)).toEqual(['Thanks for visiting. Did you like the place?']);
    const offer = accepted('offer');
    expect(quickReplies(listingConv(), boxes([offer]), NOW)).toContain('When can we sign the rent agreement?');
    expect(quickReplies(listingConv({ property: { deal: 'buy', available: true } }), boxes([offer]), NOW)).toContain('What are the next steps?');
    expect(quickReplies(listingConv({ youAre: 'owner' }), boxes([], [offer]), NOW)).toContain("Let's fix a date for the agreement");
    expect(quickReplies(listingConv({ youAre: 'owner', property: { deal: 'buy', available: true } }), boxes([], [offer]), NOW)).toContain('Will you need a home loan?');
  });

  it('ignores accepted rows for other listings or parties', () => {
    const other = accepted('offer', { target: { id: 'zzz' } });
    expect(quickReplies(listingConv(), boxes([other]), NOW)).toContain('Is it still available?');
  });

  it('does not suggest when you already sent the last message or have spoken more than once', () => {
    expect(quickReplies(listingConv({ messages: [{ from: 'me', text: 'hi' }] }), boxes(), NOW)).toEqual([]);
    const spoken = [{ from: 'me', text: 'a' }, { from: 'them', text: 'b' }, { from: 'me', text: 'c' }, { from: 'them', text: 'd' }];
    expect(quickReplies(listingConv({ messages: spoken }), boxes(), NOW)).toEqual([]);
  });

  it('allows one earlier message of yours when you opened the thread', () => {
    const msgs = [{ from: 'me', text: 'Is it still available?' }, { from: 'them', text: 'yes' }];
    const replies = quickReplies(listingConv({ messages: msgs }), boxes(), NOW);
    expect(replies).not.toContain('Is it still available?');
    expect(replies).toContain('When can I come for a visit?');
  });

  it('suggests flatmate replies by role', () => {
    const conv = { party: { id: 'u2' }, flatmate: { kind: 'room', id: 'r1' }, messages: [] };
    const row = { kind: 'flatmate', target: { id: 'r1' }, party: { id: 'u2' } };
    expect(quickReplies(conv, boxes([row]), NOW)).toContain('Is the room still available?');
    expect(quickReplies(conv, boxes([], [row]), NOW)).toContain('Yes, the room is available');
    const post = { ...conv, flatmate: { kind: 'post', id: 'r1' } };
    expect(quickReplies(post, boxes([row]), NOW)).toContain("What's your budget?");
    expect(quickReplies(post, boxes([], [row]), NOW)).toContain('Where is the place?');
    expect(quickReplies(conv, boxes(), NOW)).toEqual([]);
    expect(quickReplies({ ...conv, flatmate: { kind: 'zzz', id: 'r1' } }, boxes([row]), NOW)).toEqual([]);
  });
});

describe('supportChat', () => {
  beforeEach(() => {
    loadMyListings.mockReset();
    listMyPayments.mockReset();
  });

  it('maps service types to paths', () => {
    expect(servicePath({ type: 'rental' })).toBe('/services/rent-agreement');
    expect(servicePath({ type: 'legal' })).toBe('/services/property-legal');
    expect(servicePath({ type: 'interior' })).toBe('/services/interior-renovation');
    expect(servicePath({ type: 'packers' })).toBe('/services/packers-movers');
    expect(servicePath({ type: 'valuation' })).toBe('/services/property-valuation');
    expect(servicePath({ type: 'zzz' })).toBe('/services');
    expect(servicePath()).toBe('/services');
  });

  it('combines listings and invoiced payments', async () => {
    loadMyListings.mockResolvedValue([
      { id: 'ABC', uuid: 'UUID-1', title: 'Flat A' },
      { id: 'FM1', flatmate: true, title: 'Room B' },
    ]);
    listMyPayments.mockResolvedValue([{ invoiceNo: 'INV-1', label: 'Boost' }, { invoiceNo: 'INV-2' }, { label: 'No invoice' }]);
    const choices = await loadSupportChoices({ id: 'u' });
    expect(choices).toEqual([
      { type: 'property', id: 'uuid-1', label: 'Flat A' },
      { type: 'flatmate_room', id: 'fm1', label: 'Room B' },
      { type: 'invoice', id: 'INV-1', label: 'Boost \u00b7 INV-1' },
      { type: 'invoice', id: 'INV-2', label: 'Payment \u00b7 INV-2' },
    ]);
  });

  it('uses the id when a property has no uuid and tolerates failures', async () => {
    loadMyListings.mockResolvedValueOnce([{ id: 'XYZ', title: 'T' }]);
    listMyPayments.mockRejectedValueOnce(new Error('x'));
    expect(await loadSupportChoices({})).toEqual([{ type: 'property', id: 'xyz', label: 'T' }]);
    loadMyListings.mockRejectedValueOnce(new Error('x'));
    listMyPayments.mockResolvedValueOnce([]);
    expect(await loadSupportChoices({})).toEqual([]);
  });
});

describe('useRequestThreads', () => {
  const mkInbox = (received, sent) => ({ boxes: { received: ready(received), sent: ready(sent) } });

  const req = (kind, state, extra = {}) => ({
    kind,
    id: 1,
    state,
    createdAt: '2026-03-01T10:00:00Z',
    decidedAt: '2026-03-02T10:00:00Z',
    party: { id: 'u2', name: 'Asha Rao' },
    target: { id: 'p1', title: 'Flat A' },
    ...extra,
  });

  it('builds threads for pending received and unmatched sent requests', () => {
    const received = [req('contact', 'pending'), req('document', 'pending', { id: 2 })];
    const sent = [req('visit', 'pending', { id: 3 })];
    useRequestsInbox.mockReturnValue(mkInbox(received, sent));
    const convs = [];
    const { result } = renderHook(() => useRequestThreads(convs));
    expect(result.current.threads).toHaveLength(2);
    const [first, second] = result.current.threads;
    expect(first).toMatchObject({ id: 'request:contact:1', box: 'received', party: { id: 'u2', name: 'Asha Rao', avatar: 'AR' }, property: { title: 'Flat A' } });
    expect(first.messages).toHaveLength(1);
    expect(first.messages[0]).toMatchObject({ id: 'request', from: 'them' });
    expect(second.box).toBe('sent');
    expect(second.messages[0].from).toBe('me');
  });

  it('adds a system line for decided states', () => {
    const sent = [
      req('visit', 'declined', { id: 1 }),
      req('visit', 'expired', { id: 2 }),
      req('visit', 'withdrawn', { id: 3 }),
      req('offer', 'countered', { id: 4 }),
      req('offer', 'accepted', { id: 5 }),
    ];
    useRequestsInbox.mockReturnValue(mkInbox([], sent));
    const convs = [];
    const { result } = renderHook(() => useRequestThreads(convs));
    const lines = result.current.threads.map((t) => t.messages[1]?.text);
    expect(lines).toEqual([
      'Request declined',
      'This request expired',
      'You withdrew this request',
      'Asha Rao sent a counter-offer',
      'Asha Rao accepted your request',
    ]);
    expect(result.current.threads[0].at).toBe(Date.parse('2026-03-02T10:00:00Z'));
    expect(result.current.threads[0].messages[1]).toMatchObject({ id: 'state', type: 'system' });
  });

  it('hides accepted requests that already have a chat and keeps those awaiting one', () => {
    const received = [req('contact', 'accepted', { id: 1 }), req('contact', 'accepted', { id: 2, target: { id: 'p2', title: 'B' } }), req('group', 'accepted', { id: 3 })];
    const sent = [req('contact', 'accepted', { id: 4 })];
    useRequestsInbox.mockReturnValue(mkInbox(received, sent));
    const convs = [{ party: { id: 'u2' }, propertyId: 'p1' }];
    const { result } = renderHook(() => useRequestThreads(convs));
    expect(result.current.threads.map((t) => t.id)).toEqual(['request:contact:2']);
    expect(result.current.threads[0].messages[1].text).toBe("You accepted Asha Rao's request");
  });

  it('matches flatmate chats without a property and ignores staged or group chats', () => {
    const received = [req('flatmate', 'accepted', { id: 1 })];
    useRequestsInbox.mockReturnValue(mkInbox(received, []));
    const withChat = [{ party: { id: 'u2' } }];
    expect(renderHook(() => useRequestThreads(withChat)).result.current.threads).toEqual([]);
    const staged = [{ party: { id: 'u2' }, staged: true }, { party: { id: 'u2' }, group: true }];
    expect(renderHook(() => useRequestThreads(staged)).result.current.threads).toHaveLength(1);
  });

  it('filters non-connection kinds and falls back for missing names and timestamps', () => {
    const received = [req('photo', 'pending'), { kind: 'contact', id: 9, state: 'pending' }];
    useRequestsInbox.mockReturnValue(mkInbox(received, []));
    const convs = [];
    const { result } = renderHook(() => useRequestThreads(convs));
    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0].party).toEqual({ id: undefined, name: 'Someone', avatar: 'S' });
    expect(result.current.threads[0].at).toBe(0);
    expect(result.current.inbox.boxes.received.items).toBe(received);
  });
});

describe('useTargetCard', () => {
  beforeEach(() => {
    getProperty.mockReset();
    getFlatmateDetail.mockReset();
    toSavedCard.mockReset();
  });

  it('returns null for unknown kinds or missing ids', () => {
    expect(renderHook(() => useTargetCard('mystery', 'x', 'T')).result.current).toBeNull();
    expect(renderHook(() => useTargetCard('property', '', 'T')).result.current).toBeNull();
    expect(getProperty).not.toHaveBeenCalled();
  });

  it('loads a property card', async () => {
    getProperty.mockResolvedValue({ title: 'Flat', image: 'i.jpg', price: 100, deal: 'buy', bhk: '2', locality: 'Baner' });
    const { result } = renderHook(() => useTargetCard('property', 'p1', 'Fallback'));
    expect(result.current).toEqual({ title: 'Fallback' });
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(result.current).toMatchObject({ key: 'property:p1', title: 'Flat', img: 'i.jpg', price: 100, deal: 'buy', bhk: '2', loc: 'Baner' });
  });

  it('marks a missing property as unavailable', async () => {
    getProperty.mockResolvedValue(null);
    const { result } = renderHook(() => useTargetCard('property', 'gone', 'T'));
    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.title).toBe('T');
  });

  it('loads flatmate cards through toSavedCard', async () => {
    getFlatmateDetail.mockResolvedValue({ item: { id: 'r1' } });
    toSavedCard.mockReturnValue({ title: 'Room', img: 'r.jpg', price: 9, sub: 'Shared', loc: 'Wakad' });
    const { result } = renderHook(() => useTargetCard('room', 'r1', 'T'));
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(getFlatmateDetail).toHaveBeenCalledWith('room', 'r1');
    expect(result.current).toMatchObject({ title: 'Room', img: 'r.jpg', price: 9, bhk: 'Shared', loc: 'Wakad' });
  });

  it('marks flatmate cards unavailable when the item cannot be mapped', async () => {
    getFlatmateDetail.mockResolvedValue({ item: null });
    toSavedCard.mockReturnValue(null);
    const { result } = renderHook(() => useTargetCard('group', 'g9', 'T'));
    await waitFor(() => expect(result.current.available).toBe(false));
  });

  it('keeps the placeholder when loading fails', async () => {
    getProperty.mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useTargetCard('property', 'err', 'T'));
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toEqual({ title: 'T' });
  });
});
