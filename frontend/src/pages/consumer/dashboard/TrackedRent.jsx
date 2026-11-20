import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import LeaseFacts from '../../../components/LeaseFacts.jsx';
import TenantLeaseEnd from './TenantLeaseEnd.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { fmtNum } from '../../../lib/format.js';
import { ymLabel } from '../../../lib/data/rentReminders.js';
import { fyLabel, fyOf, generateMany, generateSingle } from '../../../lib/rentReceipt.js';
import { claimRentPaid } from '../../../services/managedService.js';
import { Card } from './components.jsx';

const TONE = {
  paid: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300',
  claimed: 'bg-sky-500/10 border-sky-500/25 text-sky-300',
  overdue: 'bg-rose-500/10 border-rose-500/25 text-rose-300',
  due: 'bg-amber-500/10 border-amber-500/25 text-amber-300',
};
const ICON = { paid: 'check-circle', claimed: 'clock', overdue: 'alert-circle', due: 'clock' };
const RECENT = 6;
// Above this annual rent the employer needs the landlord's PAN before allowing HRA.
const PAN_NEEDED_ABOVE = 100_000;

const toPdf = (h, r) => ({
  tenant: r.tenantName,
  landlord: r.landlordName,
  address: r.propertyAddress,
  rent: r.amount,
  pan: h.landlordPan,
  mode: 'Cash / Bank',
  month: r.ym,
  txnRef: r.id,
  paidOnline: false,
});

const byFinancialYear = (receipts) => {
  const years = new Map();
  for (const r of receipts) {
    const fy = fyOf(r.ym);
    years.set(fy, [...(years.get(fy) || []), r]);
  }
  return [...years].sort(([a], [b]) => b - a);
};

export default function TrackedRent({ homes, onChange }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState('');
  const rupees = (n) => '₹' + fmtNum(n);
  const failed = () => toast(t('dash.trackedRent.downloadFailed'), 'error');

  const claim = async (h) => {
    if (busy) return;
    setBusy(h.id);
    try {
      onChange?.(await claimRentPaid(h.id));
      toast(t('dash.trackedRent.claimedToast', { owner: h.landlordName }), 'success');
    } catch {
      toast(t('dash.trackedRent.claimFailed'), 'error');
    } finally {
      setBusy('');
    }
  };

  const bundle = (h, fy, rows) => generateMany(
    [...rows].sort((a, b) => a.ym.localeCompare(b.ym)).map((r) => toPdf(h, r)),
    'Rent-Receipts-' + fyLabel(fy).replace(/\s+/g, '-') + '.pdf',
  ).catch(failed);

  return homes.map((h) => {
    const state = TONE[h.status] ? h.status : 'due';
    const month = ymLabel(h.dueOn.slice(0, 7), i18n.language);
    return (
      <Card key={h.id} className="p-5" data-testid="tracked-rent">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-white font-bold truncate">{h.title}</h2>
            <p className="text-gray-400 text-xs mt-0.5 truncate">{h.address}</p>
          </div>
          <p className="text-white font-extrabold whitespace-nowrap">{t('dash.trackedRent.perMonth', { amount: rupees(h.monthlyRent) })}</p>
        </div>
        <p className={'mt-3 rounded-xl border px-3 py-2 text-xs font-medium flex items-center gap-1.5 ' + TONE[state]} data-testid="tracked-rent-status">
          <Icon name={ICON[state]} className="w-3.5 h-3.5 shrink-0" />
          {t('dash.trackedRent.' + state, { month, day: Number(h.dueOn.slice(8)), owner: h.landlordName })}
        </p>
        {(state === 'due' || state === 'overdue') && (
          <button onClick={() => claim(h)} disabled={!!busy} aria-busy={busy === h.id} className="mt-2 w-full min-h-[44px] py-2 rounded-xl border border-white/10 text-white text-sm font-semibold hover:bg-white/5 flex items-center justify-center gap-1.5 disabled:opacity-50">
            <Icon name="check" className="w-4 h-4" /> {t('dash.trackedRent.iPaid')}
          </button>
        )}
        <LeaseFacts home={h} testId="tracked-rent" className="mt-3" />
        <TenantLeaseEnd home={h} />
        {h.receipts.length > 0 && (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              {byFinancialYear(h.receipts).map(([fy, rows]) => (
                <button key={fy} onClick={() => bundle(h, fy, rows)} aria-label={t('dash.trackedRent.fyReceiptsFor', { fy: fyLabel(fy) })} className="rounded-lg border border-brand-teal/30 bg-brand-teal/10 min-h-[44px] px-2.5 py-1.5 text-xs font-medium text-brand-teal-3 hover:bg-brand-teal/15 flex items-center gap-1">
                  <Icon name="download" className="w-3.5 h-3.5" /> {t('dash.trackedRent.fyReceipts', { fy: fyLabel(fy) })}
                </button>
              ))}
            </div>
            {!h.landlordPan && h.monthlyRent * 12 > PAN_NEEDED_ABOVE && (
              <p className="mt-2 text-amber-300/90 text-xs" data-testid="tracked-rent-no-pan">{t('dash.trackedRent.noPan', { owner: h.landlordName })}</p>
            )}
            <ul className="mt-2 divide-y divide-white/5">
              {h.receipts.slice(0, RECENT).map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-gray-300">{ymLabel(r.ym, i18n.language)} · {rupees(r.amount)}</span>
                  <button onClick={() => generateSingle(toPdf(h, r)).catch(failed)} aria-label={t('dash.trackedRent.receiptFor', { month: ymLabel(r.ym, i18n.language) })} className="min-h-[44px] px-2 -mr-2 text-brand-teal-3 text-xs hover:underline flex items-center gap-1">
                    <Icon name="download" className="w-3.5 h-3.5" /> {t('dash.trackedRent.receipt')}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    );
  });
}
