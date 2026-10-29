import { get, del, patch, post, postMultipart, unwrapFullPage } from '../../http.js';
import { MAX_PAGE_SIZE } from '../../apiLimits.js';
import { toDoc, toDocList, toRequest, toRequestList, toStatusUpdate } from './documentMapper.js';

export async function listDocuments(_mobile, propId) {
  const res = await get(`/me/documents/${encodeURIComponent(propId)}`);
  return toDocList(res?.content ?? (Array.isArray(res) ? res : []));
}

export async function uploadDocument(_mobile, propId, { category, file } = {}) {
  const form = new FormData();
  form.append('category', category || 'Other');
  form.append('file', file);
  return toDoc(await postMultipart(`/me/documents/${encodeURIComponent(propId)}`, form));
}

export async function uploadPersonalDocument({ category, file } = {}) {
  const form = new FormData();
  form.append('category', category || 'Other');
  form.append('file', file);
  return toDoc(await postMultipart('/me/documents/personal', form));
}

export async function getDocumentUrl(docId) {
  return (await get(`/me/documents/${encodeURIComponent(docId)}/url`))?.url || null;
}

export async function deleteDocument(mobile, propId, docId) {
  await del(`/me/documents/${encodeURIComponent(propId)}/${encodeURIComponent(docId)}`);
  return listDocuments(mobile, propId);
}

export async function listManagedDocuments(_mobile, managedId) {
  const res = await get(`/me/documents/managed/${encodeURIComponent(managedId)}`);
  return toDocList(res?.content ?? (Array.isArray(res) ? res : []));
}

export async function uploadManagedDocument(_mobile, managedId, { category, file } = {}) {
  const form = new FormData();
  form.append('category', category || 'Other');
  form.append('file', file);
  return toDoc(await postMultipart(`/me/documents/managed/${encodeURIComponent(managedId)}`, form));
}

export async function deleteManagedDocument(mobile, managedId, docId) {
  await del(`/me/documents/managed/${encodeURIComponent(managedId)}/${encodeURIComponent(docId)}`);
  return listManagedDocuments(mobile, managedId);
}

export async function listDocRequests() {
  const res = await get('/me/documents/requests', { size: MAX_PAGE_SIZE });
  return toRequestList(unwrapFullPage(res, 'document'));
}

export async function respondDocRequest(mobile, reqId, decision, note) {
  await patch(`/me/documents/requests/${encodeURIComponent(reqId)}`, toStatusUpdate(decision, note));
  const reqs = await listDocRequests(mobile);
  return reqs.find((r) => r.id === reqId) || null;
}

export async function requestDocumentAccess({
  propertyId, categories = [], message = '', acknowledgedDisclaimer = false,
} = {}) {
  return toRequest(await post('/documents/requests', {
    propertyId,
    categories,
    message: message || undefined,
    acknowledgedDisclaimer: !!acknowledgedDisclaimer,
  }));
}

export async function listMyDocumentRequests({ propertyId } = {}) {
  const res = await get('/me/document-requests', { propertyId, size: MAX_PAGE_SIZE });
  return toRequestList(unwrapFullPage(res, 'document'));
}

export async function listMyGrantedDocuments(requestId) {
  const res = await get(`/me/document-requests/${encodeURIComponent(requestId)}/documents`);
  return toDocList(Array.isArray(res) ? res : (res?.content ?? []));
}

export async function getGrantedDocumentUrl(requestId, docId) {
  const res = await get(`/me/document-requests/${encodeURIComponent(requestId)}/documents/${encodeURIComponent(docId)}/url`);
  return res?.url || null;
}

export async function getSharedDocumentUrl(token, docId) {
  const res = await get('/documents/shared/url', { docId }, { auth: false, headers: { 'X-Share-Token': token } });
  return res?.url || null;
}

export async function listSharedDocuments(token) {
  const res = await get('/documents/shared', undefined, {
    auth: false,
    headers: { 'X-Share-Token': token },
  });
  return toDocList(Array.isArray(res) ? res : (res?.content ?? []));
}
