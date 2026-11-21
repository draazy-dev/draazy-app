import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupFetch, status } from '../net.js';

vi.mock('../../../../../src/lib/uploads/prepareUpload.js', () => ({
  prepareUpload: vi.fn(async (file) => file),
}));

const { prepareUpload } = await import('../../../../../src/lib/uploads/prepareUpload.js');
const { MAX_UPLOAD_BYTES, REGISTERED_COPY_MAX_BYTES } = await import('../../../../../src/lib/uploads/policy.js');
const sm = await import('../../../../../src/services/providers/http/serviceRequestMapper.js');
const sr = await import('../../../../../src/services/providers/http/serviceRequestProvider.js');

const iso = (day) => `2026-01-${String(day).padStart(2, '0')}T00:00:00Z`;
const ms = (day) => Date.parse(iso(day));

describe('serviceRequestMapper', () => {
  it('toWireType', () => {
    expect(sm.toWireType('rental')).toBe('rent-agreement');
    expect(sm.toWireType('legal')).toBe('legal');
  });

  it('toViewModel for an empty request', () => {
    expect(sm.toViewModel(null)).toBeNull();
    const vm = sm.toViewModel({ id: 'x' });
    expect(vm).toMatchObject({
      id: 'x', type: undefined, service: 'Service request', status: undefined, details: {}, docs: [], draft: null, finalDoc: null, draftDecision: null,
      messages: [], timeline: [], parties: [], assignedTo: null, cancellable: false, amount: null, sla: null, amendment: null, draftApproval: null, updatedAt: 0,
    });
  });

  it('toViewModel maps statuses, service names and types', () => {
    expect(sm.toViewModel({ id: 1, type: 'rent-agreement', status: 'new' })).toMatchObject({ type: 'rental', service: 'Rent Agreement', status: 'submitted' });
    expect(sm.toViewModel({ id: 1, type: 'custom-thing', status: 'in-progress' })).toMatchObject({ service: 'Custom Thing', status: 'docs_review' });
    expect(sm.toViewModel({ id: 1, status: 'weird' }).status).toBe('weird');
    expect(sm.toViewModel({ id: 1, status: 'approved' }).draftDecision).toEqual({ type: 'accepted', at: 0 });
    expect(sm.toViewModel({ id: 1, status: 'changes-requested', createdAt: iso(1) }).draftDecision).toEqual({ type: 'changes', at: ms(1) });
    ['awaiting-payment', 'assigned', 'draft-shared', 'action-required', 'completed', 'cancelled'].forEach((s) => {
      expect(sm.toViewModel({ id: 1, status: s }).status).not.toBe(s === 'assigned' ? 'assigned' : undefined);
    });
  });

  it('toViewModel builds docs, drafts, messages and timeline', () => {
    const vm = sm.toViewModel({
      id: 'r', type: 'legal', createdAt: iso(1), details: { a: 1 },
      documents: [
        { id: 'd1', category: 'draft', fileName: 'v1.pdf', uploadedAt: iso(2) },
        { id: 'd2', category: 'draft', uploadedAt: iso(4) },
        { id: 'f1', category: 'final-document', uploadedAt: iso(6) },
        { category: 'id' },
        null,
      ],
      messages: [{ id: 1, authorRole: 'staff', body: 'b', createdAt: iso(3), readAt: iso(3) }, { id: 2, createdAt: iso(5) }, null],
      timeline: [{ event: 'draft.shared', by: 'staff', at: iso(4) }, { event: 'draft.opened', at: iso(5) }, null],
    });
    expect(vm.docs).toHaveLength(5);
    expect(vm.docs[3]).toEqual({ id: '', category: 'id', fileName: 'document', uploadedAt: 0 });
    expect(vm.docs[4]).toEqual({ id: '', category: '', fileName: 'document', uploadedAt: 0 });
    expect(vm.draft).toEqual({ id: 'd2', fileName: 'draft', sharedAt: ms(4), version: 2, opened: true });
    expect(vm.finalDoc).toEqual({ id: 'f1', fileName: 'final-document', uploadedAt: ms(6) });
    expect(vm.messages).toEqual([
      { id: 1, from: 'staff', text: 'b', at: ms(3), read: true },
      { id: 2, from: 'user', text: '', at: ms(5), read: false },
    ]);
    expect(vm.timeline[2]).toEqual({ stage: '', by: '', at: 0 });
    expect(vm.updatedAt).toBe(ms(6));
    expect(sm.toViewModel({ id: 1, documents: [{ category: 'draft', uploadedAt: iso(2) }], timeline: [{ event: 'draft.opened' }, { event: 'draft.shared' }] }).draft.opened).toBe(false);
    expect(sm.toViewModel({ id: 1, details: 'str' }).details).toEqual({});
  });

  it('toViewModel maps parties, sla, amendment and draft approval', () => {
    const vm = sm.toViewModel({
      id: 'r', assignee: 'Ann', assignedToMe: 1, cancellable: 1, editableByMe: 1, mySideSubmitted: 1, myPartyId: 'p1', payableByMe: 1, paidBy: 'u',
      amount: 0, charges: { x: 1 }, attention: { y: 1 }, propertyId: 'pr', paymentSessionId: 's', registration: { z: 1 },
      parties: [{ id: 'p', requestId: 'q', role: 'tenant', partyIndex: 2, status: 's', party: 'P', mobile: '9', pending: 1, invitedBy: 'x', whatsappQueued: true, createdAt: iso(2) }, {}],
      sla: { waitingOn: 'ops', dueAt: iso(9), overdue: 1 },
      amendment: { id: 'a', terms: { t: 1 }, reason: 'r', amountBefore: 1, amountAfter: 2, delta: 1, checkoutOpen: 1, proposedAt: iso(3) },
      draftApproval: { version: 3, approved: 1, total: 2, parties: [{ key: 'k', label: 'L', method: 'otp', mobile: '9', opened: 1, approved: 1, approvedAt: iso(4), mine: 1 }, {}] },
    });
    expect(vm).toMatchObject({
      assignedTo: 'Ann', assignedToMe: true, cancellable: true, editableByMe: true, mySideSubmitted: true, myPartyId: 'p1', payableByMe: true, paidBy: 'u', amount: 0,
      propertyId: 'pr', sla: { waitingOn: 'ops', dueAt: ms(9), overdue: true },
      amendment: { id: 'a', terms: { t: 1 }, delta: 1, checkoutOpen: true, proposedAt: ms(3) },
    });
    expect(vm.parties[0]).toEqual({ id: 'p', requestId: 'q', role: 'tenant', partyIndex: 2, status: 's', party: 'P', mobile: '9', pending: true, invitedBy: 'x', whatsappQueued: true, createdAt: ms(2) });
    expect(vm.parties[1]).toEqual({ id: '', requestId: 'r', role: '', partyIndex: 0, status: '', party: '', mobile: null, pending: false, invitedBy: '', whatsappQueued: false, createdAt: 0 });
    expect(vm.draftApproval).toMatchObject({ version: 3, approved: 1, total: 2 });
    expect(vm.draftApproval.parties[0]).toEqual({ key: 'k', label: 'L', method: 'otp', mobile: '9', opened: true, approved: true, approvedAt: ms(4), mine: true });
    expect(vm.draftApproval.parties[1]).toEqual({ key: '', label: 'Party', method: '', mobile: null, opened: false, approved: false, approvedAt: null, mine: false });
    expect(sm.toViewModel({ id: 1, sla: { waitingOn: 'x' }, amendment: {}, draftApproval: {} })).toMatchObject({
      sla: { dueAt: null, overdue: false }, amendment: { terms: {}, reason: '', amountBefore: 0, delta: 0 }, draftApproval: { version: 0, approved: 0, total: 0, parties: [] },
    });
    expect(sm.toViewModel({ id: 1, documents: [{ category: 'draft', uploadedAt: iso(2) }], draftApproval: {} }).draftApproval.version).toBe(1);
  });

  it('toViewModelList sorts newest first', () => {
    expect(sm.toViewModelList([{ id: 'a', createdAt: iso(1) }, null, { id: 'b', createdAt: iso(5) }]).map((v) => v.id)).toEqual(['b', 'a']);
    expect(sm.toViewModelList(null)).toEqual([]);
  });

  it('toQueueRow and page', () => {
    expect(sm.toQueueRow(null)).toBeNull();
    expect(sm.toQueueRow({ id: 'q' })).toMatchObject({ requesterName: '', details: {}, timeline: [], updatedAt: 0, sla: null, amount: null });
    const row = sm.toQueueRow({ id: 'q', type: 'rent-agreement', status: 'new', createdAt: iso(1), approvedAt: iso(3), assignee: 'A', sla: { waitingOn: 'x', dueAt: iso(4) } });
    expect(row).toMatchObject({ type: 'rental', service: 'Rent Agreement', status: 'submitted', assignedTo: 'A', updatedAt: ms(3), timeline: [{ stage: 'draft.approved', by: '', at: ms(3) }], sla: { dueAt: ms(4), overdue: false } });
    expect(sm.toQueueRowPage(null, { page: 2, size: 5 })).toEqual({ items: [], total: 0, page: 2, size: 5 });
    expect(sm.toQueueRowPage({ content: [{ id: 'a' }, null], totalElements: 9, number: 3, size: 1 })).toMatchObject({ total: 9, page: 3, size: 1, items: [expect.objectContaining({ id: 'a' })] });
  });

  it('identities and checklist', () => {
    expect(sm.toIdentity(null)).toBeNull();
    expect(sm.toIdentity({})).toEqual({ partyRole: 'tenant', partyIndex: 0, partyName: '', pan: '', aadhaar: '', purged: false, purgedAt: 0 });
    expect(sm.toIdentity({ partyRole: 'owner', partyIndex: 1, purgedAt: iso(2) })).toMatchObject({ partyRole: 'owner', partyIndex: 1, purged: true, purgedAt: ms(2) });
    expect(sm.toIdentity({ partyIndex: '3' }).partyIndex).toBe(0);
    expect(sm.toIdentityList([{ partyName: 'A' }, null])).toHaveLength(1);
    expect(sm.toIdentityList(null)).toEqual([]);
    expect(sm.toChecklist(null)).toBeNull();
    expect(sm.toChecklist({})).toEqual({ ready: 0, total: 0, items: [] });
    expect(sm.toChecklist({ ready: 1, items: [{ id: 'a', done: 1, canUpload: false, review: 'ok' }, { name: 'no id' }, { id: 'b', name: 'B', documentId: 'd', reason: 'r' }] })).toEqual({
      ready: 1, total: 2,
      items: [
        { id: 'a', name: 'a', done: true, documentId: null, review: 'ok', reason: null, canUpload: false },
        { id: 'b', name: 'B', done: false, documentId: 'd', review: null, reason: 'r', canUpload: true },
      ],
    });
  });

  it('toCreate', () => {
    expect(sm.toCreate()).toEqual({ type: 'rent-agreement', details: {} });
    expect(sm.toCreate({ type: 'legal', details: { a: 1 }, propertyId: 5, ticketRef: 'T' })).toEqual({ type: 'legal', details: { a: 1 }, propertyId: '5', ticketId: 'T' });
    expect(sm.toCreate({ ticketId: 9, ticketRef: 'x', details: 'bad' })).toEqual({ type: 'rent-agreement', details: {}, ticketId: '9' });
  });
});

describe('serviceRequestProvider', () => {
  const net = setupFetch({ signedIn: true });
  beforeEach(() => prepareUpload.mockClear());

  it('listServiceRequests', async () => {
    net.reply({ content: [{ id: 'a', createdAt: iso(1) }, { id: 'b', createdAt: iso(2) }] });
    expect((await sr.listServiceRequests('rental', { ttl: 1000 })).map((r) => r.id)).toEqual(['b', 'a']);
    expect(net.last().search).toBe('type=rent-agreement');
    net.fresh();
    net.reply([{ id: 'c' }]);
    expect(await sr.listServiceRequests()).toHaveLength(1);
    expect(net.last().search).toBe('');
    net.fresh();
    net.reply({});
    expect(await sr.listServiceRequests()).toEqual([]);
  });

  it('queue and summary', async () => {
    net.reply({ content: [{ id: 'q' }], totalElements: 1 });
    expect((await sr.listServiceRequestQueue({ type: 'rental', status: ['new', 'assigned'], mine: true, unassigned: true, overdue: true, q: 'x', days: 3, page: 1, size: 5 })).total).toBe(1);
    expect(net.last()).toMatchObject({ path: '/service-requests/queue', query: { page: '1', size: '5', type: 'rent-agreement', status: 'new,assigned', mine: 'true', unassigned: 'true', overdue: 'true', q: 'x', days: '3' } });
    net.reply({});
    await sr.listServiceRequestQueue({ status: 'new' });
    expect(net.last().query).toEqual({ page: '0', size: '20', status: 'new' });
    net.reply({ open: 2 });
    expect(await sr.getServiceRequestQueueSummary('legal')).toEqual({ open: 2 });
    expect(net.last().query).toEqual({ team: 'legal' });
    net.fresh();
    await sr.getServiceRequestQueueSummary();
    expect(net.last().search).toBe('');
  });

  it('take and cancel as ops patch the status', async () => {
    net.reply({ id: 'r' });
    await sr.takeServiceRequest('r/1');
    expect(net.last()).toMatchObject({ path: '/service-requests/r%2F1/status', method: 'PATCH', body: { status: 'assigned' } });
    await sr.cancelServiceRequestAsOps('r1', '  dup ');
    expect(net.last().body).toEqual({ status: 'cancelled', note: 'dup' });
    await sr.cancelServiceRequestAsOps('r1');
    expect(net.last().body).toEqual({ status: 'cancelled', note: '' });
  });

  it('staff document uploads', async () => {
    const file = new File(['x'], 'draft.pdf', { type: 'application/pdf' });
    net.reply({ id: 'r' });
    await sr.shareServiceRequestDraft('r/1', { file, note: ' n ', checks: ['a', '', 'b'] });
    expect(prepareUpload).toHaveBeenCalledWith(file, { document: true, maxBytes: MAX_UPLOAD_BYTES });
    const call = net.last();
    expect(call).toMatchObject({ path: '/service-requests/r%2F1/draft', method: 'POST' });
    expect(call.init.body.get('file')).toBeInstanceOf(File);
    expect(call.init.body.get('note')).toBe('n');
    expect(call.init.body.getAll('checks')).toEqual(['a', 'b']);
    await expect(sr.shareServiceRequestDraft('r1')).rejects.toThrow('Choose a document to upload.');

    net.reply({}).reply({ id: 'r1' });
    const res = await sr.uploadServiceRequestFinalDoc('r1', file, { regNo: '123', blank: '' });
    expect(prepareUpload).toHaveBeenLastCalledWith(file, { document: true, maxBytes: REGISTERED_COPY_MAX_BYTES });
    expect(net.calls.at(-2)).toMatchObject({ path: '/service-requests/r1/final-doc', method: 'POST' });
    expect(net.calls.at(-2).init.body.get('regNo')).toBe('123');
    expect(net.calls.at(-2).init.body.has('blank')).toBe(false);
    expect(net.last()).toMatchObject({ path: '/service-requests/r1', method: 'GET' });
    expect(res.id).toBe('r1');
  });

  it('identities and checklist', async () => {
    net.reply([{ partyName: 'A' }]);
    expect(await sr.readServiceRequestIdentities('r/1')).toHaveLength(1);
    expect(net.last().path).toBe('/service-requests/r%2F1/identities');
    net.reply({ ready: 1, items: [] });
    expect(await sr.readServiceRequestChecklist('r1')).toMatchObject({ ready: 1 });
    net.reply({ ready: 0, items: [] });
    await sr.reviewServiceRequestDocument('r1', 'id card', { documentId: 'd', verdict: 'ok', reason: 'fine' });
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/checklist/id%20card', method: 'PUT', body: { documentId: 'd', verdict: 'ok', reason: 'fine' } });
    await sr.reviewServiceRequestDocument('r1', 'c');
    expect(net.last().body).toEqual({});
  });

  it('amendments and attention', async () => {
    net.reply({ id: 'r' });
    await sr.proposeServiceRequestAmendment('r1', { reason: 'why', rent: 5 });
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/amendments', method: 'POST', body: { rent: 5, reason: 'why' } });
    await sr.proposeServiceRequestAmendment('r1');
    expect(net.last().body).toEqual({});
    await sr.acceptServiceRequestAmendment('r1', 'a/1');
    expect(net.last().path).toBe('/service-requests/r1/amendments/a%2F1/accept');
    await sr.withdrawServiceRequestAmendment('r1', 'a1');
    expect(net.last().path).toBe('/service-requests/r1/amendments/a1/withdraw');
    await sr.askServiceRequestAttention('r1', { party: 'tenant', reason: 'r' });
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/attention', body: { party: 'tenant', reason: 'r', papers: [] } });
    await sr.resolveServiceRequestAttention('r1', 'done');
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/attention/resolve', body: { note: 'done' } });
    await sr.resolveServiceRequestAttention('r1');
    expect(net.last().body).toEqual({});
  });

  it('desk edits and refunds', async () => {
    net.reply({ id: 'r' });
    await sr.editServiceRequestDetails('r1', { a: 1 }, 'n');
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/desk-details', method: 'PUT', body: { state: { a: 1 }, note: 'n' } });
    await sr.correctServiceRequestIdentities('r1', [{ pan: 'x' }]);
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/desk-identities', method: 'PUT', body: { parties: [{ pan: 'x' }] } });
    net.reply([{ id: 'f' }]);
    expect(await sr.getServiceRequestRefunds('r/1')).toEqual([{ id: 'f' }]);
    expect(net.last().path).toBe('/service-requests/r%2F1/refunds');
    await sr.requestServiceRequestRefund('r1', { amount: 5, dutyPaid: 1, reason: 'r' });
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/refunds', method: 'POST', body: { amount: 5, dutyPaid: true, reason: 'r' } });
    await sr.requestServiceRequestRefund('r1');
    expect(net.last().body).toEqual({ dutyPaid: false });
    await sr.decideServiceRequestRefund('r1', 'f/1', 'approve', 'ok');
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/refunds/f%2F1/approve', body: { note: 'ok' } });
    await sr.decideServiceRequestRefund('r1', 'f1', 'reject');
    expect(net.last().body).toEqual({});
  });

  it('document urls, rent agreements and overlaps', async () => {
    net.reply({ url: 'u' });
    expect(await sr.getServiceRequestDocumentUrl('r1', 'd/1')).toBe('u');
    expect(net.last().path).toBe('/service-requests/r1/docs/d%2F1/url');
    net.reply({});
    expect(await sr.getServiceRequestDocumentUrl('r1', 'd')).toBeNull();
    net.reply([1]);
    expect(await sr.listServiceRequestRentAgreements('r1')).toEqual([1]);
    net.reply({});
    expect(await sr.listServiceRequestRentAgreements('r1')).toEqual([]);
    net.reply([2]);
    expect(await sr.listServiceRequestOverlaps('r1')).toEqual([2]);
    net.reply(null);
    expect(await sr.listServiceRequestOverlaps('r1')).toEqual([]);
    net.reply({ ok: 1 });
    expect(await sr.verifyRentAgreement('a/1', 'verified')).toEqual({ ok: 1 });
    expect(net.last()).toMatchObject({ path: '/admin/rent-agreements/a%2F1', method: 'PATCH', body: { status: 'verified' } });
  });

  it('getServiceRequest maps 404 and 403 to null', async () => {
    net.reply({ id: 'r' });
    expect((await sr.getServiceRequest('r')).id).toBe('r');
    net.fresh();
    net.reply(status(404, {}));
    expect(await sr.getServiceRequest('r')).toBeNull();
    net.fresh();
    net.reply(status(403, {}));
    expect(await sr.getServiceRequest('r')).toBeNull();
    net.fresh();
    net.reply(status(500, {}));
    await expect(sr.getServiceRequest('r')).rejects.toMatchObject({ status: 500 });
  });

  it('create flows', async () => {
    net.reply({ id: 'r' });
    await sr.createServiceRequest({ type: 'rental', details: { a: 1 } });
    expect(net.last()).toMatchObject({ path: '/service-requests', method: 'POST', body: { type: 'rent-agreement', details: { a: 1 } } });
    await sr.createCoFillServiceRequest({ request: { type: 'legal' }, role: 'owner', mobile: '9' });
    expect(net.last()).toMatchObject({ path: '/service-requests/co-fill', body: { request: { type: 'legal', details: {} }, role: 'owner', mobile: '9' } });
    await sr.createCoFillServiceRequest({ role: 'r', mobile: 'm' });
    expect(net.last().body.request).toEqual({ type: 'rent-agreement', details: {} });
  });

  it('invites', async () => {
    net.reply([{ id: 1 }]);
    expect(await sr.listMyServiceRequestInvites({ maxAge: 5 })).toEqual([{ id: 1 }]);
    net.fresh();
    net.reply({});
    expect(await sr.listMyServiceRequestInvites()).toEqual([]);
    net.reply({ ok: 1 });
    expect(await sr.decideServiceRequestInvite('p/1', 'accept')).toEqual({ ok: 1 });
    expect(net.last()).toMatchObject({ path: '/me/service-request-invites/p%2F1', method: 'POST', body: { decision: 'accept' } });
  });

  it('detail updates, checkout and payment', async () => {
    net.reply({ id: 'r' });
    await sr.submitServiceRequestPartyDetails('r1', { a: 1 });
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/party-details', method: 'PUT', body: { details: { a: 1 } } });
    await sr.submitServiceRequestPartyDetails('r1');
    expect(net.last().body).toEqual({ details: {} });
    await sr.updateServiceRequestDetails('r1', { b: 1 });
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/details', body: { details: { b: 1 } } });
    await sr.updateServiceRequestDetails('r1');
    expect(net.last().body).toEqual({ details: {} });
    await sr.openServiceRequestCheckout('r1', 'I agree');
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/checkout', body: { declaration: 'I agree' } });
    await sr.openServiceRequestCheckout('r1');
    expect(net.last().body).toEqual({});
    await sr.simulateServiceRequestPayment('r1');
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/payment/simulate', query: { outcome: 'paid' }, method: 'POST' });
    await sr.simulateServiceRequestPayment('r1', 'failed');
    expect(net.last().query).toEqual({ outcome: 'failed' });
    await sr.cancelServiceRequest('r1');
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/cancel', method: 'POST' });
    await sr.deleteServiceRequest('r1');
    expect(net.last()).toMatchObject({ path: '/service-requests/r1', method: 'DELETE' });
  });

  it('party management re-reads the request', async () => {
    net.reply({}).reply({ id: 'r' });
    expect((await sr.withdrawServiceRequestParty('r1', 'p/1')).id).toBe('r');
    expect(net.calls.at(-2)).toMatchObject({ path: '/service-requests/r1/parties/p%2F1', method: 'DELETE' });
    net.fresh();
    net.reply({}).reply({ id: 'r' });
    await sr.inviteServiceRequestParty('r1', { role: 'tenant', mobile: '9', partyIndex: 1 });
    expect(net.calls.at(-2)).toMatchObject({ path: '/service-requests/r1/parties', method: 'POST', body: { role: 'tenant', mobile: '9', partyIndex: 1 } });
    await sr.addServiceRequestDocFromVault('r1', { documentId: 'd', category: 'id' });
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/docs/from-vault', body: { documentId: 'd', category: 'id' } });
  });

  it('addServiceRequestDoc uploads a File or a data URL and ignores unusable input', async () => {
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    await sr.addServiceRequestDoc('r/1', { file, category: 'id' });
    expect(net.last()).toMatchObject({ path: '/service-requests/r%2F1/docs', method: 'POST' });
    expect(net.last().init.body.get('category')).toBe('id');
    expect(net.last().init.body.get('file')).toBe(file);

    await sr.addServiceRequestDoc('r1', { dataUrl: 'data:text/plain;base64,aGk=', fileName: 'n.txt', mime: 'text/plain' });
    const sent = net.last().init.body;
    expect(sent.get('category')).toBe('service-request');
    expect(sent.get('file')).toMatchObject({ name: 'n.txt', type: 'text/plain', size: 2 });
    await sr.addServiceRequestDoc('r1', { dataUrl: 'data:;base64,aGk=' });
    expect(net.last().init.body.get('file')).toMatchObject({ name: 'document.bin', type: 'application/octet-stream' });

    const before = net.calls.length;
    await sr.addServiceRequestDoc('r1', { dataUrl: 'nonsense' });
    await sr.addServiceRequestDoc('r1', { dataUrl: ',abc' });
    await sr.addServiceRequestDoc('r1', {});
    await sr.addServiceRequestDoc('r1');
    expect(net.calls).toHaveLength(before);
  });

  it('identities recording and masked reads', async () => {
    await sr.recordServiceRequestIdentities('', [{}]);
    await sr.recordServiceRequestIdentities('r1', []);
    await sr.recordServiceRequestIdentities('r1', 'x');
    expect(net.calls).toHaveLength(0);
    await sr.recordServiceRequestIdentities('r1', [{ pan: 'A' }]);
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/identities', method: 'PUT', body: { parties: [{ pan: 'A' }] } });
    net.reply([{ partyRole: 'owner', partyIndex: 0, pan: 'XXX' }, { partyRole: 'tenant', partyIndex: 1 }]);
    expect(await sr.readMaskedServiceRequestIdentities('r1')).toEqual({ 'owner-0': { pan: 'XXX', aadhaar: '' }, 'tenant-1': { pan: '', aadhaar: '' } });
    expect(net.last().path).toBe('/service-requests/r1/identities/masked');
    net.reply(null);
    expect(await sr.readMaskedServiceRequestIdentities('r1')).toEqual({});
  });

  it('draft decisions and read markers', async () => {
    net.reply({ id: 'r' });
    await sr.decideServiceRequestDraft('r1', 'accepted', 'good');
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/draft/decision', body: { decision: 'approve', note: 'good' } });
    await sr.decideServiceRequestDraft('r1', 'changes');
    expect(net.last().body).toEqual({ decision: 'reject', note: '' });
    net.reply({ ok: 1 });
    expect(await sr.approveServiceRequestDraftParty('r1', 'k', '123456')).toEqual({ ok: 1 });
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/draft/otp', body: { partyKey: 'k', otp: '123456' } });
    await sr.approveServiceRequestDraftParty('r1', 'k');
    expect(net.last().body).toEqual({ partyKey: 'k' });
    await sr.markServiceRequestRead('r1');
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/read', method: 'POST', body: {} });
    await sr.markServiceRequestDraftOpened('r1');
    expect(net.last()).toMatchObject({ path: '/service-requests/r1/draft/opened', method: 'POST', body: {} });
  });
});
