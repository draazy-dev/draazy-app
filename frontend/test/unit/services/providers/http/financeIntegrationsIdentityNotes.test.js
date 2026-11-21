import { describe, expect, it } from 'vitest';
import { setupFetch } from '../net.js';
import { getFinanceOverview, getFinanceSeries, listFinanceTransactions } from '../../../../../src/services/providers/http/financeProvider.js';
import { getProviderHealth, listProviderCalls } from '../../../../../src/services/providers/http/integrationsProvider.js';
import { myLeadNotes, saveLeadNote } from '../../../../../src/services/providers/http/leadNoteProvider.js';
import {
  approveIdentityReview, claimIdentityReview, decideIdentityAppeal, getIdentityReview, identityReviewSummary,
  listIdentityReviews, rejectIdentityReview, releaseIdentityReview, revokeIdentityReview, updateKycProfile,
} from '../../../../../src/services/providers/http/identityReviewProvider.js';

describe('financeProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('getFinanceOverview coerces numbers and defaults on an empty payload', async () => {
    net.reply(null);
    expect(await getFinanceOverview()).toEqual({
      mrr: 0,
      plans: [],
      month: { collected: 0, refunded: 0, passThrough: 0, net: 0, payments: 0 },
      attention: {
        refundRequests: 0, refundRequestAmount: 0, serviceRefunds: 0, serviceRefundAmount: 0, openDisputes: 0, openDisputeAmount: 0,
      },
    });
  });

  it('getFinanceOverview maps plans, rounding and clamping counts', async () => {
    net.reply({
      mrr: '1500.5',
      plans: [{ name: 'Pro', audience: 'owner', billingCycle: 'monthly', price: '99', active: '3.6', monthlyValue: 'x' }],
      month: { collected: 10, payments: -4 },
      attention: { openDisputes: 2.4, openDisputeAmount: '7' },
    });
    const res = await getFinanceOverview();
    expect(net.last().path).toBe('/admin/finance');
    expect(res.mrr).toBe(1500.5);
    expect(res.plans[0]).toEqual({ name: 'Pro', audience: 'owner', billingCycle: 'monthly', termDays: null, price: 99, active: 4, monthlyValue: 0 });
    expect(res.month).toMatchObject({ collected: 10, payments: 0 });
    expect(res.attention).toMatchObject({ openDisputes: 2, openDisputeAmount: 7 });
  });

  it('getFinanceSeries defaults to 12 months', async () => {
    net.reply([{ month: '2026-01', subscriptions: '5', services: 'z', refunds: 1 }]);
    expect(await getFinanceSeries()).toEqual([{ month: '2026-01', subscriptions: 5, services: 0, refunds: 1 }]);
    expect(net.last()).toMatchObject({ path: '/admin/finance/series', query: { months: '12' } });
    net.reply({ nope: 1 });
    expect(await getFinanceSeries(6)).toEqual([]);
    expect(net.last().query.months).toBe('6');
  });

  it('listFinanceTransactions trims q and maps rows', async () => {
    net.reply({ content: [{ id: 't', date: 'd', number: 'n', party: 'p', kind: 'sub', amount: '10', fee: 'x' }], totalElements: 1 });
    const res = await listFinanceTransactions({ kind: 'sub', days: 7, q: '  inv ' });
    expect(net.last().query).toEqual({ page: '0', size: '20', kind: 'sub', days: '7', q: 'inv' });
    expect(res.items).toEqual([{ id: 't', date: 'd', number: 'n', party: 'p', kind: 'sub', amount: 10, fee: 0 }]);
    await listFinanceTransactions({ q: '   ' });
    expect(net.last().query).toEqual({ page: '0', size: '20' });
  });
});

describe('integrationsProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('getProviderHealth maps rows and tolerates a non-array', async () => {
    net.reply([{ provider: 'sms', live: true, ok24h: '4', failed24h: 'x', lastOkAt: 't' }]);
    expect(await getProviderHealth()).toEqual([{
      provider: 'sms', live: true, ok24h: 4, failed24h: 0, skipped24h: 0, ok7d: 0, failed7d: 0, lastOkAt: 't', lastFailureAt: null, lastFailureDetail: null,
    }]);
    net.reply({});
    expect(await getProviderHealth()).toEqual([]);
  });

  it('listProviderCalls passes filters and trims q', async () => {
    net.reply({ content: [{ id: 1 }], totalElements: 1 });
    const res = await listProviderCalls({ provider: 'sms', outcome: 'failed', days: 1, q: ' x ' });
    expect(net.last()).toMatchObject({ path: '/admin/integrations/calls', query: { page: '0', size: '20', provider: 'sms', outcome: 'failed', days: '1', q: 'x' } });
    expect(res.items).toEqual([{ id: 1 }]);
  });
});

describe('leadNoteProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('myLeadNotes falls back to []', async () => {
    net.reply(null);
    expect(await myLeadNotes()).toEqual([]);
    net.reply([{ leadKey: 'a' }]);
    expect(await myLeadNotes()).toEqual([{ leadKey: 'a' }]);
  });

  it('saveLeadNote PUTs the note and normalises follow-up instants', async () => {
    await saveLeadNote('a/b', { note: 'n', followUpAt: Date.UTC(2026, 0, 1) });
    expect(net.last()).toMatchObject({ path: '/me/lead-notes/a%2Fb', method: 'PUT', body: { note: 'n', followUpAt: '2026-01-01T00:00:00.000Z' } });
    await saveLeadNote('k', { followUpAt: '2026-02-02T00:00:00Z' });
    expect(net.last().body).toEqual({ note: null, followUpAt: '2026-02-02T00:00:00Z' });
    await saveLeadNote('k');
    expect(net.last().body).toEqual({ note: null, followUpAt: null });
    await saveLeadNote('k', { followUpAt: '' });
    expect(net.last().body.followUpAt).toBeNull();
  });
});

describe('identityReviewProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listIdentityReviews defaults to pending and normalises rows', async () => {
    net.reply({
      content: [{
        id: 'r1', livenessChallenge: 'left', livenessSource: 'weird', numberOverridden: 1, submittedAt: '2026-01-01T00:00:00Z', decidedAt: 'bad',
      }],
      totalElements: 1,
    });
    const res = await listIdentityReviews({ q: 'x' });
    expect(net.last().query).toEqual({ status: 'pending', page: '0', size: '10', q: 'x' });
    expect(res.items[0]).toMatchObject({
      id: 'r1', livenessChallenge: 'left', livenessSource: null, numberOverridden: true,
      submittedAt: Date.parse('2026-01-01T00:00:00Z'), decidedAt: null, filesPurgedAt: null, revokedAt: null,
    });
  });

  it('summary and single review', async () => {
    net.reply({ pending: 2 });
    expect(await identityReviewSummary()).toEqual({ pending: 2 });
    net.reply({ id: 'r/1', livenessChallenge: 'nope', livenessSource: 'client' });
    expect(await getIdentityReview('r/1')).toMatchObject({ livenessChallenge: null, livenessSource: 'client' });
    expect(net.last().path).toBe('/moderation/identity-reviews/r%2F1');
  });

  it('claim / release', async () => {
    net.reply({ claimedByName: 'Ops', claimedByMe: 1 });
    expect(await claimIdentityReview('r1')).toEqual({ claimedByName: 'Ops', claimedByMe: true });
    expect(net.last()).toMatchObject({ path: '/moderation/identity-reviews/r1/claim', method: 'POST' });
    net.reply(null);
    expect(await claimIdentityReview('r1')).toEqual({ claimedByName: null, claimedByMe: false });
    await releaseIdentityReview('r1');
    expect(net.last()).toMatchObject({ path: '/moderation/identity-reviews/r1/claim', method: 'DELETE' });
    expect(net.last().search).toBe('');
    await releaseIdentityReview('r1', { force: true });
    expect(net.last().query).toEqual({ force: 'true' });
  });

  it('approve sends dob, or birthYear when yearOnly', async () => {
    await approveIdentityReview('r1', { number: 'N', name: 'A', dob: '1990-01-01', gender: 'F', poseConfirmed: 1 });
    expect(net.last().body).toEqual({ number: 'N', name: 'A', poseConfirmed: true, numberOverride: false, gender: 'F', dob: '1990-01-01' });
    await approveIdentityReview('r1', { number: 'N', name: 'A', yearOnly: true, birthYear: '1985', dob: 'ignored' });
    expect(net.last().body).toEqual({ number: 'N', name: 'A', poseConfirmed: false, numberOverride: false, birthYear: 1985 });
    expect(net.last().path).toBe('/moderation/identity-reviews/r1/approve');
  });

  it('reject, revoke and appeal decisions', async () => {
    await rejectIdentityReview('r1', { reason: 'blur' });
    expect(net.last()).toMatchObject({ path: '/moderation/identity-reviews/r1/reject', body: { reason: 'blur' } });
    await revokeIdentityReview('r1', 'fraud');
    expect(net.last()).toMatchObject({ path: '/moderation/identity-reviews/r1/revoke', body: { reason: 'fraud' } });
    net.reply(null).reply({ id: 'r1' });
    expect(await decideIdentityAppeal('r1', 'reopen')).toMatchObject({ id: 'r1' });
    expect(net.calls.at(-2).path).toBe('/moderation/identity-reviews/r1/appeal/reopen');
    net.reply(null).reply({ id: 'r1' });
    await decideIdentityAppeal('r1', 'anything');
    expect(net.calls.at(-2).path).toBe('/moderation/identity-reviews/r1/appeal/uphold');
  });

  it('updateKycProfile omits blanks', async () => {
    await updateKycProfile('u/1', { name: 'N', email: '' });
    expect(net.last()).toMatchObject({ path: '/users/u%2F1/kyc-profile', method: 'PATCH', body: { name: 'N' } });
    expect(net.last().body.email).toBeUndefined();
  });
});
