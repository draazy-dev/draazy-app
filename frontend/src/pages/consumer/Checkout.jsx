import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/Icon.jsx';
import { openCashfreeCheckout } from '../../lib/cashfree.js';
import { cancelPending, listPlans, subscribe as subscribeToPlan } from '../../services/planService.js';
import { getEntitlements } from '../../services/entitlementService.js';
import { myListingCard } from '../../services/propertyService.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { usePricing } from '../../context/PricingContext.jsx';
import { useAppFlags } from '../../context/AppFlagsContext.jsx';
import { fmtDate } from '../../lib/format.js';
import RefundGuarantee from '../../components/billing/RefundGuarantee.jsx';

const DAY_MS = 86_400_000;
const POLL_MS = 3_000;
const POLL_MAX_MS = 30_000;
const newAttemptId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const isSafePath = (p) => typeof p === 'string' && /^\/(?![/\\])/.test(p);

/** When THIS purchase's entitlement ends, or null while it has not landed: the webhook, not the modal, grants it. */
async function purchaseExpiry({ needsProperty, propertyId, before }) {
  const e = await getEntitlements().catch(() => null);
  if (needsProperty) return e?.listings?.passes?.find((p) => String(p.propertyId) === String(propertyId))?.expiresAt ?? null;
  const at = e?.contacts?.packExpiresAt ?? null;
  return at && (!before || Date.parse(at) > Date.parse(before)) ? at : null;
}

const checkoutPlans = (t) => ({
  'contact-pack': { nameLabel: t('misc.coContactPackName'), priceKey: 'contactPack', sub: t('misc.coContactPackSub'), termDays: 30, icon: 'user-plus', tagline: t('misc.coContactPackTagline'), feats: [t('misc.coContactPackFeat1'), t('misc.coContactPackFeat2'), t('misc.coContactPackFeat3')], done: { cta: t('misc.coContactPackDoneCta'), href: '/listings' } },
  'listing-pass': { nameLabel: t('misc.coListingPassName'), priceKey: 'listingPass', sub: t('misc.coListingPassSub'), termDays: 60, icon: 'building-2', tagline: t('misc.coListingPassTagline'), feats: [t('misc.coListingPassFeat1'), t('misc.coListingPassFeat2'), t('misc.coListingPassFeat3')], done: { cta: t('misc.coListingPassDoneCta'), href: '/dashboard#properties' } },
});
const checkoutMethods = (t) => [
  { id: 'UPI', label: t('misc.coMethodUpiLabel'), desc: t('misc.coMethodUpiDesc'), icon: 'smartphone' },
  { id: 'Card', label: t('misc.coMethodCardLabel'), desc: t('misc.coMethodCardDesc'), icon: 'credit-card' },
  { id: 'Netbanking', label: t('misc.coMethodNetbankingLabel'), desc: t('misc.coMethodNetbankingDesc'), icon: 'landmark' },
];
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');

export default function Checkout() {
  const { t } = useTranslation();
  const { isIn } = useAuth();
  const { flagEnabled } = useAppFlags();
  const [params] = useSearchParams();
  const planId = params.get('plan');
  const propertyId = params.get('property');
  // The configured price list, from `GET /bootstrap` (`pricing`). Only the fallback — `serverPlan` below is the
  // plan catalogue's own row and wins when it resolves.
  const { prices } = usePricing();
  const CO = checkoutPlans(t);
  const METHODS = checkoutMethods(t);
  const base = CO[planId];
  const needsProperty = planId === 'listing-pass';
  const [method, setMethod] = useState('UPI');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  /** `null` until Pay: then `verifying` (polling entitlements), `timeout` (still unconfirmed) or `paid`. */
  const [phase, setPhase] = useState(null);
  const [orderRef, setOrderRef] = useState('');
  /** The open gateway order, kept so a retry after the SDK failed reopens it instead of POSTing again. */
  const [session, setSession] = useState(null);
  /** Server catalogue row for this plan, once it resolves. See the note in `Plans.jsx`. */
  const [serverPlan, setServerPlan] = useState(null);
  /** The listing a pass is bought for; `false` once the lookup fails. */
  const [listing, setListing] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const packExpiryBefore = useRef(null);
  const attemptKey = `dz_co_${planId}_${propertyId || ''}`;
  const [attemptId, setAttemptId] = useState(() => {
    try {
      const saved = sessionStorage.getItem(attemptKey);
      if (saved) return saved;
    } catch {
      // ignore storage access errors
    }
    const id = newAttemptId();
    try { sessionStorage.setItem(attemptKey, id); } catch {
      // ignore storage access errors
    }
    return id;
  });

  useEffect(() => {
    let alive = true;
    listPlans()
      .then((rows) => {
        const row = rows.find((r) => r.slug === planId);
        if (alive && row) setServerPlan(row);
      })
      // Falls back to the configured fee. The charge is the server's either way — this only
      // affects which number is shown while the catalogue is unreachable.
      .catch(() => {});
    return () => { alive = false; };
  }, [planId]);

  useEffect(() => {
    if (!needsProperty || !propertyId || !isIn) return undefined;
    let alive = true;
    myListingCard(propertyId)
      .then((row) => { if (alive) setListing(row?.title ? row : false); })
      .catch(() => { if (alive) setListing(false); });
    return () => { alive = false; };
  }, [needsProperty, propertyId, isIn]);

  // The charged amount is the server's plan row, so display that rather than the back-office fee.
  const price = base && (serverPlan?.price ?? prices[base.priceKey]);
  const termDays = serverPlan?.termDays ?? base?.termDays;
  const P = base && { ...base, price };

  const paid = phase === 'paid';
  const waiting = phase === 'verifying' || phase === 'timeout';
  useEffect(() => {
    if (phase !== 'verifying') return undefined;
    let alive = true;
    let timer;
    const started = Date.now();
    const tick = async () => {
      const at = await purchaseExpiry({ needsProperty, propertyId, before: packExpiryBefore.current });
      if (!alive) return;
      if (at) {
        setExpiresAt(at);
        setPhase('paid');
        try { sessionStorage.removeItem(attemptKey); } catch { /* ignore */ }
      } else if (Date.now() - started >= POLL_MAX_MS) {
        try { sessionStorage.removeItem(attemptKey); } catch { /* ignore */ }
        setPhase('timeout');
      } else {
        timer = setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [phase, needsProperty, propertyId, attemptKey]);

  const [cancelling, setCancelling] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const rotateAttempt = () => {
    const fresh = newAttemptId();
    setAttemptId(fresh);
    try { sessionStorage.setItem(attemptKey, fresh); } catch { /* ignore */ }
  };
  const cancelOpenOrder = async () => {
    setCancelling(true);
    try {
      await cancelPending();
      setSession(null);
      rotateAttempt();
      setError('');
      setOrderOpen(false);
    } catch {
      setError(t('misc.coPaymentFailed'));
    } finally {
      setCancelling(false);
    }
  };

  const pay = async () => {
    if (paying || phase) return;
    setPaying(true);
    setError('');
    setOrderOpen(false);
    try {
      let order = session;
      if (!order) {
        if (!needsProperty) packExpiryBefore.current = (await getEntitlements().catch(() => null))?.contacts?.packExpiresAt ?? null;
        const sub = await subscribeToPlan(planId, method.toLowerCase(), { propertyId: needsProperty ? propertyId : undefined, attemptId });
        // No session means the key replayed a settled order, so the next Pay must be a new purchase.
        if (!sub?.paymentSessionId) rotateAttempt();
        setOrderRef(sub?.paymentRef || sub?.subscriptionId || '');
        order = { sessionId: sub?.paymentSessionId ?? null };
        setSession(order);
      }
      const outcome = order.sessionId ? await openCashfreeCheckout(order.sessionId) : null;
      if (outcome?.error) {
        setError(t('misc.coPaymentFailed'));
        return;
      }
      setPhase('verifying');
    } catch (err) {
      const open = err?.code === 'order_already_open';
      setOrderOpen(open);
      setError(open ? t('misc.coOrderAlreadyOpen') : err?.status === 409 ? t(needsProperty ? 'misc.coPassConflict' : 'misc.coOrderAlreadyOpen') : err?.code === 'purchases_paused' ? t('misc.coPausedBody') : t('misc.coPaymentFailed'));
    } finally {
      setPaying(false);
    }
  };

  if (!base) return <Navigate to="/plans" replace />;
  if (needsProperty && (!propertyId || listing === false)) return <Navigate to="/dashboard#properties" replace />;
  if (!isIn) return <Navigate to={`/signin?next=${encodeURIComponent('/checkout?' + params.toString())}`} replace />;
  if (needsProperty && !listing) return null;

  const till = fmtDate(expiresAt) || fmtDate(Date.now() + termDays * DAY_MS);
  const doneBody = needsProperty
    ? t(listing.status === 'pending' ? 'misc.coListingPassDonePending' : 'misc.coListingPassDone', { title: listing.title, date: till })
    : t('misc.coContactPackDone', { count: serverPlan?.contactLimit ?? 15, date: till });
  const next = params.get('next');
  const doneHref = !needsProperty && isSafePath(next) ? next : P.done.href;
  const doneCta = doneHref === P.done.href ? P.done.cta : t('misc.coContinue');
  const paused = !phase && !flagEnabled('subscriptionPlans');

  return (
    <div className="pt-8 sm:pt-10 pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <Link to="/plans" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-5"><Icon name="arrow-left" className="w-4 h-4" /> {t('misc.coBackToPricing')}</Link>
      <h1 className="text-2xl sm:text-3xl font-extrabold mb-1">{t('misc.coTitle')}</h1>
      <p className="text-gray-400 text-sm mb-7">{t('misc.coSubtitle')} <span className="text-gray-500">{t('misc.coBrokerage')}</span></p>

      {paused ? (
        <div className="glass rounded-2xl p-8 sm:p-10 max-w-lg mx-auto text-center">
          <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-5" style={{ background: 'rgb(var(--dz-c-amber-500) / .15)' }}><Icon name="pause-circle" className="w-9 h-9 text-amber-400" /></div>
          <h2 className="text-xl font-extrabold mb-1">{t('misc.coPausedTitle')}</h2>
          <p className="text-gray-400 text-sm mb-6">{t('misc.coPausedBody')}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/dashboard" className="btn-teal px-5 py-2.5 rounded-xl font-semibold text-sm">{t('misc.coGoToDashboard')}</Link>
            <Link to="/plans" className="h-btn inline-flex items-center justify-center px-5 rounded-xl font-semibold text-sm border border-white/10 text-gray-200 hover:bg-white/5 transition-colors">{t('misc.coViewPlans')}</Link>
          </div>
        </div>
      ) : waiting ? (
        <div className="glass rounded-2xl p-8 sm:p-10 max-w-lg mx-auto text-center">
          <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-5" style={{ background: 'rgb(var(--dz-c-amber-500) / .15)' }}><Icon name="clock" className="w-9 h-9 text-amber-400" /></div>
          <h2 className="text-xl font-extrabold mb-1">{t('misc.coPaymentPending')}</h2>
          <p className="text-gray-400 text-sm mb-1">{P.nameLabel} · {inr(P.price)} {t('misc.coPaidVia')} {method}</p>
          <p className="text-gray-400 text-sm mb-2">{t('misc.coPaymentPendingBody')}</p>
          {orderRef && <p className="text-gray-500 text-xs mb-6">{t('misc.coOrderReference')} · <span className="text-gray-400 font-mono">{orderRef}</span></p>}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {phase === 'timeout'
              ? <button type="button" onClick={() => setPhase('verifying')} className="btn-teal px-5 py-2.5 rounded-xl font-semibold text-sm">{t('misc.coCheckAgain')}</button>
              : <span className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm text-gray-400"><Icon name="loader-2" className="w-4 h-4 animate-spin" /> {t('misc.coProcessing')}</span>}
            <Link to="/dashboard" className="h-btn inline-flex items-center justify-center px-5 rounded-xl font-semibold text-sm border border-white/10 text-gray-200 hover:bg-white/5 transition-colors">{t('misc.coGoToDashboard')}</Link>
          </div>
        </div>
      ) : paid ? (
        <div className="glass rounded-2xl p-8 sm:p-10 max-w-lg mx-auto text-center">
          <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-5" style={{ background: 'rgb(var(--dz-c-emerald-500) / .15)' }}><Icon name="check-circle-2" className="w-9 h-9 text-emerald-400" /></div>
          <h2 className="text-xl font-extrabold mb-1">{t('misc.coPaymentSuccess')}</h2>
          <p className="text-gray-400 text-sm mb-1">{P.nameLabel} · {inr(P.price)} {t('misc.coPaidVia')} {method}</p>
          <p className="text-gray-400 text-sm mb-2">{doneBody}</p>
          {orderRef && <p className="text-gray-500 text-xs mb-6">{t('misc.coOrderReference')} · <span className="text-gray-400 font-mono">{orderRef}</span></p>}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to={doneHref} className="btn-teal px-5 py-2.5 rounded-xl font-semibold text-sm">{doneCta}</Link>
            <Link to="/dashboard" className="h-btn inline-flex items-center justify-center px-5 rounded-xl font-semibold text-sm border border-white/10 text-gray-200 hover:bg-white/5 transition-colors">{t('misc.coGoToDashboard')}</Link>
          </div>
        </div>
      ) : (
        <>
        <div className="grid md:grid-cols-2 gap-6 items-start">
          <div className="glass rounded-2xl p-5 sm:p-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">{t('misc.coOrderSummary')}</h2>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgb(var(--dz-c-teal-500) / .14)' }}><Icon name={P.icon} className="w-5 h-5 text-teal-400" /></div>
              <div><h3 className="text-lg font-extrabold leading-tight">{P.nameLabel}</h3><p className="text-teal-300 text-sm font-medium">{needsProperty ? listing.title : P.tagline}</p></div>
            </div>
            <ul className="space-y-2.5 mb-5">
              {P.feats.map((f) => <li key={f} className="flex gap-2 text-sm text-gray-300"><Icon name="check" className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> {f}</li>)}
            </ul>
            <div className="border-t border-white/8 pt-4 space-y-2 text-sm">
              <div className="flex justify-between text-gray-400"><span>{P.nameLabel} <span className="text-gray-600">({P.sub})</span></span><span className="text-gray-200">{inr(P.price)}</span></div>
              <div className="flex justify-between font-bold text-base pt-2 border-t border-white/8 mt-2"><span>{t('misc.coTotal')}</span><span>{inr(P.price)}</span></div>
              {needsProperty && <RefundGuarantee kind="pass" />}
              {planId === 'contact-pack' && <RefundGuarantee kind="pack" />}
            </div>
          </div>

          <div className="glass rounded-2xl p-5 sm:p-6">
            <h2 id="co-method-label" className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">{t('misc.coPaymentMethod')}</h2>
            <div role="radiogroup" aria-labelledby="co-method-label" className="space-y-2.5 mb-5">
              {METHODS.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={m.id === method} onClick={() => setMethod(m.id)} className={'method w-full flex items-center gap-3 text-left' + (m.id === method ? ' active' : '')}>
                  <Icon name={m.icon} className="w-5 h-5 text-teal-400 flex-shrink-0" />
                  <span className="flex-1"><span className="block text-sm font-semibold">{m.label}</span><span className="block text-xs text-gray-500">{m.desc}</span></span>
                  <Icon name={m.id === method ? 'check-circle-2' : 'circle'} className={'w-4 h-4 ' + (m.id === method ? 'text-teal-400' : 'text-gray-600')} />
                </button>
              ))}
            </div>
            <button onClick={pay} disabled={paying} className="btn-teal w-full py-3 rounded-xl font-semibold hidden md:inline-flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">{paying ? <><Icon name="loader-2" className="w-4 h-4 animate-spin" /> {t('misc.coProcessing')}</> : <><Icon name="lock" className="w-4 h-4" /> {t('misc.coPay')} {inr(P.price)}</>}</button>
            {error && (
              <div className="mt-3 text-center space-y-2">
                <p role="alert" className="text-rose-300 text-xs">{error}</p>
                {orderOpen && (
                  <button
                    type="button"
                    onClick={cancelOpenOrder}
                    disabled={cancelling}
                    className="text-xs text-teal-400 hover:text-teal-300 underline font-medium cursor-pointer"
                  >
                    {cancelling ? t('misc.coProcessing') : t('misc.coCancelPending')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mobile sticky pay bar — keeps the total and pay action reachable without
            scrolling. In-flow (sticky, not fixed) so it releases naturally at the footer. */}
        <div className="md:hidden sticky bottom-0 z-30 -mx-4 sm:-mx-6 mt-6 border-t border-white/10 bg-ink/95 backdrop-blur-xl px-4 sm:px-6 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
          <div className="flex items-center gap-4">
            <div className="shrink-0">
              <p className="text-[11px] text-gray-500 leading-none mb-1">{t('misc.coTotal')}</p>
              <p className="text-lg font-extrabold leading-none">{inr(P.price)}</p>
            </div>
            <button onClick={pay} disabled={paying} className="btn-teal flex-1 py-3 rounded-xl font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">{paying ? <><Icon name="loader-2" className="w-4 h-4 animate-spin" /> {t('misc.coProcessing')}</> : <><Icon name="lock" className="w-4 h-4" /> {t('misc.coPay')}</>}</button>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
