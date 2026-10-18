import { useCallback, useRef, useState } from 'react';
import { useOpenChat } from '../../../lib/useOpenChat.js';
import { myContactRequests, respondToContactRequest } from '../../../services/contactService.js';
import { dropPendingChat } from '../../../services/conversationService.js';
import { decideGroupApplication, decideRequest } from '../../../services/flatmateService.js';
import { decidePhotoRequest } from '../../../services/photoRequestService.js';
import { remindRequest, removeRequest } from '../../../services/requestInboxService.js';
import { updateVisitStatus } from '../../../services/visitService.js';
import { isPending, requestKey, targetSlug } from './requestMeta.js';

const DECIDERS = {
  contact: (id, yes) => respondToContactRequest(id, yes ? 'approved' : 'declined'),
  visit: (id, yes) => updateVisitStatus(id, yes ? 'confirmed' : 'cancelled'),
  photo: (id, yes) => decidePhotoRequest(id, yes ? 'resolved' : 'declined'),
  flatmate: (id, yes) => decideRequest(id, yes ? 'accepted' : 'declined'),
  group: (id, yes) => decideGroupApplication(id, yes ? 'accepted' : 'declined'),
};

const DECIDED_TOAST = {
  contact: ['Accepted — you can chat now and see their number.', 'Request declined.'],
  visit: ['Visit confirmed.', 'Visit declined.'],
  photo: ['Marked done — the buyer has been told your new photos are up.', 'Declined — the buyer has been told there are no more photos coming.'],
  flatmate: ['Request accepted — connect in Messages.', 'Request declined.'],
  group: ['Group application accepted.', 'Group application declined.'],
};

const FAILED = 'That did not go through. Please try again.';

async function approvedMobile(id) {
  const { items } = await myContactRequests();
  const row = items.find((r) => r.id === id);
  return row?.contact?.mobile || row?.requester?.mobile || '';
}

export function useRequestActions({ inbox, toast, onStagedChanged }) {
  const openChat = useOpenChat(toast);
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

  const chatAfterApproval = useCallback(async (item) => {
    try {
      const mobile = await approvedMobile(item.id);
      if (!mobile) return;
      await openChat({
        mobile,
        propertyId: item.target.id,
        greeting: `Hi ${item.party?.name || 'there'}, thanks for your interest in ${item.target.title} on Draazy.`,
      });
    } catch {
      /* the approval stands; the chat can be opened from Messages */
    }
  }, [openChat]);

  const decide = useCallback((item, yes) => guarded(item, async () => {
    try {
      await DECIDERS[item.kind](item.id, yes);
    } catch (e) {
      const notLive = item.kind === 'contact' && e?.code === 'listing_not_live';
      toast(notLive ? 'Make the listing live to share your number.' : e?.message || FAILED, 'error');
      load('received', { quiet: true });
      return;
    }
    removeItem('received', item);
    toast(DECIDED_TOAST[item.kind][yes ? 0 : 1], yes ? 'success' : 'info');
    if (item.kind === 'contact' && yes) await chatAfterApproval(item);
    load('received', { quiet: true });
  }), [chatAfterApproval, guarded, load, removeItem, toast]);

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

  const remove = useCallback((item) => guarded(item, async () => {
    const withdrawing = isPending(item);
    try {
      await removeRequest(item.kind, item.id);
    } catch (e) {
      toast(e?.message || FAILED, 'error');
      load('sent', { quiet: true });
      return;
    }
    if (withdrawing && item.kind === 'contact') {
      try {
        await dropPendingChat(item.target?.id, targetSlug(item));
      } catch {
        /* a leftover draft is harmless; the request itself is withdrawn */
      }
      onStagedChanged?.();
    }
    removeItem('sent', item);
    if (withdrawing) toast('Request withdrawn', 'info');
    load('sent', { quiet: true });
  }), [guarded, load, onStagedChanged, removeItem, toast]);

  return { busy, decide, remind, remove };
}
