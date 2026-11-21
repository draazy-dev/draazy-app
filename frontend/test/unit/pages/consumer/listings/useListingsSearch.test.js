import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';

vi.mock('../../../../../src/services/propertyService.js', () => ({ searchListings: vi.fn() }));

import { searchListings } from '../../../../../src/services/propertyService.js';
import useListingsSearch from '../../../../../src/pages/consumer/listings/useListingsSearch.js';

const result = (total, extra = {}) => ({ items: Array.from({ length: total }, (_, i) => ({ id: i })), total, ...extra });

afterEach(cleanup);

let n = 0;
const uniq = (label) => ({ q: `${label}-${n += 1}` });

describe('useListingsSearch', () => {
  beforeEach(() => {
    searchListings.mockReset();
  });

  it('stays loading without a query', () => {
    const { result: r } = renderHook(() => useListingsSearch({ query: null }));
    expect(r.current.status).toBe('loading');
    expect(searchListings).not.toHaveBeenCalled();
  });

  it('loads and exposes data', async () => {
    const query = uniq('load');
    searchListings.mockResolvedValue(result(2));
    const { result: r } = renderHook(() => useListingsSearch({ query, page: 2, size: 10 }));
    await waitFor(() => expect(r.current.status).toBe('ready'));
    expect(r.current.data.total).toBe(2);
    expect(r.current.relaxed).toBe(false);
    expect(searchListings).toHaveBeenCalledWith(query, expect.objectContaining({ page: 2, size: 10 }));
  });

  it('falls back to the relaxed query when the primary has no results', async () => {
    const query = uniq('strict');
    const relaxedQuery = uniq('loose');
    searchListings.mockImplementation(async (q) => (q === query ? result(0) : result(3)));
    const { result: r } = renderHook(() => useListingsSearch({ query, relaxedQuery }));
    await waitFor(() => expect(r.current.status).toBe('ready'));
    expect(r.current.relaxed).toBe(true);
    expect(r.current.data.total).toBe(3);
  });

  it('keeps the empty primary result when the relaxed query is empty too', async () => {
    const query = uniq('p');
    const relaxedQuery = uniq('r');
    searchListings.mockResolvedValue(result(0));
    const { result: r } = renderHook(() => useListingsSearch({ query, relaxedQuery }));
    await waitFor(() => expect(r.current.status).toBe('ready'));
    expect(r.current.relaxed).toBe(false);
    expect(r.current.data.total).toBe(0);
  });

  it('reports errors', async () => {
    const query = uniq('err');
    const boom = new Error('boom');
    searchListings.mockRejectedValue(boom);
    const { result: r } = renderHook(() => useListingsSearch({ query }));
    await waitFor(() => expect(r.current.status).toBe('error'));
    expect(r.current.error).toBe(boom);
    expect(r.current.data.items).toEqual([]);
  });

  it('retry bypasses the cache', async () => {
    const query = uniq('retry');
    searchListings.mockResolvedValueOnce(result(1)).mockResolvedValueOnce(result(5));
    const { result: r } = renderHook(() => useListingsSearch({ query }));
    await waitFor(() => expect(r.current.data.total).toBe(1));
    act(() => r.current.retry());
    await waitFor(() => expect(r.current.data.total).toBe(5));
    expect(searchListings).toHaveBeenCalledTimes(2);
  });

  it('serves repeated queries from the cache', async () => {
    const query = uniq('cache');
    searchListings.mockResolvedValue(result(4));
    const first = renderHook(() => useListingsSearch({ query }));
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    first.unmount();
    const second = renderHook(() => useListingsSearch({ query }));
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    expect(searchListings).toHaveBeenCalledTimes(1);
  });
});
