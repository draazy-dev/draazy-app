/* The first `X-Draazy-Build` seen is the baseline; a different one latches, because a rolling deploy
   alternates stamps for seconds and an unlatched banner would flap. Never polls or auto-reloads. */
import { useSyncExternalStore } from 'react';
import { observeBuildStamp } from '../services/http.js';

/** First stamp this tab saw. Null until the first response that carried one. */
let baseline = null;

/** A stamp different from the baseline, once seen. Latched — see the header. */
let pending = null;

/** The `pending` value the user dismissed, so a later, different deploy can still speak up. */
let dismissed = null;

let snapshot = { updateReady: false };

const listeners = new Set();

function publish() {
  const updateReady = pending !== null && pending !== dismissed;
  // `useSyncExternalStore` compares snapshots by identity, so this must only be rebuilt when the
  // value actually changes — returning a fresh object per read loops forever.
  if (updateReady === snapshot.updateReady) return;
  snapshot = { updateReady };
  for (const notify of listeners) notify();
}

/* A null stamp means "no information", never "unchanged": that is the steady state against a
   backend built outside the Maven lifecycle. */
function noteBuildStamp(stamp) {
  if (!stamp) return;
  if (baseline === null) {
    baseline = stamp;
    return;
  }
  if (stamp === baseline || stamp === pending) return;
  pending = stamp;
  publish();
}

/** Hide the prompt until a *further* deploy lands. The user has declined this one, not all of them. */
export function dismissUpdate() {
  dismissed = pending;
  publish();
}

/* Early enough only because `ConnectivityBanner` statically imports this from both layouts; a
   `React.lazy` layout would take the baseline from whatever response lands after its chunk. */
observeBuildStamp(noteBuildStamp);

function subscribe(onChange) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

const getSnapshot = () => snapshot;

/** `{ updateReady }` — true once a different build has answered and the user has not waved it off. */
export function useAppUpdate() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
