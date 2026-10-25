import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Home, Loader2, ShieldAlert } from 'lucide-react';
import { answerOwnerNotice, getOwnerNotice } from '../../services/flatmateService.js';
import { inr } from './flatmates/helpers.js';

const BTN = 'inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold';

/* An owner opens this from the WhatsApp note sent when their tenant posts a room. The token in the
   URL fragment is the whole credential, so it is read once and scrubbed from history. */
export default function OwnerConfirm() {
  const { t } = useTranslation();
  const [token] = useState(() => window.location.hash.slice(1));
  const [notice, setNotice] = useState(null);
  const [state, setState] = useState(token ? 'loading' : 'invalid');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    if (!token) return undefined;
    let live = true;
    getOwnerNotice(token)
      .then((n) => { if (live) { setNotice(n); setState('ready'); } })
      .catch(() => { if (live) setState('invalid'); });
    return () => { live = false; };
  }, [token]);

  const answer = async (choice) => {
    setBusy(choice);
    setError('');
    try {
      setNotice(await answerOwnerNotice(token, choice));
    } catch (err) {
      setError(err?.status === 409 ? t('flatmates.ownerNotice.alreadyAnswered') : t('flatmates.ownerNotice.failed'));
    } finally {
      setBusy('');
    }
  };

  const place = [notice?.society, notice?.locality].filter(Boolean).join(', ');
  const roomKind = notice?.roomType === 'Shared room' ? t('flatmates.ownerNotice.roomDouble') : t('flatmates.ownerNotice.roomSingle');

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-10">
      <div className="glass-card w-full rounded-2xl p-6 sm:p-8" data-testid="owner-confirm">
        {state === 'loading' && <Loader2 className="mx-auto h-8 w-8 animate-spin text-teal-400" aria-label={t('flatmates.ownerNotice.loading')} />}
        {state === 'invalid' && (
          <div className="text-center">
            <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-amber-300" aria-hidden="true" />
            <h1 className="text-lg font-bold text-white">{t('flatmates.ownerNotice.invalidTitle')}</h1>
            <p className="mt-2 text-sm text-gray-400">{t('flatmates.ownerNotice.invalidBody')}</p>
          </div>
        )}
        {state === 'ready' && notice && (
          <>
            <h1 className="text-xl font-bold text-white">{t('flatmates.ownerNotice.title', { name: notice.tenantName })}</h1>
            <p className="mt-3 text-sm text-gray-300">{t('flatmates.ownerNotice.about')}</p>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
              <p className="font-semibold text-white">{place}</p>
              <p className="mt-1 text-gray-400">{roomKind}{notice.rent ? ` · ${inr(notice.rent)}${t('flatmates.perMonth')}` : ''}</p>
            </div>
            {notice.status === 'sent' ? (
              <>
                <p className="mt-5 text-sm font-medium text-white">{t('flatmates.ownerNotice.question')}</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button type="button" disabled={!!busy} onClick={() => answer('decline')} className={`${BTN} btn-outline text-gray-200`}>
                    {busy === 'decline' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t('flatmates.ownerNotice.decline')}
                  </button>
                  <button type="button" disabled={!!busy} onClick={() => answer('agree')} className={`${BTN} btn-teal text-white`}>
                    {busy === 'agree' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t('flatmates.ownerNotice.agree')}
                  </button>
                </div>
                {error && <p role="alert" className="mt-3 text-xs text-red-400">{error}</p>}
                <p className="mt-3 text-[11px] text-gray-500">{t('flatmates.ownerNotice.accountNote')}</p>
              </>
            ) : (
              <p role="status" className="mt-5 flex items-start gap-2 text-sm text-teal-200" data-testid="owner-confirm-done">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {notice.status === 'agreed' ? t('flatmates.ownerNotice.agreed') : t('flatmates.ownerNotice.declined')}
              </p>
            )}
            {notice.homeSaved ? (
              <>
                <p className="mt-4 text-sm text-gray-300">{t('flatmates.ownerNotice.homeSaved')}</p>
                <Link to="/dashboard?tab=properties" className={`${BTN} btn-teal mt-3 text-white`} data-testid="owner-confirm-see-home">
                  <Home className="h-4 w-4" aria-hidden="true" />{t('flatmates.ownerNotice.seeHome')}
                </Link>
              </>
            ) : (
              <Link to="/list-property" className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-teal-300">
                <Home className="h-3.5 w-3.5" aria-hidden="true" />{t('flatmates.ownerNotice.listYours')}
              </Link>
            )}
          </>
        )}
      </div>
    </main>
  );
}
