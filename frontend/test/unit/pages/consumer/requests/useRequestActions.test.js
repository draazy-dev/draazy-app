import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  openChat: vi.fn(),
  refreshRequests: vi.fn(),
}));

vi.mock('react-router', () => ({ useNavigate: () => h.navigate }));
vi.mock('../../../../../src/context/ConversationContext.jsx', () => ({ useConversationUnread: () => ({ refreshRequests: h.refreshRequests }) }));
vi.mock('../../../../../src/lib/useOpenChat.js', () => ({ useOpenChat: () => h.openChat }));
vi.mock('../../../../../src/services/contactService.js', () => ({ myContactRequests: vi.fn(), respondToContactRequest: vi.fn() }));
vi.mock('../../../../../src/services/conversationService.js', () => ({
  dropPendingChat: vi.fn(),
  openFlatmateRequestConversation: vi.fn(),
  openLeadRequestConversation: vi.fn(),
  startConversation: vi.fn(),
}));
vi.mock('../../../../../src/services/dealService.js', () => ({ respondOffer: vi.fn() }));
vi.mock('../../../../../src/services/documentService.js', () => ({ respondDocRequest: vi.fn() }));
vi.mock('../../../../../src/services/flatmateService.js', () => ({ decideGroupApplication: vi.fn(), decideRequest: vi.fn() }));
vi.mock('../../../../../src/services/photoRequestService.js', () => ({ decidePhotoRequest: vi.fn() }));
vi.mock('../../../../../src/services/requestInboxService.js', () => ({ remindRequest: vi.fn(), removeRequest: vi.fn() }));
vi.mock('../../../../../src/services/visitService.js', () => ({ updateVisitStatus: vi.fn() }));

import { myContactRequests, respondToContactRequest } from '../../../../../src/services/contactService.js';
import { dropPendingChat, openFlatmateRequestConversation, openLeadRequestConversation, startConversation } from '../../../../../src/services/conversationService.js';
import { respondOffer } from '../../../../../src/services/dealService.js';
import { respondDocRequest } from '../../../../../src/services/documentService.js';
import { decideGroupApplication, decideRequest } from '../../../../../src/services/flatmateService.js';
import { decidePhotoRequest } from '../../../../../src/services/photoRequestService.js';
import { remindRequest, removeRequest } from '../../../../../src/services/requestInboxService.js';
import { updateVisitStatus } from '../../../../../src/services/visitService.js';
import { ApiError } from '../../../../../src/services/http.js';
import { useRequestActions } from '../../../../../src/pages/consumer/requests/useRequestActions.js';

afterEach(cleanup);

let inbox;
let toast;
let onChanged;

const item = (kind, extra = {}) => ({
  kind,
  id: 5,
  state: 'pending',
  party: { id: 'u1', name: 'Asha' },
  target: { id: 'p1', title: 'Flat A', link: '/property/flat-a?x=1' },
  ...extra,
});

const setup = () => renderHook(() => useRequestActions({ inbox, toast, onChanged })).result;

beforeEach(() => {
  inbox = { load: vi.fn(), patchItem: vi.fn(), removeItem: vi.fn() };
  toast = vi.fn();
  onChanged = vi.fn();
  h.navigate.mockReset();
  h.openChat.mockReset().mockResolvedValue(undefined);
  h.refreshRequests.mockReset();
  [
    respondToContactRequest, updateVisitStatus, decidePhotoRequest, decideRequest, decideGroupApplication,
    respondDocRequest, respondOffer, remindRequest, removeRequest, dropPendingChat,
  ].forEach((m) => m.mockReset().mockResolvedValue({}));
  myContactRequests.mockReset().mockResolvedValue({ items: [{ id: 5, contact: { mobile: '9000000001' } }] });
  openFlatmateRequestConversation.mockReset().mockResolvedValue({ id: 'c-fm' });
  openLeadRequestConversation.mockReset().mockResolvedValue({ id: 'c lead' });
  startConversation.mockReset().mockResolvedValue({ id: 'c-start' });
});

describe('decide', () => {
  it.each([
    ['contact', respondToContactRequest, 'approved', 'declined'],
    ['visit', updateVisitStatus, 'confirmed', 'cancelled'],
    ['photo', decidePhotoRequest, 'resolved', 'declined'],
    ['flatmate', decideRequest, 'accepted', 'declined'],
    ['group', decideGroupApplication, 'accepted', 'declined'],
  ])('%s calls the right service for accept and decline', async (kind, fn, yes, no) => {
    const result = setup();
    await act(() => result.current.decide(item(kind), true));
    expect(fn).toHaveBeenLastCalledWith(5, yes);
    await act(() => result.current.decide(item(kind), false));
    expect(fn).toHaveBeenLastCalledWith(5, no);
  });

  it('calls the document and offer services with their own arguments', async () => {
    const result = setup();
    await act(() => result.current.decide(item('document'), true));
    expect(respondDocRequest).toHaveBeenCalledWith(null, 5, 'granted');
    await act(() => result.current.decide(item('offer'), false));
    expect(respondOffer).toHaveBeenCalledWith(5, 'decline', null, { isOwner: true });
  });

  it('patches the item, toasts, refreshes and opens the chat after accepting a contact request', async () => {
    const result = setup();
    const it = item('contact');
    await act(() => result.current.decide(it, true));
    expect(inbox.patchItem).toHaveBeenCalledWith('received', it, expect.any(Function));
    const patched = inbox.patchItem.mock.calls[0][2](it);
    expect(patched.state).toBe('accepted');
    expect(typeof patched.decidedAt).toBe('string');
    expect(toast).toHaveBeenCalledWith('Accepted \u2014 you can chat now and see their number.', 'success');
    expect(onChanged).toHaveBeenCalled();
    expect(h.refreshRequests).toHaveBeenCalled();
    expect(h.openChat).toHaveBeenCalledWith({
      mobile: '9000000001',
      propertyId: 'p1',
      greeting: 'Hi Asha, thanks for your interest in Flat A on Draazy.',
    });
    expect(inbox.load).toHaveBeenCalledWith('received', { quiet: true });
  });

  it('opens the dedicated thread for flatmate and visit requests', async () => {
    const result = setup();
    await act(() => result.current.decide(item('flatmate'), true));
    expect(openFlatmateRequestConversation).toHaveBeenCalledWith(5);
    expect(h.navigate).toHaveBeenCalledWith('/messages?c=c-fm');
    await act(() => result.current.decide(item('visit'), true));
    expect(openLeadRequestConversation).toHaveBeenCalledWith('visit', 5);
    expect(h.navigate).toHaveBeenLastCalledWith('/messages?c=c%20lead');
  });

  it('uses group-join copy and does not open a chat for group joins', async () => {
    const result = setup();
    const join = item('flatmate', { target: { id: 'g1', type: 'group', title: 'G' } });
    await act(() => result.current.decide(join, true));
    expect(toast).toHaveBeenCalledWith("Accepted \u2014 they're in your group now.", 'success');
    expect(openFlatmateRequestConversation).not.toHaveBeenCalled();
  });

  it('toasts info for declines and does not open a chat', async () => {
    const result = setup();
    await act(() => result.current.decide(item('contact'), false));
    expect(toast).toHaveBeenCalledWith('Request declined.', 'info');
    expect(h.openChat).not.toHaveBeenCalled();
  });

  it('swallows chat-opening failures after accepting', async () => {
    myContactRequests.mockResolvedValue({ items: [] });
    const result = setup();
    await act(() => result.current.decide(item('contact'), true));
    expect(toast).toHaveBeenCalledTimes(1);
    expect(inbox.load).toHaveBeenCalledWith('received', { quiet: true });
  });

  it('falls back to the requester mobile when the contact has none', async () => {
    myContactRequests.mockResolvedValue({ items: [{ id: 5, requester: { mobile: '9000000002' } }] });
    const result = setup();
    await act(() => result.current.decide(item('contact', { party: undefined }), true));
    expect(h.openChat).toHaveBeenCalledWith(expect.objectContaining({ mobile: '9000000002', greeting: expect.stringContaining('Hi there') }));
  });

  it('shows a listing-not-live message for a contact failure', async () => {
    respondToContactRequest.mockRejectedValue(new ApiError({ code: 'listing_not_live', message: 'x', status: 409 }));
    const result = setup();
    await act(() => result.current.decide(item('contact'), true));
    expect(toast).toHaveBeenCalledWith('Make the listing live to share your number.', 'error');
    expect(inbox.load).toHaveBeenCalledWith('received', { quiet: true });
    expect(inbox.patchItem).not.toHaveBeenCalled();
  });

  it('shows a generic or server message for other failures', async () => {
    decideRequest.mockRejectedValueOnce(new Error('raw'));
    const result = setup();
    await act(() => result.current.decide(item('flatmate'), true));
    expect(toast).toHaveBeenCalledWith('That did not go through. Please try again.', 'error');
    decideRequest.mockRejectedValueOnce(new ApiError({ code: 'x', message: 'Server says no', status: 400 }));
    await act(() => result.current.decide(item('flatmate'), true));
    expect(toast).toHaveBeenLastCalledWith('Server says no', 'error');
  });

  it('ignores a second call for the same request while one is in flight', async () => {
    let release;
    updateVisitStatus.mockImplementation(() => new Promise((res) => { release = res; }));
    const result = setup();
    let first;
    act(() => { first = result.current.decide(item('visit'), false); });
    expect([...result.current.busy]).toEqual(['visit:5']);
    await act(() => result.current.decide(item('visit'), false));
    expect(updateVisitStatus).toHaveBeenCalledTimes(1);
    await act(async () => { release({}); await first; });
    expect(result.current.busy.size).toBe(0);
  });
});

describe('remind', () => {
  it('patches reminders and toasts on success', async () => {
    remindRequest.mockResolvedValue({ nextAt: 'later' });
    const result = setup();
    const it = item('contact', { reminders: { count: 1 } });
    await act(() => result.current.remind(it));
    expect(remindRequest).toHaveBeenCalledWith('contact', 5);
    const patched = inbox.patchItem.mock.calls[0][2](it);
    expect(patched.reminders).toEqual({ count: 1, nextAt: 'later' });
    expect(toast).toHaveBeenCalledWith('Reminder sent', 'success');
  });

  it('records the next reminder time when it is too soon', async () => {
    remindRequest.mockRejectedValue(Object.assign(new ApiError({ code: 'reminder_too_soon', message: 'Wait a bit', status: 429 }), { nextReminderAt: 'T' }));
    const result = setup();
    await act(() => result.current.remind(item('contact')));
    expect(inbox.patchItem.mock.calls[0][2](item('contact')).reminders).toEqual({ nextAt: 'T' });
    expect(toast).toHaveBeenCalledWith('Wait a bit', 'info');
  });

  it('reports other errors and reloads when the request is gone', async () => {
    remindRequest.mockRejectedValue(new ApiError({ code: 'nf', message: 'gone', status: 404 }));
    const result = setup();
    await act(() => result.current.remind(item('contact')));
    expect(toast).toHaveBeenCalledWith('gone', 'error');
    expect(inbox.load).toHaveBeenCalledWith('sent', { quiet: true });
    remindRequest.mockRejectedValue(new Error('boom'));
    inbox.load.mockClear();
    await act(() => result.current.remind(item('contact')));
    expect(toast).toHaveBeenLastCalledWith('That did not go through. Please try again.', 'error');
    expect(inbox.load).not.toHaveBeenCalled();
  });
});

describe('remove', () => {
  it('withdraws a pending sent contact request and drops the pending chat', async () => {
    const result = setup();
    const it = item('contact');
    await act(() => result.current.remove(it));
    expect(removeRequest).toHaveBeenCalledWith('contact', 5, 'sent');
    expect(dropPendingChat).toHaveBeenCalledWith('p1', 'flat-a');
    expect(inbox.patchItem.mock.calls[0][2](it).state).toBe('withdrawn');
    expect(toast).toHaveBeenCalledWith('Request withdrawn', 'info');
    expect(onChanged).toHaveBeenCalled();
    expect(inbox.load).toHaveBeenCalledWith('sent', { quiet: true });
  });

  it('ignores a failing dropPendingChat', async () => {
    dropPendingChat.mockRejectedValue(new Error('x'));
    const result = setup();
    await act(() => result.current.remove(item('contact')));
    expect(toast).toHaveBeenCalledWith('Request withdrawn', 'info');
  });

  it('removes decided items from the list without a toast', async () => {
    const result = setup();
    const it = item('visit', { state: 'accepted' });
    await act(() => result.current.remove(it, 'received'));
    expect(removeRequest).toHaveBeenCalledWith('visit', 5, 'received');
    expect(inbox.removeItem).toHaveBeenCalledWith('received', it);
    expect(toast).not.toHaveBeenCalled();
    expect(dropPendingChat).not.toHaveBeenCalled();
  });

  it('reports failures and reloads the box', async () => {
    removeRequest.mockRejectedValue(new Error('x'));
    const result = setup();
    await act(() => result.current.remove(item('contact')));
    expect(toast).toHaveBeenCalledWith('That did not go through. Please try again.', 'error');
    expect(inbox.load).toHaveBeenCalledWith('sent', { quiet: true });
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('openAccepted and openReceived', () => {
  it('opens the own thread for kinds that have one', async () => {
    const result = setup();
    await act(() => result.current.openAccepted(item('offer')));
    expect(openLeadRequestConversation).toHaveBeenCalledWith('offer', 5);
    expect(h.navigate).toHaveBeenCalledWith('/messages?c=c%20lead');
    await act(() => result.current.openAccepted(item('flatmate')));
    expect(openFlatmateRequestConversation).toHaveBeenCalledWith(5);
  });

  it('starts a property conversation otherwise', async () => {
    const result = setup();
    await act(() => result.current.openAccepted(item('contact')));
    expect(startConversation).toHaveBeenCalledWith({
      propertyId: 'p1',
      firstMessage: 'Hi, I\'m interested in "Flat A" on Draazy. Is it still available?',
      clientId: 'open:p1',
    });
    expect(h.navigate).toHaveBeenCalledWith('/messages?c=c-start');
  });

  it('toasts when opening fails', async () => {
    startConversation.mockRejectedValue(new Error('x'));
    const result = setup();
    await act(() => result.current.openAccepted(item('contact')));
    expect(toast).toHaveBeenCalledWith('Could not open the chat. Please try again.', 'error');
  });

  it('opens the received chat and toasts the missing number', async () => {
    const result = setup();
    await act(() => result.current.openReceived(item('contact')));
    expect(h.openChat).toHaveBeenCalled();
    myContactRequests.mockResolvedValue({ items: [] });
    await act(() => result.current.openReceived(item('contact')));
    expect(toast).toHaveBeenCalledWith('Could not open the chat. Please try again.', 'error');
  });
});
