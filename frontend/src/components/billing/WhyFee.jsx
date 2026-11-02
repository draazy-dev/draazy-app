import { useTranslation } from 'react-i18next';
import Icon from '../Icon.jsx';
import { usePricing } from '../../context/PricingContext.jsx';

export default function WhyFee({ deal, kind, price, compact = false }) {
  const { t } = useTranslation();
  const { refunds, loaded } = usePricing();
  const refundDays = loaded ? (kind === 'pass' ? refunds.passGuaranteeDays : refunds.packRefundDays) : 0;
  const refundBody = kind === 'pass' ? t('misc1.refundGuaranteePass', { days: refundDays }) : t('misc1.refundGuaranteePack', { days: refundDays });

  const points = [
    { key: 'broker', icon: 'ban', title: t('misc1.whyBrokerTitle'), body: t('misc1.whyBrokerBody') },
    { key: 'checked', icon: 'search-check', title: t('misc1.whyCheckedTitle'), body: t('misc1.whyCheckedBody') },
    { key: 'verified', icon: 'user-check', title: t('misc1.whyVerifiedTitle'), body: t('misc1.whyVerifiedBody') },
    { key: 'private', icon: 'lock-keyhole', title: t('misc1.whyPrivateTitle'), body: t('misc1.whyPrivateBody') },
    refundDays > 0 && { key: 'refund', icon: 'shield-check', title: t('misc1.whyRefundTitle'), body: refundBody },
    { key: 'renew', icon: 'refresh-cw', title: t('misc1.whyRenewTitle'), body: t('misc1.whyRenewBody') },
  ].filter(Boolean);
  const shown = compact ? points.filter((p) => ['broker', 'checked', 'refund', 'renew'].includes(p.key)).slice(0, 3) : points;
  const savings = t(deal === 'buy' ? 'misc1.whySavingsBuy' : 'misc1.whySavingsRent', { price });

  return (
    <section className="glass rounded-2xl p-5 sm:p-6" data-testid="why-fee">
      <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
        <Icon name="sparkles" className="w-4 h-4 text-teal-400" /> {t('misc1.whyFeeTitle')}
      </h2>
      {compact ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
          {shown.map((p) => (
            <li key={p.key} className="flex items-center gap-1.5 text-sm font-semibold text-gray-200">
              <Icon name={p.icon} className="w-4 h-4 text-teal-400 flex-shrink-0" /> {p.title}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-4 mb-4">
          {shown.map((p) => (
            <li key={p.key} className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgb(var(--dz-c-teal-500) / .14)' }}>
                <Icon name={p.icon} className="w-4 h-4 text-teal-400" />
              </span>
              <span>
                <span className="block text-sm font-bold text-white">{p.title}</span>
                <span className="block text-xs text-gray-400 mt-0.5">{p.body}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-200" data-testid="why-fee-savings">
        <Icon name="piggy-bank" className="w-4 h-4 mt-0.5 flex-shrink-0" /> {savings}
      </p>
    </section>
  );
}
