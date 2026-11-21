import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

vi.mock('../../../../../src/services/leadService.js', () => ({
  listLeads: vi.fn(),
  getLead: vi.fn(),
}));

import { getLead, listLeads } from '../../../../../src/services/leadService.js';
import { PAGE_SIZE, useLeadList } from '../../../../../src/pages/admin/leads/useLeadList.js';
import { useLeadDetail } from '../../../../../src/pages/admin/leads/useLeadDetail.js';
import { ApiError } from '../../../../../src/services/http.js';

afterEach(cleanup);

const base = { view: 'mine', q: '', stage: '', type: '', page: 0, enabled: true };

describe('useLeadList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads a page and keeps the last counts', async () => {
    listLeads.mockResolvedValue({ items: [{ id: 1 }], total: 1, counts: { open: 4 } });
    const { result } = renderHook((p) => useLeadList(p), { initialProps: base });
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(listLeads).toHaveBeenCalledWith({ view: 'mine', q: '', stage: '', type: '', page: 0, size: PAGE_SIZE });
    expect(result.current.state.items).toEqual([{ id: 1 }]);
    expect(result.current.counts).toEqual({ open: 4 });
    expect(result.current.reloading).toBe(false);
  });

  it('keeps previous counts when a response has none', async () => {
    listLeads.mockResolvedValueOnce({ items: [], total: 0, counts: { open: 2 } });
    const { result, rerender } = renderHook((p) => useLeadList(p), { initialProps: base });
    await waitFor(() => expect(result.current.counts).toEqual({ open: 2 }));
    listLeads.mockResolvedValueOnce({ items: [], total: 0 });
    rerender({ ...base, q: 'x' });
    await waitFor(() => expect(listLeads).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.reloading).toBe(false));
    expect(result.current.counts).toEqual({ open: 2 });
  });

  it('reports a friendly error', async () => {
    listLeads.mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useLeadList(base));
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    expect(result.current.state.error).toBe('Could not read the leads.');
  });

  it('does nothing while disabled and reload refetches', async () => {
    listLeads.mockResolvedValue({ items: [], total: 0, counts: null });
    const { result, rerender } = renderHook((p) => useLeadList(p), { initialProps: { ...base, enabled: false } });
    expect(listLeads).not.toHaveBeenCalled();
    rerender(base);
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    act(() => result.current.reload());
    await waitFor(() => expect(listLeads).toHaveBeenCalledTimes(2));
  });
});

describe('useLeadDetail', () => {
  const toast = vi.fn();
  const onChanged = vi.fn();
  beforeEach(() => vi.clearAllMocks());

  it('loads the lead', async () => {
    getLead.mockResolvedValue({ id: 5 });
    const { result } = renderHook(() => useLeadDetail(5, { toast, onChanged }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.lead).toEqual({ id: 5 });
  });

  it('shows a friendly error when the first load fails', async () => {
    getLead.mockRejectedValue({ status: 403 });
    const { result } = renderHook(() => useLeadDetail(5, { toast, onChanged }));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/owner/);
    expect(result.current.lead).toBeNull();
  });

  it('act stores the returned lead, toasts and notifies', async () => {
    getLead.mockResolvedValue({ id: 5 });
    const { result } = renderHook(() => useLeadDetail(5, { toast, onChanged }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let ok;
    await act(async () => { ok = await result.current.act(async () => ({ id: 5, stage: 'contacted' }), 'Saved'); });
    expect(ok).toBe(true);
    expect(result.current.lead.stage).toBe('contacted');
    expect(toast).toHaveBeenCalledWith('Saved');
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
  });

  it('act reloads when the action returns nothing', async () => {
    getLead.mockResolvedValueOnce({ id: 5 }).mockResolvedValueOnce({ id: 5, stage: 'lost' });
    const { result } = renderHook(() => useLeadDetail(5, { toast, onChanged }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => { await result.current.act(async () => undefined); });
    expect(getLead).toHaveBeenCalledTimes(2);
    expect(result.current.lead.stage).toBe('lost');
    expect(toast).not.toHaveBeenCalled();
  });

  it('act toasts an error, reloads on stale codes and returns false', async () => {
    getLead.mockResolvedValue({ id: 5 });
    const { result } = renderHook(() => useLeadDetail(5, { toast, onChanged }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let ok;
    await act(async () => {
      ok = await result.current.act(async () => { throw new ApiError({ code: 'lead-closed', status: 409 }); });
    });
    expect(ok).toBe(false);
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/closed/), 'error');
    expect(getLead).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('act does not reload for unrelated errors', async () => {
    getLead.mockResolvedValue({ id: 5 });
    const { result } = renderHook(() => useLeadDetail(5, { toast, onChanged }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => { await result.current.act(async () => { throw new Error('x'); }); });
    expect(getLead).toHaveBeenCalledTimes(1);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('ignores a second act while one is in flight', async () => {
    getLead.mockResolvedValue({ id: 5 });
    const { result } = renderHook(() => useLeadDetail(5, { toast, onChanged }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let release;
    const slow = () => new Promise((r) => { release = r; });
    let first;
    let second;
    await act(async () => {
      first = result.current.act(slow);
      second = await result.current.act(async () => ({ id: 9 }));
    });
    expect(second).toBe(false);
    await act(async () => { release({ id: 5 }); await first; });
  });
});
