import { describe, expect, it } from 'vitest';
import { setupFetch } from '../net.js';
import { slotFromParts, slotFromWhen, whenFromSlot } from '../../../../../src/lib/visitWhen.js';
import * as team from '../../../../../src/services/providers/http/teamProvider.js';
import * as tm from '../../../../../src/services/providers/http/ticketMapper.js';
import * as tp from '../../../../../src/services/providers/http/ticketProvider.js';
import * as vm from '../../../../../src/services/providers/http/verificationMapper.js';
import * as vp from '../../../../../src/services/providers/http/verificationProvider.js';
import * as ss from '../../../../../src/services/providers/http/savedSearchProvider.js';
import * as visit from '../../../../../src/services/providers/http/visitProvider.js';
import * as users from '../../../../../src/services/providers/http/usersProvider.js';
import * as staff from '../../../../../src/services/providers/http/staffActivityProvider.js';
import * as rfm from '../../../../../src/services/providers/http/refundMapper.js';
import * as rfp from '../../../../../src/services/providers/http/refundProvider.js';
import * as inbox from '../../../../../src/services/providers/http/requestInboxProvider.js';
import * as saved from '../../../../../src/services/providers/http/savedProvider.js';

describe('teamProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listTeamMembers maps the wire user', async () => {
    net.reply([
      { id: 1, name: 'A', mobile: '9', email: 'a@x', role: 'staff', functions: ['f'], status: 'active', createdAt: 'c1' },
      { id: 2, status: 'active', archived: true, joinedAt: 'j2' },
      { id: 3, status: 'suspended' },
      {},
    ]);
    const rows = await team.listTeamMembers();
    expect(net.last().path).toBe('/admin/team');
    expect(rows[0]).toEqual({ id: 1, name: 'A', mobile: '9', email: 'a@x', role: 'staff', roleId: null, moduleAccess: [], functions: ['f'], status: 'active', archived: false, createdAt: 'c1' });
    expect(rows[1]).toMatchObject({ status: 'suspended', archived: true, createdAt: 'j2', functions: [] });
    expect(rows[2].status).toBe('suspended');
    expect(rows[3]).toMatchObject({ name: '', createdAt: null });
  });

  it('listAssignees', async () => {
    net.reply([{ id: 1, name: 'A', desks: ['sales'] }, { id: 2, desks: 'x' }]);
    expect(await team.listAssignees()).toEqual([{ id: 1, name: 'A', desks: ['sales'] }, { id: 2, name: '', desks: [] }]);
    expect(net.last().path).toBe('/admin/team/assignees');
  });

  it('saveTeamMember creates staff and managers only', async () => {
    await expect(team.saveTeamMember({ role: 'admin' })).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    await expect(team.saveTeamMember()).rejects.toMatchObject({ status: 403 });
    net.reply({ user: { id: 9, name: 'N', role: 'staff', status: 'active' }, inviteUrl: 'http://i' });
    const res = await team.saveTeamMember({ name: 'N', mobile: '9', email: 'e', role: 'staff', functions: ['f'] });
    expect(net.last()).toMatchObject({ path: '/users/staff', method: 'POST', body: { name: 'N', mobile: '9', email: 'e', role: 'staff', functions: ['f'] } });
    expect(res).toMatchObject({ inviteUrl: 'http://i', member: { id: 9, functions: ['f'] } });
    net.reply({ user: { id: 10, role: 'manager' } });
    const mgr = await team.saveTeamMember({ name: 'M', role: 'manager', functions: ['x'] });
    expect(net.last().body.functions).toEqual([]);
    expect(mgr.member.functions).toEqual(['x']);
    net.reply({ user: { id: 11, role: 'staff' } });
    expect((await team.saveTeamMember({ role: 'staff' })).member.functions).toEqual([]);
    expect(net.last().body.functions).toEqual([]);
  });

  it('saveTeamMember edits an existing member but refuses a role change', async () => {
    net.reply({ id: 'u/1', name: 'N', role: 'staff', status: 'active' });
    expect(await team.saveTeamMember({ id: 'u/1', name: 'N', email: 'e', role: 'staff' }, { role: 'staff' })).toMatchObject({ id: 'u/1', status: 'active' });
    expect(net.last()).toMatchObject({ path: '/users/u%2F1', method: 'PATCH', body: { name: 'N', email: 'e' } });
    net.reply({ id: 1 });
    await team.saveTeamMember({ id: 1, name: 'N' });
    expect(net.calls).toHaveLength(2);
    await expect(team.saveTeamMember({ id: 1, role: 'manager' }, { role: 'staff' })).rejects.toMatchObject({ status: 409, code: 'role_change_unsupported' });
    expect(net.calls).toHaveLength(2);
  });

  it('status changes and account recovery', async () => {
    await team.setTeamMemberStatus({ id: 'u/1' }, 'suspended');
    expect(net.last()).toMatchObject({ path: '/users/u%2F1/suspend', method: 'PATCH', body: { reason: 'Suspended from the admin console' } });
    await team.setTeamMemberStatus({ id: 1, archived: true }, 'active');
    expect(net.last()).toMatchObject({ path: '/users/1/restore', method: 'PATCH' });
    await team.setTeamMemberStatus({ id: 1 }, 'active');
    expect(net.last().path).toBe('/users/1/reactivate');
    await team.resetTeamMemberTwoFactor('u/1');
    expect(net.last()).toMatchObject({ path: '/users/u%2F1/reset-2fa', method: 'POST' });
    await team.reissueTeamMemberInvite('u/1');
    expect(net.last()).toMatchObject({ path: '/users/u%2F1/reissue-invite', method: 'POST' });
  });
});

describe('ticketMapper', () => {
  it('toWireStatus and toNote', () => {
    expect(tm.toWireStatus('in_progress')).toBe('in-progress');
    expect(tm.toWireStatus('open')).toBe('open');
    expect(tm.toWireStatus('')).toBeUndefined();
    expect(tm.toNote(null)).toBeNull();
    expect(tm.toNote({})).toEqual({ by: 'Ops', text: '', at: null });
    expect(tm.toNote({ by: 'A', text: 't', at: 'x' })).toEqual({ by: 'A', text: 't', at: 'x' });
  });

  it('toViewModel', () => {
    expect(tm.toViewModel(null)).toBeNull();
    expect(tm.toViewModel({ id: 1 })).toEqual({
      id: 1, subject: '', desk: null, priority: 'medium', status: 'open', propertyId: null, assignedTo: null, service: null, customer: '', mobile: '', value: null,
      quotedValue: null, detail: '', notes: [], createdAt: 0,
    });
    expect(tm.toViewModel({
      id: 2, subject: 's', team: 'sales', priority: 'high', status: 'closed', propertyId: 'p', assignee: 'a', service: 'svc', customer: 'c', mobile: '9', value: 0, quotedValue: 5,
      detail: 'd', notes: [{ text: 'n' }, null], createdAt: '2026-01-01T00:00:00Z',
    })).toMatchObject({ desk: 'sales', priority: 'high', assignedTo: 'a', value: 0, quotedValue: 5, notes: [{ by: 'Ops', text: 'n', at: null }], createdAt: Date.parse('2026-01-01T00:00:00Z') });
    expect(tm.toViewModel({ id: 3, createdAt: 'bad', notes: 'x' })).toMatchObject({ createdAt: 0, notes: [] });
  });

  it('toViewModelPage, toClaim and toCreate', () => {
    expect(tm.toViewModelPage(null)).toEqual({ items: [], total: 0, page: 0, size: 0 });
    expect(tm.toViewModelPage({ content: [{ id: 1 }, null], totalElements: 5, page: 1, size: 2 })).toMatchObject({ total: 5, page: 1, size: 2 });
    expect(tm.toViewModelPage({ content: [{ id: 1 }] }, { page: 3, size: 8 })).toMatchObject({ total: 1, page: 3, size: 8 });
    expect(tm.toClaim(5)).toEqual({ assigneeId: '5' });
    expect(tm.toClaim()).toEqual({ assigneeId: '' });
    expect(tm.toCreate()).toEqual({ subject: '' });
    expect(tm.toCreate({ subject: ' s ', desk: 'sales', priority: 'high', propertyId: 'p', body: ' b ', quotedValue: '1500' })).toEqual({
      subject: 's', team: 'sales', priority: 'high', propertyId: 'p', body: 'b', quotedValue: 1500,
    });
    for (const bad of [null, undefined, '', 'abc', Infinity]) expect(tm.toCreate({ quotedValue: bad })).toEqual({ subject: '' });
    expect(tm.toCreate({ quotedValue: 0 })).toEqual({ subject: '', quotedValue: 0 });
  });
});

describe('ticketProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listTicketQueue', async () => {
    net.reply({ content: [{ id: 1 }], totalElements: 1 });
    expect((await tp.listTicketQueue({ status: 'in_progress', team: 'sales', priority: 'high', q: 'x', days: 7, page: 1, size: 5 })).items).toHaveLength(1);
    expect(net.last()).toMatchObject({ path: '/tickets', query: { page: '1', size: '5', status: 'in-progress', team: 'sales', priority: 'high', q: 'x', days: '7' } });
    net.fresh();
    net.reply({});
    await tp.listTicketQueue();
    expect(net.last().query).toEqual({ page: '0', size: '20' });
  });

  it('summary, get, claim, status, note, create', async () => {
    net.reply({ open: 3 });
    expect(await tp.getTicketSummary('sales')).toEqual({ open: 3 });
    expect(net.last().query).toEqual({ team: 'sales' });
    net.fresh();
    await tp.getTicketSummary();
    expect(net.last().search).toBe('');
    net.reply({ id: 'a' });
    expect((await tp.getTicket('t/1')).id).toBe('a');
    expect(net.last().path).toBe('/tickets/t%2F1');
    await tp.claimTicket('t1', 7);
    expect(net.last()).toMatchObject({ path: '/tickets/t1', method: 'PATCH', body: { assigneeId: '7' } });
    await tp.setTicketStatus('t1', 'in_progress');
    expect(net.last().body).toEqual({ status: 'in-progress' });
    net.reply({ by: 'me', text: 'hi' });
    expect(await tp.addTicketNote('t/1', '  hi ')).toEqual({ by: 'me', text: 'hi', at: null });
    expect(net.last()).toMatchObject({ path: '/tickets/t%2F1/notes', method: 'POST', body: { body: 'hi' } });
    await tp.addTicketNote('t1');
    expect(net.last().body).toEqual({ body: '' });
    net.reply({ id: 'n' });
    expect((await tp.createTicket({ subject: 'S' })).id).toBe('n');
    expect(net.last()).toMatchObject({ path: '/tickets', method: 'POST', body: { subject: 'S' } });
  });

  it('joinServiceWaitlist forwards the Turnstile token only when present', async () => {
    await tp.joinServiceWaitlist({ service: 's', name: 'N', mobile: '9', turnstileToken: 'tok' });
    expect(net.last()).toMatchObject({ path: '/service-waitlist', method: 'POST', body: { service: 's', name: 'N', mobile: '9' } });
    expect(net.last().headers['CF-Turnstile-Response']).toBe('tok');
    await tp.joinServiceWaitlist({ service: 's', mobile: '9' });
    expect(net.last().body).toEqual({ service: 's', mobile: '9' });
    expect(net.last().headers['CF-Turnstile-Response']).toBeUndefined();
  });
});

describe('verificationMapper', () => {
  it('toVerificationViewModel falls back to the none state', () => {
    expect(vm.toVerificationViewModel(null)).toEqual(vm.NONE_VERIFICATION);
    expect(vm.toVerificationViewModel('x')).toEqual(vm.NONE_VERIFICATION);
    expect(vm.toVerificationViewModel(null)).not.toBe(vm.NONE_VERIFICATION);
    expect(vm.toVerificationViewModel({})).toMatchObject({ status: 'none', verified: false, attemptsRemaining: null, canRetry: false, appeal: null, canAppeal: false });
  });

  it('toVerificationViewModel maps a verified record', () => {
    const res = vm.toVerificationViewModel({
      status: 'verified', docType: 'aadhaar', docLast4: '1234', submittedAt: '2026-01-01T00:00:00Z', decidedAt: '2026-01-02T00:00:00Z', name: 'Ann', source: 'digilocker',
      maskedAadhaar: 'XXXX', mobileMatch: true, attemptsRemaining: 2, retryAfter: 'bad', canAppeal: 1,
    });
    expect(res).toMatchObject({
      verified: true, docType: 'aadhaar', maskedDocument: '1234', submittedAt: Date.parse('2026-01-01T00:00:00Z'), decidedAt: Date.parse('2026-01-02T00:00:00Z'),
      verifiedAt: Date.parse('2026-01-02T00:00:00Z'), verifiedName: 'Ann', source: 'digilocker', maskedAadhaar: 'XXXX', mobileMatch: true, attemptsRemaining: 2,
      retryAfter: null, canRetry: false, canAppeal: true, aadhaarMobile: '',
    });
    expect(vm.toVerificationViewModel({ verifiedName: 'V', name: 'N' }).verifiedName).toBe('V');
  });

  it('canRetry derives from status and attempts unless supplied', () => {
    expect(vm.toVerificationViewModel({ status: 'rejected', attemptsRemaining: 1 }).canRetry).toBe(true);
    expect(vm.toVerificationViewModel({ status: 'rejected', attemptsRemaining: 0 }).canRetry).toBe(false);
    expect(vm.toVerificationViewModel({ status: 'rejected' }).canRetry).toBe(true);
    expect(vm.toVerificationViewModel({ status: 'rejected', attemptsRemaining: 0, canRetry: true }).canRetry).toBe(true);
    expect(vm.toVerificationViewModel({ status: 'pending', canRetry: false }).canRetry).toBe(false);
  });

  it('maps appeals and revocations', () => {
    const res = vm.toVerificationViewModel({
      status: 'revoked', revokedAt: '2026-02-01T00:00:00Z', revocationReason: 'fraud', rejectionReason: 'r', rejectionNote: 'n',
      appeal: { note: 'x', openedAt: '2026-02-02T00:00:00Z', decidedAt: null },
    });
    expect(res).toMatchObject({ revokedAt: Date.parse('2026-02-01T00:00:00Z'), revocationReason: 'fraud', rejectionReason: 'r', rejectionNote: 'n' });
    expect(res.appeal).toEqual({ note: 'x', openedAt: Date.parse('2026-02-02T00:00:00Z'), decidedAt: null });
  });

  it('toSubmissionPayload', () => {
    const file = new File(['x'], 'f.jpg');
    const form = vm.toSubmissionPayload({ docType: 'aadhaar', consent: 1, captures: { front: file, back: file, selfie: file }, liveness: 'passed', challenge: 'c' });
    expect(Object.fromEntries([...form.entries()].filter(([k]) => !['front', 'back', 'selfie'].includes(k)))).toEqual({
      docType: 'aadhaar', consent: 'true', consentLanguage: 'en', liveness: 'passed', challenge: 'c',
    });
    expect(form.get('front')).toBeInstanceOf(File);
    expect(form.has('back')).toBe(true);
    expect(form.has('selfie')).toBe(true);
    const bare = vm.toSubmissionPayload({ docType: 'pan', liveness: 'failed' });
    expect([...bare.keys()].sort()).toEqual(['consent', 'consentLanguage', 'docType']);
    expect(bare.get('consent')).toBe('false');
    expect(vm.toSubmissionPayload({ docType: 'pan', liveness: 'bypassed' }).get('liveness')).toBe('bypassed');
    expect(vm.toSubmissionPayload({ docType: 'pan', liveness: 'unavailable' }).get('liveness')).toBe('unavailable');
  });

  it('toSubmissionResult flags pending submissions', () => {
    expect(vm.toSubmissionResult({ status: 'pending' })).toMatchObject({ pending: true, status: 'pending' });
    expect(vm.toSubmissionResult({ status: 'verified' }).pending).toBe(false);
    expect(vm.toSubmissionResult(null)).toMatchObject({ pending: false, status: 'none' });
  });
});

describe('verificationProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('getAadhaarStatus', async () => {
    net.reply({ status: 'verified' });
    expect((await vp.getAadhaarStatus()).verified).toBe(true);
    expect(net.last().path).toBe('/me/verification/identity');
  });

  it('challenge, dispute, appeal and withdraw', async () => {
    net.reply({ challenge: 'c' });
    expect(await vp.getIdentityChallenge()).toEqual({ challenge: 'c' });
    expect(net.last()).toMatchObject({ path: '/me/verification/identity/challenge', method: 'POST' });
    await vp.disputeIdentityVerification({ note: 'n' });
    expect(net.last()).toMatchObject({ path: '/me/verification/identity/dispute', body: { note: 'n' } });
    await vp.disputeIdentityVerification({ note: '' });
    expect(net.last().body).toEqual({});
    await vp.appealIdentityVerification({ note: 'please' });
    expect(net.last()).toMatchObject({ path: '/me/verification/identity/appeal', body: { note: 'please' } });
    expect(await vp.withdrawIdentityVerification()).toEqual(vm.NONE_VERIFICATION);
    expect(net.last()).toMatchObject({ path: '/me/verification/identity', method: 'DELETE' });
  });

  it('submitIdentityVerification posts the multipart form', async () => {
    net.reply({ status: 'pending' });
    const file = new File(['x'], 'f.jpg');
    expect(await vp.submitIdentityVerification({ docType: 'aadhaar', consent: true, captures: { front: file } })).toMatchObject({ pending: true });
    expect(net.last()).toMatchObject({ path: '/me/verification/identity', method: 'POST' });
    expect(net.last().init.body.get('docType')).toBe('aadhaar');
    expect(net.last().init.body.get('front')).toBeInstanceOf(File);
  });
});

describe('verificationProvider signed out', () => {
  const net = setupFetch();
  it('returns the none state without calling the API', async () => {
    expect(await vp.getAadhaarStatus()).toEqual(vm.NONE_VERIFICATION);
    expect(net.calls).toHaveLength(0);
  });
});

describe('savedSearchProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listSavedSearches maps rows', async () => {
    net.reply([
      { id: 1, kind: 'flatmates', name: 'N', query: 'q', criteria: { a: 1 }, label: 'L', alertFrequency: 'off', channel: 'email', newCount: 2, matchCount: 3, createdAt: '2026-01-01T00:00:00Z', filters: { bhk: '2' } },
      { id: 2 },
    ]);
    const [a, b] = await ss.listSavedSearches();
    expect(net.last().path).toBe('/me/saved-searches');
    expect(a).toEqual({ bhk: '2', id: 1, kind: 'flatmates', name: 'N', query: 'q', criteria: { a: 1 }, label: 'L', alertFrequency: 'off', alerts: false, channel: 'email', newCount: 2, matchCount: 3, at: Date.parse('2026-01-01T00:00:00Z') });
    expect(b).toMatchObject({ kind: 'listings', name: undefined, query: '', label: '', alertFrequency: 'daily', alerts: true, channel: 'whatsapp', newCount: undefined, matchCount: 0 });
    expect(typeof b.at).toBe('number');
    expect(await (async () => { net.fresh(); net.reply({}); return ss.listSavedSearches(); })()).toEqual([]);
    net.fresh();
    net.reply([{ id: 3, name: 'Only name', filters: 'bad' }]);
    expect((await ss.listSavedSearches())[0].label).toBe('Only name');
  });

  it('createSavedSearch sends non-top-level keys as filters', async () => {
    net.on(() => ({ id: 1 }));
    await ss.createSavedSearch({ label: 'Baner 2BHK', bhk: '2', city: undefined, alerts: false, at: 1 });
    expect(net.last()).toMatchObject({ path: '/me/saved-searches', method: 'POST', body: { kind: 'listings', name: 'Baner 2BHK', query: 'Baner 2BHK', filters: { bhk: '2' }, alertFrequency: 'off', channel: 'whatsapp' } });
    await ss.createSavedSearch({ kind: 'flatmates', name: 'F', gender: 'f', alertFrequency: 'weekly', channel: 'email' });
    expect(net.last().body).toEqual({ kind: 'flatmates', name: 'F', filters: { gender: 'f' }, criteria: { gender: 'f' }, alertFrequency: 'weekly', channel: 'email' });
    await ss.createSavedSearch({ query: 'q', criteria: { z: 1 } });
    expect(net.last().body).toMatchObject({ query: 'q', criteria: { z: 1 }, alertFrequency: 'daily' });
    await ss.createSavedSearch();
    expect(net.last().body).toMatchObject({ kind: 'listings', query: '', filters: {} });
  });

  it('createSavedSearch rejects anonymous lead capture', async () => {
    const before = net.calls.length;
    await expect(ss.createSavedSearch({ mobile: '9' })).rejects.toThrow('Anonymous lead capture is not supported');
    expect(net.calls).toHaveLength(before);
  });

  it('update, edit and delete', async () => {
    net.on(() => ({ id: 1 }));
    await ss.updateSavedSearch('s/1', { name: 'N' });
    expect(net.last()).toMatchObject({ path: '/me/saved-searches/s%2F1', method: 'PATCH', body: { name: 'N' } });
    await ss.updateSavedSearch('s1');
    expect(net.last().body).toEqual({});
    await ss.editSavedSearch('s1', { name: 'N', query: 'q', bhk: '3', alerts: false });
    expect(net.last().body).toEqual({ name: 'N', query: 'q', filters: { bhk: '3' }, alertFrequency: 'off' });
    await ss.editSavedSearch('s1');
    expect(net.last().body).toMatchObject({ query: '' });
    await ss.deleteSavedSearch('s/1');
    expect(net.last()).toMatchObject({ path: '/me/saved-searches/s%2F1', method: 'DELETE' });
  });
});

describe('visitProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listVisits maps rows and scopes the query', async () => {
    net.reply({ content: [
      { id: 1, propertyId: 'p', propertySlug: 's', propertyTitle: 'T', slot: '2026-05-01T10:00', mode: 'video', status: 'confirmed', visitor: { id: 'v', name: 'V', mobile: '9' }, note: 'n', owner: { id: 'o' }, createdAt: '2026-01-01T00:00:00Z' },
      { id: 2, listing: 'L', host: { id: 'h' } },
      { id: 3, parties: [{ id: 'x', role: 'tenant' }, { id: 'own', role: 'Property_Owner' }] },
      { id: 4, parties: [{ id: 'q' }] },
    ], totalElements: 4 });
    const rows = await visit.listVisits({ propertyId: 'p', maxAge: 1000 });
    expect(net.last()).toMatchObject({ path: '/visits', query: { propertyId: 'p', size: '100' } });
    expect(rows[0]).toMatchObject({
      id: 1, propertyId: 'p', listingId: 'p', propertySlug: 's', listing: 'T', slot: '2026-05-01T10:00', when: whenFromSlot('2026-05-01T10:00', 'video'), mode: 'video',
      status: 'confirmed', visitorName: 'V', visitorMobile: '9', visitorId: 'v', note: 'n', ownerId: 'o', createdAt: Date.parse('2026-01-01T00:00:00Z'),
    });
    expect(rows[1]).toMatchObject({ listing: 'L', ownerId: 'h', mode: 'in-person', status: 'scheduled', visitorName: 'Visitor', visitorMobile: '', visitorId: '', propertyId: '', slot: '' });
    expect(rows[2].ownerId).toBe('own');
    expect(rows[3].ownerId).toBe('');
    net.fresh();
    net.reply({ content: [], totalElements: 0 });
    await visit.listVisits();
    expect(net.last().query).toEqual({ size: '100' });
  });

  it('myVisitRequests', async () => {
    net.reply({ content: [{ id: 1 }], totalElements: 1 });
    expect(await visit.myVisitRequests()).toHaveLength(1);
    expect(net.last()).toMatchObject({ path: '/me/visit-requests', query: { size: '100' } });
  });

  it('scheduleVisit', async () => {
    net.reply({ id: 1, propertyId: 'p' });
    const out = await visit.scheduleVisit({ propertyId: 'p', slot: '2026-05-01T10:00', note: 'hi', listing: 'Nice flat' });
    expect(net.last()).toMatchObject({ path: '/visits', method: 'POST', body: { propertyId: 'p', slot: '2026-05-01T10:00', mode: 'in-person', note: 'hi' } });
    expect(out.listing).toBe('Nice flat');
    net.reply({ id: 2, listing: 'Server' });
    expect((await visit.scheduleVisit({ propertyId: 'p', dateIso: '2026-05-02', time: '11:30', listing: 'X' })).listing).toBe('Server');
    expect(net.last().body.slot).toBe(slotFromParts('2026-05-02', '11:30'));
    net.reply({ id: 3 });
    await visit.scheduleVisit({ propertyId: 'p' });
    expect(net.last().body.slot).toBeNull();
    net.reply({ id: 4 });
    await visit.scheduleVisit();
  });

  it('updateVisitStatus and rescheduleVisit', async () => {
    expect(await visit.updateVisitStatus('v/1', 'confirmed')).toEqual({ id: 'v/1', status: 'confirmed' });
    expect(net.last()).toMatchObject({ path: '/visit-requests/v%2F1/status', method: 'PATCH', body: { status: 'confirmed' } });
    const when = 'Sat, 2 May, 10:00 AM';
    expect(await visit.rescheduleVisit('v/1', when)).toEqual({ id: 'v/1', when });
    expect(net.last()).toMatchObject({ path: '/visits/v%2F1/slot', method: 'PATCH' });
    expect(net.last().body.slot).toBe(slotFromWhen(when));
  });
});

describe('usersProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listUsers maps rows and filters', async () => {
    net.reply({ content: [{ id: 1, name: 'A', mobile: '9', role: 'owner', city: 'Pune', listingsCount: 3, joinedAt: 'j', status: 'active', verified: 1, badgeSource: 'kyc', flagged: 1, flagReason: 'r' }, { id: 2, archived: true, createdAt: 'c', status: 'active' }, {}], totalElements: 3, counts: { all: 3 } });
    const res = await users.listUsers({ role: 'owner', customers: true, status: 'active', q: 'a', days: 7, page: 1, size: 5, counts: true });
    expect(net.last()).toMatchObject({ path: '/users', query: { page: '1', size: '5', archived: 'false', role: 'owner', customers: 'true', q: 'a', days: '7', status: 'active', counts: 'true' } });
    expect(res.counts).toEqual({ all: 3 });
    expect(res.total).toBe(3);
    expect(res.items[0]).toEqual({ id: 1, name: 'A', mobile: '9', role: 'owner', city: 'Pune', listings: 3, joinedAt: 'j', status: 'active', verified: true, badgeSource: 'kyc', flagged: true, flagReason: 'r', archived: false });
    expect(res.items[1]).toMatchObject({ status: 'archived', archived: true, joinedAt: 'c', listings: 0, badgeSource: null });
    expect(res.items[2]).toMatchObject({ name: '', joinedAt: null, verified: false });
  });

  it('listUsers translates the archived pseudo-status', async () => {
    net.reply({ content: [] });
    await users.listUsers({ status: 'archived' });
    expect(net.last().query).toEqual({ page: '0', size: '20', archived: 'true' });
    net.fresh();
    net.reply({});
    await users.listUsers({ status: 'weird' });
    expect(net.last().query).toEqual({ page: '0', size: '20', archived: 'false' });
    net.fresh();
    net.reply({});
    await users.listUsers();
    expect(net.last().query.archived).toBe('false');
  });

  it('timeline and badge', async () => {
    net.reply([{ a: 1 }]);
    expect(await users.getUserTimeline('u/1')).toEqual([{ a: 1 }]);
    expect(net.last().path).toBe('/users/u%2F1/timeline');
    net.fresh();
    net.reply({});
    expect(await users.getUserTimeline('u1')).toEqual([]);
    net.reply({ id: 1, verified: true });
    expect(await users.setUserBadge('u/1', true, 'kyc')).toMatchObject({ id: 1, verified: true });
    expect(net.last()).toMatchObject({ path: '/users/u%2F1/badge', method: 'PATCH', body: { granted: true, reason: 'kyc' } });
  });

  it('setUserStatus routes by action', async () => {
    await users.setUserStatus('u/1', 'archive', 'r');
    expect(net.last()).toMatchObject({ path: '/users/u%2F1/archive', method: 'PATCH', body: { reason: 'r' } });
    await users.setUserStatus('u1', 'suspend', 'r');
    expect(net.last()).toMatchObject({ path: '/users/u1/suspend', body: { reason: 'r' } });
    await users.setUserStatus('u1', 'restore');
    expect(net.last().path).toBe('/users/u1/restore');
    await users.setUserStatus('u1', 'anything');
    expect(net.last().path).toBe('/users/u1/reactivate');
  });

  it('setUserFlag', async () => {
    net.reply({ id: 1, flagged: true, flagReason: 'x' });
    expect(await users.setUserFlag('u/1', true, 'x')).toMatchObject({ flagged: true, flagReason: 'x' });
    expect(net.last()).toMatchObject({ path: '/users/u%2F1/flag', method: 'PATCH', body: { flagged: true, reason: 'x' } });
  });
});

describe('staffActivityProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listStaffActivity builds the filter query', async () => {
    net.reply({ content: [{ id: 1 }], totalElements: 1 });
    expect((await staff.listStaffActivity({ actor: 'a', entity: 'e', action: 'x', from: 'f', to: 't', q: ' hi ', page: 1, size: 5 })).items).toEqual([{ id: 1 }]);
    expect(net.last()).toMatchObject({ path: '/admin/staff-activity', query: { actor: 'a', entity: 'e', action: 'x', from: 'f', to: 't', q: 'hi', page: '1', size: '5' } });
    net.fresh();
    net.reply({});
    await staff.listStaffActivity({ q: '   ' });
    expect(net.last().query).toEqual({ page: '0', size: '50' });
    net.fresh();
    net.reply({});
    await staff.listStaffActivity();
    expect(net.last().query).toEqual({ page: '0', size: '50' });
  });

  it('getStaffActivitySummary', async () => {
    net.reply({ total: 5, staffCount: 2, byEntity: [1], actions: [2], leaderboard: [3] });
    expect(await staff.getStaffActivitySummary({ actor: 'a' })).toEqual({ total: 5, staffCount: 2, byEntity: [1], actions: [2], leaderboard: [3] });
    expect(net.last()).toMatchObject({ path: '/admin/staff-activity/summary', query: { actor: 'a' } });
    net.fresh();
    net.reply({ byEntity: 'x' });
    expect(await staff.getStaffActivitySummary()).toEqual({ total: 0, staffCount: 0, byEntity: [], actions: [], leaderboard: [] });
  });

  it('team performance and my work', async () => {
    net.reply({ windowDays: 30, staff: [1], queues: [2] });
    expect(await staff.getTeamPerformance(30)).toEqual({ windowDays: 30, staff: [1], queues: [2] });
    expect(net.last()).toMatchObject({ path: '/admin/team-performance', query: { days: '30' } });
    net.fresh();
    net.reply({ staff: 'x' });
    expect(await staff.getTeamPerformance()).toEqual({ windowDays: 7, staff: [], queues: [] });
    expect(net.last().query).toEqual({ days: '7' });
    net.fresh();
    net.reply(null);
    expect(await staff.getMyWork(14)).toEqual({ windowDays: 14, staff: [], queues: [] });
    expect(net.last()).toMatchObject({ path: '/admin/my-work', query: { days: '14' } });
    net.fresh();
    await staff.getMyWork();
    expect(net.last().query).toEqual({ days: '7' });
  });
});

describe('refundMapper', () => {
  it('toPayment and toPayments', () => {
    expect(rfm.toPayment(null)).toBeNull();
    expect(rfm.toPayment({ id: 1 })).toEqual({
      id: 1, kind: '', label: '', amount: 0, paidAt: 0, invoiceNo: '', status: 'paid', creditNoteNo: '', propertyId: null, serviceRequestId: null,
      refund: { eligible: false, reason: '', until: 0, from: 0, amount: 0 },
    });
    const full = rfm.toPayment({
      id: 2, kind: 'pass', label: 'L', amount: '999', paidAt: '2026-01-01T00:00:00Z', invoiceNo: 'I', status: 'refunded', creditNoteNo: 'C', propertyId: 'p', serviceRequestId: 's',
      refund: { eligible: true, reason: 'r', until: '2026-02-01T00:00:00Z', from: '2026-01-02T00:00:00Z', amount: '500' },
    });
    expect(full).toMatchObject({ amount: 999, paidAt: Date.parse('2026-01-01T00:00:00Z'), propertyId: 'p', serviceRequestId: 's', refund: { eligible: true, reason: 'r', until: Date.parse('2026-02-01T00:00:00Z'), amount: 500 } });
    expect(rfm.toPayment({ id: 3, amount: 100, paidAt: 'bad' })).toMatchObject({ paidAt: 0, refund: { amount: 100 } });
    expect(rfm.toPayment({ id: 4, amount: 'abc' }).amount).toBe(0);
    expect(rfm.toPayments([{ id: 1 }, null])).toHaveLength(1);
    expect(rfm.toPayments(null)).toEqual([]);
  });

  it('toRefundRow', () => {
    expect(rfm.toRefundRow(null)).toBeNull();
    expect(rfm.toRefundRow({ id: 1 })).toMatchObject({ id: 1, status: 'pending_review', at: 0, decidedAt: 0, customerId: null, transaction: null, signals: null });
    const row = rfm.toRefundRow({
      id: 2, orderRef: 'o', kind: 'k', label: 'l', amount: '5', customerId: 'c', customerName: 'N', customerMobile: '9', requestedAt: '2026-01-01T00:00:00Z', decidedAt: '2026-01-02T00:00:00Z',
      status: 'approved', basis: 'b', customerReason: 'cr', decisionReason: 'dr', creditNoteNo: 'cn', propertyId: 'p', serviceRequestId: 's',
      transaction: { paid: '10', paidAt: '2026-01-01T00:00:00Z', orderStatus: 'os', invoiceNo: 'i', refundReason: 'rr', refundAmount: '4', refundDueAt: '2026-01-03T00:00:00Z', refundState: 'st', refundSettledAt: '2026-01-04T00:00:00Z', gatewayRefund: 'g', refundAttempts: 2, refundTriedAt: '2026-01-05T00:00:00Z' },
      signals: { refunds12m: 1, linkedAccounts: 2, contactsUsed: 3, enquiries: 4, pausedDuringWindow: true },
    });
    expect(row).toMatchObject({ amount: 5, at: Date.parse('2026-01-01T00:00:00Z'), decidedAt: Date.parse('2026-01-02T00:00:00Z'), status: 'approved', customerName: 'N' });
    expect(row.transaction).toEqual({
      paid: 10, paidAt: Date.parse('2026-01-01T00:00:00Z'), orderStatus: 'os', invoiceNo: 'i', refundReason: 'rr', refundAmount: 4, refundDueAt: Date.parse('2026-01-03T00:00:00Z'),
      refundState: 'st', refundSettledAt: Date.parse('2026-01-04T00:00:00Z'), gatewayRefund: 'g', refundAttempts: 2, refundTriedAt: Date.parse('2026-01-05T00:00:00Z'),
    });
    expect(row.signals).toEqual({ refunds12m: 1, linkedAccounts: 2, contactsUsed: 3, enquiries: 4, pausedDuringWindow: true });
    expect(rfm.toRefundRow({ id: 3, transaction: {}, signals: {} })).toMatchObject({
      transaction: { paid: 0, refundAmount: null, orderStatus: '', refundAttempts: 0 }, signals: { pausedDuringWindow: false, refunds12m: 0 },
    });
  });

  it('toRefundPage', () => {
    expect(rfm.toRefundPage(null)).toEqual({ items: [], total: 0, counts: null });
    expect(rfm.toRefundPage({ content: [{ id: 1 }, null], totalElements: 9, counts: { pending: 1 } })).toMatchObject({ total: 9, counts: { pending: 1 }, items: [expect.objectContaining({ id: 1 })] });
    expect(rfm.toRefundPage({ content: [{ id: 1 }] }).total).toBe(1);
  });
});

describe('refundProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listMyPayments and requestRefund', async () => {
    net.reply([{ id: 1, amount: 5 }]);
    expect(await rfp.listMyPayments()).toHaveLength(1);
    expect(net.last().path).toBe('/me/payments');
    net.reply({ id: 1, status: 'refund_requested' });
    expect(await rfp.requestRefund('p/1', { reason: ' changed mind ', attemptId: 'a1' })).toMatchObject({ id: 1, status: 'refund_requested' });
    expect(net.last()).toMatchObject({ path: '/me/payments/p%2F1/refund', method: 'POST', body: { reason: 'changed mind' } });
    expect(net.last().headers['Idempotency-Key']).toBe('refund:p/1:a1');
    await rfp.requestRefund('p1');
    expect(net.last().body).toEqual({});
    expect(net.last().headers['Idempotency-Key']).toBe('refund:p1:undefined');
  });

  it('admin refunds', async () => {
    net.reply({ content: [{ id: 1 }], totalElements: 1 });
    expect((await rfp.listRefunds({ status: 'pending_review', feature: 'pass', days: 7, page: 1, size: 5, counts: true })).items).toHaveLength(1);
    expect(net.last()).toMatchObject({ path: '/admin/refunds', query: { status: 'pending_review', page: '1', size: '5', feature: 'pass', days: '7', counts: 'true' } });
    net.fresh();
    net.reply({});
    await rfp.listRefunds();
    expect(net.last().query).toEqual({ page: '0', size: '20' });
    net.reply({ id: 1, status: 'approved' });
    expect((await rfp.approveRefund('r/1')).status).toBe('approved');
    expect(net.last()).toMatchObject({ path: '/admin/refunds/r%2F1/approve', method: 'POST' });
    await rfp.rejectRefund('r1', ' nope ');
    expect(net.last()).toMatchObject({ path: '/admin/refunds/r1/reject', body: { reason: 'nope' } });
    await rfp.rejectRefund('r1');
    expect(net.last().body).toEqual({ reason: '' });
  });
});

describe('requestInboxProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('lists, counts, reminds and removes', async () => {
    net.reply({ content: [{ id: 1 }] });
    expect(await inbox.listRequests('received')).toEqual([{ id: 1 }]);
    expect(net.last()).toMatchObject({ path: '/me/requests', query: { box: 'received', size: '100' } });
    net.fresh();
    net.reply([]);
    expect(await inbox.listRequests()).toEqual([]);
    net.reply({ count: '3' });
    expect(await inbox.pendingRequestCount()).toBe(3);
    net.fresh();
    net.reply({});
    expect(await inbox.pendingRequestCount()).toBe(0);
    net.reply({ ok: 1 });
    expect(await inbox.remindRequest('visit', 'r/1')).toEqual({ ok: 1 });
    expect(net.last()).toMatchObject({ path: '/me/requests/visit/r%2F1/reminders', method: 'POST' });
    await inbox.removeRequest('visit', 'r/1');
    expect(net.last()).toMatchObject({ path: '/me/requests/visit/r%2F1', method: 'DELETE', query: { box: 'sent' } });
    await inbox.removeRequest('visit', 'r1', 'received');
    expect(net.last().query).toEqual({ box: 'received' });
  });
});

describe('savedProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listSaved', async () => {
    net.reply({ content: [{ id: 'a', title: 'T', available: false, savedAt: 's1' }, { id: 'b', savedAt: 's2' }], totalElements: 2 });
    const res = await saved.listSaved({ page: 1, size: 5 });
    expect(net.last()).toMatchObject({ path: '/me/saved', query: { page: '1', size: '5' } });
    expect(res.total).toBe(2);
    expect(res.items[0]).toMatchObject({ available: false, savedAt: 's1' });
    expect(res.items[1]).toMatchObject({ available: true, savedAt: 's2' });
    net.fresh();
    net.reply({});
    await saved.listSaved();
    expect(net.last().query).toEqual({ page: '0', size: '20' });
  });

  it('listSavedKeys, save and unsave', async () => {
    net.reply([{ id: 'u1', slug: 's1' }, { id: 'u2' }]);
    expect(await saved.listSavedKeys()).toEqual([{ token: 's1', uuid: 'u1' }, { token: 'u2', uuid: 'u2' }]);
    net.fresh();
    net.reply({});
    expect(await saved.listSavedKeys()).toEqual([]);
    await saved.saveProperty('p/1');
    expect(net.last()).toMatchObject({ path: '/me/saved/p%2F1', method: 'PUT' });
    await saved.unsaveProperty('p/1');
    expect(net.last()).toMatchObject({ path: '/me/saved/p%2F1', method: 'DELETE' });
  });
});
