export const PROVIDER_LOAD_FAILED = 'provider_load_failed';

export function isDefinitelyOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

const RELOAD_ATTEMPTED = 'draazy:reloaded-for-stale-shell';

export function healStaleShell(err) {
  return err?.code === PROVIDER_LOAD_FAILED && reloadOnceForStaleShell();
}

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
  }
  window.location.reload();
}
