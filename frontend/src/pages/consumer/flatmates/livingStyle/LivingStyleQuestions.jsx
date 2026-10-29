import { useTranslation } from 'react-i18next';
import Icon from '../../../../components/Icon.jsx';
import '../../../../styles/components/furniture-tiles.css';
import { STYLE_ICONS, STYLE_KEYS } from './questions.js';

const glueEmoji = (label) => label.replace(/ (?=\p{Extended_Pictographic})/u, '\u00A0');

export function LoadError({ onRetry }) {
  const { t } = useTranslation();
  return (
    <p role="alert" data-testid="ls-load-error" className="mb-3 text-xs text-rose-300">
      {t('flatmates.ls.loadFailed')}{' '}
      <button type="button" onClick={onRetry} className="underline font-semibold">{t('flatmates.ls.retry')}</button>
    </p>
  );
}

export default function LivingStyleQuestions({ answers, onChange, disabled = false }) {
  const { t } = useTranslation();
  const pick = (key, value) => {
    const next = { ...answers };
    if (next[key] === value) delete next[key];
    else next[key] = value;
    onChange(next);
  };
  return (
    <ol className="space-y-4" data-testid="ls-questions">
      {STYLE_KEYS.map((key) => (
        <li key={key} data-q={key}>
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-200">
            <Icon name={STYLE_ICONS[key]} className="w-4 h-4 text-teal-400 shrink-0" />
            {t(`flatmates.ls.q_${key}`)}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label={t(`flatmates.ls.q_${key}`)}>
            {[0, 1, 2].map((v) => (
              <button key={v} type="button" disabled={disabled} aria-pressed={answers[key] === v} data-v={v} onClick={() => pick(key, v)} className={'furn-tile furn-tile--text disabled:opacity-50' + (answers[key] === v ? ' checked' : '')}>
                <span className="furn-check" aria-hidden="true"><Icon name="check" className="w-3 h-3" /></span>
                {glueEmoji(t(`flatmates.ls.a_${key}_${v}`))}
              </button>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
