import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import { daysUntil, SOON_DAYS } from '../../../components/LeaseFacts.jsx';
import { usePricing } from '../../../context/PricingContext.jsx';
import { fmtDate } from '../../../lib/format.js';
import { publishHref } from './helpers.js';

const GRACE_DAYS = 30;
const SECONDARY = 'min-h-[44px] px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 text-sm font-semibold inline-flex items-center justify-center gap-2';

export default function LeaseEndActions({ home }) {
  const { t } = useTranslation();
  const { fee } = usePricing();
  if (!home.rented || !home.leaseEnd) return null;
  const left = daysUntil(home.leaseEnd);
  if (left > SOON_DAYS || left < -GRACE_DAYS) return null;
  const relistTo = home.publishedListingId
    ? `/dashboard?${new URLSearchParams({ relist: home.publishedListingId, from: home.leaseEnd })}#properties`
    : null;
  return (
    <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3" data-testid="lease-end-actions">
      <p className="text-amber-200 text-sm font-semibold">{t('ownerHub.leaseEndTitle', { date: fmtDate(home.leaseEnd) })}</p>
      <p className="text-xs text-gray-400 mt-0.5">{t('ownerHub.leaseEndHint')}</p>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Link to={`/services/rent-agreement?renewHome=${encodeURIComponent(home.id)}`} data-testid="lease-end-renew" className="btn-teal min-h-[44px] px-4 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2">
          <Icon name="repeat" className="w-4 h-4" /> {t('ownerHub.leaseRenewCta', { price: fee('rentAgreementPlatform') })}
        </Link>
        {relistTo ? (
          <Link to={relistTo} data-testid="lease-end-relist" className={SECONDARY}><Icon name="megaphone" className="w-4 h-4" /> {t('ownerHub.leaseRelistCta')}</Link>
        ) : (
          <Link to={publishHref(home)} data-testid="lease-end-list" className={SECONDARY}><Icon name="megaphone" className="w-4 h-4" /> {t('ownerHub.leaseListCta', { date: fmtDate(home.leaseEnd) })}</Link>
        )}
      </div>
    </div>
  );
}
