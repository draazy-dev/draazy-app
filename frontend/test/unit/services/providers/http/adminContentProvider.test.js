import { describe, expect, it } from 'vitest';
import { setupFetch } from '../net.js';
import {
  archiveContent, createContent, listContent, restoreContent, updateContent,
} from '../../../../../src/services/providers/http/adminContentProvider.js';

describe('adminContentProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('lists content with encoded type and filters, dropping empty query values', async () => {
    net.reply([{ id: 1 }]);
    expect(await listContent('help articles', { archived: true })).toEqual([{ id: 1 }]);
    const call = net.last();
    expect(call.path).toBe('/admin/content/help%20articles');
    expect(call.method).toBe('GET');
    expect(call.query).toEqual({ archived: 'true' });
  });

  it('returns an empty list for a non-array response', async () => {
    net.reply({ nope: true });
    expect(await listContent('faq')).toEqual([]);
  });

  it('creates content stripping undefined fields', async () => {
    net.reply({ id: 'n1' });
    expect(await createContent('faq', { title: 'T', body: undefined, order: 0 })).toEqual({ id: 'n1' });
    expect(net.last()).toMatchObject({ path: '/admin/content/faq', method: 'POST', body: { title: 'T', order: 0 } });
  });

  it('tolerates a missing body on create', async () => {
    await createContent('faq');
    expect(net.last().body).toEqual({});
  });

  it('updates with encoded ids', async () => {
    await updateContent('faq', 'a/b', { title: 'X', skip: undefined });
    expect(net.last()).toMatchObject({ path: '/admin/content/faq/a%2Fb', method: 'PATCH', body: { title: 'X' } });
  });

  it('archives and restores via POST', async () => {
    await archiveContent('faq', '7');
    expect(net.last()).toMatchObject({ path: '/admin/content/faq/7/archive', method: 'POST' });
    await restoreContent('faq', '7');
    expect(net.last()).toMatchObject({ path: '/admin/content/faq/7/restore', method: 'POST' });
  });
});
