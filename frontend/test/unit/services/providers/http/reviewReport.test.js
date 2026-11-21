import { describe, expect, it, vi } from 'vitest';
import { setupFetch, status } from '../net.js';
import * as rm from '../../../../../src/services/providers/http/reviewMapper.js';
import * as rp from '../../../../../src/services/providers/http/reviewProvider.js';
import * as pm from '../../../../../src/services/providers/http/reportMapper.js';
import * as pp from '../../../../../src/services/providers/http/reportProvider.js';

describe('reviewMapper', () => {
  it('toViewModel', () => {
    expect(rm.toViewModel(null)).toBeNull();
    expect(rm.toViewModel({ id: 1 })).toEqual({ id: 1, user: 'User', rating: 0, text: '', categories: {}, recommend: null, context: null, at: '', mine: false });
    expect(rm.toViewModel({ id: 2, author: 'Ann', rating: '4', body: 'ok', categories: { a: 1 }, recommend: false, context: 'tenant', createdAt: '2026-03-04T10:00:00Z', mine: true })).toEqual({
      id: 2, user: 'Ann', rating: 4, text: 'ok', categories: { a: 1 }, recommend: false, context: 'tenant', at: '2026-03-04', mine: true,
    });
    expect(rm.toViewModel({ id: 3, createdAt: 'garbage', mine: 'yes' })).toMatchObject({ at: '', mine: false });
  });

  it('toViewModelPage', () => {
    expect(rm.toViewModelPage(null)).toEqual({ items: [], total: 0, page: 0, size: 0 });
    expect(rm.toViewModelPage({ content: [{ id: 1 }, null], totalElements: 9, page: 2, size: 5 })).toMatchObject({ total: 9, page: 2, size: 5, items: [expect.objectContaining({ id: 1 })] });
    expect(rm.toViewModelPage({ content: [{ id: 1 }], number: 3 }, { size: 7 })).toMatchObject({ total: 1, page: 3, size: 7 });
    expect(rm.toViewModelPage({}, { page: 4 })).toMatchObject({ page: 4 });
  });

  it('toSummaryViewModel', () => {
    expect(rm.toSummaryViewModel()).toEqual({ count: 0, avg: null, dist: [0, 0, 0, 0, 0], catAvg: {} });
    expect(rm.toSummaryViewModel({
      avgRating: '4.2', reviewCount: 5, distribution: { 1: 1, 5: '4', 9: 3 }, categoryAverages: { locality: 4, value: 'x', owner: '3.5' },
    })).toEqual({ count: 5, avg: 4.2, dist: [1, 0, 0, 0, 4], catAvg: { locality: 4, owner: 3.5 } });
    expect(rm.toSummaryViewModel({ categoryAverages: { Safety: 5, locality: 4 } }, 'society').catAvg).toEqual({ Safety: 5 });
    expect(rm.toSummaryViewModel({ reviewCount: 3, avgRating: null })).toMatchObject({ count: 0, avg: null });
    expect(rm.toSummaryViewModel({ reviewCount: 0, avgRating: 4 })).toMatchObject({ count: 0, avg: null });
    expect(rm.toSummaryViewModel({ reviewCount: 2, avgRating: 0 })).toMatchObject({ count: 2, avg: 0 });
  });

  it('moderation view models', () => {
    expect(rm.toModerationViewModel(null)).toBeNull();
    expect(rm.toModerationViewModel({ id: 1 })).toMatchObject({ status: 'pending', authorMobile: '', target: null });
    expect(rm.toModerationViewModel({ id: 1, status: 'approved', authorMobile: '9', targetType: 'society', targetId: 's-1' })).toMatchObject({ status: 'approved', authorMobile: '9', target: 'Society: s-1' });
    expect(rm.toModerationViewModel({ id: 1, targetType: 'property' }).target).toBe('Property');
    expect(rm.toModerationViewModelPage(null)).toEqual({ items: [], total: 0, page: 0, size: 0, counts: null });
    expect(rm.toModerationViewModelPage({ content: [{ id: 1 }], counts: { pending: 2 }, number: 1 }, { size: 4 })).toMatchObject({ total: 1, page: 1, size: 4, counts: { pending: 2 } });
  });

  it('toReviewCreate', () => {
    expect(rm.toReviewCreate()).toEqual({ rating: 0 });
    expect(rm.toReviewCreate({ rating: '4', text: '  nice ', categories: { a: 1 }, recommend: false })).toEqual({ rating: 4, body: 'nice', categories: { a: 1 }, recommend: false });
    expect(rm.toReviewCreate({ rating: 5, text: '   ', categories: {} })).toEqual({ rating: 5 });
  });
});

describe('reviewProvider', () => {
  const net = setupFetch({ signedIn: true });
  const summary = { avgRating: 4, reviewCount: 2, distribution: { 4: 2 } };

  it('property reviews list and summary', async () => {
    net.reply({ content: [{ id: 1, rating: 4 }], summary });
    expect((await rp.listPropertyReviews('p/1')).items).toHaveLength(1);
    expect(net.last().path).toBe('/properties/p%2F1/reviews');
    net.fresh();
    net.reply({ summary });
    expect(await rp.getPropertyReviewSummary('p1')).toMatchObject({ count: 2, avg: 4 });
    net.fresh();
    net.reply({ content: [] });
    await expect(rp.getPropertyReviewSummary('p1')).rejects.toThrow('Review list response carried no summary.');
  });

  it('creating, updating and deleting reviews', async () => {
    net.reply({ id: 1, rating: 5 });
    expect(await rp.createPropertyReview('p/1', { rating: 5, text: 'x' })).toMatchObject({ id: 1, rating: 5 });
    expect(net.last()).toMatchObject({ path: '/properties/p%2F1/reviews', method: 'POST', body: { rating: 5, body: 'x' } });
    await rp.createEntityReview('society', 's/1', { rating: 3 });
    expect(net.last()).toMatchObject({ path: '/reviews/society/s%2F1', method: 'POST', body: { rating: 3 } });
    await rp.updateReview('r/1', { rating: 2 });
    expect(net.last()).toMatchObject({ path: '/reviews/r%2F1', method: 'PUT', body: { rating: 2 } });
    await rp.deleteReview('r/1');
    expect(net.last()).toMatchObject({ path: '/reviews/r%2F1', method: 'DELETE' });
  });

  it('entity reviews paging and truncation warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    net.reply({ content: [{ id: 1 }], totalElements: 5, summary });
    expect((await rp.listEntityReviews('society', 's1')).total).toBe(5);
    expect(net.last()).toMatchObject({ path: '/reviews/society/s1', query: { page: '0', size: '100' } });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('society s1 has 5 reviews but only 1'));
    warn.mockClear();
    net.fresh();
    net.reply({ content: [{ id: 1 }], totalElements: 5 });
    expect((await rp.listEntityReviews('society', 's1', { page: 1, size: 1 })).size).toBe(1);
    expect(warn).not.toHaveBeenCalled();
    net.fresh();
    net.reply({ totalElements: 0 });
    await rp.listEntityReviews('society', 's2');
    expect(warn).not.toHaveBeenCalled();
    net.fresh();
    net.reply({ content: [{ id: 1 }] });
    await rp.listEntityReviews('society', 's3');
    expect(warn).not.toHaveBeenCalled();
  });

  it('entity review summary uses the entity type for categories', async () => {
    net.reply({ summary: { reviewCount: 1, avgRating: 5, categoryAverages: { Safety: 5 } } });
    expect((await rp.getEntityReviewSummary('society', 's1', { size: 10 })).catAvg).toEqual({ Safety: 5 });
    expect(net.last().query).toEqual({ page: '0', size: '10' });
    net.fresh();
    net.reply({ summary });
    await rp.getEntityReviewSummary('property', 'p1');
    expect(net.last().query.size).toBe('100');
  });

  it('moderation', async () => {
    net.reply({ content: [{ id: 1, targetType: 'property', targetId: 'p' }], totalElements: 1, counts: { pending: 1 } });
    expect((await rp.listReviewsForModeration({ status: 'pending', q: 'x', days: 7, page: 1, size: 5, counts: true })).counts).toEqual({ pending: 1 });
    expect(net.last()).toMatchObject({ path: '/admin/reviews', query: { status: 'pending', q: 'x', days: '7', page: '1', size: '5', counts: 'true' } });
    net.fresh();
    net.reply({});
    await rp.listReviewsForModeration();
    expect(net.last().query).toEqual({ page: '0', size: '20' });
    await rp.setReviewStatus('r/1', 'rejected', 'spam');
    expect(net.last()).toMatchObject({ path: '/reviews/r%2F1/status', method: 'PATCH', body: { status: 'rejected', reason: 'spam' } });
    await rp.setReviewStatus('r1', 'approved');
    expect(net.last().body).toEqual({ status: 'approved' });
  });
});

describe('reportMapper', () => {
  it('toTargetType maps known kinds and warns once for unknown ones', () => {
    expect(pm.toTargetType('listing')).toBe('property');
    expect(pm.toTargetType('share')).toBe('post');
    expect(pm.toTargetType('user')).toBe('user');
    expect(pm.toTargetType('review')).toBe('review');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(pm.toTargetType('mystery-kind')).toBe('property');
    expect(pm.toTargetType('mystery-kind')).toBe('property');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('reasonLabel and canTriage', () => {
    expect(pm.reasonLabel('nope', 'property')).toBe('nope');
    expect(pm.reasonLabel('', 'property')).toBe('');
    expect(pm.reasonLabel(undefined)).toBe('');
    const [reason, label] = Object.entries(pm.REASON_LABELS)[0];
    expect(pm.reasonLabel(reason)).toBe(label);
    expect(pm.canTriage({ status: 'open' })).toBe(true);
    expect(pm.canTriage({ status: 'reviewing' })).toBe(true);
    expect(pm.canTriage({ status: 'dismissed' })).toBe(false);
    expect(pm.canTriage(null)).toBe(false);
  });

  it('toViewModel', () => {
    expect(pm.toViewModel(null)).toBeNull();
    expect(pm.toViewModel({ id: 1 })).toEqual({
      id: 1, kind: undefined, targetId: '', targetTitle: '', targetOwner: '', ownerMobile: '', reportedBy: '', reason: '', reasonLabel: '', details: '', status: 'open',
      actionTaken: '', at: 0, handledAt: 0, targetReportCount: 1,
    });
    expect(pm.toViewModel({
      id: 2, targetType: 'property', targetId: 'p', targetTitle: 'T', targetName: 'N', targetMobile: '9', reason: 'spam', details: 'd', status: 'reviewing',
      createdAt: '2026-01-01T00:00:00Z', targetReportCount: '3',
    })).toMatchObject({ kind: 'listing', targetTitle: 'T', targetOwner: 'N', ownerMobile: '9', status: 'reviewing', at: Date.parse('2026-01-01T00:00:00Z'), targetReportCount: 3 });
    expect(pm.toViewModel({ id: 3, targetType: 'post', targetName: 'Nm' })).toMatchObject({ kind: 'share', targetTitle: 'Nm' });
    expect(pm.toViewModel({ id: 4, targetType: 'other', createdAt: 'bad' })).toMatchObject({ kind: 'other', at: 0 });
  });

  it('toViewModelPage', () => {
    expect(pm.toViewModelPage(null)).toEqual({ items: [], total: 0, page: 0, size: 0, counts: null });
    expect(pm.toViewModelPage({ content: [{ id: 1 }, null], totalElements: 4, number: 2, size: 3, counts: { open: 1 } })).toMatchObject({ total: 4, page: 2, size: 3, counts: { open: 1 } });
    expect(pm.toViewModelPage({ content: [{ id: 1 }] }, { page: 1, size: 9 })).toMatchObject({ total: 1, page: 1, size: 9 });
  });

  it('toReportCreate and toReportTriage', () => {
    expect(pm.toReportCreate()).toEqual({ targetType: 'property', targetId: '', reason: '' });
    expect(pm.toReportCreate({ kind: 'user', targetId: 5, reason: 'spam', details: '  more ' })).toEqual({ targetType: 'user', targetId: '5', reason: 'spam', details: 'more' });
    expect(pm.toReportTriage()).toEqual({ status: undefined });
    expect(pm.toReportTriage({ status: 'resolved', note: ' n ', enforcement: 'ban' })).toEqual({ status: 'dismissed', note: 'n', enforcement: 'ban' });
    expect(pm.toReportTriage({ status: 'reviewing', note: '  ' })).toEqual({ status: 'reviewing' });
  });
});

describe('reportProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('createReport returns the report, or "duplicate" on a 409', async () => {
    net.reply({ id: 1, targetType: 'property' });
    expect(await pp.createReport({ kind: 'listing', targetId: 'p', reason: 'spam' })).toMatchObject({ id: 1, kind: 'listing' });
    expect(net.last()).toMatchObject({ path: '/reports', method: 'POST', body: { targetType: 'property', targetId: 'p', reason: 'spam' } });
    net.reply(status(409, {}));
    expect(await pp.createReport({ kind: 'listing', targetId: 'p' })).toBe('duplicate');
    net.reply(status(500, {}));
    await expect(pp.createReport({ kind: 'listing' })).rejects.toMatchObject({ status: 500 });
  });

  it('listReports builds the query from the filters given', async () => {
    net.reply({ content: [{ id: 1 }], totalElements: 1 });
    expect((await pp.listReports({ status: 'open', reason: 'spam', targetType: 'user', q: 'x', sinceDays: 7, page: 1, size: 5, counts: true })).items).toHaveLength(1);
    expect(net.last()).toMatchObject({ path: '/reports', query: { page: '1', size: '5', status: 'open', reason: 'spam', targetType: 'user', q: 'x', sinceDays: '7', counts: 'true' } });
    net.fresh();
    net.reply({});
    await pp.listReports();
    expect(net.last().query).toEqual({ page: '0', size: '10' });
  });

  it('triageReport', async () => {
    net.reply({ id: 1, status: 'dismissed' });
    expect(await pp.triageReport('r/1', { status: 'resolved', note: 'n' })).toMatchObject({ id: 1, status: 'dismissed' });
    expect(net.last()).toMatchObject({ path: '/reports/r%2F1', method: 'PATCH', body: { status: 'dismissed', note: 'n' } });
  });
});
