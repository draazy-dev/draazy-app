/* One merged inbox across contact, visit, photo, flatmate and group requests, so the UI never stitches five lists. */
import { createProvider } from './config.js';

const provider = createProvider('requestInbox');

/** `box` is 'received' | 'sent'. Rejects on failure; an empty box resolves to `[]`. */
export const listRequests = async (box) => (await provider()).listRequests(box);

/** Nudge the recipient. Resolves `{ count, lastAt, nextAt }`; a 409 `reminder_too_soon` carries `nextReminderAt`. */
export const remindRequest = async (kind, id) => (await provider()).remindRequest(kind, id);

/** Box 'sent' (default) withdraws a pending request or clears a decided one; 'received' clears a decided one. */
export const removeRequest = async (kind, id, box) => (await provider()).removeRequest(kind, id, box);
