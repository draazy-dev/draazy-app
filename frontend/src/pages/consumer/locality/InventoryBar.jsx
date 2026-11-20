import { Link } from 'react-router';
import { Trans, useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import { fmtINR } from '../../../lib/format.js';

export default function InventoryBar({ loc, activeName }) {
  const { t } = useTranslation();
  const deals = [['buy', loc.forSale, loc.fromSale], ['rent', loc.forRent, loc.fromRent]].filter(([, n]) => n > 0);
  return deals.length ? (
    <div className="glass-card rounded-2xl px-5 py-1 divide-y divide-white/5">
      {deals.map(([deal, n, from]) => (
        <Link key={deal} to={`/listings?deal=${deal}&loc=${encodeURIComponent(loc.slug)}`} className="min-h-[44px] py-2 flex items-center justify-between gap-3 group">
          <span className="flex items-center gap-2.5 text-sm text-gray-200">
            <Icon name={deal === 'buy' ? 'home' : 'key-round'} className="w-4.5 h-4.5 text-teal-400" />
            <span><Trans i18nKey={deal === 'buy' ? 'locality.invSale' : 'locality.invRent'} count={n} values={{ count: n, name: activeName }} components={{ 1: <span className="font-bold text-white" /> }} />{from != null ? <> · {t('locality.invFrom')} <span className="font-semibold text-white whitespace-nowrap">{fmtINR(from)}{deal === 'rent' ? t('locality.invPerMonth') : ''}</span></> : null}</span>
          </span>
          <span className="text-teal-400 text-sm font-semibold inline-flex items-center gap-1 flex-shrink-0">{t('locality.invView')} <Icon name="arrow-right" className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></span>
        </Link>
      ))}
    </div>
  ) : (
    <Link to="/list-property" className="glass-card rounded-2xl px-5 py-3.5 flex items-center justify-between gap-3 hover:border-teal-400/30 transition-all group">
      <span className="flex items-center gap-2.5 text-sm text-gray-300"><Icon name="plus-circle" className="w-4.5 h-4.5 text-teal-400" /> {t('locality.invNone', { name: activeName })}</span>
      <span className="text-teal-400 text-sm font-semibold inline-flex items-center gap-1 flex-shrink-0">{t('locality.invListFree')} <Icon name="arrow-right" className="w-4 h-4" /></span>
    </Link>
  );
}
