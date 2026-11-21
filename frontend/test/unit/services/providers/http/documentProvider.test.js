import { describe, expect, it } from 'vitest';
import { setupFetch } from '../net.js';
import { toDoc, toDocList, toRequest, toRequestList, toStatusUpdate } from '../../../../../src/services/providers/http/documentMapper.js';
import * as docs from '../../../../../src/services/providers/http/documentProvider.js';

describe('documentMapper', () => {
  it('toDoc maps and defaults', () => {
    expect(toDoc(null)).toBeNull();
    expect(toDoc({ id: 'd', category: 'Sale deed', fileName: 'a.pdf', sizeBytes: 5, mimeType: 'application/pdf', uploadedAt: '2026-01-01T00:00:00Z' }))
      .toEqual({ id: 'd', category: 'Sale deed', name: 'a.pdf', size: 5, mime: 'application/pdf', dataUrl: null, url: null, uploadedAt: Date.parse('2026-01-01T00:00:00Z') });
    expect(toDoc({ id: 'd', uploadedAt: 'garbage' })).toMatchObject({ category: 'Other', name: 'Document', size: 0, mime: 'application/octet-stream', uploadedAt: 0 });
  });

  it('toDocList / toRequestList filter falsy and non-arrays', () => {
    expect(toDocList(null)).toEqual([]);
    expect(toDocList([null, { id: 'a' }])).toHaveLength(1);
    expect(toRequestList('x')).toEqual([]);
    expect(toRequestList([null, { id: 'r' }])).toHaveLength(1);
  });

  it('toRequest maps requester, categories and expiry', () => {
    expect(toRequest(null)).toBeNull();
    expect(toRequest({
      id: 'r', propertyId: 'p', requester: { id: 'u', name: 'N', mobile: 'M' }, categories: ['A', 'B'], status: 'granted',
      sharedDocumentCount: -3, createdAt: '2026-01-01T00:00:00Z', acknowledgedDisclaimer: 1, expiresAt: '2026-02-01T00:00:00Z',
    })).toEqual({
      id: 'r', propId: 'p', requesterId: 'u', buyerName: 'N', buyerMobile: 'M', docType: 'A', categories: ['A', 'B'], status: 'granted',
      sharedDocumentCount: 0, requestedAt: Date.parse('2026-01-01T00:00:00Z'), acknowledgedDisclaimer: true, expiresAt: Date.parse('2026-02-01T00:00:00Z'),
    });
    expect(toRequest({ id: 'r', requesterId: 'rid' })).toMatchObject({
      requesterId: 'rid', buyerName: 'Buyer', docType: 'Document', categories: [], status: 'pending', expiresAt: null, requestedAt: 0,
    });
  });

  it('toStatusUpdate only grants on "granted"', () => {
    expect(toStatusUpdate('granted', 'ok')).toEqual({ status: 'granted', note: 'ok' });
    expect(toStatusUpdate('whatever')).toEqual({ status: 'declined', note: '' });
  });
});

describe('documentProvider', () => {
  const net = setupFetch({ signedIn: true });
  const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });

  it('listDocuments reads a paged or bare response', async () => {
    net.reply({ content: [{ id: 'd1' }] });
    expect(await docs.listDocuments('m', 'p/1')).toMatchObject([{ id: 'd1' }]);
    expect(net.last().path).toBe('/me/documents/p%2F1');
    net.reply([{ id: 'd2' }]);
    expect(await docs.listDocuments('m', 'p2')).toMatchObject([{ id: 'd2' }]);
    net.reply(null);
    expect(await docs.listDocuments('m', 'p3')).toEqual([]);
  });

  it('uploads send multipart form data without a JSON content type', async () => {
    net.reply({ id: 'u1', fileName: 'a.pdf' });
    const doc = await docs.uploadDocument('m', 'p1', { category: '', file });
    const { init, path } = net.last();
    expect(path).toBe('/me/documents/p1');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get('category')).toBe('Other');
    expect(init.body.get('file')).toBeInstanceOf(File);
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(doc).toMatchObject({ id: 'u1', name: 'a.pdf' });

    await docs.uploadPersonalDocument({ category: 'ID', file });
    expect(net.last().path).toBe('/me/documents/personal');
    expect(net.last().init.body.get('category')).toBe('ID');
    await docs.uploadManagedDocument('m', 'mg 1', { file });
    expect(net.last().path).toBe('/me/documents/managed/mg%201');
  });

  it('getDocumentUrl returns the url or null', async () => {
    net.reply({ url: 'https://x/y' });
    expect(await docs.getDocumentUrl('d 1')).toBe('https://x/y');
    expect(net.last().path).toBe('/me/documents/d%201/url');
    net.reply({});
    expect(await docs.getDocumentUrl('d2')).toBeNull();
  });

  it('deleteDocument deletes then relists', async () => {
    net.reply(null).reply({ content: [{ id: 'left' }] });
    expect(await docs.deleteDocument('m', 'p1', 'd1')).toMatchObject([{ id: 'left' }]);
    expect(net.calls[0]).toMatchObject({ path: '/me/documents/p1/d1', method: 'DELETE' });
    expect(net.calls[1].path).toBe('/me/documents/p1');
  });

  it('managed documents list and delete', async () => {
    net.reply([{ id: 'm1' }]);
    expect(await docs.listManagedDocuments('x', 'mg1')).toHaveLength(1);
    expect(net.last().path).toBe('/me/documents/managed/mg1');
    net.reply(null).reply({ content: [] });
    expect(await docs.deleteManagedDocument('x', 'mg1', 'd1')).toEqual([]);
    expect(net.calls[1]).toMatchObject({ path: '/me/documents/managed/mg1/d1', method: 'DELETE' });
  });

  it('request inbox: list, respond and find the updated request', async () => {
    net.reply({ content: [{ id: 'r1' }] });
    expect(await docs.listDocRequests()).toMatchObject([{ id: 'r1' }]);
    expect(net.last().query).toEqual({ size: '100' });

    net.reply(null).reply({ content: [{ id: 'r1', status: 'granted' }] });
    const updated = await docs.respondDocRequest('m', 'r1', 'granted', 'ok');
    expect(net.calls[1]).toMatchObject({ path: '/me/documents/requests/r1', method: 'PATCH', body: { status: 'granted', note: 'ok' } });
    expect(updated).toMatchObject({ id: 'r1', status: 'granted' });

    net.reply(null).reply([]);
    expect(await docs.respondDocRequest('m', 'zz', 'declined')).toBeNull();
  });

  it('requestDocumentAccess posts the disclaimer flag', async () => {
    net.reply({ id: 'r9' });
    expect(await docs.requestDocumentAccess({ propertyId: 'p1', categories: ['A'], acknowledgedDisclaimer: 1 })).toMatchObject({ id: 'r9' });
    expect(net.last()).toMatchObject({ path: '/documents/requests', body: { propertyId: 'p1', categories: ['A'], acknowledgedDisclaimer: true } });
    expect(net.last().body.message).toBeUndefined();
    await docs.requestDocumentAccess();
    expect(net.last().body).toEqual({ categories: [], acknowledgedDisclaimer: false });
  });

  it('listMyDocumentRequests / granted documents / urls', async () => {
    net.reply([{ id: 'r' }]);
    await docs.listMyDocumentRequests({ propertyId: 'p1' });
    expect(net.last()).toMatchObject({ path: '/me/document-requests', query: { propertyId: 'p1', size: '100' } });
    net.reply({ content: [{ id: 'd' }] });
    expect(await docs.listMyGrantedDocuments('r 1')).toHaveLength(1);
    expect(net.last().path).toBe('/me/document-requests/r%201/documents');
    net.reply({ url: 'u' });
    expect(await docs.getGrantedDocumentUrl('r1', 'd1')).toBe('u');
    expect(net.last().path).toBe('/me/document-requests/r1/documents/d1/url');
    net.reply({});
    expect(await docs.getGrantedDocumentUrl('r1', 'd1')).toBeNull();
  });

  it('shared documents use the share token header and no auth', async () => {
    net.reply({ url: 'shared-u' });
    expect(await docs.getSharedDocumentUrl('tok', 'd1')).toBe('shared-u');
    expect(net.last()).toMatchObject({ path: '/documents/shared/url', query: { docId: 'd1' } });
    expect(net.last().headers['X-Share-Token']).toBe('tok');
    expect(net.last().headers.Authorization).toBeUndefined();
    net.reply([{ id: 'd' }]);
    expect(await docs.listSharedDocuments('tok')).toHaveLength(1);
    expect(net.last().headers['X-Share-Token']).toBe('tok');
    net.reply({ content: [{ id: 'd' }] });
    expect(await docs.listSharedDocuments('tok')).toHaveLength(1);
  });
});
