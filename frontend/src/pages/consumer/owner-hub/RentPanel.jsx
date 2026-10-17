import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import FieldError from '../../../components/ui/FieldError.jsx';
import IdInput from '../../../components/IdInput.jsx';
import NativeSelect from '../../../components/ui/NativeSelect.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { fmtNum } from '../../../lib/format.js';
import { isValidName } from '../../../lib/auth.js';
import { digits, fmtPhone } from '../../../lib/contact.js';
import { updateManaged, listRentReceipts, recordRentReceipt, stopRentTracking } from '../../../services/managedService.js';
import { currentDueStatus, recentMonths } from '../../../lib/data/rentReminders.js';
import { generateSingle } from '../../../lib/rentReceipt.js';
import AmountInput from '../flatmates/AmountInput.jsx';
import { FIELD_CLS } from './constants.js';

// Shared by the fetch window and the row window: fetching fewer receipts than rows shows a settled month as unpaid.
const LEDGER_MONTHS = 6;
// Must match ManagedProperty.MAX_MONTHLY_RENT on the server.
const MAX_RENT = 10_000_000;
// 29–31 never fall due in February.
const DUE_DAYS = Array.from({ length: 28 }, (_, i) => String(i + 1));
const invalid = (err) => (err ? ' dz-invalid' : '');
const blankForm = (prop) => ({
  tenantName: prop.tenantName || '',
  tenantMobile: prop.tenantMobile || '',
  monthlyRent: String(prop.monthlyRent || (prop.deal === 'rent' ? prop.price : '') || ''),
  dueDay: String(prop.dueDay || 5),
});

// Settled months are a server fact; every figure comes off the returned receipt, never off `prop`.
// Gateway payments are webhook-controlled, so nothing here asserts them.
export default function RentPanel({ prop, onChange }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const rentStr = (n) => t('ownerHub.rentPerMo', { amount: fmtNum(n) });
  const [editing, setEditing] = useState(!prop.rented);
  const [form, setForm] = useState(() => blankForm(prop));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  const checks = {
    tenantName: (v) => (isValidName(v.trim()) ? '' : t('ownerHub.errTenantName')),
    tenantMobile: (v) => (!/^[6-9]\d{9}$/.test(v) ? t('ownerHub.errTenantMobile')
      : v === digits(prop.ownerMobile).slice(-10) ? t('ownerHub.errOwnMobile') : ''),
    monthlyRent: (v) => (!(Number(v) > 0) ? t('ownerHub.errRent') : Number(v) > MAX_RENT ? t('ownerHub.errRentMax') : ''),
  };
  const check = (k, v = form[k]) => setErrors((e) => ({ ...e, [k]: checks[k](v) }));
  // An invalid field re-checks as it is corrected, so the message clears the moment it is fixed.
  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) check(k, v);
  };

  // `null` while the first read is in flight, so a settled month never flashes a "Mark received" button.
  const [receipts, setReceipts] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busyMonth, setBusyMonth] = useState('');
  // Re-armed in the effect body, not only cleared in cleanup: under StrictMode a mount/cleanup/
  // re-mount would otherwise leave this false forever and silently swallow every state update.
  const alive = useRef(true);
  // Re-entrancy guard: `busyMonth` is state, so a second handler in the same render still reads the old value.
  const busyRef = useRef('');
  // Kept out of `load`'s deps so a language toggle doesn't blank the ledger and refetch.
  const tRef = useRef(t);
  tRef.current = t;

  const propId = prop.id;
  const tracking = !!prop.rented;

  const load = useCallback(async () => {
    if (!propId || !tracking) return;
    try {
      const rows = await listRentReceipts(propId, LEDGER_MONTHS);
      if (alive.current) {
        setReceipts(rows);
        setFailed(false);
      }
    } catch {
      // Stay on the read-only pending shape so settled months never look unpaid; `failed` offers a retry.
      if (alive.current) {
        setFailed(true);
        toast(tRef.current('ownerHub.rentReceiptsFailed'), 'error');
      }
    }
  }, [propId, tracking, toast]);

  useEffect(() => {
    alive.current = true;
    setReceipts(null);
    setFailed(false);
    load();
    return () => { alive.current = false; };
  }, [load]);

  const byMonth = useMemo(
    () => new Map((receipts || []).map((r) => [r.ym, r])),
    [receipts],
  );

  const saveDetails = async () => {
    const next = Object.fromEntries(Object.entries(checks).map(([k, fn]) => [k, fn(form[k])]));
    setErrors(next);
    if (Object.values(next).some(Boolean) || saving) return;
    const wasTracking = prop.rented;
    setSaving(true);
    try {
      await updateManaged(prop.id, {
        rented: true,
        tenantName: form.tenantName.trim(),
        tenantMobile: form.tenantMobile,
        monthlyRent: Number(form.monthlyRent),
        dueDay: Number(form.dueDay),
      });
      setEditing(false);
      onChange?.();
      toast(wasTracking ? t('ownerHub.rentDetailsSaved') : t('ownerHub.trackingOn'), 'success');
    } catch (e) {
      // 422 carries the server's own words: it names the field it refused.
      toast((e?.status === 422 && e.message) || t('ownerHub.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const markVacant = async () => {
    try {
      await updateManaged(prop.id, { rented: false });
      onChange?.();
      toast(t('ownerHub.markedVacant'), 'success');
    } catch {
      toast(t('ownerHub.saveFailed'), 'error');
    }
  };

  const stopTracking = async () => {
    setSaving(true);
    try {
      const updated = await stopRentTracking(prop.id);
      setForm(blankForm(updated || {}));
      setErrors({});
      setConfirmStop(false);
      setEditing(true);
      onChange?.();
      toast(t('ownerHub.trackingStopped'), 'success');
    } catch {
      toast(t('ownerHub.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (ym) => {
    if (busyRef.current || byMonth.has(ym)) return;
    busyRef.current = ym;
    setBusyMonth(ym);
    try {
      const receipt = await recordRentReceipt(prop.id, ym);
      if (alive.current) setReceipts((rows) => [receipt, ...(rows || [])]);
      onChange?.();
      toast(t('ownerHub.rentRecorded'), 'success');
    } catch (e) {
      if (e?.status === 409) {
        // Already recorded — somewhere else, or a double press. Our view is the stale thing, so
        // converge on the server's rather than report a failure the owner cannot act on.
        await load();
        toast(t('ownerHub.rentAlreadyRecorded'), 'info');
      } else if (e?.status === 422) {
        // The server's own words: it knows which of rent, tenant or tracking is missing.
        toast(e.message || t('ownerHub.setRentFirst'), 'error');
      } else {
        toast(t('ownerHub.rentRecordFailed'), 'error');
      }
    } finally {
      busyRef.current = '';
      if (alive.current) setBusyMonth('');
    }
  };

  // Printed from the receipt, not `prop`, so figures match the month; `txnRef` is the server's stable receipt id.
  const download = (r) => generateSingle({
    tenant: r.tenantName || t('ownerHub.tenant'),
    landlord: r.landlordName || t('ownerHub.landlord'),
    address: r.propertyAddress || '',
    rent: r.amount,
    mode: 'Cash / Bank',
    month: r.ym,
    txnRef: r.id,
    paidOnline: false,
  }).catch(() => toast(t('ownerHub.receiptDownloadFailed'), 'error'));

  if (!prop.rented || editing) {
    return (
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-1"><Icon name="receipt-indian-rupee" className="w-5 h-5 text-brand-teal-2" /><h2 className="text-lg font-bold text-white">{t('ownerHub.rentTracking')}</h2></div>
        <p className="text-gray-400 text-sm mb-5">{t('ownerHub.rentSetupSub')}</p>
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs text-gray-400 mb-1.5 block">{t('ownerHub.tenantName')}</span>
            <input value={form.tenantName} onChange={(e) => set('tenantName', e.target.value)} onBlur={() => check('tenantName')} maxLength={80} autoComplete="off" placeholder={t('ownerHub.tenantPlaceholder')} className={FIELD_CLS + invalid(errors.tenantName)} />
            <FieldError>{errors.tenantName}</FieldError>
          </label>
          <label className="block">
            <span className="text-xs text-gray-400 mb-1.5 block">{t('ownerHub.tenantMobile')}</span>
            <IdInput
              kind="mobile"
              value={form.tenantMobile}
              onChange={(v) => set('tenantMobile', v)}
              onBlur={() => check('tenantMobile')}
              autoComplete="off"
              placeholder={t('ownerHub.tenantMobilePlaceholder')}
              className={FIELD_CLS + invalid(errors.tenantMobile)}
            />
            <FieldError>{errors.tenantMobile}</FieldError>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-gray-400 mb-1.5 block">{t('ownerHub.monthlyRent')}</span>
              <AmountInput value={form.monthlyRent} onChange={(v) => set('monthlyRent', v)} onBlur={() => check('monthlyRent')} className={invalid(errors.monthlyRent)} placeholder={t('ownerHub.rentPlaceholder')} />
              <FieldError>{errors.monthlyRent}</FieldError>
            </label>
            <div>
              <span className="text-xs text-gray-400 mb-1.5 block">{t('ownerHub.dueDay')}</span>
              <NativeSelect value={form.dueDay} onChange={(e) => set('dueDay', e.target.value)} title={t('ownerHub.dueDay')}>
                {DUE_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </NativeSelect>
            </div>
          </div>
          <div className="flex gap-2.5">
            <button onClick={saveDetails} disabled={saving} className="btn-teal flex-1 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"><Icon name={prop.rented ? 'check' : 'bell'} className="w-4 h-4" /> {prop.rented ? t('ownerHub.saveChanges') : t('ownerHub.startTracking')}</button>
            {prop.rented && <button onClick={() => { setEditing(false); setErrors({}); setConfirmStop(false); setForm(blankForm(prop)); }} className="px-4 py-2.5 rounded-xl border border-white/10 text-gray-300 text-sm hover:bg-white/5">{t('ownerHub.cancel')}</button>}
          </div>
          {!prop.rented && <button onClick={markVacant} className="w-full text-center text-gray-500 text-xs hover:text-gray-300">{t('ownerHub.itsVacant')}</button>}
          {prop.rented && (confirmStop ? (
            <div role="alert" className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3">
              <p className="text-xs text-rose-200">{t('ownerHub.stopTrackingConfirm')}</p>
              <div className="flex gap-2 mt-2.5">
                <button onClick={stopTracking} disabled={saving} className="flex-1 py-2 rounded-lg bg-rose-500/80 hover:bg-rose-500 text-white text-xs font-semibold disabled:opacity-50">{t('ownerHub.stopTrackingYes')}</button>
                <button onClick={() => setConfirmStop(false)} className="flex-1 py-2 rounded-lg border border-white/10 text-gray-300 text-xs hover:bg-white/5">{t('ownerHub.cancel')}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmStop(true)} className="w-full text-center text-rose-300/80 text-xs hover:text-rose-300 flex items-center justify-center gap-1"><Icon name="trash-2" className="w-3.5 h-3.5" /> {t('ownerHub.stopTracking')}</button>
          ))}
        </div>
      </div>
    );
  }

  // While pending (or failed) rows stay read-only rather than "unpaid", so no button earns a 409.
  const pending = receipts === null;
  const s = currentDueStatus(prop, i18n.language);
  const thisMonth = byMonth.get(s.ym) || null;
  const paid = !!thisMonth;
  const months = recentMonths(LEDGER_MONTHS, i18n.language);
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Icon name="receipt-indian-rupee" className="w-5 h-5 text-brand-teal-2" /><h2 className="text-lg font-bold text-white">{t('ownerHub.rentTracking')}</h2></div>
        <button onClick={() => setEditing(true)} className="text-gray-400 text-xs hover:text-white flex items-center gap-1"><Icon name="pencil" className="w-3.5 h-3.5" /> {t('ownerHub.edit')}</button>
      </div>

      <div className={'rounded-xl p-4 border mb-4 ' + (paid ? 'bg-emerald-500/10 border-emerald-500/25' : pending ? 'bg-white/[0.03] border-white/10' : s.overdue ? 'bg-rose-500/10 border-rose-500/25' : 'bg-amber-500/10 border-amber-500/25')}>
        <p className="text-xs text-gray-300">{s.label} · {prop.tenantName || t('ownerHub.tenant')}{prop.tenantMobile && <> · <span className="whitespace-nowrap">{fmtPhone(prop.tenantMobile)}</span></>}</p>
        <p className="text-2xl font-extrabold text-white leading-tight mt-0.5">{rentStr(thisMonth ? thisMonth.amount : prop.monthlyRent)}</p>
        <p className={'text-xs font-medium mt-1 flex items-center gap-1 ' + (paid ? 'text-emerald-300' : pending ? 'text-gray-400' : s.overdue ? 'text-rose-300' : 'text-amber-300')}>
          <Icon name={paid ? 'check-circle' : s.overdue && !pending ? 'alert-circle' : 'clock'} className="w-3.5 h-3.5" />
          {/* `overdue` asserts that nothing was paid, so it waits for the read; `dueBy` states when
              the month falls due, which is true either way and needs no such guard. */}
          {paid ? t('ownerHub.receivedThisMonth') : s.overdue && !pending ? t('ownerHub.overdueOn', { day: s.dueDay }) : t('ownerHub.dueBy', { day: s.dueDay })}
        </p>
        {!paid && (
          <button onClick={() => markPaid(s.ym)} disabled={pending || !!busyMonth} aria-busy={busyMonth === s.ym} className="btn-teal w-full mt-3 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"><Icon name="check" className="w-4 h-4" /> {t('ownerHub.markReceived')}</button>
        )}
      </div>
      {prop.tenantMobile && (
        <a
          href={`https://wa.me/91${prop.tenantMobile}?text=${encodeURIComponent(t('ownerHub.inviteTenantText', { name: prop.tenantName, home: prop.title, link: `${window.location.origin}/dashboard#rental` }))}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 -mt-1 inline-flex items-center gap-1.5 text-xs text-brand-teal-3 hover:underline"
        >
          <Icon name="message-circle" className="w-3.5 h-3.5" /> {t('ownerHub.inviteTenant')}
        </a>
      )}

      <p className="text-xs text-gray-400 mb-2">{t('ownerHub.recentMonths')}</p>
      {failed && (
        <button onClick={load} className="mb-2 text-xs text-brand-teal-3 hover:underline flex items-center gap-1"><Icon name="refresh-cw" className="w-3.5 h-3.5" /> {t('ownerHub.retryReceipts')}</button>
      )}
      <ul className="space-y-1.5">
        {months.map((m) => {
          const r = byMonth.get(m.ym);
          return (
            <li key={m.ym} className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg hover:bg-white/[0.03]">
              <span className="text-gray-300">{m.label}</span>
              {r ? (
                <span className="flex items-center gap-3">
                  <span className="text-emerald-300 text-xs flex items-center gap-1"><Icon name="check-circle" className="w-3.5 h-3.5" /> {rentStr(r.amount)}</span>
                  {/* The month in the label keeps six rows' accessible names distinct. */}
                  <button onClick={() => download(r)} aria-label={t('ownerHub.receiptFor', { month: m.label })} className="text-brand-teal-3 text-xs hover:underline flex items-center gap-1"><Icon name="download" className="w-3.5 h-3.5" /> {t('ownerHub.receipt')}</button>
                </span>
              ) : (
                <button onClick={() => markPaid(m.ym)} disabled={pending || !!busyMonth} aria-busy={busyMonth === m.ym} aria-label={t('ownerHub.markReceivedFor', { month: m.label })} className="text-gray-400 text-xs hover:text-white border border-white/10 rounded-lg px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-400">{t('ownerHub.markReceived')}</button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
