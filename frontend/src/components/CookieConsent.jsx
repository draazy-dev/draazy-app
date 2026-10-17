import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import Icon from './Icon.jsx';

/* DPDPA-aligned: only strictly-necessary cookies are exempt, everything else is opt-in.
   Withdrawal must be as easy as consent — the footer reopens via `pn:open-cookie-preferences`. */

const KEY = 'dz_cookie_consent_v1';
const VERSION = 1;
export const CONSENT_CHANGE = 'dz:consent-change';

export function getCookieConsent() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && v.version === VERSION) return v;
  } catch { /* ignore */ }
  return null;
}

export const hasAnalyticsConsent = () => Boolean(getCookieConsent()?.analytics);

export default function CookieConsent() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!getCookieConsent()) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener('pn:open-cookie-preferences', reopen);
    return () => window.removeEventListener('pn:open-cookie-preferences', reopen);
  }, []);

  // Bottom-anchored widgets (e.g. the Draaz FAB) step aside so nothing overlaps the actions.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('pn:cookie-banner', { detail: { visible: open } }));
  }, [open]);

  useEffect(() => {
    const root = document.documentElement;
    if (!open || !panelRef.current) {
      root.style.setProperty('--dz-cookie-banner-h', '0px');
      return undefined;
    }

    const syncHeight = () => {
      const box = panelRef.current?.getBoundingClientRect();
      root.style.setProperty('--dz-cookie-banner-h', `${Math.ceil(box?.height || 0)}px`);
    };

    syncHeight();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(syncHeight) : null;
    observer?.observe(panelRef.current);
    window.addEventListener('resize', syncHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncHeight);
      root.style.setProperty('--dz-cookie-banner-h', '0px');
    };
  }, [open]);

  const persist = (allowed) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        necessary: true, functional: allowed, analytics: allowed, marketing: allowed, version: VERSION, ts: Date.now(),
      }));
    } catch { /* ignore */ }
    window.dispatchEvent(new Event(CONSENT_CHANGE));
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div data-kbd-hide className="dz-safe-x fixed inset-x-0 bottom-[var(--dz-bottom-inset)] z-[1400] flex justify-center items-end p-3 sm:p-4 pointer-events-none max-h-[100dvh]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label="Cookie preferences"
        className="pointer-events-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-ink-card/95 backdrop-blur-xl shadow-[0_20px_60px_-15px_rgb(var(--dz-c-black)/0.7)] flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:gap-5 sm:py-3 sm:pl-4 sm:pr-3"
      >
        <div className="flex items-center gap-3 min-w-0 sm:flex-1">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center shrink-0">
            <Icon name="shield-check" className="w-4 h-4 text-teal-400" />
          </div>
          <p className="text-[13px] leading-snug text-gray-300 min-w-0">
            We use cookies to run and improve Draazy.{' '}
            <Link to="/privacy" className="text-teal-400 hover:underline whitespace-nowrap">Privacy Policy</Link>
          </p>
        </div>
        <div className="grid gap-2 min-[360px]:grid-cols-2 sm:flex sm:items-center shrink-0">
          <button
            type="button"
            onClick={() => persist(false)}
            className="h-btn-sm inline-flex items-center justify-center rounded-lg border border-white/15 px-3.5 text-[13px] font-semibold text-gray-200 hover:bg-white/5 transition-colors whitespace-nowrap"
          >
            Reject non-essential
          </button>
          <button
            type="button"
            onClick={() => persist(true)}
            className="h-btn-sm inline-flex items-center justify-center rounded-lg bg-teal-500 px-4 text-[13px] font-semibold text-white hover:bg-teal-400 transition-colors whitespace-nowrap"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
