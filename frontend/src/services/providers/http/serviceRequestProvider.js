import { PAGE_LOAD_TTL, del, get, patch, post, postMultipart, put } from '../../http.js';
import { MAX_UPLOAD_BYTES, REGISTERED_COPY_MAX_BYTES } from '../../../lib/uploads/policy.js';
import {
  toChecklist, toIdentityList, toViewModel, toViewModelList, toQueueRowPage, toCreate, toWireType,
} from './serviceRequestMapper.js';

export async function listServiceRequests(typeFilter, { ttl, maxAge } = {}) {
  const qs = typeFilter ? `?type=${encodeURIComponent(toWireType(typeFilter))}` : '';
  const res = await get(`/service-requests${qs}`, undefined, { ttl, maxAge });
  return toViewModelList(res?.content ?? (Array.isArray(res) ? res : []));
}

export async function listServiceRequestQueue({ type, status, mine, unassigned, overdue, q, days, page = 0, size = 20 } = {}) {
  const query = { page, size };
  if (type) query.type = toWireType(type);
  if (status) query.status = Array.isArray(status) ? status.join(',') : status;
  if (mine) query.mine = true;
  if (unassigned) query.unassigned = true;
  if (overdue) query.overdue = true;
  if (q) query.q = q;
  if (days) query.days = days;
  return toQueueRowPage(await get('/service-requests/queue', query), { page, size });
}

export async function getServiceRequestQueueSummary(team) {
  return get('/service-requests/queue-summary', team ? { team } : {});
}

export async function takeServiceRequest(id) {
  return toViewModel(
    await patch(`/service-requests/${encodeURIComponent(id)}/status`, { status: 'assigned' }),
  );
}

const uploadStaffDocument = async (id, path, file, fields = {}, maxBytes = MAX_UPLOAD_BYTES) => {
  if (!file) throw new Error('Choose a document to upload.');
  const { prepareUpload } = await import('../../../lib/uploads/prepareUpload.js');
  const prepared = await prepareUpload(file, { document: true, maxBytes });
  const form = new FormData();
  form.append('file', prepared);
  Object.entries(fields).forEach(([key, value]) => {
    [value].flat().forEach((item) => {
      const text = String(item ?? '').trim();
      if (text) form.append(key, text);
    });
  });
  return postMultipart(`/service-requests/${encodeURIComponent(id)}${path}`, form);
};

export async function shareServiceRequestDraft(id, { file, note, checks } = {}) {
  return toViewModel(await uploadStaffDocument(id, '/draft', file, { note, checks }));
}

export async function uploadServiceRequestFinalDoc(id, file, registration = {}) {
  await uploadStaffDocument(id, '/final-doc', file, registration, REGISTERED_COPY_MAX_BYTES);
  return getServiceRequest(id);
}

export async function cancelServiceRequestAsOps(id, reason) {
  return toViewModel(await patch(`/service-requests/${encodeURIComponent(id)}/status`, {
    status: 'cancelled',
    note: String(reason || '').trim(),
  }));
}

export async function readServiceRequestIdentities(id) {
  return toIdentityList(await get(`/service-requests/${encodeURIComponent(id)}/identities`));
}

export async function readServiceRequestChecklist(id) {
  return toChecklist(await get(`/service-requests/${encodeURIComponent(id)}/checklist`));
}

export async function reviewServiceRequestDocument(id, category, { documentId, verdict, reason } = {}) {
  const body = { documentId, verdict };
  if (reason) body.reason = reason;
  return toChecklist(await put(
    `/service-requests/${encodeURIComponent(id)}/checklist/${encodeURIComponent(category)}`, body));
}

export async function proposeServiceRequestAmendment(id, { reason, ...terms } = {}) {
  return toViewModel(await post(`/service-requests/${encodeURIComponent(id)}/amendments`, { ...terms, reason }));
}

export async function acceptServiceRequestAmendment(id, amendmentId) {
  return toViewModel(await post(
    `/service-requests/${encodeURIComponent(id)}/amendments/${encodeURIComponent(amendmentId)}/accept`));
}

export async function withdrawServiceRequestAmendment(id, amendmentId) {
  return toViewModel(await post(
    `/service-requests/${encodeURIComponent(id)}/amendments/${encodeURIComponent(amendmentId)}/withdraw`));
}

export async function askServiceRequestAttention(id, { party, reason, papers = [] }) {
  return toViewModel(await post(`/service-requests/${encodeURIComponent(id)}/attention`, { party, reason, papers }));
}

export async function resolveServiceRequestAttention(id, note) {
  return toViewModel(await post(`/service-requests/${encodeURIComponent(id)}/attention/resolve`, note ? { note } : {}));
}

export async function editServiceRequestDetails(id, state, note) {
  return toViewModel(await put(`/service-requests/${encodeURIComponent(id)}/desk-details`, { state, note }));
}

export async function correctServiceRequestIdentities(id, parties) {
  await put(`/service-requests/${encodeURIComponent(id)}/desk-identities`, { parties });
}

const refundsPath = (id) => `/service-requests/${encodeURIComponent(id)}/refunds`;

export async function getServiceRequestRefunds(id) {
  return get(refundsPath(id));
}

export async function requestServiceRequestRefund(id, { amount, dutyPaid, grn, reason } = {}) {
  return post(refundsPath(id), { amount, dutyPaid: !!dutyPaid, grn: grn || undefined, reason });
}

export async function decideServiceRequestRefund(id, refundId, decision, note) {
  return post(`${refundsPath(id)}/${encodeURIComponent(refundId)}/${decision}`, note ? { note } : {});
}

export async function getServiceRequestDocumentUrl(id, docId) {
  return (await get(`/service-requests/${encodeURIComponent(id)}/docs/${encodeURIComponent(docId)}/url`))?.url || null;
}

export async function listServiceRequestRentAgreements(id) {
  const rows = await get(`/service-requests/${encodeURIComponent(id)}/rent-agreements`);
  return Array.isArray(rows) ? rows : [];
}

export async function listServiceRequestOverlaps(id) {
  const rows = await get(`/service-requests/${encodeURIComponent(id)}/overlaps`);
  return Array.isArray(rows) ? rows : [];
}

export async function verifyRentAgreement(agreementId, status) {
  return patch(`/admin/rent-agreements/${encodeURIComponent(agreementId)}`, { status });
}

export async function getServiceRequest(id) {
  try {
    return toViewModel(await get(`/service-requests/${encodeURIComponent(id)}`));
  } catch (e) {
    if (e?.status === 404 || e?.status === 403) return null;
    throw e;
  }
}

export async function createServiceRequest(data) {
  return toViewModel(await post('/service-requests', toCreate(data)));
}

export async function createCoFillServiceRequest({ request, role, mobile }) {
  return toViewModel(await post('/service-requests/co-fill', {
    request: toCreate(request || {}),
    role,
    mobile,
  }));
}

export async function listMyServiceRequestInvites({ maxAge } = {}) {
  const rows = await get('/me/service-request-invites', undefined, { ttl: PAGE_LOAD_TTL, maxAge });
  return Array.isArray(rows) ? rows : [];
}

export async function decideServiceRequestInvite(partyId, decision) {
  return post(`/me/service-request-invites/${encodeURIComponent(partyId)}`, { decision });
}

export async function submitServiceRequestPartyDetails(id, details) {
  return toViewModel(await put(`/service-requests/${encodeURIComponent(id)}/party-details`, {
    details: details || {},
  }));
}

export async function updateServiceRequestDetails(id, details) {
  return toViewModel(await put(`/service-requests/${encodeURIComponent(id)}/details`, {
    details: details || {},
  }));
}

export async function openServiceRequestCheckout(id, declaration) {
  return toViewModel(await post(`/service-requests/${encodeURIComponent(id)}/checkout`,
    declaration ? { declaration } : {}));
}

export async function simulateServiceRequestPayment(id, outcome = 'paid') {
  return toViewModel(await post(`/service-requests/${encodeURIComponent(id)}/payment/simulate?outcome=${outcome}`, {}));
}

export async function cancelServiceRequest(id) {
  return toViewModel(await post(`/service-requests/${encodeURIComponent(id)}/cancel`, {}));
}

export async function deleteServiceRequest(id) {
  await del(`/service-requests/${encodeURIComponent(id)}`);
}

export async function withdrawServiceRequestParty(id, partyId) {
  await del(`/service-requests/${encodeURIComponent(id)}/parties/${encodeURIComponent(partyId)}`);
  return getServiceRequest(id);
}

export async function inviteServiceRequestParty(id, { role, mobile, partyIndex }) {
  await post(`/service-requests/${encodeURIComponent(id)}/parties`, { role, mobile, partyIndex });
  return getServiceRequest(id);
}

export async function addServiceRequestDocFromVault(id, { documentId, category }) {
  await post(`/service-requests/${encodeURIComponent(id)}/docs/from-vault`, { documentId, category });
}

const toUploadFile = (doc = {}) => {
  if (doc?.file instanceof File) return doc.file;
  const name = doc?.fileName || 'document.bin';
  const mime = doc?.mime || 'application/octet-stream';
  const dataUrl = String(doc?.dataUrl || '');
  const comma = dataUrl.indexOf(',');
  if (comma <= 0 || !dataUrl.startsWith('data:')) return null;
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: mime });
};

export async function addServiceRequestDoc(id, doc) {
  const file = toUploadFile(doc);
  if (!file) return;
  const { prepareUpload } = await import('../../../lib/uploads/prepareUpload.js');
  const prepared = await prepareUpload(file, { document: true });
  const form = new FormData();
  form.append('category', doc?.category || 'service-request');
  form.append('file', prepared);
  await postMultipart(`/service-requests/${encodeURIComponent(id)}/docs`, form);
}

export async function recordServiceRequestIdentities(id, parties) {
  if (!id || !Array.isArray(parties) || parties.length === 0) return;
  await put(`/service-requests/${encodeURIComponent(id)}/identities`, { parties });
}

export async function readMaskedServiceRequestIdentities(id) {
  const rows = await get(`/service-requests/${encodeURIComponent(id)}/identities/masked`);
  return Object.fromEntries((Array.isArray(rows) ? rows : [])
    .map((r) => [`${r.partyRole}-${r.partyIndex}`, { pan: r.pan || '', aadhaar: r.aadhaar || '' }]));
}

export async function decideServiceRequestDraft(id, decision, note) {
  const wire = decision === 'accepted' ? 'approve' : 'reject';
  return toViewModel(
    await post(`/service-requests/${encodeURIComponent(id)}/draft/decision`, {
      decision: wire,
      note: note || '',
    }),
  );
}

export async function approveServiceRequestDraftParty(id, partyKey, otp) {
  const body = otp ? { partyKey, otp } : { partyKey };
  return post(`/service-requests/${encodeURIComponent(id)}/draft/otp`, body);
}

export async function markServiceRequestRead(id) {
  await post(`/service-requests/${encodeURIComponent(id)}/read`, {});
}

export async function markServiceRequestDraftOpened(id) {
  await post(`/service-requests/${encodeURIComponent(id)}/draft/opened`, {});
}
