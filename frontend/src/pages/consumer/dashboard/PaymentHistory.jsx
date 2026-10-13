import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import Modal from '../../../components/ui/Modal.jsx';
import LoadError from '../../../components/LoadError.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { listMyPayments, requestRefund } from '../../../services/refundService.js';
import { fmtDate, fmtINR } from '../../../lib/format.js';

const STATUS_TONE = {
  paid: 'bg-emerald-500/15 text-emerald-300',
  refund_pending: 'bg-amber-500/15 text-amber-300',
  refunded: 'bg-sky-500/15 text-sky-300',
  refund_rejected: 'bg-rose-500/15 text-rose-300',
  disputed: 'bg-rose-500/15 text-rose-300',
};
const REFUNDABLE_KINDS = ['listing_pass', 'contact_pack'];
const isRent = (p) => p.kind === 'rent_agreement' || p.kind === 'ra_amendment';
const newAttemptId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const reviewHref = (p) => `/support?cat=payment${p.invoiceNo ? `&invoice=${encodeURIComponent(p.invoiceNo)}` : ''}`;
const fmtWhen = (ms) => new Date(ms).toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
});
const whyNotText = (t, { reason, from }) => {
  if (reason === 'window_not_open') return from ? t('dash.billingWhyNot.window_not_open', { date: fmtWhen(from) }) : t('dash.billingWhyNot.window_not_open_soon');
  return t(`dash.billingWhyNot.${reason}`, { defaultValue: '' });
};
const linkCls = 'text-teal-400 text-xs font-semibold hover:text-teal-300';

function RefundSheet({ payment, onClose, onSent }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const attemptId = useRef(newAttemptId());
  const inFlight = useRef(false);

  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      onSent(await requestRefund(payment.id, { reason, attemptId: attemptId.current }));
    } catch (err) {
      onSent(null, err);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={t('dash.refundTitle')}
      size="sm"
      footer={(
        <button type="button" onClick={confirm} disabled={busy} className="btn-teal min-h-[44px] w-full rounded-xl px-5 text-sm font-semibold disabled:opacity-60" data-testid="refund-confirm">
          {t('dash.refundConfirm')}
        </button>
      )}
    >
      <div className="space-y-3">
        <p className="text-white text-sm font-semibold">{payment.label}</p>
        <p className="text-gray-300 text-sm">{t('dash.refundBack', { amount: fmtINR(payment.refund.amount) })}</p>
        <p className="text-amber-200 text-xs">{t(payment.kind === 'listing_pass' ? 'dash.refundFreezePass' : 'dash.refundFreezePack')}</p>
        <label className="block text-xs text-gray-400">
          {t('dash.refundReasonLabel')}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={2}
            className="dz-input mt-1 w-full text-sm"
            data-testid="refund-reason"
          />
        </label>
      </div>
    </Modal>
  );
}

function PaymentRow({ payment: p, onRefund }) {
  const { t } = useTranslation();
  const refundable = REFUNDABLE_KINDS.includes(p.kind);
  const whyNot = whyNotText(t, p.refund);
  return (
    <li className="rounded-xl bg-white/[0.03] p-3.5" data-testid="payment-row">
      <div className="flex items-start justify-between gap-3">
        <p className="text-white text-sm font-semibold leading-snug min-w-0">{p.label}</p>
        <span className="text-white text-sm font-bold whitespace-nowrap flex-shrink-0">{fmtINR(p.amount)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 mt-2">
        <p className="text-gray-500 text-xs truncate">
          {p.invoiceNo && <><span className="font-mono">{p.invoiceNo}</span> · </>}{fmtDate(p.paidAt)}
        </p>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${STATUS_TONE[p.status] || STATUS_TONE.paid}`}>
          {t(`dash.billingStatus.${p.status}`, { defaultValue: p.status })}
        </span>
      </div>
      {p.status === 'refunded' && p.creditNoteNo && (
        <p className="text-gray-400 text-xs mt-2">{t('dash.billingCreditNote', { no: p.creditNoteNo })}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {isRent(p) && p.serviceRequestId && (
          <Link to={`/services/rent-agreement?request=${encodeURIComponent(p.serviceRequestId)}`} className={linkCls}>{t('dash.billingViewCase')}</Link>
        )}
        {refundable && p.status === 'paid' && p.refund.eligible && (
          <button type="button" onClick={() => onRefund(p)} className="btn-teal min-h-[44px] rounded-lg px-4 text-xs font-semibold text-white" data-testid="refund-open">
            {t('dash.billingRefundUntil', { date: fmtWhen(p.refund.until) })}
          </button>
        )}
        {refundable && p.status === 'paid' && !p.refund.eligible && (
          <>
            {whyNot && <span className="text-gray-400 text-xs">{whyNot}</span>}
            <Link to={reviewHref(p)} className={linkCls}>{t('dash.billingAskReview')}</Link>
          </>
        )}
        {refundable && p.status === 'refund_rejected' && (
          <Link to={reviewHref(p)} className={linkCls}>{t('dash.billingAskReview')}</Link>
        )}
      </div>
    </li>
  );
}

export default function PaymentHistory() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [state, setState] = useState({ status: 'loading', rows: [], error: null });
  const [target, setTarget] = useState(null);

  const load = useCallback(() => {
    let live = true;
    listMyPayments()
      .then((rows) => { if (live) setState({ status: 'ready', rows, error: null }); })
      .catch((error) => { if (live) setState({ status: 'error', rows: [], error }); });
    return () => { live = false; };
  }, []);

  useEffect(load, [load]);

  const onSent = (row, err) => {
    if (row) {
      setState((s) => ({ ...s, rows: s.rows.map((x) => (x.id === row.id ? row : x)) }));
      setTarget(null);
      toast(t('dash.refundSent'));
      return;
    }
    if (err?.code === 'refund_not_eligible') {
      setTarget(null);
      load();
      toast(whyNotText(t, { reason: err.reason }) || t('dash.refundNotEligible'), 'error');
      return;
    }
    toast(t('dash.refundFailed'), 'error');
  };

  if (state.status === 'loading') return <p className="text-gray-500 text-sm">{t('common.loading')}</p>;
  if (state.status === 'error') {
    return <LoadError message={t('dash.billingLoadError')} error={state.error} onRetry={() => { setState({ status: 'loading', rows: [], error: null }); load(); }} className="p-2" />;
  }
  if (!state.rows.length) return <p className="text-gray-500 text-sm">{t('dash.billingEmpty')}</p>;

  return (
    <>
      <ul className="space-y-2.5">
        {state.rows.map((p) => <PaymentRow key={p.id} payment={p} onRefund={setTarget} />)}
      </ul>
      {target && <RefundSheet payment={target} onClose={() => setTarget(null)} onSent={onSent} />}
    </>
  );
}
