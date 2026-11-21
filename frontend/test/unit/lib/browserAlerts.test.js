import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registerPushSubscription = vi.fn();
const unregisterPushSubscription = vi.fn();
vi.mock('../../../src/services/notificationService.js', () => ({
  registerPushSubscription: (...a) => registerPushSubscription(...a),
  unregisterPushSubscription: (...a) => unregisterPushSubscription(...a),
}));

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
let alerts;
let notification;

const load = async (vapid = 'BPaddedKey') => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', vapid);
  alerts = await import('../../../src/lib/browserAlerts.js');
};

const setNotification = (permission, requestPermission = vi.fn()) => {
  notification = Object.assign(vi.fn(function Notif(title, opts) { this.title = title; this.opts = opts; this.close = vi.fn(); }), { permission, requestPermission });
  vi.stubGlobal('Notification', notification);
  window.Notification = notification;
};

beforeEach(async () => {
  localStorage.clear();
  registerPushSubscription.mockReset();
  unregisterPushSubscription.mockReset();
  setNotification('default');
  await load();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete window.Notification;
  delete window.PushManager;
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined });
});

const installSw = (reg) => {
  window.PushManager = class {};
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: vi.fn().mockResolvedValue(reg), register: vi.fn().mockResolvedValue(reg) } });
  return navigator.serviceWorker;
};

describe('support detection', () => {
  it('reports permission or unsupported', () => {
    expect(alerts.alertsSupported()).toBe(true);
    expect(alerts.alertPermission()).toBe('default');
    delete window.Notification;
    vi.unstubAllGlobals();
    expect(alerts.alertsSupported()).toBe(false);
    expect(alerts.alertPermission()).toBe('unsupported');
  });

  it('needs a VAPID key, PushManager and a service worker for push', async () => {
    expect(alerts.pushSupported()).toBe(false);
    installSw(null);
    expect(alerts.pushSupported()).toBe(true);
    await load('');
    expect(alerts.pushSupported()).toBe(false);
  });
});

describe('opt-in state', () => {
  it('is on when granted and not switched off', () => {
    setNotification('granted');
    expect(alerts.browserAlertsOn()).toBe(true);
    localStorage.setItem('dz_browser_alerts_off_v1', '1');
    expect(alerts.browserAlertsOn()).toBe(false);
  });

  it('asks again only after the 14 day snooze', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(alerts.alertsAskPending()).toBe(true);
    alerts.snoozeAlertsAsk();
    expect(alerts.alertsAskPending()).toBe(false);
    vi.setSystemTime(NOW + 14 * DAY - 1);
    expect(alerts.alertsAskPending()).toBe(false);
    vi.setSystemTime(NOW + 14 * DAY);
    expect(alerts.alertsAskPending()).toBe(true);
  });

  it('never asks once permission was decided', () => {
    setNotification('denied');
    expect(alerts.alertsAskPending()).toBe(false);
  });

  it('tolerates blocked storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('x'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x'); });
    expect(() => alerts.snoozeAlertsAsk()).not.toThrow();
    expect(alerts.alertsAskPending()).toBe(true);
  });
});

describe('enableBrowserAlerts', () => {
  it('rejects when notifications are unsupported', async () => {
    delete window.Notification;
    vi.unstubAllGlobals();
    await expect(alerts.enableBrowserAlerts()).rejects.toThrow('does not support notifications');
  });

  it('rejects when the user denies permission', async () => {
    notification.requestPermission.mockResolvedValue('denied');
    await expect(alerts.enableBrowserAlerts()).rejects.toThrow(/blocked for this site/);
  });

  it('clears the off flag and stops there without push support', async () => {
    localStorage.setItem('dz_browser_alerts_off_v1', '1');
    notification.requestPermission.mockResolvedValue('granted');
    await alerts.enableBrowserAlerts();
    expect(localStorage.getItem('dz_browser_alerts_off_v1')).toBeNull();
    expect(registerPushSubscription).not.toHaveBeenCalled();
  });

  it('subscribes with the decoded VAPID key and registers it', async () => {
    setNotification('granted');
    await load('AQID');
    const sub = { toJSON: () => ({ endpoint: 'https://push/1' }) };
    const reg = { pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn().mockResolvedValue(sub) } };
    const sw = installSw(reg);
    await alerts.enableBrowserAlerts();
    expect(notification.requestPermission).not.toHaveBeenCalled();
    expect(sw.register).toHaveBeenCalledWith('/push-sw.js');
    const arg = reg.pushManager.subscribe.mock.calls[0][0];
    expect(arg.userVisibleOnly).toBe(true);
    expect([...arg.applicationServerKey]).toEqual([1, 2, 3]);
    expect(registerPushSubscription).toHaveBeenCalledWith({ endpoint: 'https://push/1' });
  });

  it('registers the production worker outside dev', async () => {
    setNotification('granted');
    vi.stubEnv('DEV', false);
    const sub = { toJSON: () => ({}) };
    const reg = { pushManager: { getSubscription: vi.fn().mockResolvedValue(sub) } };
    const sw = installSw(reg);
    await alerts.enableBrowserAlerts();
    expect(sw.register).toHaveBeenCalledWith('/sw.js');
  });

  it('reuses an existing subscription', async () => {
    setNotification('granted');
    const sub = { toJSON: () => ({ endpoint: 'e' }) };
    const reg = { pushManager: { getSubscription: vi.fn().mockResolvedValue(sub), subscribe: vi.fn() } };
    installSw(reg);
    await alerts.enableBrowserAlerts();
    expect(reg.pushManager.subscribe).not.toHaveBeenCalled();
    expect(registerPushSubscription).toHaveBeenCalledWith({ endpoint: 'e' });
  });
});

describe('subscription lookup and disable', () => {
  it('has no subscription without push support or a registration', async () => {
    expect(await alerts.currentPushSubscription()).toBeNull();
    installSw(undefined);
    expect(await alerts.currentPushSubscription()).toBeNull();
  });

  it('turns alerts off locally and unsubscribes on the server', async () => {
    const sub = { endpoint: 'https://push/1', unsubscribe: vi.fn().mockResolvedValue(true) };
    installSw({ pushManager: { getSubscription: vi.fn().mockResolvedValue(sub) } });
    await alerts.disableBrowserAlerts();
    expect(localStorage.getItem('dz_browser_alerts_off_v1')).toBe('1');
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(unregisterPushSubscription).toHaveBeenCalledWith('https://push/1');
  });

  it('only sets the flag when there is nothing subscribed', async () => {
    await alerts.disableBrowserAlerts();
    expect(localStorage.getItem('dz_browser_alerts_off_v1')).toBe('1');
    expect(unregisterPushSubscription).not.toHaveBeenCalled();
  });
});

describe('showBrowserAlert', () => {
  beforeEach(() => {
    setNotification('granted');
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  });

  it('stays quiet when alerts are off or the tab is focused', async () => {
    localStorage.setItem('dz_browser_alerts_off_v1', '1');
    await alerts.showBrowserAlert({ body: 'hi', url: '/x' });
    localStorage.clear();
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    await alerts.showBrowserAlert({ body: 'hi', url: '/x' });
    expect(notification).not.toHaveBeenCalled();
  });

  it('shows through the service worker when registered', async () => {
    const reg = { showNotification: vi.fn() };
    installSw(reg);
    await alerts.showBrowserAlert({ body: 'hi', url: '/inbox' });
    expect(reg.showNotification).toHaveBeenCalledWith('Draazy', { body: 'hi', tag: 'draazy-alert', renotify: true, data: { url: '/inbox' } });
    expect(notification).not.toHaveBeenCalled();
  });

  it('falls back to a page notification that focuses and navigates on click', async () => {
    installSw(undefined);
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { pathname: '/home', search: '', assign } });
    try {
      await alerts.showBrowserAlert({ body: 'hi', url: '/inbox' });
      const instance = notification.mock.instances[0];
      instance.onclick();
      expect(focus).toHaveBeenCalled();
      expect(assign).toHaveBeenCalledWith('/inbox');
      expect(instance.close).toHaveBeenCalled();
      assign.mockClear();
      Object.defineProperty(window, 'location', { configurable: true, value: { pathname: '/inbox', search: '', assign } });
      instance.onclick();
      expect(assign).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('swallows notification errors', async () => {
    installSw({ showNotification: vi.fn().mockRejectedValue(new Error('x')) });
    await expect(alerts.showBrowserAlert({ body: 'b', url: '/' })).resolves.toBeUndefined();
  });
});
