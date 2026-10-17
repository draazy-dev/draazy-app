import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';

// Any caller mounting more than one strip must pass `aspect`: e2e and screen readers match "3 star" as a
// substring, so without it every row answers to the same name.
export function StarInput({ value, onChange, size = 24, aspect }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          className="p-0.5 leading-none"
          aria-label={aspect ? t('common.starAriaCat', { count: i, aspect }) : t('common.starAria', { count: i })}
        >
          <Icon name="star" weight={i <= value ? 'fill' : 'regular'} style={{ width: size, height: size }} className={i <= value ? 'text-amber-400' : 'text-slate-600'} />
        </button>
      ))}
    </span>
  );
}
