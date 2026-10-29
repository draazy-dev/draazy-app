import { useSyncExternalStore } from 'react';
import { NetworkError, observeReachability } from '../services/http.js';

let unreachable = false;

let snapshot = { status: readStatus() };

const listeners = new Set();

function readStatus() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  return unreachable ? 'unreachable' : 'online';
}

function publish() {
  const status = readStatus();
  if (status === snapshot.status) return;
  snapshot = { status };
  for (const notify of listeners) notify();
}

function handleOnline() {
  unreachable = false;
  publish();
}

function subscribe(onChange) {
  listeners.add(onChange);
  if (listeners.size === 1) {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', publish);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', publish);
    }
  };
}

const getSnapshot = () => snapshot;

export function isReachabilityFailure(err) {
  return err instanceof NetworkError;
}

export function noteNetworkFailure(err) {
  if (!isReachabilityFailure(err)) return false;
  unreachable = true;
  publish();
  return true;
}

export function noteNetworkSuccess() {
  if (!unreachable) return;
  unreachable = false;
  publish();
}

export function useConnectivity() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

observeReachability((err) => {
  if (err) noteNetworkFailure(err);
  else noteNetworkSuccess();
});
