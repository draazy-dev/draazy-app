import { registerPushSubscription, unregisterPushSubscription } from '../services/notificationService.js';

const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const SNOOZE_KEY = 'dz_browser_alerts_ask_v1';
const OFF_KEY = 'dz_browser_alerts_off_v1';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

export const alertsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export const pushSupported = () => Boolean(VAPID_KEY) && alertsSupported() && 'PushManager' in window && 'serviceWorker' in navigator;

export const alertPermission = () => (alertsSupported() ? Notification.permission : 'unsupported');

function readStore(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStore(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { }
}

export const browserAlertsOn = () => alertPermission() === 'granted' && readStore(OFF_KEY) === null;

export const snoozeAlertsAsk = () => writeStore(SNOOZE_KEY, String(Date.now()));

export const alertsAskPending = () => alertPermission() === 'default'
  && Date.now() - Number(readStore(SNOOZE_KEY) || 0) >= SNOOZE_MS;

function vapidBytes(key) {
  const padded = `${key}${'='.repeat((4 - (key.length % 4)) % 4)}`;
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
}

export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  return (await reg?.pushManager?.getSubscription()) || null;
}

export async function enableBrowserAlerts() {
  if (!alertsSupported()) throw new Error('This browser does not support notifications.');
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in your browser\'s site settings.');
  writeStore(OFF_KEY, null);
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.register(import.meta.env.DEV ? '/push-sw.js' : '/sw.js');
  const sub = await reg.pushManager.getSubscription()
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(VAPID_KEY) });
  await registerPushSubscription(sub.toJSON());
}

export async function disableBrowserAlerts() {
  writeStore(OFF_KEY, '1');
  const sub = await currentPushSubscription();
  const endpoint = sub?.endpoint;
  if (sub) await sub.unsubscribe();
  if (endpoint) await unregisterPushSubscription(endpoint);
}

export async function showBrowserAlert({ body, url }) {
  if (!browserAlertsOn() || (!document.hidden && document.hasFocus())) return;
  const options = { body, tag: 'draazy-alert', renotify: true, data: { url } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification('Draazy', options);
      return;
    }
    const alert = new Notification('Draazy', options);
    alert.onclick = () => {
      window.focus();
      if (`${window.location.pathname}${window.location.search}` !== url) window.location.assign(url);
      alert.close();
    };
  } catch {
  }
}
