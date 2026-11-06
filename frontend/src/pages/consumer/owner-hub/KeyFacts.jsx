import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import { fmtArea, fmtDate, fmtNum } from '../../../lib/format.js';
import { FURNISH_LABEL } from '../dashboard/myListings/helpers.js';

export default function KeyFacts({ prop }) {
  const { t } = useTranslation();
  const rent = prop.deal === 'rent';
  const furnishing = prop.furnishing && (FURNISH_LABEL[String(prop.furnishing).toLowerCase()] || prop.furnishing);
  const facts = [
    ['tag', 'factPurpose', t(rent ? 'ownerHub.forRent' : 'ownerHub.forSale')],
    ['indian-rupee', rent ? 'factRent' : 'factPrice', prop.price ? prop.priceStr : ''],
    rent && ['wallet', 'factDeposit', prop.deposit ? `₹${fmtNum(prop.deposit)}` : ''],
    ['home', 'factType', prop.type],
    ['bed-double', 'factConfig', prop.bhk],
    ['ruler', 'factArea', fmtArea(prop.area, prop.areaUnit)],
    ['sofa', 'factFurnishing', furnishing],
    ['building-2', 'factSociety', prop.society],
    ['key-round', 'factOccupancy', t(prop.rented ? 'ownerHub.occupied' : 'ownerHub.vacant')],
    ['calendar', 'factAdded', fmtDate(prop.createdAt)],
  ].filter(Boolean);
  return (
    <section className="glass-card rounded-2xl p-5 sm:p-6" data-testid="passport-facts">
      <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Icon name="clipboard-list" className="w-5 h-5 text-brand-teal-2" /> {t('ownerHub.keyFacts')}</h2>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {facts.map(([icon, key, value]) => (
          <div key={key} className="rd-cell min-w-0">
            <dt className="text-[11px] text-gray-500 flex items-center gap-1.5"><Icon name={icon} className="w-3.5 h-3.5" /> {t(`ownerHub.${key}`)}</dt>
            <dd className={'text-sm font-semibold mt-0.5 truncate ' + (value ? 'text-white' : 'text-gray-500')}>{value || t('ownerHub.notSet')}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
