import { useTranslation } from 'react-i18next';
import Icon from '../Icon.jsx';
import { usePricing } from '../../context/PricingContext.jsx';

/** One reassurance line at the point of purchase; renders nothing when the admin set the window to 0. */
export default function RefundGuarantee({ kind, className = 'text-xs text-emerald-300' }) {
  const { t } = useTranslation();
  const { refunds, loaded } = usePricing();
  const days = kind === 'pass' ? refunds.passGuaranteeDays : refunds.packRefundDays;
  if (!loaded || !(days > 0)) return null;
  return (
    <p className={`${className} flex items-start gap-1.5`} data-testid={`refund-guarantee-${kind}`}>
      <Icon name="shield-check" className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      {kind === 'pass' ? t('misc1.refundGuaranteePass', { days }) : t('misc1.refundGuaranteePack', { days })}
    </p>
  );
}
