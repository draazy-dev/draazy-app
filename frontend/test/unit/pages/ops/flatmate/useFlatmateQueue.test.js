import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../../../../src/services/flatmateService.js', () => ({
  getFlatmateModerationSummary: vi.fn(),
  listFlatmateModeration: vi.fn(),
  listFlatmateReviews: vi.fn(),
  listGroupApplications: vi.fn(),
}));
vi.mock('../../../../../src/pages/ops/flatmate/board.jsx', () => ({ claimLabel: (tier) => `claim:${tier}` }));

import * as svc from '../../../../../src/services/flatmateService.js';
import useFlatmateQueue, { QUEUE_TABS } from '../../../../../src/pages/ops/flatmate/useFlatmateQueue.js';

const page = (items, total = items.length) => ({ items, total });
const post = (over = {}) => ({ id: 'p1', kind: 'post', headline: 'H', locality: 'Baner', authorName: 'A', authorMobile: '9', createdAt: 100, modStatus: 'pending', photoCount: 2, coverPhoto: 'c', rent: 5000, freeText: 'txt', caseStatus: null, unreadFromHost: 0, ...over });

beforeEach(() => {
  Object.values(svc).forEach((fn) => { fn.mockReset(); });
  svc.getFlatmateModerationSummary.mockResolvedValue({ badgeRequests: 3 });
  svc.listFlatmateModeration.mockResolvedValue(page([]));
  svc.listGroupApplications.mockResolvedValue(page([]));
  svc.listFlatmateReviews.mockResolvedValue(page([]));
});

const ready = async (tab) => {
  const view = renderHook(() => useFlatmateQueue(tab));
  await waitFor(() => expect(view.result.current.status).not.toBe('loading'));
  return view;
};

describe('useFlatmateQueue', () => {
  it('lists the queue tabs', () => {
    expect(QUEUE_TABS.map((t) => t.id)).toEqual(['pending', 'badge', 'published', 'hidden']);
  });

  it('builds the pending queue newest-first with reasons', async () => {
    svc.listFlatmateModeration.mockResolvedValue(page([
      post({ id: 'a', createdAt: 100 }),
      post({ id: 'b', createdAt: 300, caseStatus: 'needs_info', unreadFromHost: 2 }),
      post({ id: 'c', createdAt: 200, recheckRequestedAt: 250, recheckReason: 'edited, new post' }),
      post({ id: 'd', createdAt: 50, recheckRequestedAt: 60, recheckReason: 'edited' }),
    ], 9));
    svc.listGroupApplications.mockResolvedValue(page([{ id: 'g1', at: 150 }]));
    const { result } = await ready('pending');
    expect(result.current.items.map((i) => i.key)).toEqual(['b', 'c', 'application:g1', 'a', 'd']);
    const byKey = Object.fromEntries(result.current.items.map((i) => [i.key, i]));
    expect(byKey.b.reasons).toEqual(['Needs info', 'Host replied (2)']);
    expect(byKey.a.reasons).toEqual(['Awaiting publish']);
    expect(byKey.c.reasons[0]).toBe('Live \u00b7 not yet reviewed');
    expect(byKey.d.reasons[0]).toBe('Edited since review');
    expect(byKey['application:g1']).toMatchObject({ reasons: ['Group application'], since: 150 });
    expect(byKey.a.post).toMatchObject({ id: 'a', author: 'A', snippet: 'txt', rent: 5000 });
    expect(result.current).toMatchObject({ truncated: true, counts: { badgeRequests: 3 }, error: '' });
    expect(svc.listFlatmateModeration).toHaveBeenCalledWith(expect.objectContaining({ modStatus: ['pending', 'recheck'] }));
  });

  it('orders badge requests oldest-first and keys them by room or group', async () => {
    svc.listFlatmateReviews.mockResolvedValue(page([
      { id: 1, roomId: 'room-1', tier: 'tenant', ownerConsent: false, flagForReview: true, createdAt: 20 },
      { id: 2, groupId: 'grp-1', tier: 'owner', ownerConsent: true, createdAt: 10 },
      { id: 3, tier: 'owner', createdAt: 30 },
    ]));
    const { result } = await ready('badge');
    expect(result.current.items.map((i) => i.key)).toEqual(['grp-1', 'room-1', 'review:3']);
    expect(result.current.items[1].reasons).toEqual(['claim:tenant', 'Contested address', 'Owner consent missing']);
    expect(result.current.items[0].reasons).toEqual(['claim:owner']);
    expect(result.current.truncated).toBe(false);
    expect(svc.listFlatmateReviews).toHaveBeenCalledWith({ status: 'pending', size: 100 });
  });

  it('loads published and hidden posts with their statuses', async () => {
    svc.listFlatmateModeration.mockResolvedValue(page([post({ id: 'x', createdAt: 1 }), post({ id: 'y', createdAt: 2 })]));
    const published = await ready('published');
    expect(published.result.current.items.map((i) => i.key)).toEqual(['y', 'x']);
    expect(published.result.current.items[0].reasons).toEqual([]);
    expect(svc.listFlatmateModeration).toHaveBeenLastCalledWith(expect.objectContaining({ modStatus: ['approved', 'live'] }));
    await ready('hidden');
    expect(svc.listFlatmateModeration).toHaveBeenLastCalledWith(expect.objectContaining({ modStatus: ['flagged', 'removed', 'rejected', 'expired'] }));
  });

  it('keeps going when the summary fails', async () => {
    svc.getFlatmateModerationSummary.mockRejectedValue(new Error('x'));
    const { result } = await ready('pending');
    expect(result.current).toMatchObject({ status: 'ready', counts: null });
  });

  it('reports a load error and recovers on reload', async () => {
    svc.listFlatmateModeration.mockRejectedValueOnce(new Error('boom'));
    const { result } = await ready('pending');
    expect(result.current).toMatchObject({ status: 'error', items: [], error: 'Could not read this queue.' });
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.error).toBe('');
  });
});
