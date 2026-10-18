// Named for what the seam observes: a dynamic import rejects alike for a stale chunk, no signal,
// a CDN 5xx or a syntax error.
export const PROVIDER_LOAD_FAILED = 'provider_load_failed';

/** `navigator.onLine` is trustworthy only in the negative: it withholds the "reload, we updated"
 * advice, never asserts it. */
export function isDefinitelyOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Set before the reload, read after it: a second attempt would be a loop, not a recovery. */
const RELOAD_ATTEMPTED = 'draazy:reloaded-for-stale-shell';

/** A rejected dynamic import is memoised, so the page is already dead and a reload loses nothing.
 * Returns true once a reload has started (the caller's message will never be read). */
export function healStaleShell(err) {
  return err?.code === PROVIDER_LOAD_FAILED && reloadOnceForStaleShell();
}

/** The same once-per-tab reload, for a failed lazy route chunk caught by the error boundary. */
export function reloadOnceForStaleShell() {
  if (isDefinitelyOffline()) return false;
  try {
    if (sessionStorage.getItem(RELOAD_ATTEMPTED)) return false;
    sessionStorage.setItem(RELOAD_ATTEMPTED, '1');
  } catch {
    return false;
  }
  updateWorkerThenReload();
  return true;
}

const WORKER_ACTIVATION_TIMEOUT_MS = 5000;

/** A bare reload is answered from the old precache that names the missing chunk, so update the worker
 * first and wait for the new one to activate, or the old one still answers. */
export async function updateWorkerThenReload() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update();
    const incoming = registration?.installing || registration?.waiting;
    if (incoming) {
      await new Promise((resolve) => {
        setTimeout(resolve, WORKER_ACTIVATION_TIMEOUT_MS);
        incoming.addEventListener('statechange', () => {
          if (incoming.state === 'activated' || incoming.state === 'redundant') resolve();
        });
      });
    }
  } catch {
    /* No worker registered, or the update check failed. Reload regardless: with no worker in the
       way the navigation goes to the origin, which is the fresh shell we were after. */
  }
  window.location.reload();
}
