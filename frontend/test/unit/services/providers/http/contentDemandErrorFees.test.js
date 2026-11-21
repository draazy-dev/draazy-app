import { describe, expect, it } from 'vitest';
import { setupFetch } from '../net.js';
import * as content from '../../../../../src/services/providers/http/contentProvider.js';
import { recordSignal, supplyGap } from '../../../../../src/services/providers/http/demandProvider.js';
import { getEntitlements } from '../../../../../src/services/providers/http/entitlementProvider.js';
import { decideErasureRequest, listErasureRequests } from '../../../../../src/services/providers/http/erasureProvider.js';
import { getErrorLogEntry, listErrorLog, resolveErrorLogEntry } from '../../../../../src/services/providers/http/errorLogProvider.js';
import { listFees } from '../../../../../src/services/providers/http/feesProvider.js';

describe('contentProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listFaqs maps rows with string coercion', async () => {
    net.reply([{ id: 5, question: 'Q', answer: null, translations: { hi: 'x' } }, null]);
    expect(await content.listFaqs()).toEqual([
      { id: '5', question: 'Q', answer: '', category: '', translations: { hi: 'x' } },
      { id: '', question: '', answer: '', category: '', translations: {} },
    ]);
    expect(net.last().path).toBe('/faqs');
    net.fresh();
    net.reply({});
    expect(await content.listFaqs()).toEqual([]);
  });

  it('submitHelpFeedback stores a stable voter id and omits an empty comment', async () => {
    await content.submitHelpFeedback({ slug: 'a', helpful: true });
    const first = net.last().body;
    expect(first).toMatchObject({ slug: 'a', lang: 'en', helpful: true });
    expect(first.voter).toBe(localStorage.getItem('dz_help_voter_v1'));
    expect(first.comment).toBeUndefined();
    await content.submitHelpFeedback({ slug: 'b', helpful: false, comment: 'meh' });
    expect(net.last().body).toMatchObject({ voter: first.voter, comment: 'meh' });
  });

  it('submitHelpFeedback sends no voter when storage is unavailable', async () => {
    const { vi } = await import('vitest');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    await content.submitHelpFeedback({ slug: 'a', helpful: true });
    expect(net.last().body.voter).toBeUndefined();
  });

  it('admin help feedback lists', async () => {
    net.reply({ content: [{ slug: 'a' }], totalElements: 1 });
    expect((await content.listHelpFeedbackArticles({ days: 7 })).items).toEqual([{ slug: 'a' }]);
    expect(net.last()).toMatchObject({ path: '/admin/help-feedback', query: { page: '0', size: '20', days: '7' } });
    await content.listHelpFeedbackComments({ slug: 's', days: 3, page: 1, size: 5 });
    expect(net.last()).toMatchObject({ path: '/admin/help-feedback/comments', query: { page: '1', size: '5', slug: 's', days: '3' } });
    await content.listHelpFeedbackComments();
    expect(net.last().query).toEqual({ page: '0', size: '20' });
  });

  it('staff help content normalises the tree', async () => {
    net.reply({ sections: [1], articles: 'x' });
    expect(await content.staffHelpContent()).toEqual({ sections: [1], categories: [], articles: [] });
    expect(net.last().path).toBe('/admin/help/staff');
    net.reply(null);
    expect(await content.staffHelpIndex()).toEqual({ sections: [], categories: [], articles: [] });
    expect(net.last().path).toBe('/admin/help/staff/index');
  });
});

describe('demandProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('recordSignal trims blanks to undefined and returns true', async () => {
    expect(await recordSignal({ kind: 'search', localitySlug: ' baner ', deal: '', bhk: 2, propertyId: null })).toBe(true);
    expect(net.last()).toMatchObject({ path: '/demand-signals', method: 'POST', body: { kind: 'search', localitySlug: 'baner', bhk: '2' } });
    expect(net.last().body).not.toHaveProperty('deal');
    await recordSignal();
    expect(net.last().body).toEqual({ kind: '' });
  });

  it('supplyGap maps numeric fields', async () => {
    net.reply([{ localitySlug: 'b', supply: '3', demand: 'x', demandPerListing: '1.5' }]);
    expect(await supplyGap({ days: 30 })).toEqual([{
      localitySlug: 'b', localityName: null, supply: 3, searches: 0, alerts: 0, views: 0, repeatSeekers: 0, demand: 0, demandPerListing: 1.5,
    }]);
    expect(net.last()).toMatchObject({ path: '/admin/supply-gap', query: { days: '30' } });
    net.reply({});
    expect(await supplyGap()).toEqual([]);
    expect(net.last().query).toEqual({});
  });
});

describe('entitlementProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('getEntitlements reads /me/entitlements', async () => {
    net.reply({ plan: 'free' });
    expect(await getEntitlements()).toEqual({ plan: 'free' });
    expect(net.last().path).toBe('/me/entitlements');
  });
});

describe('erasureProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listErasureRequests filters', async () => {
    net.reply({ content: [{ id: 1 }], totalElements: 1 });
    expect((await listErasureRequests({ status: 'pending', days: 9 })).items).toEqual([{ id: 1 }]);
    expect(net.last().query).toEqual({ page: '0', size: '20', status: 'pending', days: '9' });
  });

  it('decideErasureRequest trims the note', async () => {
    await decideErasureRequest('a/b', 'approve', '  done ');
    expect(net.last()).toMatchObject({ path: '/admin/erasure-requests/a%2Fb', method: 'PATCH', body: { decision: 'approve', note: 'done' } });
    await decideErasureRequest('a', 'reject', '   ');
    expect(net.last().body).toEqual({ decision: 'reject' });
  });
});

describe('errorLogProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listErrorLog filters and maps rows', async () => {
    net.reply({ content: [{ id: 'e', source: 'web', occurrences: 4 }, {}], totalElements: 2 });
    const res = await listErrorLog({ source: 'web', status: 'open', q: 'x', days: 2 });
    expect(net.last().query).toEqual({ source: 'web', status: 'open', q: 'x', days: '2', page: '0', size: '20' });
    expect(res.items[0]).toMatchObject({ id: 'e', source: 'web', occurrences: 4, firstSeen: null });
    expect(res.items[1]).toMatchObject({ id: '', occurrences: 1 });
  });

  it('getErrorLogEntry adds detail fields', async () => {
    net.reply({ id: 'e/1', stack: 'trace', httpStatus: 500, context: { a: 1 }, level: 'ERROR' });
    expect(await getErrorLogEntry('e/1')).toMatchObject({
      id: 'e/1', stack: 'trace', httpStatus: 500, context: { a: 1 }, level: 'ERROR', httpMethod: null, fingerprint: null,
    });
    expect(net.last().path).toBe('/admin/error-log/e%2F1');
    net.reply({ id: 'x', context: 'str' });
    expect((await getErrorLogEntry('x')).context).toEqual({});
  });

  it('resolveErrorLogEntry posts', async () => {
    expect(await resolveErrorLogEntry('e1')).toBeUndefined();
    expect(net.last()).toMatchObject({ path: '/admin/error-log/e1/resolve', method: 'POST' });
  });
});

describe('feesProvider', () => {
  const net = setupFetch();

  it('listFees maps rows and reads without auth', async () => {
    net.reply([{ deal: 'rent', brokerage: '10', platformFee: 'x', stampDuty: 0, registration: null, notes: '' }]);
    expect(await listFees()).toEqual([{ deal: 'rent', brokerage: 10, platformFee: 0, stampDuty: 0, registration: null, notes: null }]);
    expect(net.last().path).toBe('/fees');
    net.fresh();
    net.reply({});
    expect(await listFees()).toEqual([]);
  });
});
