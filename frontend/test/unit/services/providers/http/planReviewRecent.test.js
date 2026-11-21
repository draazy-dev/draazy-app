import { describe, expect, it } from 'vitest';
import { setupFetch, status } from '../net.js';
import { toPlanCatalogueEntry } from '../../../../../src/services/providers/http/planMapper.js';
import * as plans from '../../../../../src/services/providers/http/planProvider.js';
import { toCaseFile, toReviewBadge } from '../../../../../src/services/providers/http/propertyReviewMapper.js';
import * as review from '../../../../../src/services/providers/http/propertyReviewProvider.js';
import { listRecentSearches, recordRecentSearch } from '../../../../../src/services/providers/http/recentSearchProvider.js';

describe('planMapper', () => {
  it('derives a slug for known kinds only', () => {
    expect(toPlanCatalogueEntry({ id: 1, kind: 'listing-pass', deal: 'buy' })).toMatchObject({ slug: 'listing-pass-buy' });
    expect(toPlanCatalogueEntry({ id: 1, kind: 'contact-pack', deal: 'rent' })).toMatchObject({ slug: 'contact-pack' });
    expect(toPlanCatalogueEntry({ id: 2, kind: 'other' })).toMatchObject({ slug: null, kind: 'other', deal: null, termDays: null, listingLimit: null, contactLimit: null, features: [] });
    expect(toPlanCatalogueEntry({ id: 3 })).toMatchObject({ slug: null, kind: null });
  });

  it('passes the commercial fields through', () => {
    expect(toPlanCatalogueEntry({
      id: 'p', name: 'Pass', kind: 'listing-pass', audience: 'owner', price: 99, billingCycle: 'once', termDays: 30, listingLimit: 1, contactLimit: 5, features: ['a'],
    })).toEqual({
      id: 'p', slug: 'listing-pass', name: 'Pass', kind: 'listing-pass', deal: null, audience: 'owner', price: 99, billingCycle: 'once',
      termDays: 30, listingLimit: 1, contactLimit: 5, features: ['a'],
    });
  });
});

describe('planProvider', () => {
  const net = setupFetch({ signedIn: true });
  const catalogue = { plans: [{ id: 'pl1', kind: 'listing-pass', deal: 'rent' }, { id: 'pl2', kind: 'contact-pack', deal: 'buy' }] };

  it('listPlans maps the bootstrap plans', async () => {
    net.reply(catalogue);
    expect((await plans.listPlans()).map((p) => p.slug)).toEqual(['listing-pass', 'contact-pack-buy']);
    net.fresh();
    net.reply({ plans: 'x' });
    expect(await plans.listPlans()).toEqual([]);
  });

  it('subscribe posts the plan with an idempotency key', async () => {
    net.reply(catalogue).reply({ id: 's1', paymentRef: 'ref', paymentSessionId: 'sess' });
    expect(await plans.subscribe('contact-pack-buy', 'card', { propertyId: 'p9', attemptId: 'a1' }))
      .toEqual({ subscriptionId: 's1', paymentRef: 'ref', paymentSessionId: 'sess' });
    expect(net.last()).toMatchObject({ path: '/me/subscription', method: 'POST', body: { planId: 'pl2', paymentMethod: 'card', propertyId: 'p9' } });
    expect(net.last().headers['Idempotency-Key']).toBe('sub:pl2:p9:a1');
  });

  it('subscribe defaults to upi, omits the property and tolerates an empty response', async () => {
    net.reply(catalogue).reply(null);
    expect(await plans.subscribe('listing-pass', undefined, { attemptId: 'a2' }))
      .toEqual({ subscriptionId: null, paymentRef: null, paymentSessionId: null });
    expect(net.last().body).toEqual({ planId: 'pl1', paymentMethod: 'upi' });
    expect(net.last().headers['Idempotency-Key']).toBe('sub:pl1:-:a2');
  });

  it('subscribe rejects an unknown slug without posting', async () => {
    net.reply(catalogue);
    await expect(plans.subscribe('nope')).rejects.toThrow('No catalogue plan for "nope"');
    expect(net.calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('cancelPending and orderStatus', async () => {
    await plans.cancelPending();
    expect(net.last()).toMatchObject({ path: '/me/subscription/cancel', method: 'POST', body: {} });
    net.reply({ status: 'paid' });
    expect(await plans.orderStatus('o/1')).toBe('paid');
    expect(net.last().path).toBe('/me/subscription/orders/o%2F1');
    net.reply(null);
    expect(await plans.orderStatus('o2')).toBe('pending');
  });
});

describe('propertyReviewMapper', () => {
  it('toCaseFile normalises nested lists', () => {
    expect(toCaseFile(null)).toBeNull();
    expect(toCaseFile({})).toEqual({
      propertyId: '', status: 'pending', propertyStatus: '', reviewer: null, checklist: [], messages: [], notes: null,
      reasonCode: null, reasonNote: null, reraCheck: null, signals: null, decidedAt: null,
    });
    const file = toCaseFile({
      propertyId: 'p',
      status: 'approved',
      checklist: [{ item: 'a', pass: 1 }, null],
      messages: [{ id: 3, from: 'owner', body: 'b', read: 1 }, { from: 'whoever', internal: 1 }],
      signals: { possibleBroker: 1, items: [{ code: 'c', severity: 'hard', detail: 'd' }, { severity: 'x' }] },
    });
    expect(file.checklist).toEqual([{ item: 'a', pass: true }, { item: '', pass: false }]);
    expect(file.messages).toEqual([
      { id: '3', from: 'owner', body: 'b', at: null, read: true, internal: false },
      { id: '', from: 'ops', body: '', at: null, read: false, internal: true },
    ]);
    expect(file.signals).toEqual({
      possibleBroker: true, hardBlock: false, conflict: false,
      items: [{ code: 'c', severity: 'hard', detail: 'd' }, { code: '', severity: 'soft', detail: '' }],
    });
  });

  it('toReviewBadge defaults', () => {
    expect(toReviewBadge(undefined)).toEqual({
      propertyId: '', status: 'pending', unread: 0, updatedAt: null, reasonCode: null, reasonNote: null, lastMessage: '',
    });
    expect(toReviewBadge({ propertyId: 'p', unread: '3', lastMessage: 'm' })).toMatchObject({ propertyId: 'p', unread: 3, lastMessage: 'm' });
  });
});

describe('propertyReviewProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('ownership verification endpoints', async () => {
    net.reply({ state: 'x' });
    expect(await review.getOwnershipVerification('p/1')).toEqual({ state: 'x' });
    expect(net.last().path).toBe('/properties/p%2F1/verification/ownership');
    await review.listOwnershipDocuments('p1');
    expect(net.last().path).toBe('/properties/p1/verification/ownership/documents');
    net.reply({ url: 'u' });
    expect(await review.getOwnershipDocumentUrl('p1', 'd 1')).toBe('u');
    expect(net.last().path).toBe('/properties/p1/verification/ownership/documents/d%201/url');
    net.reply({});
    expect(await review.getOwnershipDocumentUrl('p1', 'd')).toBeNull();
    await review.recordOwnershipEvidence('p1', { docType: 'tax', documentId: 'd', issuedAt: 'a', issuedOn: 'b', subjectName: 'S', ignored: 1 });
    expect(net.last()).toMatchObject({
      path: '/properties/p1/verification/ownership/evidence', method: 'POST',
      body: { docType: 'tax', documentId: 'd', issuedAt: 'a', issuedOn: 'b', subjectName: 'S' },
    });
    await review.verifyOwnership('p1');
    expect(net.last()).toMatchObject({ path: '/properties/p1/verification/ownership', method: 'POST' });
    await review.revokeOwnershipVerification('p1', 'fake');
    expect(net.last()).toMatchObject({ path: '/properties/p1/verification/ownership', method: 'DELETE', query: { reason: 'fake' } });
    await review.requestOwnershipVerification('p1');
    expect(net.last().path).toBe('/properties/p1/verification/ownership/request');
    await review.declineOwnershipVerification('p1', 'no');
    expect(net.last()).toMatchObject({ path: '/properties/p1/verification/ownership/decline', body: { reason: 'no' } });
  });

  it('getPropertyReview maps 404 to null', async () => {
    net.reply({ propertyId: 'p1', status: 'approved' });
    expect(await review.getPropertyReview('p1')).toMatchObject({ propertyId: 'p1', status: 'approved' });
    net.reply(status(404, { message: 'none' }));
    expect(await review.getPropertyReview('p1')).toBeNull();
    net.reply(status(500, { message: 'x' }));
    await expect(review.getPropertyReview('p1')).rejects.toMatchObject({ status: 500 });
  });

  it('start / begin / read', async () => {
    net.reply({ propertyId: 'p1' });
    await review.startPropertyReview('p1');
    expect(net.last()).toMatchObject({ path: '/properties/p1/verification', method: 'POST' });
    expect(net.last().search).toBe('');
    await review.startPropertyReview('p1', { markRead: true });
    expect(net.last().query).toEqual({ markRead: 'true' });
    await review.beginPropertyReview('p1');
    expect(net.last().path).toBe('/properties/p1/verification/start');
    await review.markPropertyReviewRead('p1');
    expect(net.last().path).toBe('/properties/p1/verification/read');
  });

  it('checklist and RERA check', async () => {
    await review.setPropertyReviewChecklistItem('p1', 'photos', 1);
    expect(net.last()).toMatchObject({ path: '/properties/p1/verification/checklist', method: 'PATCH', body: { item: 'photos', pass: true } });
    await review.recordPropertyReraCheck('p/1', 'valid');
    expect(net.last()).toMatchObject({ path: '/properties/p%2F1/rera-check', method: 'POST', body: { result: 'valid' } });
  });

  it.each([
    ['approve', 'approve'], ['Approved', 'approve'], ['reject', 'reject'], ['rejected', 'reject'],
    ['needs_info', 'needs_info'], ['needs-info', 'needs_info'], ['needs more', 'needs_info'],
  ])('decidePropertyReview normalises %s to %s', async (input, verb) => {
    await review.decidePropertyReview('p1', input, 'a note');
    expect(net.last()).toMatchObject({ path: '/properties/p1/verification/decision', body: { decision: verb, note: 'a note' } });
  });

  it('decidePropertyReview accepts an options object', async () => {
    await review.decidePropertyReview('p1', 'reject', { reasonCode: 'photos', note: 'n', expectedStatus: 'pending' });
    expect(net.last().body).toEqual({ decision: 'reject', reasonCode: 'photos', note: 'n', expectedStatus: 'pending' });
  });

  it('decidePropertyReview rejects an unknown decision without a request', async () => {
    const err = await review.decidePropertyReview('p1', 'maybe').catch((e) => e);
    expect(err).toMatchObject({ name: 'ApiError', status: 400, code: 'bad_request' });
    expect(net.calls).toHaveLength(0);
    await expect(review.decidePropertyReview('p1')).rejects.toMatchObject({ status: 400 });
  });

  it('listMyPropertyReviews caps the page size', async () => {
    net.reply({ content: [{ propertyId: 'p', unread: 2 }], totalElements: 1 });
    const res = await review.listMyPropertyReviews({ size: 500 });
    expect(net.last().query).toEqual({ page: '0', size: '100' });
    expect(res.items).toEqual([expect.objectContaining({ propertyId: 'p', unread: 2 })]);
    expect(res.size).toBe(100);
  });
});

describe('recentSearchProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('lists searches, dropping incomplete rows and bad dates', async () => {
    net.reply([
      { label: 'Baner 2BHK', url: '/search?x', at: '2026-01-01T00:00:00Z' },
      { label: 'No date', url: '/b', at: 'garbage' },
      { label: '', url: '/c' },
      null,
    ]);
    expect(await listRecentSearches()).toEqual([
      { label: 'Baner 2BHK', url: '/search?x', at: Date.parse('2026-01-01T00:00:00Z') },
      { label: 'No date', url: '/b', at: null },
    ]);
    net.reply({});
    expect(await listRecentSearches()).toEqual([]);
  });

  it('recordRecentSearch PUTs and returns the refreshed list', async () => {
    net.reply([{ label: 'L', url: '/u' }]);
    expect(await recordRecentSearch({ label: 'L', url: '/u' })).toEqual([{ label: 'L', url: '/u', at: null }]);
    expect(net.last()).toMatchObject({ path: '/me/recent-searches', method: 'PUT', body: { label: 'L', url: '/u' } });
  });
});
