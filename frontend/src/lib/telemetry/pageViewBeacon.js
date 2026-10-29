import { recordPageViews } from '../../services/pageViewService.js';
import { CONSENT_CHANGE, hasAnalyticsConsent } from '../../components/CookieConsent.jsx';
import { toRoutePattern, isBackOffice } from './routePatterns.js';

const SESSION_KEY = 'pn.pv.sid';

const FLUSH_INTERVAL_MS = 60_000;

const MAX_QUEUED = 40;

const TABLET_MIN_PX = 768;
const DESKTOP_MIN_PX = 1024;

let queue = [];
let queueAttributed = null;
let timer = null;
let started = false;
let memorySessionId = null;

const mintId = () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const size = 32;
  const out = new Array(size);

  const values = new Uint8Array(size);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
  } else {
    for (let i = 0; i < size; i += 1) values[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < size; i += 1) out[i] = alphabet[values[i] % alphabet.length];
  return out.join('');
};

const sessionId = () => {
  try {
    const existing = globalThis.sessionStorage?.getItem(SESSION_KEY);
    if (existing) return existing;
    const minted = mintId();
    globalThis.sessionStorage?.setItem(SESSION_KEY, minted);
    return minted;
  } catch {
    if (!memorySessionId) memorySessionId = mintId();
    return memorySessionId;
  }
};

const device = () => {
  const width = globalThis.innerWidth || DESKTOP_MIN_PX;
  if (width < TABLET_MIN_PX) return 'mobile';
  if (width < DESKTOP_MIN_PX) return 'tablet';
  return 'desktop';
};

const referrerHost = () => {
  try {
    const raw = globalThis.document?.referrer;
    if (!raw) return undefined;
    const host = new URL(raw).hostname;
    if (!host || host === globalThis.location?.hostname) return undefined;
    return host;
  } catch {
    return undefined;
  }
};

const flush = () => {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];

  const at = Date.now();
  recordPageViews({
    sessionId: sessionId(),
    events: batch.map((e) => ({
      path: e.path,
      referrerHost: e.referrerHost,
      device: e.device,
      agoMs: Math.max(0, at - e.at),
    })),
    attributed: queueAttributed === true,
  });
};

const followConsent = () => {
  const attributed = hasAnalyticsConsent();
  if (attributed === queueAttributed) return;
  if (queueAttributed !== null) {
    flush();
    memorySessionId = null;
    try { globalThis.sessionStorage?.removeItem(SESSION_KEY); } catch { }
  }
  queueAttributed = attributed;
};

export const recordPageView = (pathname) => {
  const path = toRoutePattern(pathname);
  if (isBackOffice(path)) return;

  followConsent();
  queue.push({
    path,
    referrerHost: referrerHost(),
    device: device(),
    at: Date.now(),
  });

  if (queue.length >= MAX_QUEUED) flush();
};

export const startPageViewBeacon = () => {
  if (started) return () => {};
  started = true;

  const onHidden = () => {
    if (globalThis.document?.visibilityState === 'hidden') flush();
  };

  timer = globalThis.setInterval(flush, FLUSH_INTERVAL_MS);
  globalThis.document?.addEventListener('visibilitychange', onHidden);
  globalThis.addEventListener?.(CONSENT_CHANGE, followConsent);

  return () => {
    started = false;
    if (timer) globalThis.clearInterval(timer);
    timer = null;
    globalThis.document?.removeEventListener('visibilitychange', onHidden);
    globalThis.removeEventListener?.(CONSENT_CHANGE, followConsent);
    flush();
  };
};
