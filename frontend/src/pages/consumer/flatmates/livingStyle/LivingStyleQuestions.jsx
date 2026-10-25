import { useTranslation } from 'react-i18next';
import Icon from '../../../../components/Icon.jsx';
import { STYLE_ICONS, STYLE_KEYS } from './questions.js';

const optClass = (on) => 'seg w-full min-h-11 px-2 py-1.5 rounded-xl text-sm font-semibold leading-tight text-center text-gray-300 box-border' + (on ? ' active' : '');

export function LoadError({ onRetry }) {
  const { t } = useTranslation();
  return (
    <p role="alert" data-testid="ls-load-error" className="mb-3 text-xs text-rose-300">
      {t('flatmates.ls.loadFailed')}{' '}
      <button type="button" onClick={onRetry} className="underline font-semibold">{t('flatmates.ls.retry')}</button>
    </p>
  );
}

/** Twelve one-tap rows. Tapping the chosen option again clears that answer. */
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
              <button key={v} type="button" disabled={disabled} aria-pressed={answers[key] === v} data-v={v} onClick={() => pick(key, v)} className={optClass(answers[key] === v) + ' disabled:opacity-50'}>
                {t(`flatmates.ls.a_${key}_${v}`)}
              </button>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
