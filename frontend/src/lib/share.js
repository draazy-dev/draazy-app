import { referralShareUrlNow } from './referralShare.js';

export async function shareOrCopy({ title, text, url: target = window.location.href } = {}) {
  const url = referralShareUrlNow(target);
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
