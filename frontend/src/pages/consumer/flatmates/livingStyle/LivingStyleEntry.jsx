import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../../components/Icon.jsx';
import { useSignInGate } from '../../../../lib/useSignInGate.js';
import LivingStyleSheet from './LivingStyleSheet.jsx';
import { MIN_COMMON, STYLE_KEYS } from './questions.js';
import useLivingStyle from './useLivingStyle.js';

/** The one optional way in to the questionnaire from the board. Guests sign in first, then land in the sheet. */
export default function LivingStyleEntry() {
  const { t } = useTranslation();
  const style = useLivingStyle();
  const gate = useSignInGate();
  const [open, setOpen] = useState(false);
  const done = style.count > 0;
  const total = STYLE_KEYS.length;
  const sub = !done ? t('flatmates.ls.entrySub')
    : style.count < MIN_COMMON ? t('flatmates.ls.entryLocked', { count: MIN_COMMON - style.count })
      : t(style.count < total ? 'flatmates.ls.entryPartial' : 'flatmates.ls.entryAll');

  const start = () => {
    if (style.signedIn) setOpen(true);
    else gate('default', null, () => setOpen(true));
  };

  return (
    <>
      <div data-testid="ls-entry" data-answered={style.count} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] px-4 py-3">
        <Icon name="heart-handshake" className="w-5 h-5 text-pink-300 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{done ? t('flatmates.ls.entryDone', { n: style.count, total }) : t('flatmates.ls.entryTitle')}</p>
          <p data-testid="ls-entry-sub" className="text-xs text-gray-400">{sub}</p>
        </div>
        <button type="button" onClick={start} data-testid="ls-open" className={(done ? 'seg ' : 'btn-teal text-white ') + 'shrink-0 rounded-full px-4 min-h-10 text-sm font-semibold'}>
          {t(done ? 'flatmates.ls.edit' : 'flatmates.ls.start')}
        </button>
      </div>
      {open && <LivingStyleSheet onClose={() => setOpen(false)} />}
    </>
  );
}
