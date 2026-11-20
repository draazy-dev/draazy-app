import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from './Icon.jsx';
import LogoMark from './brand/LogoMark.jsx';
import { getCookieConsent } from './CookieConsent.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { alertsAskPending } from '../lib/browserAlerts.js';

const KEY = 'dz_install_prompt_v1';
const VERSION = 1;
const DAY = 24 * 60 * 60 * 1000;

const COOLDOWNS = [7 * DAY, 14 * DAY, Infinity];

const MIN_VIEWS = 3;

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && v.version === VERSION) return v;
  } catch { }
  return { dismissals: 0, lastDismissAt: 0, installed: false, views: 0 };
}

function write(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...value, version: VERSION }));
  } catch { }
}

function isInstalled(state) {
  if (state.installed) return true;
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function isSilenced(state) {
  const wait = COOLDOWNS[Math.min(state.dismissals, COOLDOWNS.length) - 1];
  if (state.dismissals === 0) return false;
  return wait === Infinity || Date.now() - state.lastDismissAt < wait;
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export default function InstallPrompt() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { isIn } = useAuth();
  const [deferred, setDeferred] = useState(null);
  const [engaged, setEngaged] = useState(false);
  const [gone, setGone] = useState(false);
  const [cookieBar, setCookieBar] = useState(() => !getCookieConsent());

  useEffect(() => {
    const state = read();
    if (isInstalled(state) || isSilenced(state)) { setGone(true); return undefined; }

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => { write({ ...read(), installed: true }); setGone(true); };
    const onCookieBar = (e) => setCookieBar(!!e.detail?.visible);

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('pn:cookie-banner', onCookieBar);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('pn:cookie-banner', onCookieBar);
    };
  }, []);

  const counted = useRef(null);
  useEffect(() => {
    if (counted.current === pathname) return;
    counted.current = pathname;
    const state = read();
    const views = (state.views || 0) + 1;
    write({ ...state, views });
    if (views >= MIN_VIEWS) setEngaged(true);
  }, [pathname]);

  const dismiss = () => {
    const state = read();
    write({ ...state, dismissals: state.dismissals + 1, lastDismissAt: Date.now() });
    setGone(true);
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'accepted') write({ ...read(), installed: true });
    else dismiss();
    setGone(true);
  };

  const ios = typeof navigator !== 'undefined' && isIOS();
  if (gone || cookieBar || !engaged || (!deferred && !ios) || (isIn && alertsAskPending())) return null;

  return (
    <div data-kbd-hide className="dz-safe-x fixed inset-x-0 bottom-[var(--dz-bottom-inset)] z-[1350] flex justify-center p-3 lg:hidden pointer-events-none">
      <div
        role="dialog"
        aria-label={t('install.title')}
        className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/10 bg-ink-card/95 backdrop-blur-xl shadow-[0_20px_60px_-15px_rgb(var(--dz-c-black)/0.7)] p-3.5"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center shrink-0">
            <LogoMark className="w-6 h-6 text-teal-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-white leading-snug">{t('install.title')}</p>
            <p className="mt-1 text-[12.5px] leading-snug text-gray-300">
              {ios ? t('install.iosBody') : t('install.body')}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('install.dismiss')}
            className="tap-target inline-flex items-center justify-center -mt-1 -mr-1 text-gray-400 hover:text-white shrink-0"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        {!ios && (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={install}
              className="tap-target flex-1 rounded-xl bg-teal-500 px-4 text-[13px] font-semibold text-ink hover:bg-teal-400 transition-colors"
            >
              {t('install.cta')}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="tap-target rounded-xl border border-white/10 px-4 text-[13px] font-medium text-gray-300 hover:text-white hover:border-white/20 transition-colors"
            >
              {t('install.later')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
