import { describe, expect, it } from 'vitest';
import { setupFetch } from '../net.js';
import * as rm from '../../../../../src/services/providers/http/referralMapper.js';
import * as rp from '../../../../../src/services/providers/http/referralProvider.js';
import * as sm from '../../../../../src/services/providers/http/supportMapper.js';
import * as cm from '../../../../../src/services/providers/http/supportChatMapper.js';
import * as sp from '../../../../../src/services/providers/http/supportProvider.js';

describe('referralMapper', () => {
  it('toViewModel', () => {
    expect(rm.toViewModel(null)).toBeNull();
    expect(rm.toViewModel({ id: 1 })).toEqual({
      id: 1, referrer: '', referrerMobile: '', referred: '', referredMobile: '', track: null, reward: '', rewardAmount: 0, status: 'pending', risk: 'low',
      identityVerified: false, identityUnique: false, sameDevice: false, sameIp: false, velocityHigh: false, activated: false, holdUntil: 0, autoReason: '', at: 0,
    });
    expect(rm.toDecision({ id: 2, risk: 'high', holdUntil: '2026-01-01T00:00:00Z', at: 'garbage', sameIp: 1, rewardAmount: 0 }))
      .toMatchObject({ risk: 'high', holdUntil: Date.parse('2026-01-01T00:00:00Z'), at: 0, sameIp: true, rewardAmount: 0 });
  });

  it('toSummary', () => {
    expect(rm.toSummary(null)).toBeNull();
    expect(rm.toSummary({})).toEqual({
      code: '', invited: 0, joined: 0, qualified: 0, checking: 0,
      rewards: { earned: 0, used: 0, remaining: 0, locked: 0, discountPercent: 0 },
      friendReward: { redeemed: false, status: '', contacts: 0, featuredDays: 0 },
      friends: [],
    });
    const s = rm.toSummary({
      code: 'ABC', invited: '3', joined: 'x', rewards: { earned: 2, discountPercent: '10' },
      friendReward: { redeemed: 1, status: 'ok', contacts: 4, featuredDays: 7 },
      friends: [{ name: 'A', mobile: '9', at: 't', track: 'owner', state: 'qualified', kycPending: 'pan' }, {}],
    });
    expect(s).toMatchObject({ code: 'ABC', invited: 3, joined: 0, rewards: { earned: 2, discountPercent: 10 }, friendReward: { redeemed: true, contacts: 4, featuredDays: 7 } });
    expect(s.friends).toEqual([
      { name: 'A', mobile: '9', at: 't', track: 'owner', state: 'qualified', kycPending: 'pan' },
      { name: '', mobile: '', at: '', track: '', state: 'joined', kycPending: '' },
    ]);
  });

  it('toInviteResult', () => {
    expect(rm.toInviteResult(undefined)).toEqual({ delivery: 'sent', whatsappUrl: '' });
    expect(rm.toInviteResult({ delivery: 'sent', whatsappUrl: 'https://wa.me/1' })).toEqual({ delivery: 'sent', whatsappUrl: '' });
    expect(rm.toInviteResult({ delivery: 'open_whatsapp' })).toEqual({ delivery: 'sent', whatsappUrl: '' });
    expect(rm.toInviteResult({ delivery: 'open_whatsapp', whatsappUrl: 'https://wa.me/9199?text=hi' })).toEqual({ delivery: 'open_whatsapp', whatsappUrl: 'https://wa.me/9199?text=hi' });
    expect(() => rm.toInviteResult({ delivery: 'open_whatsapp', whatsappUrl: 'https://evil.com/x' })).toThrow('non-WhatsApp');
    expect(() => rm.toInviteResult({ delivery: 'open_whatsapp', whatsappUrl: 'http://wa.me/x' })).toThrow('non-WhatsApp');
    expect(() => rm.toInviteResult({ delivery: 'open_whatsapp', whatsappUrl: 'not a url' })).toThrow('non-WhatsApp');
  });

  it('toViewModelPage', () => {
    expect(rm.toViewModelPage(null)).toEqual({ items: [], total: 0, page: 0, size: 0, counts: null });
    expect(rm.toViewModelPage(undefined, { page: 2, size: 10 })).toMatchObject({ page: 2, size: 10 });
    expect(rm.toViewModelPage({ content: [{ id: 1 }, null], totalElements: 9, page: 1, size: 5, counts: { a: 1 } }))
      .toMatchObject({ total: 9, page: 1, size: 5, counts: { a: 1 }, items: [expect.objectContaining({ id: 1 })] });
  });
});

describe('referralProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('listReferralQueue only sends the filters that are set', async () => {
    net.reply({ content: [{ id: 'r1' }], totalElements: 1 });
    const page = await rp.listReferralQueue();
    expect(net.last()).toMatchObject({ path: '/referrals', query: { page: '0', size: '20' } });
    expect(page.items).toHaveLength(1);
    net.fresh();
    net.reply({});
    await rp.listReferralQueue({ status: 'pending', risk: 'high', q: 'x', days: 7, page: 2, size: 5, counts: true });
    expect(net.last().query).toEqual({ page: '2', size: '5', status: 'pending', risk: 'high', q: 'x', days: '7', counts: 'true' });
  });

  it.each([['approveReferral', 'approve'], ['rejectReferral', 'reject'], ['clawbackReferral', 'clawback']])('%s posts the trimmed reason', async (fn, verb) => {
    net.reply({ id: 'r/1', status: 'x' });
    expect(await rp[fn]('r/1', '  because ')).toMatchObject({ id: 'r/1' });
    expect(net.last()).toMatchObject({ path: `/referrals/r%2F1/${verb}`, method: 'POST', body: { reason: 'because' } });
    await rp[fn]('r1', '   ');
    expect(net.last().body).toBeUndefined();
    await rp[fn]('r1');
    expect(net.last().body).toBeUndefined();
  });

  it('my summary, invites and redeem', async () => {
    net.reply({ code: 'C', invited: 2 });
    expect(await rp.getMyReferralSummary()).toMatchObject({ code: 'C', invited: 2 });
    expect(net.last().path).toBe('/me/referrals');
    net.reply({ delivery: 'sent' });
    expect(await rp.sendReferralInvite('9999')).toEqual({ delivery: 'sent', whatsappUrl: '' });
    expect(net.last()).toMatchObject({ path: '/me/referrals/invites', body: { mobile: '9999' } });
    net.reply({ ok: true });
    expect(await rp.redeemReferral('C1', ' whatsapp ')).toEqual({ ok: true });
    expect(net.last()).toMatchObject({ path: '/referrals/redeem', body: { code: 'C1', shareChannel: 'whatsapp' } });
    await rp.redeemReferral('C1');
    expect(net.last().body).toEqual({ code: 'C1' });
  });
});

describe('supportMapper', () => {
  it('toMessage', () => {
    expect(sm.toMessage(null)).toBeNull();
    expect(sm.toMessage({ id: 1, authorRole: 'admin', body: 'b', createdAt: '2026-01-01T00:00:00Z' }))
      .toEqual({ id: 1, by: 'staff', name: 'Support', text: 'b', images: [], at: Date.parse('2026-01-01T00:00:00Z') });
    expect(sm.toMessage({ id: 2, author: 'Ann', authorRole: 'staff' })).toMatchObject({ by: 'staff', name: 'Ann', text: '', at: 0 });
    expect(sm.toMessage({ id: 3, authorRole: 'user', createdAt: 'bad' })).toMatchObject({ by: 'customer', name: 'You', at: 0 });
  });

  it('toViewModel', () => {
    expect(sm.toViewModel(null)).toBeNull();
    expect(sm.toViewModel({ id: 't' })).toEqual({
      id: 't', subject: '', category: 'other', about: null, status: 'open', priority: '', unread: false, createdAt: 0, updatedAt: 0, messages: [],
    });
    const vm = sm.toViewModel({
      id: 't', subject: 'S', category: 'billing', about: { type: 'property', id: 9 }, status: 'closed', unread: 1,
      createdAt: '2026-01-01T00:00:00Z',
      messages: [{ id: 1, createdAt: '2026-01-02T00:00:00Z' }, null, { id: 2, createdAt: '2025-01-01T00:00:00Z' }],
    });
    expect(vm.about).toEqual({ type: 'property', id: '9' });
    expect(vm.messages).toHaveLength(2);
    expect(vm.updatedAt).toBe(Date.parse('2026-01-01T00:00:00Z'));
    expect(sm.toViewModel({ id: 't', about: { type: 'x' } }).about).toBeNull();
  });

  it('toSummary and toSummaryList', () => {
    expect(sm.toSummary(null)).toBeNull();
    expect(sm.toSummary({ id: 't' })).toMatchObject({ category: 'other', status: 'open', unread: false, lastMessage: null, updatedAt: 0 });
    const s = sm.toSummary({ id: 't', createdAt: '2026-01-01T00:00:00Z', lastMessage: { authorRole: 'manager', body: 'b', createdAt: '2026-02-01T00:00:00Z' } });
    expect(s.lastMessage).toEqual({ by: 'staff', text: 'b', at: Date.parse('2026-02-01T00:00:00Z') });
    expect(s.updatedAt).toBe(Date.parse('2026-02-01T00:00:00Z'));
    expect(sm.toSummary({ id: 't', lastMessage: {} }).lastMessage).toEqual({ by: 'customer', text: '', at: 0 });
    const list = sm.toSummaryList([{ id: 'old', createdAt: '2025-01-01T00:00:00Z' }, null, { id: 'new', createdAt: '2026-01-01T00:00:00Z' }]);
    expect(list.map((t) => t.id)).toEqual(['new', 'old']);
    expect(sm.toSummaryList(null)).toEqual([]);
  });

  it('toTicketCreate', () => {
    expect(sm.toTicketCreate()).toEqual({ subject: '', category: 'other', body: '' });
    expect(sm.toTicketCreate({ subject: ' S ', category: 'billing', message: ' M ', about: { type: 'p', id: 1 } }))
      .toEqual({ subject: 'S', category: 'billing', body: 'M', about: { type: 'p', id: 1 } });
  });
});

describe('supportChatMapper', () => {
  it('toChatAbout and toChatSend', () => {
    expect(cm.toChatAbout()).toEqual({ type: 'general', id: null, label: null });
    expect(cm.toChatAbout({ type: 'property', id: 5, label: 'L' })).toEqual({ type: 'property', id: '5', label: 'L' });
    expect(cm.toChatSend(' hi ')).toEqual({ text: 'hi', about: null });
    expect(cm.toChatSend('hi', { type: 'general' })).toEqual({ text: 'hi', about: null });
    expect(cm.toChatSend('hi', { type: 'property', id: 5 })).toEqual({ text: 'hi', about: { type: 'property', id: '5' } });
    expect(cm.toChatSend(null).text).toBe('');
  });

  it('toChatMessage maps the viewer side', () => {
    expect(cm.toChatMessage(null, 'me')).toBeNull();
    expect(cm.toChatMessage({ id: 1, from: 'me', text: 't', at: '2026-01-01T00:00:00Z' }, 'me'))
      .toEqual({ id: 1, from: 'me', staffName: null, text: 't', at: Date.parse('2026-01-01T00:00:00Z'), about: { type: 'general', id: null, label: null } });
    expect(cm.toChatMessage({ id: 2, from: 'staff', staffName: 'S' }, 'me')).toMatchObject({ from: 'them', staffName: 'S', text: '', at: 0 });
    expect(cm.toChatMessage({ id: 3, from: 'staff' }, 'staff').from).toBe('me');
  });

  it('toSupportChat', () => {
    expect(cm.toSupportChat()).toEqual({ status: 'none', assignee: null, messages: [], cases: [], at: 0, last: '', unread: 0 });
    const chat = cm.toSupportChat({
      status: 'open', unread: '2', assignee: { id: 7, name: '' }, messages: [{ id: 1, from: 'me', text: 'a', at: '2026-01-01T00:00:00Z' }, null, { id: 2, from: 'staff', text: 'b', at: '2026-01-02T00:00:00Z' }],
      cases: [{ type: 'ticket', id: 4, label: 'L', status: 's', replyable: false }, { type: 'x', id: 5 }],
    });
    expect(chat).toMatchObject({ status: 'open', unread: 2, assignee: { id: '7', name: 'Draazy support' }, last: 'b', at: Date.parse('2026-01-02T00:00:00Z') });
    expect(chat.messages.map((m) => m.from)).toEqual(['me', 'them']);
    expect(chat.cases).toEqual([
      { type: 'ticket', id: '4', label: 'L', status: 's', replyable: false },
      { type: 'x', id: '5', label: '', status: '', replyable: true },
    ]);
    expect(cm.toSupportChat({ assignee: { name: 'Ann' } }).assignee).toEqual({ id: null, name: 'Ann' });
  });

  it('toStaffSupportChat and toSupportChatRow', () => {
    expect(cm.toStaffSupportChat()).toMatchObject({ user: { id: '', name: 'Customer', mobile: '', idVerified: false, roles: [] } });
    const chat = cm.toStaffSupportChat({ user: { id: 3, name: 'N', mobile: '9', idVerified: 1, roles: ['owner'] }, messages: [{ id: 1, from: 'staff', text: 'x' }, { id: 2, from: 'user', text: 'y' }] });
    expect(chat.user).toEqual({ id: '3', name: 'N', mobile: '9', idVerified: true, roles: ['owner'] });
    expect(chat.messages.map((m) => m.from)).toEqual(['me', 'them']);
    expect(cm.toSupportChatRow({ userId: 9 })).toEqual({
      userId: '9', name: 'Customer', status: 'awaiting', assignee: null, staffUnread: false, lastAt: 0, lastPreview: '', lastFrom: 'user',
      lastAbout: { type: 'general', id: null, label: null },
    });
    expect(cm.toSupportChatRow({ userId: 1, name: 'A', status: 's', staffUnread: 1, lastAt: '2026-01-01T00:00:00Z', lastPreview: 'p', lastFrom: 'staff', assignee: { id: 2, name: 'B' } }))
      .toMatchObject({ staffUnread: true, lastFrom: 'staff', lastAt: Date.parse('2026-01-01T00:00:00Z'), assignee: { id: '2', name: 'B' } });
  });
});

describe('supportProvider', () => {
  const net = setupFetch({ signedIn: true });

  it('customer chat', async () => {
    net.reply({ status: 'open', unread: 1 });
    expect(await sp.getSupportChat()).toMatchObject({ status: 'open', unread: 1 });
    expect(net.last().path).toBe('/support/chat');
    net.reply({ id: 1, from: 'me', text: 'hi' });
    expect(await sp.sendSupportChatMessage(' hi ', { type: 'property', id: 3 })).toMatchObject({ id: 1, from: 'me', text: 'hi' });
    expect(net.last()).toMatchObject({ path: '/support/chat/messages', method: 'POST', body: { text: 'hi', about: { type: 'property', id: '3' } } });
    await sp.markSupportChatRead();
    expect(net.last()).toMatchObject({ path: '/support/chat/read', method: 'POST' });
    net.reply({ count: '4' });
    expect(await sp.supportChatUnreadCount()).toBe(4);
    net.fresh();
    net.reply({ count: 'x' });
    expect(await sp.supportChatUnreadCount()).toBe(0);
    net.fresh();
    net.reply(null);
    expect(await sp.supportChatUnreadCount()).toBe(0);
  });

  it('staff chat lists and counts', async () => {
    net.reply({ content: [{ userId: 1 }], totalElements: 9 });
    expect(await sp.listSupportChats({ view: 'mine', context: 'rent', page: 1, size: 5 })).toMatchObject({ total: 9, page: 1, size: 5, items: [expect.objectContaining({ userId: '1' })] });
    expect(net.last()).toMatchObject({ path: '/admin/support/chats', query: { view: 'mine', page: '1', size: '5', context: 'rent' } });
    net.reply({});
    expect(await sp.listSupportChats()).toEqual({ items: [], total: 0, page: 0, size: 30 });
    expect(net.last().query).toEqual({ view: 'awaiting', page: '0', size: '30' });
    net.reply({ awaiting: '2', mine: 1, scope: { full: 1, contexts: ['a'] } });
    expect(await sp.supportChatCounts()).toEqual({ awaiting: 2, mine: 1, all: 0, scope: { full: true, contexts: ['a'] } });
    net.fresh();
    net.reply({ scope: { contexts: 'x' } });
    expect((await sp.supportChatCounts()).scope).toEqual({ full: false, contexts: [] });
    net.fresh();
    net.reply(null);
    expect(await sp.supportChatCounts()).toEqual({ awaiting: 0, mine: 0, all: 0, scope: null });
  });

  it('staff chat actions', async () => {
    net.reply({ user: { id: 1 }, messages: [{ id: 1, from: 'user', text: 'x' }] });
    expect((await sp.getStaffSupportChat('u/1')).messages[0].from).toBe('them');
    expect(net.last().path).toBe('/admin/support/chats/u%2F1');
    net.reply({ id: 2, from: 'staff', text: 'r' });
    expect(await sp.replyToSupportChat('u1', 'r')).toMatchObject({ from: 'me' });
    expect(net.last()).toMatchObject({ path: '/admin/support/chats/u1/messages', body: { text: 'r', about: null } });
    await sp.assignSupportChat('u1');
    expect(net.last()).toMatchObject({ path: '/admin/support/chats/u1/assign', body: { assigneeId: null } });
    await sp.assignSupportChat('u1', 'a9');
    expect(net.last().body).toEqual({ assigneeId: 'a9' });
    await sp.resolveSupportChat('u1');
    expect(net.last().path).toBe('/admin/support/chats/u1/resolve');
    await sp.markStaffSupportChatRead('u1');
    expect(net.last().path).toBe('/admin/support/chats/u1/read');
    net.reply({ userId: 5, name: '', count: 'x' });
    expect(await sp.locateSupportChat({ type: 'ticket', id: 12 })).toEqual({ userId: '5', name: 'Customer', count: 0 });
    expect(net.last().query).toEqual({ type: 'ticket', id: '12' });
    net.reply({ id: 8, team: 'legal' });
    expect(await sp.createServiceTicketFromChat('u1', { team: 'legal', subject: ' S ', note: '  ', propertyId: '' })).toEqual({ id: '8', team: 'legal' });
    expect(net.last()).toMatchObject({ path: '/admin/support/chats/u1/service-ticket', body: { team: 'legal', subject: 'S', note: null, propertyId: null } });
    await sp.createServiceTicketFromChat('u1', { team: 't', note: ' n ', propertyId: 'p' }).catch(() => {});
    expect(net.last().body).toEqual({ team: 't', subject: '', note: 'n', propertyId: 'p' });
  });

  it('tickets', async () => {
    net.reply([{ id: 'a', createdAt: '2025-01-01T00:00:00Z' }, { id: 'b', createdAt: '2026-01-01T00:00:00Z' }]);
    expect((await sp.listTickets()).map((t) => t.id)).toEqual(['b', 'a']);
    net.reply({ id: 't', subject: 'S' });
    expect(await sp.createTicket({ subject: 'S', message: 'M' })).toMatchObject({ id: 't', subject: 'S' });
    expect(net.last()).toMatchObject({ path: '/support/tickets', method: 'POST', body: { subject: 'S', category: 'other', body: 'M' } });
    net.reply({ id: 'm', authorRole: 'user', body: 'r' });
    expect(await sp.replyToTicket('t/1', ' r ')).toMatchObject({ id: 'm', by: 'customer' });
    expect(net.last()).toMatchObject({ path: '/support/tickets/t%2F1/messages', body: { body: 'r' } });
    await sp.replyToTicket('t1');
    expect(net.last().body).toEqual({ body: '' });
    await sp.markTicketRead('t1');
    expect(net.last()).toMatchObject({ path: '/support/tickets/t1/read', method: 'POST' });
  });
});
