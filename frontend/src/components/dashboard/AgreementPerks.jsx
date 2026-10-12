import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon.jsx';
import { usePricing } from '../../context/PricingContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { fmtDate, fmtINR } from '../../lib/format.js';
import { shareOrCopy } from '../../lib/share.js';

const LIVE = new Set(['registered', 'active']);
const DAY = 86400000;

/** Registered agreements get a renewal strip from 60 days before the end date until 30 days after it. */
function renewalState(ra, now = Date.now()) {
  if (!LIVE.has(ra?.status) || !ra.endDate) return null;
  const end = Date.parse(`${ra.endDate}T00:00:00Z`);
  if (Number.isNaN(end)) return null;
  const left = Math.ceil((end - now) / DAY);
  return left <= 60 && left >= -30 ? { end, left } : null;
}

export default function AgreementPerks({ ra, isOwner = false }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { fee } = usePricing();
  const renewal = renewalState(ra);
  const saved = LIVE.has(ra?.status) && ra.rent > 0 ? ra.rent : 0;
  if (!renewal && !saved) return null;

  const renewQuery = new URLSearchParams({
    ...(ra.propertyId && { listing: ra.propertyId }),
    ...(ra.id && { renew: ra.id }),
  }).toString();
  const renewTo = '/services/rent-agreement' + (renewQuery ? `?${renewQuery}` : '');
  const nextDay = renewal ? new Date(renewal.end + DAY).toISOString().slice(0, 10) : '';
  const relistTo = renewal && ra.propertyId
    ? `/dashboard?${new URLSearchParams({ relist: ra.propertyId, from: nextDay })}#properties`
    : '';

  const share = async () => {
    const text = t('dash.savedShareText', { amount: fmtINR(saved) });
    const res = await shareOrCopy({ text, url: window.location.origin });
    if (res === 'copied') toast(t('dash.savedCopied'), 'success');
    else if (res === 'failed') toast(t('dash.savedShareFailed'), 'error');
  };

  return (
    <div className="mt-2 space-y-2">
      {renewal && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3">
          <p className="text-amber-200 text-xs font-semibold">{t('dash.renewEnds', { date: fmtDate(renewal.end) })}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link to={renewTo} className="btn-teal min-h-[44px] px-4 rounded-xl text-white text-xs font-semibold inline-flex items-center justify-center">{t('dash.renewCta', { price: fee('rentAgreementPlatform') })}</Link>
            {isOwner && relistTo && (
              <Link to={relistTo} className="min-h-[44px] px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 text-xs font-semibold inline-flex items-center justify-center">{t('dash.relistCta')}</Link>
            )}
          </div>
        </div>
      )}
      {saved > 0 && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <p className="text-emerald-300 min-w-0 truncate">{t('dash.savedLine', { amount: fmtINR(saved) })}</p>
          <button type="button" onClick={share} className="flex-shrink-0 inline-flex min-h-[44px] items-center gap-1 px-2 text-teal-300 hover:text-teal-200 font-semibold"><Icon name="share-2" className="w-3.5 h-3.5" /> {t('dash.savedShare')}</button>
        </div>
      )}
    </div>
  );
}
