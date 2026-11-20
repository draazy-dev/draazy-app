import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VIBE_FILTER_KEYS } from '../../../lib/flatmates/filterState.js';
import { useSignInGate } from '../../../lib/useSignInGate.js';
import LivingStyleSheet from './livingStyle/LivingStyleSheet.jsx';
import { VibeLabel } from './livingStyle/LivingStyleQuestions.jsx';
import useLivingStyle from './livingStyle/useLivingStyle.js';
import { MIN_COMMON, VIBE_TRACK, vibeCellCx } from './livingStyle/questions.js';

export default function VibeFilter({ vibe, onChange }) {
  const { t } = useTranslation();
  const style = useLivingStyle();
  const gate = useSignInGate();
  const [sheet, setSheet] = useState(false);

  if (!style.signedIn) {
    return (
      <div data-testid="vibe-filter-guest" className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-400">{t('flatmates.ls.fGuest')}</p>
        <button type="button" onClick={() => gate('default')} className="seg shrink-0 rounded-full px-4 min-h-10 text-sm font-semibold">{t('flatmates.ls.signIn')}</button>
      </div>
    );
  }

  const ready = style.status === 'ready';
  const scorable = ready && style.count >= MIN_COMMON;
  const answered = (key) => scorable && Number.isInteger(style.answers[key]);
  const toggle = (token) => onChange(vibe.includes(token) ? vibe.filter((x) => x !== token) : [...vibe, token]);

  return (
    <div data-testid="vibe-filter" className="space-y-3">
      {ready && VIBE_FILTER_KEYS.some((key) => !answered(key)) && (
        <p data-testid="vibe-filter-hint" className="text-xs text-gray-400">
          {scorable ? t('flatmates.ls.fNeedsAnswer') : t('flatmates.ls.fNeedsThree', { count: MIN_COMMON })}{' '}
          <button type="button" onClick={() => setSheet(true)} className="underline font-semibold text-teal-300">{t('flatmates.ls.fAnswer')}</button>
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-3">
        {VIBE_FILTER_KEYS.map((key) => (
          <div key={key} data-q={key} role="group" aria-label={t(`flatmates.ls.q_${key}`)}>
            <p className="mb-1.5 text-xs font-medium text-gray-400">{t(`flatmates.ls.q_${key}`)}</p>
            <div className={VIBE_TRACK}>
              {[0, 1, 2].map((v) => {
                const token = `${key}:${v}`;
                const on = vibe.includes(token);
                return (
                  <button key={v} type="button" data-v={v} aria-pressed={on} disabled={!on && !answered(key)} onClick={() => toggle(token)} className={vibeCellCx(on)}>
                    <VibeLabel label={t(`flatmates.ls.a_${key}_${v}`)} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {sheet && <LivingStyleSheet onClose={() => setSheet(false)} />}
    </div>
  );
}
