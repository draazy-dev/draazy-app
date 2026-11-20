import { useTranslation } from 'react-i18next';
import Icon from '../../../../components/Icon.jsx';
import { ServiceBreadcrumbs } from '../../../../components/Breadcrumbs.jsx';
import { scrollToSection } from './helpers.js';

const TRUST = [['shield-check', 'chip1'], ['badge-indian-rupee', 'chip2'], ['fingerprint', 'chip3']];
const JUMPS = [['ra-docs', 'clipboard-list', 'jumpDocs'], ['ra-assist', 'badge-check', 'jumpAssist'], ['ra-faq', 'help-circle', 'jumpFaq']];

export default function Hero() {
  const { t } = useTranslation();
  return (
    <>
      <section className="hero theme-dark relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%,rgb(var(--dz-c-pure-white) / .3) 0,transparent 40%),radial-gradient(circle at 80% 70%,rgb(var(--dz-c-teal-500) / .5) 0,transparent 40%)' }} />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-14 sm:py-16 text-center">
          <ServiceBreadcrumbs k="rentAgreement" className="mb-4 text-left" />
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-white/10 border border-white/15 text-teal-200 text-xs sm:text-sm font-medium mb-4 sm:mb-5"><Icon name="file-signature" className="w-4 h-4" /> {t('services.ra.hero.badge')}</div>
          <h1 className="text-[1.75rem] sm:text-5xl font-extrabold text-white leading-[1.15] sm:leading-tight text-balance">{t('services.ra.hero.title1')}<br /><span className="gradient-text">{t('services.ra.hero.titleAccent')}</span></h1>
          <p className="text-gray-200 text-[15px] sm:text-lg mt-3 sm:mt-5 max-w-2xl mx-auto leading-relaxed text-pretty">{t('services.ra.hero.subtitle')}</p>
          <ul className="grid grid-cols-3 gap-2 mt-6 sm:mt-7 sm:flex sm:flex-wrap sm:justify-center sm:gap-3">
            {TRUST.map(([icon, k]) => (
              <li key={k} className="flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-xl bg-white/10 border border-white/15 text-white text-xs font-medium leading-tight sm:flex-row sm:gap-2 sm:px-4 sm:py-2 sm:rounded-full sm:text-sm">
                <Icon name={icon} className="w-5 h-5 sm:w-4 sm:h-4 text-teal-300" /> {t(`services.ra.hero.${k}`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
        <div className="glass-card rounded-2xl p-4 sm:p-6 reveal">
          <ol className="grid grid-cols-3 gap-2 sm:gap-6">
            {[1, 2, 3].map((n) => (
              <li key={n} className="relative flex flex-col items-center text-center gap-2 sm:flex-row sm:items-start sm:text-left sm:gap-3">
                {n < 3 && <span aria-hidden="true" className="sm:hidden absolute top-[18px] left-[calc(50%_+_1.5rem)] right-[calc(1rem_-_50%)] border-t border-dashed border-teal-400/40" />}
                <div className={'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-bold ' + (n === 3 ? 'bg-emerald-400/15 text-emerald-400' : 'bg-teal-400/15 text-teal-400')}>{n}</div>
                <div>
                  <p className="text-white font-semibold text-[13px] sm:text-sm leading-snug">{t(`services.ra.hero.step${n}Title`)}</p>
                  <p className="text-gray-400 text-[11px] sm:text-xs mt-0.5 leading-snug">{t(`services.ra.hero.step${n}Desc`)}</p>
                </div>
              </li>
            ))}
          </ol>
          <nav aria-label={t('services.ra.hero.jumpLabel')} className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/10 sm:flex sm:justify-center">
            {JUMPS.map(([id, icon, k]) => (
              <button key={id} type="button" onClick={() => scrollToSection(id)} className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-2 sm:px-4 rounded-xl bg-white/[0.03] border border-white/10 text-white text-xs font-semibold select-none transition-colors active:bg-teal-400/15 hover:border-teal-400/40">
                <Icon name={icon} className="w-4 h-4 text-teal-400 flex-shrink-0" /> {t(`services.ra.hero.${k}`)}
              </button>
            ))}
          </nav>
        </div>
      </section>
    </>
  );
}
