import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { fmtNum } from '../../../lib/format.js';
import { updateManaged, listRentReceipts, recordRentReceipt } from '../../../services/managedService.js';
import { currentDueStatus, recentMonths } from '../../../lib/data/rentReminders.js';
import { generateSingle } from '../../../lib/rentReceipt.js';
import { FIELD_CLS } from './constants.js';

// Shared by the fetch window and the row window: fetching fewer receipts than rows shows a settled month as unpaid.
const LEDGER_MONTHS = 6;

// Settled months are a server fact; every figure comes off the returned receipt, never off `prop`.
// Gateway payments are webhook-controlled, so nothing here asserts them.
export default function RentPanel({ prop, onChange }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const rentStr = (n) => t('ownerHub.rentPerMo', { amount: fmtNum(n) });
  const [editing, setEditing] = useState(!prop.rented);
  const [form, setForm] = useState({
    tenantName: prop.tenantName || '',
    monthlyRent: prop.monthlyRent || (prop.deal === 'rent' ? prop.price : '') || '',
    dueDay: prop.dueDay || 5,
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

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

  const saveDetails = async (rented) => {
    // Clamped to 1–28 here (the server accepts anything): a due day of 31 would never fall due in February.
    await updateManaged(prop.id, {
      rented,
      tenantName: form.tenantName.trim(),
      monthlyRent: Number(form.monthlyRent) || 0,
      dueDay: Math.min(28, Math.max(1, Number(form.dueDay) || 5)),
    });
    setEditing(false);
    onChange?.();
    toast(rented ? t('ownerHub.trackingOn') : t('ownerHub.markedVacant'), 'success');
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

  // ---- Vacant / setup state ----
  if (!prop.rented || editing) {
    return (
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-1"><Icon name="receipt-indian-rupee" className="w-5 h-5 text-brand-teal-2" /><h2 className="text-lg font-bold text-white">{t('ownerHub.rentTracking')}</h2></div>
        <p className="text-gray-400 text-sm mb-5">{t('ownerHub.rentSetupSub')}</p>
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs text-gray-400 mb-1.5 block">{t('ownerHub.tenantName')}</span>
            <input value={form.tenantName} onChange={set('tenantName')} placeholder={t('ownerHub.tenantPlaceholder')} className={FIELD_CLS} />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-gray-400 mb-1.5 block">{t('ownerHub.monthlyRent')}</span>
              <input type="number" inputMode="numeric" value={form.monthlyRent} onChange={set('monthlyRent')} placeholder={t('ownerHub.rentPlaceholder')} className={FIELD_CLS} />
            </label>
            <label className="block">
              <span className="text-xs text-gray-400 mb-1.5 block">{t('ownerHub.dueDay')}</span>
              <input type="number" min="1" max="28" value={form.dueDay} onChange={set('dueDay')} className={FIELD_CLS} />
            </label>
          </div>
          <div className="flex gap-2.5">
            <button onClick={() => saveDetails(true)} className="btn-teal flex-1 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2"><Icon name="bell" className="w-4 h-4" /> {t('ownerHub.startTracking')}</button>
            {prop.rented && <button onClick={() => setEditing(false)} className="px-4 py-2.5 rounded-xl border border-white/10 text-gray-300 text-sm hover:bg-white/5">{t('ownerHub.cancel')}</button>}
          </div>
          {!prop.rented && <button onClick={() => saveDetails(false)} className="w-full text-center text-gray-500 text-xs hover:text-gray-300">{t('ownerHub.itsVacant')}</button>}
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
        <p className="text-xs text-gray-300">{s.label} · {prop.tenantName || t('ownerHub.tenant')}</p>
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
