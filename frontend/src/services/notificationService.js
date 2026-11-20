import { createProvider } from './config.js';

const provider = createProvider('notification');

export const listNotifications = async (opts) => (await provider()).listNotifications(opts);

export const unreadCount = async () => (await provider()).unreadCount();

export const markRead = async (id) => (await provider()).markRead(id);

export const markAllRead = async () => (await provider()).markAllRead();

export const dismiss = async (id) => (await provider()).dismiss(id);

export const NOTIFICATION_PREFERENCE_DEFAULTS = Object.freeze({
  email: true,
  sms: false,
  whatsapp: true,
  matchAlerts: true,
  marketingCalls: false,
  quietHours: Object.freeze({ enabled: false, start: '22:00', end: '07:00' }),
  language: 'en',
});

export const getNotificationPreferences = async () => (await provider()).getNotificationPreferences();

export const updateNotificationPreferences = async (patch) => {
  const impl = await provider();
  const current = await impl.getNotificationPreferences();
  const next = {
    ...current,
    ...patch,
    quietHours: { ...current.quietHours, ...(patch.quietHours || {}) },
  };
  return impl.updateNotificationPreferences(next);
};

export const registerPushSubscription = async (subscription) => (await provider()).registerPushSubscription(subscription);
export const unregisterPushSubscription = async (endpoint) => (await provider()).unregisterPushSubscription(endpoint);
