import { useTranslation } from 'react-i18next';
import Icon from '../../../../components/Icon.jsx';
import { scrollToSection } from './helpers.js';

const ASSIST_ICONS = ['file-pen-line', 'globe', 'badge-indian-rupee', 'fingerprint', 'refresh-cw', 'shield-check'];

export default function InfoSections({ openFaq, setOpenFaq }) {
  const { t } = useTranslation();
  const items = t('services.ra.assist.item', { returnObjects: true });
  const faq = t('services.ra.assist.faq', { returnObjects: true });
  return (
    <>
      <section id="ra-assist" className="scroll-mt-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 section-pb">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">{t('services.ra.assist.title')}</h2>
        <ul className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {items.map((item, idx) => (
            <li key={item.name} className="glass-card rounded-2xl p-4 sm:p-5">
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-teal-400/20 to-teal-600/20 border border-teal-400/20 flex items-center justify-center mb-2.5 sm:mb-3"><Icon name={ASSIST_ICONS[idx]} className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-teal-400" /></div>
              <h3 className="text-white font-semibold text-[13px] sm:text-sm leading-snug">{item.name}</h3>
              <p className="text-gray-400 text-xs leading-snug mt-1">{item.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="ra-faq" className="scroll-mt-20 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 section-pb">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6 sm:text-center">{t('services.ra.assist.faqTitle')}</h2>
        <div className="space-y-2.5 sm:space-y-3">
          {faq.map(({ q, a }, i) => (
            <div key={q} className={'faq-item glass-card rounded-2xl overflow-hidden' + (openFaq === i ? ' open' : '')}>
              <button type="button" className="faq-q flex items-center justify-between gap-3 min-h-[56px] px-4 py-3 sm:p-5 w-full text-left" aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? -1 : i)}>
                <span className="text-white font-medium text-sm leading-snug">{q}</span>
                <Icon name="chevron-down" className="faq-chev w-5 h-5 text-teal-400 flex-shrink-0" />
              </button>
              <div className="faq-a"><p className="px-4 pb-4 sm:px-5 sm:pb-5 text-gray-400 text-sm leading-relaxed">{a}</p></div>
            </div>
          ))}
        </div>

        <div className="glass-card rounded-2xl p-5 mt-6 sm:mt-8 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between text-center sm:text-left">
          <div>
            <p className="text-white font-bold">{t('services.ra.assist.ctaTitle')}</p>
            <p className="text-gray-400 text-sm mt-0.5">{t('services.ra.assist.ctaDesc')}</p>
          </div>
          <button type="button" onClick={() => scrollToSection('ra-form')} className="btn-primary inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-xl font-semibold select-none">
            {t('services.ra.assist.ctaBtn')} <Icon name="arrow-up" className="w-4 h-4" />
          </button>
        </div>
      </section>
    </>
  );
}
