import { referralShareUrlNow } from './referralShare.js';

/* One share path for the app; returns the status so each surface words its own toast.
   @returns {Promise<'shared'|'cancelled'|'copied'|'failed'>} */
export async function shareOrCopy({ title, text, url: target = window.location.href } = {}) {
  const url = referralShareUrlNow(target);
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      // Dismissing the sheet is a decision, not an error.
      if (err?.name === 'AbortError') return 'cancelled';
      // Any other share failure is rare; fall through to the clipboard rather
      // than dead-ending, so the user still comes away with the link.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
