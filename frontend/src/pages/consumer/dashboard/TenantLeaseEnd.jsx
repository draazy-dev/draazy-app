import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import { daysUntil, SOON_DAYS } from '../../../components/LeaseFacts.jsx';
import { usePricing } from '../../../context/PricingContext.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { fmtDate } from '../../../lib/format.js';
import { updateNotificationPreferences } from '../../../services/notificationService.js';

const GRACE_DAYS = 30;
const MAX_RENT_FILTER = 100_000;
const ACTION = 'min-h-[44px] px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 text-sm font-semibold inline-flex items-center justify-center gap-2';

export default function TenantLeaseEnd({ home }) {
  const { t } = useTranslation();
  const { fee } = usePricing();
  const { toast } = useToast();
  const [called, setCalled] = useState('');
  if (!home.leaseEnd) return null;
  const left = daysUntil(home.leaseEnd);
  if (left > SOON_DAYS || left < -GRACE_DAYS) return null;

  const budget = Math.min(MAX_RENT_FILTER, Math.ceil((home.monthlyRent * 1.2) / 1000) * 1000);
  const searchTo = `/listings?${new URLSearchParams({ deal: 'rent', ...(budget > 0 && { rent: `0-${budget}` }) })}`;

  const askCall = async () => {
    setCalled('busy');
    try {
      await updateNotificationPreferences({ marketingCalls: true });
      setCalled('done');
    } catch {
      setCalled('');
      toast(t('dash.leaseEnd.callFailed'), 'error');
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3" data-testid="tenant-lease-end">
      <p className="text-amber-200 text-sm font-semibold">{t('dash.leaseEnd.title', { date: fmtDate(home.leaseEnd) })}</p>
      <Link to={`/services/rent-agreement?renewHome=${encodeURIComponent(home.id)}`} data-testid="tenant-lease-renew" className="btn-teal mt-3 w-full min-h-[44px] px-4 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2">
        <Icon name="repeat" className="w-4 h-4" /> {t('dash.leaseEnd.renew', { price: fee('rentAgreementPlatform') })}
      </Link>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Link to={searchTo} data-testid="tenant-lease-search" className={ACTION}><Icon name="search" className="w-4 h-4" /> {t('dash.leaseEnd.search')}</Link>
        <Link to={`/services/packers-movers?date=${encodeURIComponent(home.leaseEnd)}`} data-testid="tenant-lease-movers" className={ACTION}><Icon name="truck" className="w-4 h-4" /> {t('dash.leaseEnd.movers')}</Link>
      </div>
      {called === 'done' ? (
        <p className="mt-2 text-xs text-emerald-300 flex items-center gap-1.5" data-testid="tenant-lease-called"><Icon name="check-circle" className="w-3.5 h-3.5" /> {t('dash.leaseEnd.callDone')}</p>
      ) : (
        <>
          <button type="button" onClick={askCall} disabled={called === 'busy'} aria-busy={called === 'busy'} data-testid="tenant-lease-call" className={ACTION + ' mt-2 w-full disabled:opacity-50'}>
            <Icon name="phone-call" className="w-4 h-4" /> {t('dash.leaseEnd.call')}
          </button>
          <p className="mt-1 text-[11px] text-gray-500">{t('dash.leaseEnd.callConsent')}</p>
        </>
      )}
    </div>
  );
}
