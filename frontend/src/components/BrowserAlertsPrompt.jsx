import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from './Icon.jsx';
import { getCookieConsent } from './CookieConsent.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { alertPermission, alertsAskPending, enableBrowserAlerts, snoozeAlertsAsk } from '../lib/browserAlerts.js';

// The back office has no cookie bar to wait for, and its alerts are queue work rather than chat replies.
export default function BrowserAlertsPrompt({ staff = false }) {
  const { t } = useTranslation();
  const { isIn } = useAuth();
  const { toast } = useToast();
  const [pending, setPending] = useState(alertsAskPending);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  // The consent bar owns the bottom edge while it is up, as it does for the install prompt.
  const [cookieBar, setCookieBar] = useState(() => !staff && !getCookieConsent());

  useEffect(() => {
    const onCookieBar = (e) => setCookieBar(!staff && !!e.detail?.visible);
    window.addEventListener('pn:cookie-banner', onCookieBar);
    return () => window.removeEventListener('pn:cookie-banner', onCookieBar);
  }, [staff]);

  const dismiss = () => { snoozeAlertsAsk(); setPending(false); };

  const turnOn = async () => {
    setBusy(true);
    try {
      await enableBrowserAlerts();
      snoozeAlertsAsk();
      setPending(false);
      toast(t('browserAlerts.enabled'), 'success');
    } catch {
      // A refusal turns the card into the how-to-unblock note rather than vanishing without a word.
      if (alertPermission() === 'denied') setBlocked(true);
      else if (alertPermission() === 'granted') { setPending(false); toast(t('browserAlerts.pushFailed'), 'error'); }
      else dismiss();
    } finally {
      setBusy(false);
    }
  };

  if (!isIn || !pending || cookieBar) return null;

  return (
    <div data-kbd-hide className="dz-safe-x fixed inset-x-0 bottom-[var(--dz-bottom-inset)] z-[1350] flex justify-center lg:justify-start p-3 pointer-events-none">
      <div
        role="dialog"
        aria-label={t(blocked ? 'browserAlerts.blockedTitle' : 'browserAlerts.title')}
        data-testid="browser-alerts-prompt"
        className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/10 bg-ink-card/95 backdrop-blur-xl shadow-[0_20px_60px_-15px_rgb(var(--dz-c-black)/0.7)] p-3.5"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <Icon name="bell" className="w-5 h-5 text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-white leading-snug">{t(blocked ? 'browserAlerts.blockedTitle' : 'browserAlerts.title')}</p>
            <p className="mt-1 text-[12.5px] leading-snug text-gray-300">{t(blocked ? 'browserAlerts.blockedBody' : staff ? 'browserAlerts.staffBody' : 'browserAlerts.body')}</p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('browserAlerts.dismiss')}
            className="tap-target inline-flex items-center justify-center -mt-1 -mr-1 text-gray-400 hover:text-white shrink-0"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          {blocked ? (
            <button
              type="button"
              onClick={dismiss}
              className="tap-target flex-1 rounded-xl border border-white/10 px-4 text-[13px] font-medium text-gray-300 hover:text-white hover:border-white/20 transition-colors"
            >
              {t('browserAlerts.ok')}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={turnOn}
                disabled={busy}
                className="tap-target flex-1 rounded-xl bg-teal-500 px-4 text-[13px] font-semibold text-ink hover:bg-teal-400 transition-colors disabled:opacity-60"
              >
                {t('browserAlerts.cta')}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="tap-target rounded-xl border border-white/10 px-4 text-[13px] font-medium text-gray-300 hover:text-white hover:border-white/20 transition-colors"
              >
                {t('browserAlerts.later')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
