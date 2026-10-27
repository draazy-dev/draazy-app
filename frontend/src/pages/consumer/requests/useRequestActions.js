import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useConversationUnread } from '../../../context/ConversationContext.jsx';
import { useOpenChat } from '../../../lib/useOpenChat.js';
import { myContactRequests, respondToContactRequest } from '../../../services/contactService.js';
import { dropPendingChat, openFlatmateRequestConversation, openLeadRequestConversation, startConversation } from '../../../services/conversationService.js';
import { respondOffer } from '../../../services/dealService.js';
import { respondDocRequest } from '../../../services/documentService.js';
import { decideGroupApplication, decideRequest } from '../../../services/flatmateService.js';
import { decidePhotoRequest } from '../../../services/photoRequestService.js';
import { remindRequest, removeRequest } from '../../../services/requestInboxService.js';
import { updateVisitStatus } from '../../../services/visitService.js';
import { isGroupJoin, isPending, requestKey, targetSlug } from './requestMeta.js';

const DECIDERS = {
  contact: (id, yes) => respondToContactRequest(id, yes ? 'approved' : 'declined'),
  visit: (id, yes) => updateVisitStatus(id, yes ? 'confirmed' : 'cancelled'),
  photo: (id, yes) => decidePhotoRequest(id, yes ? 'resolved' : 'declined'),
  flatmate: (id, yes) => decideRequest(id, yes ? 'accepted' : 'declined'),
  group: (id, yes) => decideGroupApplication(id, yes ? 'accepted' : 'declined'),
  document: (id, yes) => respondDocRequest(null, id, yes ? 'granted' : 'declined'),
  offer: (id, yes) => respondOffer(id, yes ? 'accept' : 'decline', null, { isOwner: true }),
};

const DECIDED_TOAST = {
  contact: ['Accepted — you can chat now and see their number.', 'Request declined.'],
  visit: ['Visit confirmed — your chat is open.', 'Visit declined.'],
  photo: ['Marked done — the buyer has been told your new photos are up.', 'Declined — the buyer has been told there are no more photos coming.'],
  flatmate: ['Request accepted — your chat is open.', 'Request declined.'],
  group: ['Group application accepted.', 'Group application declined.'],
  document: ['Documents shared — view-only for this buyer.', 'Document request declined.'],
  offer: ['Offer accepted — your chat is open.', 'Offer declined.'],
};

const GROUP_JOIN_TOAST = ['Accepted — they\'re in your group now.', 'Request declined.'];

/** Kinds whose own endpoint opens the thread, so no first message has to be sent to create it. */
const hasOwnThread = (item) => ['flatmate', 'visit', 'offer'].includes(item.kind);
const openOwnThread = (item) => (item.kind === 'flatmate'
  ? openFlatmateRequestConversation(item.id)
  : openLeadRequestConversation(item.kind, item.id));

const FAILED = 'That did not go through. Please try again.';
const NO_CHAT = 'Could not open the chat. Please try again.';

async function approvedMobile(id) {
  const { items } = await myContactRequests();
  const row = items.find((r) => r.id === id);
  return row?.contact?.mobile || row?.requester?.mobile || '';
}

export function useRequestActions({ inbox, toast, onChanged }) {
  const navigate = useNavigate();
  const openChat = useOpenChat(toast);
  const { refreshRequests } = useConversationUnread();
  const inFlight = useRef(new Set());
  const [busy, setBusy] = useState(() => new Set());
  const { load, patchItem, removeItem } = inbox;

  const guarded = useCallback(async (item, run) => {
    const key = requestKey(item);
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setBusy(new Set(inFlight.current));
    try {
      await run();
    } finally {
      inFlight.current.delete(key);
      setBusy(new Set(inFlight.current));
    }
  }, []);

  const chatWith = useCallback(async (item) => {
    if (hasOwnThread(item)) {
      const conv = await openOwnThread(item);
      navigate(`/messages?c=${encodeURIComponent(conv.id)}`);
      return;
    }
    const mobile = await approvedMobile(item.id);
    if (!mobile) throw new Error(NO_CHAT);
    await openChat({
      mobile,
      propertyId: item.target.id,
      greeting: `Hi ${item.party?.name || 'there'}, thanks for your interest in ${item.target.title} on Draazy.`,
    });
  }, [navigate, openChat]);

  const decide = useCallback((item, yes) => guarded(item, async () => {
    try {
      await DECIDERS[item.kind](item.id, yes);
    } catch (e) {
      const notLive = item.kind === 'contact' && e?.code === 'listing_not_live';
      toast(notLive ? 'Make the listing live to share your number.' : e?.message || FAILED, 'error');
      load('received', { quiet: true });
      return;
    }
    const groupJoin = isGroupJoin(item);
    patchItem('received', item, (it) => ({ ...it, state: yes ? 'accepted' : 'declined', decidedAt: new Date().toISOString() }));
    toast((groupJoin ? GROUP_JOIN_TOAST : DECIDED_TOAST[item.kind])[yes ? 0 : 1], yes ? 'success' : 'info');
    onChanged?.();
    refreshRequests();
    if (yes && !groupJoin && (item.kind === 'contact' || hasOwnThread(item))) {
      // The approval stands either way; the chat stays one tap away on the received card.
      await chatWith(item).catch(() => undefined);
    }
    load('received', { quiet: true });
  }), [chatWith, guarded, load, onChanged, patchItem, refreshRequests, toast]);

  const remind = useCallback((item) => guarded(item, async () => {
    const applyNext = (res) => patchItem('sent', item, (it) => ({ ...it, reminders: { ...it.reminders, ...res } }));
    try {
      applyNext(await remindRequest(item.kind, item.id));
      toast('Reminder sent', 'success');
    } catch (e) {
      if (e?.code === 'reminder_too_soon' && e.nextReminderAt) {
        applyNext({ nextAt: e.nextReminderAt });
        toast(e.message || 'You reminded them recently. Try again later.', 'info');
        return;
      }
      toast(e?.message || FAILED, 'error');
      if (e?.status === 404) load('sent', { quiet: true });
    }
  }), [guarded, load, patchItem, toast]);

  const remove = useCallback((item, box = 'sent') => guarded(item, async () => {
    const withdrawing = box === 'sent' && isPending(item);
    try {
      await removeRequest(item.kind, item.id, box);
    } catch (e) {
      toast(e?.message || FAILED, 'error');
      load(box, { quiet: true });
      return;
    }
    if (withdrawing && item.kind === 'contact') {
      try {
        await dropPendingChat(item.target?.id, targetSlug(item));
      } catch {
        /* a leftover draft is harmless; the request itself is withdrawn */
      }
    }
    onChanged?.();
    if (withdrawing) patchItem('sent', item, (it) => ({ ...it, state: 'withdrawn' }));
    else removeItem(box, item);
    if (withdrawing) toast('Request withdrawn', 'info');
    load(box, { quiet: true });
  }), [guarded, load, onChanged, patchItem, removeItem, toast]);

  // The accepted side may have no thread yet, e.g. the request was sent from another device.
  const openAccepted = useCallback((item) => guarded(item, async () => {
    try {
      const conv = hasOwnThread(item)
        ? await openOwnThread(item)
        : await startConversation({
          propertyId: item.target.id,
          firstMessage: `Hi, I'm interested in "${item.target.title || 'your listing'}" on Draazy. Is it still available?`,
          clientId: `open:${item.target.id}`,
        });
      navigate(`/messages?c=${encodeURIComponent(conv.id)}`);
    } catch (e) {
      toast(e?.message || NO_CHAT, 'error');
    }
  }), [guarded, navigate, toast]);

  const openReceived = useCallback((item) => guarded(item, () => chatWith(item)
    .catch((e) => toast(e?.message || NO_CHAT, 'error'))), [chatWith, guarded, toast]);

  return { busy, decide, remind, remove, openAccepted, openReceived };
}
