import { createProvider } from './config.js';
import { prepareUpload } from '../lib/uploads/prepareUpload.js';

const provider = createProvider('document');

export const listDocuments = async (mobile, propId, opts) => (await provider()).listDocuments(mobile, propId, opts);

export const uploadDocument = async (mobile, propId, upload) => {
  const file = upload.prepared ? upload.file : await prepareUpload(upload.file, { document: true });
  return (await provider()).uploadDocument(mobile, propId, { ...upload, file });
};

export const uploadPersonalDocument = async (upload) => {
  const file = await prepareUpload(upload.file, { document: true });
  return (await provider()).uploadPersonalDocument({ ...upload, file });
};

export const deleteDocument = async (mobile, propId, docId) =>
  (await provider()).deleteDocument(mobile, propId, docId);

export const listManagedDocuments = async (mobile, managedId) =>
  (await provider()).listManagedDocuments(mobile, managedId);

export const uploadManagedDocument = async (mobile, managedId, upload) => {
  const file = await prepareUpload(upload.file, { document: true });
  return (await provider()).uploadManagedDocument(mobile, managedId, { ...upload, file });
};

export const deleteManagedDocument = async (mobile, managedId, docId) =>
  (await provider()).deleteManagedDocument(mobile, managedId, docId);

export const getDocumentUrl = async (docId) => (await provider()).getDocumentUrl(docId);

export const listDocRequests = async (mobile) => (await provider()).listDocRequests(mobile);

export const respondDocRequest = async (mobile, reqId, decision, note) =>
  (await provider()).respondDocRequest(mobile, reqId, decision, note);

export const requestDocumentAccess = async (body) => (await provider()).requestDocumentAccess(body);

export const listMyDocumentRequests = async (opts) => (await provider()).listMyDocumentRequests(opts);

export const listMyGrantedDocuments = async (requestId, opts) =>
  (await provider()).listMyGrantedDocuments(requestId, opts);

export const getGrantedDocumentUrl = async (requestId, docId) =>
  (await provider()).getGrantedDocumentUrl(requestId, docId);

export const getSharedDocumentUrl = async (token, docId) => (await provider()).getSharedDocumentUrl(token, docId);

export const listSharedDocuments = async (token) => (await provider()).listSharedDocuments(token);
