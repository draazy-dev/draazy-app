import { describe, expect, it } from 'vitest';
import { setupFetch } from '../net.js';
import { toDeal, toEnquiry, toVisit } from '../../../../../src/services/providers/http/enquiryBoardMapper.js';
import * as board from '../../../../../src/services/providers/http/enquiryBoardProvider.js';

describe('enquiryBoardMapper', () => {
  it('returns null for empty dtos', () => {
    expect(toEnquiry(null)).toBeNull();
    expect(toVisit(null)).toBeNull();
    expect(toDeal(null)).toBeNull();
  });

  it('toEnquiry maps fields and defaults', () => {
    expect(toEnquiry({
      id: 'e', propertyId: 'p', propertyTitle: 'T', locality: 'Baner', requesterName: 'N', requesterMobile: 'M', status: 'new', createdAt: 'c',
    })).toEqual({ id: 'e', propertyId: 'p', listing: 'T', locality: 'Baner', customer: 'N', mobile: 'M', status: 'new', at: 'c' });
    expect(toEnquiry({ id: 'e' })).toMatchObject({ propertyId: '', locality: '', mobile: '', status: '', at: null });
  });

  it('toVisit builds a when label from the slot', () => {
    const v = toVisit({ id: 'v', slot: new Date(2026, 4, 10, 15, 30).toISOString(), mode: 'in-person', visitorName: 'V', visitorMobile: 'M' });
    expect(v).toMatchObject({ id: 'v', customer: 'V', mobile: 'M', mode: 'in-person' });
    expect(v.when).toEqual(expect.stringContaining('3:30 PM'));
    expect(toVisit({ id: 'v' })).toMatchObject({ slot: null, when: '', mode: '', customer: '—' });
    expect(toVisit({ id: 'v', slot: 'not a date' }).when).toBe('');
  });

  it('toDeal prefers closedAt over createdAt', () => {
    expect(toDeal({ id: 'd', closedAt: 'x', createdAt: 'y', agreedPrice: 5, counterpartyName: 'C', counterpartyMobile: 'M', deal: 'rent', status: 'closed' }))
      .toMatchObject({ at: 'x', closedAt: 'x', value: 5, customer: 'C', mobile: 'M', deal: 'rent' });
    expect(toDeal({ id: 'd', createdAt: 'y' })).toMatchObject({ at: 'y', closedAt: null, value: 0 });
  });
});

describe('enquiryBoardProvider', () => {
  const net = setupFetch({ signedIn: true });

  it.each([
    ['listEnquiries', '/admin/enquiries'],
    ['listVisits', '/admin/visits'],
    ['listDeals', '/admin/deals'],
  ])('%s sends paging defaults and trimmed filters', async (fn, path) => {
    net.reply({ content: [{ id: '1' }], totalElements: 1, totalPages: 1 });
    const res = await board[fn]({ status: 'new', q: '', days: 7 });
    expect(net.last().path).toBe(path);
    expect(net.last().query).toEqual({ page: '0', size: '10', status: 'new', days: '7' });
    expect(res).toMatchObject({ page: 0, size: 10, total: 1, totalPages: 1 });
    expect(res.items).toHaveLength(1);
  });

  it('forwards deal and explicit page/size', async () => {
    await board.listDeals({ deal: 'buy', page: 2, size: 5 });
    expect(net.last().query).toEqual({ page: '2', size: '5', deal: 'buy' });
  });

  it('getEnquirySummary passes only set filters and returns raw data', async () => {
    net.reply({ total: 3 });
    expect(await board.getEnquirySummary({ days: 30 })).toEqual({ total: 3 });
    expect(net.last()).toMatchObject({ path: '/admin/enquiries/summary', query: { days: '30' } });
    await board.getEnquirySummary();
    expect(net.last().query).toEqual({});
  });

  it('single getters map and encode ids', async () => {
    net.reply({ id: 'e/1', propertyTitle: 'T' });
    expect(await board.getEnquiry('e/1')).toMatchObject({ listing: 'T' });
    expect(net.last().path).toBe('/admin/enquiries/e%2F1');
    net.reply({ id: 'v1' });
    expect(await board.getVisit('v1')).toMatchObject({ id: 'v1' });
    expect(net.last().path).toBe('/admin/visits/v1');
    net.reply({ id: 'd1' });
    expect(await board.getDeal('d1')).toMatchObject({ id: 'd1' });
    expect(net.last().path).toBe('/admin/deals/d1');
  });
});
