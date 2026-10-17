import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { fmtNum } from '../../../lib/format.js';
import { ymLabel } from '../../../lib/data/rentReminders.js';
import { generateSingle } from '../../../lib/rentReceipt.js';
import { Card } from './components.jsx';

const TONE = {
  paid: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300',
  overdue: 'bg-rose-500/10 border-rose-500/25 text-rose-300',
  due: 'bg-amber-500/10 border-amber-500/25 text-amber-300',
};

/** Rent an owner tracks against this user's mobile: this month's status plus the receipts issued to them. */
export default function TrackedRent({ homes }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const rupees = (n) => '₹' + fmtNum(n);

  const download = (r) => generateSingle({
    tenant: r.tenantName,
    landlord: r.landlordName,
    address: r.propertyAddress,
    rent: r.amount,
    mode: 'Cash / Bank',
    month: r.ym,
    txnRef: r.id,
    paidOnline: false,
  }).catch(() => toast(t('dash.trackedRent.downloadFailed'), 'error'));

  return homes.map((h) => {
    const state = TONE[h.status] ? h.status : 'due';
    return (
      <Card key={h.id} className="p-5" data-testid="tracked-rent">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-white font-bold truncate">{h.title}</h2>
            <p className="text-gray-400 text-xs mt-0.5 truncate">{h.address}</p>
          </div>
          <p className="text-white font-extrabold whitespace-nowrap">{t('dash.trackedRent.perMonth', { amount: rupees(h.monthlyRent) })}</p>
        </div>
        <p className={'mt-3 rounded-xl border px-3 py-2 text-xs font-medium flex items-center gap-1.5 ' + TONE[state]}>
          <Icon name={state === 'paid' ? 'check-circle' : state === 'overdue' ? 'alert-circle' : 'clock'} className="w-3.5 h-3.5 shrink-0" />
          {t('dash.trackedRent.' + state, { month: ymLabel(h.dueOn.slice(0, 7), i18n.language), day: Number(h.dueOn.slice(8)), owner: h.landlordName })}
        </p>
        {h.receipts.length > 0 && (
          <ul className="mt-3 divide-y divide-white/5">
            {h.receipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-300">{ymLabel(r.ym, i18n.language)} · {rupees(r.amount)}</span>
                <button onClick={() => download(r)} aria-label={t('dash.trackedRent.receiptFor', { month: ymLabel(r.ym, i18n.language) })} className="text-brand-teal-3 text-xs hover:underline flex items-center gap-1">
                  <Icon name="download" className="w-3.5 h-3.5" /> {t('dash.trackedRent.receipt')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  });
}
