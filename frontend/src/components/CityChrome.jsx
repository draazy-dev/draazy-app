import { useCallback, useState } from 'react';
import { useLocation } from 'react-router';
import { useCity } from '../context/CityContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import MobileField from './MobileField.jsx';
import TurnstileWidget from './security/TurnstileWidget.jsx';
import { useTurnstile } from './security/useTurnstile.js';
import Modal from './ui/Modal.jsx';

const digits = (s) => String(s || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');

export default function CityChrome() {
  const { city, isLive, setCity, modal, openWaitlist, closeModal, requestCity } = useCity();
  const { toast } = useToast();
  const { user } = useAuth();
  const { pathname } = useLocation();

  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('pncBarX');
    } catch {
      return null;
    }
  });

  const live = isLive(city);
  const barAllowed = pathname !== '/signin' && pathname !== '/signup' && !pathname.startsWith('/view-documents');
  const showBar = barAllowed && !live && dismissed !== city;

  const dismiss = () => {
    try {
      sessionStorage.setItem('pncBarX', city);
    } catch {
    }
    setDismissed(city);
  };

  return (
    <>
      {showBar ? (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(var(--dz-bottom-inset)+18px)] z-[1200] w-[min(680px,calc(100%-24px))]">
          <div className="relative flex flex-col gap-2.5 rounded-2xl border border-white/12 bg-ink-card/95 px-4 py-3 pr-10 shadow-2xl shadow-black/50 backdrop-blur sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:pr-4">
            <div className="flex items-start gap-2.5 sm:flex-1 sm:min-w-0 sm:items-center">
              <span className="text-lg leading-none">🚧</span>
              <span className="text-[12.5px] leading-snug text-gray-300">
                Draazy isn't live in <b className="text-white">{city}</b> yet — join the waitlist and we'll notify you the moment we launch.
              </span>
            </div>
            <div className="flex items-center gap-2 sm:flex-shrink-0 sm:gap-3">
              <button onClick={() => openWaitlist(city)} className="btn btn-primary btn-sm flex-1 sm:flex-none">
                Join the waitlist
              </button>
              {city !== 'Pune' ? (
                <button onClick={() => setCity('Pune')} className="btn btn-secondary btn-sm flex-1 sm:flex-none">
                  Switch to Pune
                </button>
              ) : null}
            </div>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="absolute right-2 top-2 px-1 text-xl leading-none text-gray-400 hover:text-white sm:static sm:flex-shrink-0"
            >
              &times;
            </button>
          </div>
        </div>
      ) : null}

      {modal ? (
        <CityModal
          modal={modal}
          user={user}
          onClose={closeModal}
          onSubmit={async (payload, msg) => {
            await requestCity(payload);
            closeModal();
            if (!isLive(city)) setCity('Pune');
            toast(msg, 'success');
          }}
        />
      ) : null}
    </>
  );
}

function CityModal({ modal, user, onClose, onSubmit }) {
  const isWaitlist = modal.type === 'waitlist';
  const cityName = modal.city;
  const [form, setForm] = useState({ city: '', mobile: digits(user?.mobile), email: user?.email || '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const turnstile = useTurnstile();
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const requestClose = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);

  const submit = async () => {
    if (busy) return;
    const target = isWaitlist ? cityName : form.city.trim();
    if (!isWaitlist && !target) { setErr('Enter a city name'); return; }
    const mob = digits(form.mobile);
    if (!/^[6-9]\d{9}$/.test(mob)) { setErr('Enter a valid 10-digit mobile number'); return; }
    const email = isWaitlist ? form.email.trim() : '';
    if (email && !/^\S+@\S+\.\S+$/.test(email)) { setErr('Enter a valid email address, or leave it blank'); return; }
    setErr('');
    setBusy(true);
    try {
      await onSubmit(
        { city: target, mobile: mob, email, turnstileToken: turnstile.spend() },
        isWaitlist ? `You're on the ${target} waitlist 🎉` : `Thanks! We've noted your request for ${target}`,
      );
    } catch {
      setErr("We couldn't record that just now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const fld = 'w-full rounded-[11px] border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20';

  return (
    <Modal
      open
      onClose={requestClose}
      title={isWaitlist ? `Join the ${cityName} waitlist` : 'Request your city'}
      footer={(
        <>
          <button onClick={requestClose} disabled={busy} className="btn btn-secondary">Cancel</button>
          <button onClick={submit} disabled={busy} aria-busy={busy} className="btn btn-primary">
            {busy ? 'Sending…' : isWaitlist ? 'Notify me when live' : 'Request city'}
          </button>
        </>
      )}
    >
      <p className="mb-3.5 text-[13px] leading-relaxed text-gray-400">
        {isWaitlist ? (
          <>We're launching in <b className="text-brand-teal">{cityName}</b> soon. Join the waitlist and we'll notify you the moment we go live.</>
        ) : (
          <>Tell us where you'd like Draazy next. The most-requested cities jump our expansion queue.</>
        )}
      </p>
      {!isWaitlist ? (
        <label className="mb-3 block text-[12.5px] font-semibold text-gray-300">Which city?
        <input value={form.city} onChange={(e) => set('city', e.target.value)} maxLength={120} className={fld + ' mt-1.5'} placeholder="City name" />
        </label>
      ) : null}
      <label className="mb-3 block text-[12.5px] font-semibold text-gray-300">Mobile number
        <MobileField value={form.mobile} onChange={(v) => set('mobile', v)} className="mt-1.5" />
      </label>
      {isWaitlist ? (
        <label className="mb-1 block text-[12.5px] font-semibold text-gray-300">Email (optional)
          <input value={form.email} onChange={(e) => set('email', e.target.value)} className={fld + ' mt-1.5'} placeholder="you@example.com" />
        </label>
      ) : null}
      <TurnstileWidget key={turnstile.round} onToken={turnstile.onToken} className="mt-2 flex justify-center" />
      {err ? <p role="alert" className="mt-1 text-xs text-rose-300">{err}</p> : null}
    </Modal>
  );
}
