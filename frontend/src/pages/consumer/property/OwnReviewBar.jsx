import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';

const BTN = 'inline-flex items-center gap-1 min-h-[44px] sm:min-h-0 px-2 py-1 rounded-lg font-medium transition-smooth';

export function OwnReviewBar({ onEdit, onDelete, busy }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1 mt-2 text-xs" data-testid="own-review-bar">
      <span className="mr-auto font-semibold text-brand-teal-3">{t('common.yourReview')}</span>
      <button type="button" onClick={onEdit} disabled={busy} className={BTN + ' text-slate-300 hover:text-white disabled:opacity-60'}>
        <Icon name="pencil" className="w-3.5 h-3.5" aria-hidden="true" /> {t('common.edit')}
      </button>
      <button type="button" onClick={onDelete} disabled={busy} className={BTN + ' text-slate-400 hover:text-rose-400 disabled:opacity-60'}>
        <Icon name="trash-2" className="w-3.5 h-3.5" aria-hidden="true" /> {t('common.delete')}
      </button>
    </div>
  );
}
