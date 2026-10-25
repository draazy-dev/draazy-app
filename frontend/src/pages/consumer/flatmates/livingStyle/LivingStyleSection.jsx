import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../../components/Icon.jsx';
import { useSignInGate } from '../../../../lib/useSignInGate.js';
import { livingStyleOf } from '../../../../services/flatmateService.js';
import { Section } from '../detail/parts.jsx';
import { StyleMatch } from '../atoms.jsx';
import LivingStyleSheet from './LivingStyleSheet.jsx';
import { MIN_COMMON, STYLE_ICONS, STYLE_KEYS } from './questions.js';
import useLivingStyle from './useLivingStyle.js';

const SAME = [
  { icon: 'check', cls: 'text-teal-300', key: 'same' },
  { icon: 'minus', cls: 'text-amber-300', key: 'close' },
  { icon: 'x-circle', cls: 'text-rose-300', key: 'differs' },
];

function Compare({ mine, theirs }) {
  const { t } = useTranslation();
  if (!Number.isInteger(mine)) return null;
  const s = SAME[Math.abs(mine - theirs)];
  return <span className={'inline-flex items-center gap-1 text-[11px] ' + s.cls} data-cmp={s.key}><Icon name={s.icon} className="w-3 h-3" />{t(`flatmates.ls.cmp_${s.key}`)}</span>;
}

/** The author's answers on a detail page, each set against the viewer's own. The server only returns answers to
 *  questions the viewer also answered, so a viewer with fewer than three sees an invitation instead. */
export default function LivingStyleSection({ kind, id, owned }) {
  const { t } = useTranslation();
  const mine = useLivingStyle();
  const gate = useSignInGate();
  const [data, setData] = useState(null);
  const [sheet, setSheet] = useState(false);
  const item = `${kind}:${id}`;
  const canCompare = mine.status === 'ready' && mine.count >= MIN_COMMON;

  useEffect(() => {
    if (!canCompare || owned) return undefined;
    let live = true;
    livingStyleOf(kind, id).then((r) => { if (live) setData({ item, r }); }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [kind, id, item, owned, canCompare, mine.version]);

  if (owned) return null;
  if (!mine.signedIn) {
    return (
      <Section icon="heart-handshake" title={t('flatmates.ls.sectionTitle')}>
        <div data-testid="ls-section-guest" className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-400">{t('flatmates.ls.guestBody')}</p>
          <button type="button" onClick={() => gate('default')} className="seg shrink-0 rounded-full px-4 min-h-10 text-sm font-semibold">{t('flatmates.ls.signIn')}</button>
        </div>
      </Section>
    );
  }
  if (mine.status !== 'ready') return null;
  if (!canCompare) {
    return (
      <Section icon="heart-handshake" title={t('flatmates.ls.sectionTitle')}>
        <button type="button" data-testid="ls-section-add" onClick={() => setSheet(true)} className="w-full text-left text-sm text-teal-300 underline">{t('flatmates.ls.addYours')}</button>
        {sheet && <LivingStyleSheet onClose={() => setSheet(false)} />}
      </Section>
    );
  }
  const theirs = data?.item === item ? data.r : null;
  const keys = STYLE_KEYS.filter((k) => Number.isInteger(theirs?.answers?.[k]));
  if (!keys.length) return null;

  return (
    <Section icon="heart-handshake" title={t('flatmates.ls.sectionTitle')} aside={<StyleMatch pct={theirs.match} />}>
      <dl data-testid="ls-section" className="-my-2">
        {keys.map((k) => (
          <div key={k} data-q={k} className="fm-row flex items-center justify-between gap-3 py-2.5">
            <dt className="flex items-center gap-2 text-xs text-gray-400 min-w-0"><Icon name={STYLE_ICONS[k]} className="w-3.5 h-3.5 text-teal-400 shrink-0" /><span className="truncate">{t(`flatmates.ls.q_${k}`)}</span></dt>
            <dd className="flex flex-col items-end text-right shrink-0">
              <span className="text-sm text-white">{t(`flatmates.ls.a_${k}_${theirs.answers[k]}`)}</span>
              <Compare mine={mine.answers[k]} theirs={theirs.answers[k]} />
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}