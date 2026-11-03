import { useTranslation } from 'react-i18next';
import Icon from '../../../../components/Icon.jsx';
import { STYLE_ICONS, STYLE_KEYS, VIBE_TRACK, splitEmoji, vibeCellCx } from './questions.js';

export function VibeLabel({ label }) {
  const { emoji, text } = splitEmoji(label);
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {emoji && <span aria-hidden="true" className="shrink-0">{emoji}</span>}
      <span>{text}</span>
    </span>
  );
}

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
          <div className={'mt-2 ' + VIBE_TRACK} role="group" aria-label={t(`flatmates.ls.q_${key}`)}>
            {[0, 1, 2].map((v) => (
              <button key={v} type="button" disabled={disabled} aria-pressed={answers[key] === v} data-v={v} onClick={() => pick(key, v)} className={vibeCellCx(answers[key] === v)}>
                <VibeLabel label={t(`flatmates.ls.a_${key}_${v}`)} />
              </button>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
