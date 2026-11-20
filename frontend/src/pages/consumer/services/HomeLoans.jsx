import { useSearchParams } from 'react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ServiceLanding from '../../../components/ServiceLanding.jsx';
import { SUPPORT_PHONE } from '../../../lib/supportContact.js';
import LoanEmiCalc from './LoanEmiCalc.jsx';

export default function HomeLoans() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [prefillType, setPrefillType] = useState('');

  useEffect(() => {
    const typeParam = searchParams.get('type');
    if (typeParam) {
      const options = ['Home Purchase Loan', 'Plot / Land Loan', 'Home Construction Loan', 'Balance Transfer', 'Top-up Loan', 'Loan Against Property'];
      const match = options.find(opt => opt.toLowerCase().includes(typeParam.toLowerCase()));
      if (match) setPrefillType(match);
    }
  }, [searchParams]);

  return (
    <ServiceLanding
      desk="loans"
      heroGradient="linear-gradient(140deg,rgb(var(--dz-c-slate-950)) 0%,rgb(var(--dz-c-teal-950)) 48%,rgb(var(--dz-c-emerald-950)) 100%)"
      heroImage="https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1600&q=80"

      badge={t('services.homeLoans.badge')}
      badgeIcon="badge-percent"
      titleTop={t('services.homeLoans.titleTop')}
      titleAccent={t('services.homeLoans.titleAccent')}
      subtitle={t('services.homeLoans.subtitle')}
      features={[['search-check', t('services.homeLoans.feature1')], ['indian-rupee', t('services.homeLoans.feature2')], ['file-check-2', t('services.homeLoans.feature3')]]}
      quote={{
        icon: 'landmark', title: t('services.homeLoans.quoteTitle'), subtitle: t('services.homeLoans.quoteSub'),
        serviceField: 'loanType', submitLabel: t('services.homeLoans.submitLabel'),
        servicesHeading: t('services.homeLoans.servicesHeading'),
        servicesSub: t('services.homeLoans.servicesSub'),
        trustHeading: t('services.homeLoans.trustHeading'),
        fields: [
          { name: 'loanType', label: t('services.homeLoans.fLoanType'), type: 'select', required: true, full: true, placeholder: t('services.homeLoans.fLoanTypePlaceholder'), options: ['Home Purchase Loan', 'Plot / Land Loan', 'Home Construction Loan', 'Balance Transfer', 'Top-up Loan', 'Loan Against Property'], value: prefillType },
          { name: 'amount', label: t('services.homeLoans.fAmount'), type: 'money', placeholder: t('services.homeLoans.fAmountPlaceholder') },
          { name: 'employment', label: t('services.homeLoans.fEmployment'), type: 'select', options: ['Salaried', 'Self-employed Professional', 'Self-employed Business'] },
          { name: 'income', label: t('services.homeLoans.fIncome'), type: 'money', placeholder: t('services.homeLoans.fIncomePlaceholder') },
          { name: 'city', label: t('services.homeLoans.fCity'), placeholder: 'Pune', value: 'Pune' },
        ],
      }}
      stats={[['Many', t('services.homeLoans.stat.lenders')], ['Quick', t('services.homeLoans.stat.eligibility')], ['24 hrs', t('services.homeLoans.stat.callback')], ['1', t('services.homeLoans.stat.oneForm')]]}
      services={[
        [t('services.homeLoans.service.0.name'), 'home', t('services.homeLoans.service.0.desc')],
        [t('services.homeLoans.service.1.name'), 'map', t('services.homeLoans.service.1.desc')],
        [t('services.homeLoans.service.2.name'), 'hard-hat', t('services.homeLoans.service.2.desc')],
        [t('services.homeLoans.service.3.name'), 'repeat', t('services.homeLoans.service.3.desc')],
        [t('services.homeLoans.service.4.name'), 'plus-circle', t('services.homeLoans.service.4.desc')],
        [t('services.homeLoans.service.5.name'), 'building', t('services.homeLoans.service.5.desc')],
      ]}
      extra={<LoanEmiCalc t={t} />}
      trust={[
        [t('services.homeLoans.trust.0.t'), 'landmark', t('services.homeLoans.trust.0.d')],
        [t('services.homeLoans.trust.1.t'), 'indian-rupee', t('services.homeLoans.trust.1.d')],
        [t('services.homeLoans.trust.2.t'), 'search-check', t('services.homeLoans.trust.2.d')],
        [t('services.homeLoans.trust.3.t'), 'headset', t('services.homeLoans.trust.3.d')],
      ]}
      steps={[
        [t('services.homeLoans.step.0.t'), 'clipboard-list', t('services.homeLoans.step.0.d')],
        [t('services.homeLoans.step.1.t'), 'scale', t('services.homeLoans.step.1.d')],
        [t('services.homeLoans.step.2.t'), 'file-check-2', t('services.homeLoans.step.2.d')],
        [t('services.homeLoans.step.3.t'), 'wallet', t('services.homeLoans.step.3.d')],
      ]}
      faqs={[
        [t('services.homeLoans.faq.0.q'), t('services.homeLoans.faq.0.a')],
        [t('services.homeLoans.faq.1.q'), t('services.homeLoans.faq.1.a')],
        [t('services.homeLoans.faq.2.q'), t('services.homeLoans.faq.2.a')],
        [t('services.homeLoans.faq.3.q'), t('services.homeLoans.faq.3.a')],
        [t('services.homeLoans.faq.4.q'), t('services.homeLoans.faq.4.a')],
      ]}
      cta={{ title: t('services.homeLoans.ctaTitle'), sub: t('services.homeLoans.ctaSub'), primary: t('services.homeLoans.ctaPrimary'), icon: 'badge-percent', phone: SUPPORT_PHONE }}
    />
  );
}
