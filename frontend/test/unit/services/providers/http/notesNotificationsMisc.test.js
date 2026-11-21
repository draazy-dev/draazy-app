import { describe, expect, it, vi } from 'vitest';
import { setupFetch } from '../net.js';
import { toNote, toNotes, toWireType } from '../../../../../src/services/providers/http/noteMapper.js';
import * as notes from '../../../../../src/services/providers/http/noteProvider.js';
import { toUiType, toViewModel, toViewModelList } from '../../../../../src/services/providers/http/notificationMapper.js';
import * as notif from '../../../../../src/services/providers/http/notificationProvider.js';
import * as outreach from '../../../../../src/services/providers/http/outreachProvider.js';
import { recordPageViews } from '../../../../../src/services/providers/http/pageViewProvider.js';
import * as perms from '../../../../../src/services/providers/http/permissionsProvider.js';
import { uploadPhoto } from '../../../../../src/services/providers/http/photoProvider.js';
import * as photoReq from '../../../../../src/services/providers/http/photoRequestProvider.js';

describe('noteMapper', () => {
  it('toWireType maps aliases and rejects unknown types', () => {
    expect(toWireType('Listing')).toBe('property');
    expect(toWireType('service_request')).toBe('service_request');
    expect(() => toWireType('bogus')).toThrow('unknown entity type "bogus"');
    expect(() => toWireType()).toThrow('unknown entity type');
  });

  it('toNote marks edits only when updatedAt is later', () => {
    expect(toNote({ id: 5, entityType: 'user', authorName: 'A', authorId: 'u', createdAt: '2026-01-01', updatedAt: '2026-01-02', text: 't' }))
      .toEqual({ id: '5', entityType: 'user', entityId: '', author: 'A', action: '', text: 't', at: '2026-01-01', editedAt: '2026-01-02' });
    expect(toNote({ createdAt: '2026-01-01', updatedAt: '2026-01-01', authorId: 'u' })).toMatchObject({ author: 'u', editedAt: null });
    expect(toNote(null)).toMatchObject({ id: '', at: null, editedAt: null });
    expect(toNotes(null)).toEqual([]);
  });
});

describe('noteProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('lists notes for a wire type', async () => {
    net.reply([{ id: 1, text: 'x' }]);
    expect(await notes.listNotes('listing', 'p/1')).toMatchObject([{ id: '1', text: 'x' }]);
    expect(net.last().path).toBe('/admin/notes/property/p%2F1');
  });

  it('addNote trims text and only sends a non-empty action', async () => {
    net.reply({ id: 9, text: 'hi' });
    expect(await notes.addNote('user', 'u1', '  hi ', ' call ')).toMatchObject({ id: '9' });
    expect(net.last()).toMatchObject({ path: '/admin/notes/user/u1', method: 'POST', body: { text: 'hi', action: 'call' } });
    await notes.addNote('user', 'u1', null, '');
    expect(net.last().body).toEqual({ text: '' });
  });

  it('rejects before any request for an unknown entity type', async () => {
    await expect(notes.listNotes('zzz', '1')).rejects.toThrow('unknown entity type');
    expect(net.calls).toHaveLength(0);
  });
});

describe('notificationMapper', () => {
  it('toUiType', () => {
    expect(toUiType()).toBe('system');
    expect(toUiType('match')).toBe('match');
    expect(toUiType('match.saved-search')).toBe('match');
    expect(toUiType('flatmate.agreement.signed')).toBe('service');
    expect(toUiType('flatmate.review')).toBe('system');
    expect(toUiType('flatmate.other')).toBe('share');
    expect(toUiType('contact.returned')).toBe('contactReturned');
    expect(toUiType('contact.new')).toBe('enquiry');
    expect(toUiType('subscription.refund')).toBe('refund');
    expect(toUiType('sla')).toBe('sla');
  });

  it('toUiType warns once for unknown types and falls back to system', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(toUiType('mystery.type')).toBe('system');
    expect(toUiType('mystery.type')).toBe('system');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('mystery.type');
  });

  it('toViewModel maps fields', () => {
    expect(toViewModel(null)).toBeNull();
    expect(toViewModel({ id: 1, type: 'offer.new', title: 'T', body: 'B', read: 1, link: '/x', createdAt: '2026-01-01T00:00:00Z' })).toEqual({
      id: 1, type: 'price', wireType: 'offer.new', title: 'T', desc: 'B', read: true, link: '/x', at: Date.parse('2026-01-01T00:00:00Z'),
    });
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    try {
      expect(toViewModel({ id: 2 })).toMatchObject({ title: '', desc: '', read: false, link: undefined, at: 5000, type: 'system' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('toViewModelList accepts arrays and pages', () => {
    expect(toViewModelList([{ id: 1, type: 'match' }, null])).toHaveLength(1);
    expect(toViewModelList({ content: [{ id: 2 }] })).toHaveLength(1);
    expect(toViewModelList({})).toEqual([]);
  });
});

describe('notificationProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listNotifications sorts newest first and reports paging', async () => {
    net.reply({
      content: [
        { id: 'old', type: 'match', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'new', type: 'match', createdAt: '2026-02-01T00:00:00Z' },
      ],
      totalElements: 7,
      totalPages: 1,
      number: 2,
      size: 2,
    });
    const res = await notif.listNotifications({ read: false });
    expect(net.last().query).toEqual({ page: '0', size: '50', read: 'false' });
    expect(res.items.map((n) => n.id)).toEqual(['new', 'old']);
    expect(res).toMatchObject({ page: 2, size: 2, total: 7, totalPages: 1 });
  });

  it('listNotifications falls back to requested paging for a bare array', async () => {
    net.reply([{ id: 'a' }]);
    expect(await notif.listNotifications({ page: 3, size: 10 })).toMatchObject({ page: 3, size: 10, total: 1, totalPages: 0 });
  });

  it('unreadCount', async () => {
    net.reply({ count: '4' });
    expect(await notif.unreadCount()).toBe(4);
    net.reply(null);
    expect(await notif.unreadCount()).toBe(0);
  });

  it('markRead ignores empty ids, filters falsy ones and wraps single ids', async () => {
    await notif.markRead();
    await notif.markRead([null, '']);
    expect(net.calls).toHaveLength(0);
    await notif.markRead('n1');
    expect(net.last()).toMatchObject({ path: '/notifications/read', method: 'POST', body: { ids: ['n1'] } });
    await notif.markRead(['a', null, 'b']);
    expect(net.last().body).toEqual({ ids: ['a', 'b'] });
    await notif.markAllRead();
    expect(net.last().body).toEqual({});
  });

  it('dismiss deletes a single id and batches many in hundreds', async () => {
    await notif.dismiss('n1');
    expect(net.last()).toMatchObject({ path: '/notifications/n1', method: 'DELETE' });
    const ids = Array.from({ length: 250 }, (_, i) => `n${i}`);
    await notif.dismiss(ids);
    const posts = net.calls.filter((c) => c.path === '/notifications/dismiss');
    expect(posts.map((c) => c.body.ids.length)).toEqual([100, 100, 50]);
    const before = net.calls.length;
    await notif.dismiss([]);
    expect(net.calls).toHaveLength(before);
  });

  it('preferences and push subscriptions', async () => {
    net.reply({ email: true });
    expect(await notif.getNotificationPreferences()).toEqual({ email: true });
    await notif.updateNotificationPreferences({ email: false });
    expect(net.last()).toMatchObject({ path: '/me/notification-preferences', method: 'PUT', body: { email: false } });
    await notif.registerPushSubscription({ endpoint: 'e' });
    expect(net.last()).toMatchObject({ path: '/me/push-subscriptions', method: 'POST', body: { endpoint: 'e' } });
    await notif.unregisterPushSubscription('https://push/x?y');
    expect(net.last()).toMatchObject({ path: '/me/push-subscriptions', method: 'DELETE', query: { endpoint: 'https://push/x?y' } });
    const before = net.calls.length;
    await notif.unregisterPushSubscription('');
    expect(net.calls).toHaveLength(before);
  });
});

describe('outreachProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listOutreachTemplates defaults to whatsapp', async () => {
    net.reply([{ id: 3, name: 'N' }]);
    expect(await outreach.listOutreachTemplates()).toEqual([{ id: '3', channel: 'whatsapp', category: null, name: 'N', body: '' }]);
    expect(net.last().path).toBe('/admin/message-templates');
    expect(net.last().query).toEqual({ channel: 'whatsapp' });
    net.reply({});
    expect(await outreach.listOutreachTemplates('sms')).toEqual([]);
    expect(net.last().query.channel).toBe('sms');
  });

  it('chaseOwner returns the prepared message', async () => {
    net.reply({ id: 7, body: 'hi', handoffLink: 'wa.me/x' });
    expect(await outreach.chaseOwner('p/1', 't1')).toEqual({ id: '7', body: 'hi', status: 'prepared', handoffLink: 'wa.me/x' });
    expect(net.last()).toMatchObject({ path: '/properties/p%2F1/outreach', method: 'POST', body: { templateId: 't1' } });
  });

  it('listOwnerOutreach and markOutreachSent', async () => {
    net.reply([{ id: 1, preparedBy: 9, templateId: 't' }]);
    expect(await outreach.listOwnerOutreach('p1')).toEqual([{
      id: '1', templateId: 't', channel: 'whatsapp', body: '', status: 'prepared', preparedById: '9', preparedAt: null,
    }]);
    net.reply(null);
    expect(await outreach.listOwnerOutreach('p1')).toEqual([]);
    net.reply({ id: 2, status: 'sent' });
    expect(await outreach.markOutreachSent('p1', 'm 2')).toMatchObject({ id: '2', status: 'sent' });
    expect(net.last()).toMatchObject({ path: '/properties/p1/outreach/m%202/sent', method: 'POST' });
  });
});

describe('pageViewProvider', () => {
  const net = setupFetch();

  it('normalises the batch and returns true', async () => {
    expect(await recordPageViews({
      sessionId: 's1',
      events: [{ path: '/a', referrerHost: ' x.com ', device: 'm', agoMs: 12.6 }, { agoMs: -5 }, null],
      attributed: true,
    })).toBe(true);
    expect(net.last()).toMatchObject({ path: '/page-views', method: 'POST' });
    expect(net.last().body).toEqual({
      sessionId: 's1',
      events: [
        { path: '/a', referrerHost: 'x.com', device: 'm', agoMs: 13 },
        { path: '', device: '', agoMs: 0 },
        { path: '', device: '', agoMs: 0 },
      ],
      attributed: true,
    });
  });

  it('handles an empty batch', async () => {
    await recordPageViews();
    expect(net.last().body).toEqual({ sessionId: '', events: [], attributed: false });
  });
});

describe('permissionsProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('reads the catalogue and member permissions, and saves functions', async () => {
    net.reply({ functions: [] });
    expect(await perms.getFunctionCatalogue()).toEqual({ functions: [] });
    expect(net.last().path).toBe('/admin/function-catalogue');
    await perms.getMemberPermissions('u1');
    expect(net.last()).toMatchObject({ path: '/users/u1/permissions', method: 'GET' });
    await perms.saveMemberFunctions('u1', ['a']);
    expect(net.last()).toMatchObject({ path: '/users/u1/permissions', method: 'PUT', body: { functions: ['a'] } });
  });
});

describe('photoProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('uploads the file as multipart and returns the url', async () => {
    net.reply({ url: 'https://cdn/x.jpg', extra: 1 });
    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    expect(await uploadPhoto(file)).toEqual({ url: 'https://cdn/x.jpg' });
    expect(net.last()).toMatchObject({ path: '/me/photos', method: 'POST' });
    expect(net.last().init.body.get('file')).toBeInstanceOf(File);
  });

  it('throws a user-facing error when no url comes back', async () => {
    net.reply({});
    const err = await uploadPhoto(new File(['x'], 'x.jpg')).catch((e) => e);
    expect(err.message).toContain('did not return a usable URL');
    expect(err.name).toBe('UserError');
  });
});

describe('photoRequestProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('requests photos for a property', async () => {
    net.reply({ id: 'pr1' });
    expect(await photoReq.requestPhotos('a b')).toEqual({ id: 'pr1' });
    expect(net.last()).toMatchObject({ path: '/properties/a%20b/photo-requests', method: 'POST' });
  });

  it('myPhotoRequests unwraps pages', async () => {
    net.reply({ content: [{ id: 1 }], totalElements: 1, totalPages: 1, number: 0, size: 100 });
    expect(await photoReq.myPhotoRequests()).toEqual({ items: [{ id: 1 }], page: 0, size: 100, total: 1, totalPages: 1 });
    expect(net.last().query).toEqual({ page: '0', size: '100' });
    net.reply([{ id: 1 }, { id: 2 }]);
    expect(await photoReq.myPhotoRequests({ page: 2, size: 5 })).toMatchObject({ items: [{ id: 1 }, { id: 2 }], page: 2, size: 5, total: 2 });
  });

  it('decidePhotoRequest patches the decision', async () => {
    await photoReq.decidePhotoRequest('r 1', 'approved');
    expect(net.last()).toMatchObject({ path: '/me/photo-requests/r%201', method: 'PATCH', body: { decision: 'approved' } });
  });
});
