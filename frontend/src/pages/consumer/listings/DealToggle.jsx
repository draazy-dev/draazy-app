import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';

export default function DealToggle({ deal, onChange, className = '' }) {
  const { t } = useTranslation();
  const opts = [
    { key: 'buy', label: t('listings.forSale'), icon: 'home' },
    { key: 'rent', label: t('listings.forRent'), icon: 'key-round' },
  ];
  return (
    <div
      className={'deal-seg inline-flex w-auto p-[3px] sm:p-1 rounded-full glass border border-white/10 ' + className}
      role="radiogroup"
      aria-label={t('listings.dealToggleAria')}
    >
      {opts.map((o) => {
        const active = deal === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => { if (!active) onChange(o.key); }}
            className={'deal-seg-btn relative tap-extend inline-flex items-center justify-center gap-1 sm:gap-1.5 h-9 px-3 sm:px-5 rounded-full text-sm font-semibold t-all ' + (active ? 'is-active' : 'text-gray-400 hover:text-white')}
          >
            <Icon name={o.icon} className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> {o.label}
          </button>
        );
      })}
    </div>
  );
}
