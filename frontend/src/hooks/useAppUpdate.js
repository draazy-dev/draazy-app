import { useSyncExternalStore } from 'react';
import { observeBuildStamp } from '../services/http.js';

let baseline = null;

let pending = null;

let dismissed = null;

let snapshot = { updateReady: false };

const listeners = new Set();

function publish() {
  const updateReady = pending !== null && pending !== dismissed;
  if (updateReady === snapshot.updateReady) return;
  snapshot = { updateReady };
  for (const notify of listeners) notify();
}

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

export function dismissUpdate() {
  dismissed = pending;
  publish();
}

observeBuildStamp(noteBuildStamp);

function subscribe(onChange) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

const getSnapshot = () => snapshot;

export function useAppUpdate() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
