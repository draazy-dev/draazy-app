import { describe, expect, it, vi } from 'vitest';
import { setupFetch, status } from '../net.js';
import { writeUser } from '../../../../../src/lib/auth.js';
import * as cm from '../../../../../src/services/providers/http/conversationMapper.js';
import * as cp from '../../../../../src/services/providers/http/conversationProvider.js';

const QUEUE = 'dzPendingRequests';
const stored = () => JSON.parse(localStorage.getItem(QUEUE) || '[]');

describe('conversationMapper', () => {
  it('toMessage', () => {
    expect(cm.toMessage(null)).toBeNull();
    expect(cm.toMessage({ id: 1, mine: true, body: 'hi', createdAt: '2026-01-01T00:00:00Z', read: 1, delivered: 1, attachments: [1], replyTo: 2, author: 'a', clientId: 'c' })).toEqual({
      id: 1, clientId: 'c', from: 'me', text: 'hi', at: Date.parse('2026-01-01T00:00:00Z'), read: true, delivered: true, attachments: [1], replyTo: 2, author: 'a',
    });
    const bare = cm.toMessage({ id: 2 });
    expect(bare).toMatchObject({ from: 'them', text: '', read: false, delivered: false, attachments: [], replyTo: null, clientId: undefined, author: undefined });
    expect(typeof bare.at).toBe('number');
  });

  it('toViewModel for a property conversation', () => {
    expect(cm.toViewModel(null)).toBeNull();
    const vm = cm.toViewModel({
      id: 'c1', propertyId: 'p', propertySlug: 's', counterpartyId: 'u', counterpartyName: 'Asha Rao', counterpartyRole: 'owner', counterpartyMobile: '9',
      propertyPrice: 1500000, propertyDeal: 'sale', propertyTitle: 'Flat', propertyBhk: '2', propertyLocality: 'Baner', propertyCover: 'c.jpg',
      updatedAt: '2026-01-02T00:00:00Z', unread: 3, lastMessage: 'yo', presence: 'online', archived: 1, muted: 1, blocked: 1, blockedYou: 1, listingDeleted: 1, awaitingReply: 1,
      messages: [{ id: 1 }], flatmateKind: 'group', flatmateTargetId: 'f',
    });
    expect(vm).toMatchObject({
      id: 'c1', propertyId: 'p', propertySlug: 's', group: null, flatmate: { kind: 'group', id: 'f' }, youAre: 'buyer', staged: false, at: Date.parse('2026-01-02T00:00:00Z'),
      unread: 3, lastMessage: 'yo', presence: 'online', archived: true, muted: true, blocked: true, blockedYou: true, listingDeleted: true, awaitingReply: true,
      party: { id: 'u', name: 'Asha Rao', avatar: 'AR', role: 'Owner', mobile: '9' },
      property: { title: 'Flat', slug: 's', price: '₹15,00,000', deal: 'sale', bhk: '2', loc: 'Baner', img: 'c.jpg', available: true },
    });
    expect(vm.messages).toHaveLength(1);
  });

  it('toViewModel defaults, rent price and unavailable listings', () => {
    const vm = cm.toViewModel({ id: 'c', propertyPrice: 20000, propertyDeal: 'rent' });
    expect(vm.property.price).toBe('₹20,000/mo');
    expect(vm).toMatchObject({ party: { name: 'Draazy user', avatar: 'DU', role: 'Buyer', mobile: '' }, youAre: 'owner', unread: 0, lastMessage: '', presence: null, flatmate: null, messages: [] });
    expect(vm.property).toMatchObject({ title: 'Conversation', deal: 'rent', bhk: '', loc: '' });
    expect(cm.toViewModel({ id: 'c', counterpartyName: '  ' }).party.avatar).toBe('PN');
    expect(cm.toViewModel({ id: 'c', youAre: 'seller' }).youAre).toBe('seller');
    const gone = cm.toViewModel({ id: 'c', propertyAvailable: false, propertyPrice: 5, propertyLocality: 'X', propertyCover: 'i' });
    expect(gone.property).toMatchObject({ price: '', loc: '', img: undefined, available: false });
    expect(cm.toViewModel({ id: 'c', propertyPrice: 'abc' }).property.price).toBe('');
  });

  it('toViewModel for a group', () => {
    const vm = cm.toViewModel({ id: 'g', kind: 'group', groupId: 'gid', groupTitle: 'Flatmates', memberCount: 4, counterpartyName: 'ignored' });
    expect(vm.group).toEqual({ id: 'gid', title: 'Flatmates', memberCount: 4 });
    expect(vm.party).toMatchObject({ name: 'Flatmates', role: 'Group', avatar: 'F' });
    expect(vm.youAre).toBe('member');
    expect(vm.property).toEqual({ title: 'Flatmates', price: '', loc: '', img: undefined, available: true });
    expect(cm.toViewModel({ id: 'g', kind: 'group' }).group).toEqual({ id: undefined, title: 'Group', memberCount: 0 });
  });

  it('toViewModelList accepts arrays and pages', () => {
    expect(cm.toViewModelList([{ id: 1 }, null])).toHaveLength(1);
    expect(cm.toViewModelList({ content: [{ id: 1 }, { id: 2 }] })).toHaveLength(2);
    expect(cm.toViewModelList(null)).toEqual([]);
  });

  it('stagedToViewModel', () => {
    const vm = cm.stagedToViewModel({
      propertyId: 'p1', propertySlug: 's', at: 5, firstMessage: 'hello',
      property: { title: 'T', price: '₹1500000', deal: 'sale' }, party: { name: 'Bob' },
    });
    expect(vm).toMatchObject({
      id: 'staged:p1', staged: true, propertyId: 'p1', propertySlug: 's', youAre: 'buyer', at: 5, unread: 0, lastMessage: 'hello',
      property: { title: 'T', price: expect.stringContaining('15') },
      party: { name: 'Bob', online: false, avatar: 'B', role: 'Owner', mobile: '' },
      messages: [{ id: 'staged-1', from: 'me', text: 'hello', at: 5, read: false }],
    });
    expect(cm.stagedToViewModel({ propertyId: 'p', property: { price: '₹2000000', deal: 'rent' } }).property.price).toMatch(/\/mo$/);
    expect(cm.stagedToViewModel({ propertyId: 'p', property: { price: '₹1,000' } }).property.price).toBe('₹1,000');
    const bare = cm.stagedToViewModel({ propertyId: 'p' });
    expect(bare).toMatchObject({ lastMessage: '', messages: [], party: { name: 'Owner', avatar: 'O' }, property: { title: 'Conversation', price: '', loc: '', img: '' } });
    expect(cm.stagedToViewModel({ propertyId: 'p', property: { price: 99 } }).property.price).toBe(99);
  });

  it('toConversationCreate only includes provided fields', () => {
    expect(cm.toConversationCreate({ body: 'b' })).toEqual({ body: 'b' });
    expect(cm.toConversationCreate({ counterpartyMobile: '9', propertyId: 'p', body: 'b', clientId: 'c' })).toEqual({ body: 'b', counterpartyMobile: '9', propertyId: 'p', clientId: 'c' });
  });
});

describe('conversationProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listConversations merges staged chats not yet live, newest first', async () => {
    localStorage.setItem(QUEUE, JSON.stringify([
      { userId: null, propertyId: 'p-live', at: 1, property: { title: 'live' } },
      { userId: null, propertyId: 'p-slug', propertySlug: 'slug-live', at: 2 },
      { userId: null, propertyId: 'p-new', at: 9999999999999, property: { title: 'new' } },
      { userId: 'someone-else', propertyId: 'p-other', at: 3 },
    ]));
    net.reply({ content: [{ id: 'c1', propertyId: 'p-live', updatedAt: '2026-01-01T00:00:00Z' }, { id: 'c2', propertySlug: 'slug-live', updatedAt: '2026-01-02T00:00:00Z' }], totalElements: 2 });
    const list = await cp.listConversations();
    expect(net.last()).toMatchObject({ path: '/messages', query: { size: '100' } });
    expect(list.map((c) => c.id)).toEqual(['staged:p-new', 'c2', 'c1']);
  });

  it('listConversations warns when the page is truncated', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    net.reply({ content: [], totalElements: 5 });
    expect(await cp.listConversations()).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('5 threads exist but only 0'));
    net.fresh();
    warn.mockClear();
    net.reply([]);
    await cp.listConversations();
    expect(warn).not.toHaveBeenCalled();
  });

  it('listConversations tolerates corrupt queue storage', async () => {
    localStorage.setItem(QUEUE, '{bad');
    net.reply([]);
    expect(await cp.listConversations()).toEqual([]);
    localStorage.setItem(QUEUE, '{"a":1}');
    net.fresh();
    net.reply([]);
    expect(await cp.listConversations()).toEqual([]);
  });

  it('getConversation', async () => {
    localStorage.setItem(QUEUE, JSON.stringify([{ userId: null, propertyId: 'p1' }]));
    expect((await cp.getConversation('staged:p1')).id).toBe('staged:p1');
    expect(await cp.getConversation('staged:none')).toBeNull();
    expect(net.calls).toHaveLength(0);
    net.reply({ id: 'c/1' });
    expect((await cp.getConversation('c/1')).id).toBe('c/1');
    expect(net.last().path).toBe('/messages/c%2F1');
    net.fresh();
    net.reply(status(404, {}));
    expect(await cp.getConversation('c2')).toBeNull();
    net.fresh();
    net.reply(status(500, {}));
    await expect(cp.getConversation('c3')).rejects.toMatchObject({ status: 500 });
  });

  it('startConversation and replyToConversation', async () => {
    net.reply({ id: 'c1' });
    expect((await cp.startConversation({ counterpartyMobile: '9', propertyId: 'p', firstMessage: 'hi', clientId: 'k' })).id).toBe('c1');
    expect(net.last()).toMatchObject({ path: '/messages', method: 'POST', body: { body: 'hi', counterpartyMobile: '9', propertyId: 'p', clientId: 'k' } });
    net.reply({ id: 'x' });
    await cp.startConversation();
    net.reply({ id: 9, body: 'yo' });
    expect(await cp.replyToConversation('c/1', 'yo')).toMatchObject({ id: 9, text: 'yo' });
    expect(net.last()).toMatchObject({ path: '/messages/c%2F1/reply', method: 'POST', body: { body: 'yo' } });
    net.reply({ id: 10 });
    await cp.replyToConversation('c1', { body: 'b', clientId: 'k', replyToId: 4 });
    expect(net.last().body).toEqual({ body: 'b', clientId: 'k', replyToId: 4 });
  });

  it('sendConversationPhoto uploads multipart', async () => {
    const file = new File(['x'], 'p.png', { type: 'image/png' });
    net.reply({ id: 3 });
    expect(await cp.sendConversationPhoto('c/1', { file, caption: 'cap', clientId: 'k' })).toMatchObject({ id: 3 });
    const sent = net.last();
    expect(sent).toMatchObject({ path: '/messages/c%2F1/photos', method: 'POST' });
    expect(sent.init.body.get('file')).toBe(file);
    expect(sent.init.body.get('caption')).toBe('cap');
    expect(sent.init.body.get('clientId')).toBe('k');
    await cp.sendConversationPhoto('c1', { file });
    expect(net.last().init.body.has('caption')).toBe(false);
    expect(net.last().init.body.has('clientId')).toBe(false);
  });

  it('state, delete, block, read and typing calls', async () => {
    await cp.updateConversationState('staged:1', { muted: true });
    await cp.markConversationRead('staged:1');
    await cp.sendTyping('staged:1');
    expect(net.calls).toHaveLength(0);
    await cp.updateConversationState('c/1', { muted: true });
    expect(net.last()).toMatchObject({ path: '/messages/c%2F1/state', method: 'PATCH', body: { muted: true } });
    await cp.deleteMessageForMe('c1', 'm/1');
    expect(net.last()).toMatchObject({ path: '/messages/c1/items/m%2F1', method: 'DELETE' });
    await cp.setConversationBlocked('c1', true);
    expect(net.last()).toMatchObject({ path: '/messages/c1/block', method: 'POST', body: {} });
    await cp.setConversationBlocked('c1', false);
    expect(net.last()).toMatchObject({ path: '/messages/c1/block', method: 'DELETE' });
    await cp.markConversationRead('c1');
    expect(net.last()).toMatchObject({ path: '/messages/c1/read', method: 'POST', body: {} });
    await cp.sendTyping('c1');
    expect(net.last()).toMatchObject({ path: '/messages/c1/typing', method: 'POST', body: {} });
  });

  it('opens group, flatmate-request and lead-request conversations', async () => {
    net.reply({ id: 'g' });
    expect((await cp.openGroupConversation('g/1')).id).toBe('g');
    expect(net.last()).toMatchObject({ path: '/messages/flatmate-groups/g%2F1', method: 'POST', body: {} });
    net.reply(status(404, {}));
    expect(await cp.openGroupConversation('g2')).toBeNull();
    net.reply(status(500, {}));
    await expect(cp.openGroupConversation('g3')).rejects.toMatchObject({ status: 500 });
    net.reply({ id: 'f' });
    expect((await cp.openFlatmateRequestConversation('r/1')).id).toBe('f');
    expect(net.last().path).toBe('/messages/flatmate-requests/r%2F1');
    net.reply({ id: 'l' });
    expect((await cp.openLeadRequestConversation('visit', 'r/1')).id).toBe('l');
    expect(net.last().path).toBe('/messages/requests/visit/r%2F1');
  });

  it('unreadCount', async () => {
    net.reply({ count: 4 });
    expect(await cp.unreadCount()).toBe(4);
    net.fresh();
    net.reply({});
    expect(await cp.unreadCount()).toBe(0);
  });

  it('openMessageStream streams from /messages/stream', async () => {
    net.reply(status(200, 'data: {}\n\n', { 'content-type': 'text/event-stream' }));
    const onOpen = vi.fn();
    await cp.openMessageStream({ onOpen, onEvent: vi.fn(), signal: new AbortController().signal }).catch(() => {});
    expect(net.last().path).toBe('/messages/stream');
  });

  describe('pending chat queue', () => {
    const property = { id: 7, title: 'Nice flat', price: 25000, deal: 'rent', locality: 'Baner', image: 'i.jpg', owner: 'Asha', slug: 'nice-flat' };

    it('queues a chat with a greeting and metadata', async () => {
      await cp.queuePendingChat({});
      await cp.queuePendingChat(null);
      expect(stored()).toEqual([]);
      await cp.queuePendingChat(property);
      const [q] = stored();
      expect(q).toMatchObject({
        kind: 'chat', userId: null, propertyId: '7', propertySlug: 'nice-flat',
        property: { title: 'Nice flat', loc: 'Baner, Pune', img: 'i.jpg' }, party: { name: 'Asha', role: 'Owner' },
        firstMessage: 'Hi, I\'m interested in "Nice flat" on Draazy. Is it still available?',
      });
      expect(q.property.price).toMatch(/\/mo$/);
      expect(q.clientId).toMatch(/^q/);
    });

    it('applies fallbacks for sparse properties', async () => {
      await cp.queuePendingChat({ id: 1, uuid: 'u-1' }, { firstMessage: 'hey' });
      expect(stored()[0]).toMatchObject({
        propertyId: 'u-1', propertySlug: '1', firstMessage: 'hey',
        property: { title: 'Property', price: '', loc: 'Pune', img: '' }, party: { name: 'Owner' },
      });
      await cp.queuePendingChat({ id: 2, priceStr: '₹5L', price: 1, img: 'x' });
      expect(stored()[1]).toMatchObject({ propertyId: '2', propertySlug: null, property: { price: '₹5L', img: 'x' } });
      await cp.queuePendingChat({ id: 3, price: 5000000, deal: 'sale' });
      expect(stored()[2].property.price).not.toMatch(/\/mo$/);
      await cp.queuePendingChat({ id: 4, title: undefined });
      expect(stored()[3].firstMessage).toContain('this property');
    });

    it('does not duplicate a staged chat but updates its first message', async () => {
      await cp.queuePendingChat(property);
      const before = stored()[0].firstMessage;
      await cp.queuePendingChat(property);
      expect(stored()).toHaveLength(1);
      expect(stored()[0].firstMessage).toBe(before);
      await cp.queuePendingChat({ id: 'other', slug: 'nice-flat' }, { firstMessage: 'new text' });
      expect(stored()).toHaveLength(1);
      expect(stored()[0].firstMessage).toBe('new text');
    });

    it('opens immediately when active and the post succeeds', async () => {
      net.reply({ id: 'c' });
      await cp.queuePendingChat(property, { active: true });
      expect(net.last()).toMatchObject({ path: '/messages', method: 'POST', body: { propertyId: '7', clientId: 'open:7' } });
      expect(stored()).toEqual([]);
      net.reply({ id: 'c' });
      await cp.queuePendingChat(property, { active: true, firstMessage: 'hi' });
      expect(net.last().body).toMatchObject({ body: 'hi', clientId: expect.stringMatching(/^q/) });
    });

    it('falls back to queueing when the immediate open fails', async () => {
      net.reply(status(500, {}));
      await cp.queuePendingChat(property, { active: true });
      expect(stored()).toHaveLength(1);
    });

    it('dropPendingChat removes this viewer\'s matching entries only', () => {
      localStorage.setItem(QUEUE, JSON.stringify([
        { userId: null, propertyId: 'a' }, { userId: null, propertyId: 'b', propertySlug: 'sb' }, { userId: 'o', propertyId: 'a' }, null,
      ]));
      cp.dropPendingChat();
      cp.dropPendingChat(null, '');
      expect(stored()).toHaveLength(4);
      cp.dropPendingChat('a', 'sb');
      expect(stored()).toEqual([{ userId: 'o', propertyId: 'a' }, null]);
      localStorage.setItem(QUEUE, '{"x":1}');
      cp.dropPendingChat('a');
      localStorage.setItem(QUEUE, '{bad');
      expect(() => cp.dropPendingChat('a')).not.toThrow();
    });

    it('drainPendingChats posts every queued chat and keeps the failed ones', async () => {
      expect(await cp.drainPendingChats()).toEqual({ sent: 0, blocked: 0 });
      localStorage.setItem(QUEUE, JSON.stringify([
        { userId: null, propertyId: 'a', firstMessage: 'one', clientId: 'k1' },
        { userId: null, propertyId: 'b', firstMessage: 'two' },
      ]));
      net.on((call) => (call.body.propertyId === 'b' ? status(500, {}) : { id: 'c' }));
      const first = cp.drainPendingChats();
      expect(cp.drainPendingChats()).toBe(first);
      expect(await first).toEqual({ sent: 1, blocked: 1 });
      expect(net.calls[0].body).toEqual({ body: 'one', propertyId: 'a', clientId: 'k1' });
      expect(net.calls[1].body.clientId).toMatch(/^q/);
      expect(stored().map((q) => q.propertyId)).toEqual(['b']);
      expect(stored()[0].clientId).toMatch(/^q/);
    });
  });

  describe('viewer-scoped state', () => {
    it('reads only the signed-in viewer\'s queue', async () => {
      writeUser({ id: 'u1' });
      localStorage.setItem(QUEUE, JSON.stringify([{ userId: 'u1', propertyId: 'mine' }, { userId: 'u2', propertyId: 'theirs' }]));
      net.reply([]);
      expect((await cp.listConversations()).map((c) => c.id)).toEqual(['staged:mine']);
    });

    it('clearConversationDeviceState drops the viewer\'s drafts but keeps other users\' queued chats', () => {
      writeUser({ id: 'u1' });
      localStorage.setItem(QUEUE, JSON.stringify([{ userId: 'u1', propertyId: 'mine' }, { userId: 'u2', propertyId: 'theirs' }, { propertyId: 'anon' }]));
      localStorage.setItem('dzDismissedNotifs', '[1]');
      sessionStorage.setItem('dzMsgDraft:c1', 'x');
      sessionStorage.setItem('keep', 'y');
      cp.clearConversationDeviceState();
      expect(stored()).toEqual([{ userId: 'u2', propertyId: 'theirs' }]);
      expect(localStorage.getItem('dzDismissedNotifs')).toBeNull();
      expect(sessionStorage.getItem('dzMsgDraft:c1')).toBeNull();
      expect(sessionStorage.getItem('keep')).toBe('y');
    });

    it('clearConversationDeviceState removes the key when nothing remains and tolerates bad data', () => {
      localStorage.setItem(QUEUE, JSON.stringify([{ userId: null, propertyId: 'a' }]));
      cp.clearConversationDeviceState();
      expect(localStorage.getItem(QUEUE)).toBeNull();
      localStorage.setItem(QUEUE, '{bad');
      expect(() => cp.clearConversationDeviceState()).not.toThrow();
      localStorage.setItem(QUEUE, '{"a":1}');
      cp.clearConversationDeviceState();
      expect(localStorage.getItem(QUEUE)).toBe('{"a":1}');
    });
  });
});
