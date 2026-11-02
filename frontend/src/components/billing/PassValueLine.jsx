import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon.jsx';
import { dealOf } from '../../lib/dealPlans.js';

export default function PassValueLine({ deal, className = 'text-[11px] text-gray-400' }) {
  const { t } = useTranslation();
  return (
    <p className={`${className} flex flex-wrap items-center gap-x-1.5`} data-testid="pass-value-line">
      <Icon name="shield-check" className="w-3.5 h-3.5 flex-shrink-0 text-teal-400" />
      <span>{t('misc1.passValueLine')}</span>
      <Link to={dealOf(deal) === 'buy' ? '/plans?deal=buy' : '/plans'} className="font-semibold text-teal-300 underline underline-offset-2">{t('misc1.whyFeeLink')}</Link>
    </p>
  );
}
