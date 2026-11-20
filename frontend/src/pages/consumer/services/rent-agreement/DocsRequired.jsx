import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../../components/Icon.jsx';

const GROUPS = [
  { key: 'owner', icon: 'key-round', tone: ['bg-teal-400/15', 'text-teal-400'] },
  { key: 'tenant', icon: 'user', tone: ['bg-teal-400/15', 'text-teal-400'] },
  { key: 'other', icon: 'users', tone: ['bg-amber-400/15', 'text-amber-400'] },
];

export default function DocsRequired() {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const tabs = useRef([]);
  const select = (i) => {
    setActive(i);
    tabs.current[i]?.focus();
  };
  const onKeyDown = (e) => {
    const move = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (move) select((active + move + GROUPS.length) % GROUPS.length);
  };
  return (
    <section id="ra-docs" className="scroll-mt-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 section-pb">
      <h2 className="text-xl sm:text-2xl font-bold text-white">{t('services.ra.docs.title')}</h2>
      <p className="text-gray-400 text-sm mt-1 mb-4 sm:mb-6">{t('services.ra.docs.subtitle')}</p>
      <div role="tablist" aria-label={t('services.ra.docs.title')} className="md:hidden grid grid-cols-3 gap-1 p-1 mb-3 rounded-xl bg-white/[0.03] border border-white/10">
        {GROUPS.map((g, i) => (
          <button
            key={g.key} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab"
            id={`ra-docs-tab-${g.key}`} aria-controls={`ra-docs-panel-${g.key}`} aria-selected={i === active} tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)} onKeyDown={onKeyDown}
            className={'min-h-[44px] rounded-lg text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 select-none transition-colors ' + (i === active ? 'bg-teal-400/15 text-teal-400 ring-1 ring-inset ring-teal-400/40' : 'text-gray-400')}
          >
            {t(`services.ra.docs.tab.${g.key}`)}
            <span className="text-[11px] tabular-nums opacity-70">{t(`services.ra.docs.${g.key}Items`, { returnObjects: true }).length}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {GROUPS.map((g, i) => (
          <div key={g.key} id={`ra-docs-panel-${g.key}`} role="tabpanel" aria-labelledby={`ra-docs-tab-${g.key}`} className={'glass-card rounded-2xl p-4 sm:p-6 ' + (i === active ? '' : 'hidden md:block')}>
            <div className="flex items-center gap-3 mb-3 sm:mb-4">
              <div className={'w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ' + g.tone[0]}><Icon name={g.icon} className={'w-5 h-5 ' + g.tone[1]} /></div>
              <h3 className="text-white font-bold">{t(`services.ra.docs.${g.key}Title`)}</h3>
            </div>
            <ul className="space-y-2.5 text-sm text-gray-400 leading-snug">
              {t(`services.ra.docs.${g.key}Items`, { returnObjects: true }).map((d) => (
                <li key={d} className="flex items-start gap-2"><Icon name="check" className={'w-4 h-4 mt-px flex-shrink-0 ' + g.tone[1]} /> {d}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
