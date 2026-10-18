/* One merged inbox across contact, visit, photo, flatmate and group requests, so the UI never stitches five lists. */
import { createProvider } from './config.js';

const provider = createProvider('requestInbox');

/** `box` is 'received' | 'sent'. Rejects on failure; an empty box resolves to `[]`. */
export const listRequests = async (box) => (await provider()).listRequests(box);

/** Nudge the recipient. Resolves `{ count, lastAt, nextAt }`; a 409 `reminder_too_soon` carries `nextReminderAt`. */
export const remindRequest = async (kind, id) => (await provider()).remindRequest(kind, id);

/** Withdraws a pending request or clears a decided one from the sender's list. Idempotent. */
export const removeRequest = async (kind, id) => (await provider()).removeRequest(kind, id);
