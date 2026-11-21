import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';

const ctx = vi.hoisted(() => ({
  conv: { pendingRequests: 0, streamConnected: false },
  notes: { unread: 0, status: 'ready' },
}));

vi.mock('../../../../../src/context/ConversationContext.jsx', () => ({ useConversationUnread: () => ctx.conv }));
vi.mock('../../../../../src/context/NotificationContext.jsx', () => ({ useNotifications: () => ctx.notes }));
vi.mock('../../../../../src/services/requestInboxService.js', () => ({ listRequests: vi.fn() }));

import { listRequests } from '../../../../../src/services/requestInboxService.js';
import { useNow, useRequestsInbox } from '../../../../../src/pages/consumer/requests/useRequestsInbox.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const pendingContact = (id) => ({ kind: 'contact', id, state: 'pending' });

beforeEach(() => {
  ctx.conv = { pendingRequests: 0, streamConnected: false };
  ctx.notes = { unread: 0, status: 'ready' };
  listRequests.mockReset();
  listRequests.mockImplementation(async (box) => (box === 'received' ? [pendingContact(1)] : [{ kind: 'visit', id: 2, state: 'accepted' }]));
});

describe('useNow', () => {
  it('ticks on the interval', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T10:00:00Z'));
    const { result } = renderHook(() => useNow(1000));
    const start = result.current;
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current).toBeGreaterThanOrEqual(start + 3000);
  });
});

describe('useRequestsInbox', () => {
  it('loads both boxes on mount', async () => {
    const { result } = renderHook(() => useRequestsInbox());
    expect(result.current.boxes.received.status).toBe('loading');
    await waitFor(() => expect(result.current.boxes.received.status).toBe('ready'));
    await waitFor(() => expect(result.current.boxes.sent.status).toBe('ready'));
    expect(result.current.boxes.received.items).toEqual([pendingContact(1)]);
    expect(result.current.boxes.sent.items).toHaveLength(1);
  });

  it('reports an error state when loading fails', async () => {
    listRequests.mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useRequestsInbox());
    await waitFor(() => expect(result.current.boxes.received.status).toBe('error'));
    expect(result.current.boxes.received.items).toEqual([]);
  });

  it('keeps ready data when a quiet reload fails', async () => {
    const { result } = renderHook(() => useRequestsInbox());
    await waitFor(() => expect(result.current.boxes.received.status).toBe('ready'));
    listRequests.mockRejectedValue(new Error('x'));
    await act(async () => { await result.current.load('received', { quiet: true }); });
    expect(result.current.boxes.received.status).toBe('ready');
    expect(result.current.boxes.received.items).toHaveLength(1);
  });

  it('shows a loading state for a non-quiet reload and keeps the items', async () => {
    const { result } = renderHook(() => useRequestsInbox());
    await waitFor(() => expect(result.current.boxes.received.status).toBe('ready'));
    let release;
    listRequests.mockImplementation(() => new Promise((res) => { release = res; }));
    let pending;
    act(() => { pending = result.current.load('received'); });
    expect(result.current.boxes.received.status).toBe('loading');
    expect(result.current.boxes.received.items).toHaveLength(1);
    await act(async () => { release([]); await pending; });
    expect(result.current.boxes.received).toEqual({ items: [], status: 'ready' });
  });

  it('drops stale responses', async () => {
    const { result } = renderHook(() => useRequestsInbox());
    await waitFor(() => expect(result.current.boxes.received.status).toBe('ready'));
    const releases = [];
    listRequests.mockImplementation(() => new Promise((res) => { releases.push(res); }));
    let first;
    let second;
    act(() => {
      first = result.current.load('received', { quiet: true });
      second = result.current.load('received', { quiet: true });
    });
    await act(async () => { releases[1]([{ kind: 'contact', id: 'new', state: 'pending' }]); await second; });
    await act(async () => { releases[0]([]); await first; });
    expect(result.current.boxes.received.items).toEqual([{ kind: 'contact', id: 'new', state: 'pending' }]);
  });

  it('patches and removes items by request key', async () => {
    const { result } = renderHook(() => useRequestsInbox());
    await waitFor(() => expect(result.current.boxes.received.status).toBe('ready'));
    act(() => result.current.patchItem('received', pendingContact(1), (it) => ({ ...it, state: 'accepted' })));
    expect(result.current.boxes.received.items[0].state).toBe('accepted');
    act(() => result.current.removeItem('received', pendingContact(1)));
    expect(result.current.boxes.received.items).toEqual([]);
  });

  it('polls quietly on an interval but skips hidden documents', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRequestsInbox({ refreshMs: 1000 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.boxes.received.status).toBe('ready');
    const before = listRequests.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(listRequests.mock.calls.length).toBe(before + 2);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(listRequests.mock.calls.length).toBe(before + 2);
    hidden.mockRestore();
  });

  it('polls slower while the live stream is connected', async () => {
    vi.useFakeTimers();
    ctx.conv = { pendingRequests: 0, streamConnected: true };
    renderHook(() => useRequestsInbox({ refreshMs: 1000 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const before = listRequests.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(listRequests.mock.calls.length).toBe(before);
    await act(async () => { await vi.advanceTimersByTimeAsync(250000); });
    expect(listRequests.mock.calls.length).toBe(before + 2);
  });

  it('reloads when the unread notification count rises', async () => {
    const { result, rerender } = renderHook(() => useRequestsInbox());
    await waitFor(() => expect(result.current.boxes.sent.status).toBe('ready'));
    const before = listRequests.mock.calls.length;
    ctx.notes = { unread: 3, status: 'ready' };
    rerender();
    await waitFor(() => expect(listRequests.mock.calls.length).toBe(before + 2));
  });

  it('reloads received when the badge shows more pending requests than the box', async () => {
    const { result, rerender } = renderHook(() => useRequestsInbox());
    await waitFor(() => expect(result.current.boxes.received.status).toBe('ready'));
    const before = listRequests.mock.calls.length;
    ctx.conv = { pendingRequests: 4, streamConnected: false };
    rerender();
    await waitFor(() => expect(listRequests.mock.calls.length).toBe(before + 1));
    expect(listRequests).toHaveBeenLastCalledWith('received');
  });
});
