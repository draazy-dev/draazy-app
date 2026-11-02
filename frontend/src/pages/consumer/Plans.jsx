import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/Icon.jsx';
import { Link, useSearchParams } from 'react-router';
import { usePricing } from '../../context/PricingContext.jsx';
import { listPlans } from '../../services/planService.js';
import { useAuth } from '../../context/AuthContext.jsx';
import WhyFee from '../../components/billing/WhyFee.jsx';
import { packSlug, passSlug, packPriceKey, passPriceKey } from '../../lib/dealPlans.js';

const rupees = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

const freePlan = (t, n) => ({
  id: 'free',
  name: t('misc1.plansSeekerFreeName'),
  price: '₹0',
  sub: t('misc1.plansSeekerFreeSub'),
  unit: t('misc1.plansFreeSummary'),
  feats: [
    t('misc1.plansSeekerFreeFeat2'),
    t('misc1.plansOwnerFreeFeat1'),
    t('misc1.plansSeekerFreeFeat1'),
    t('misc1.plansSeekerFreeFeat3'),
    t('misc1.plansSeekerFreeFeat4'),
    t('misc1.contactComesBack', { days: n.contactReplyDays }),
    t('misc1.plansOwnerFreeFeat2'),
    t('misc1.plansOwnerFreeFeat3'),
    t('misc1.plansOwnerFreeFeat4', { days: n.featuredDays }),
    t('misc1.plansOwnerFreeFeat5'),
  ],
  ctas: [
    { label: t('misc1.plansSeekerFreeCta'), href: '/listings' },
    { label: t('misc1.plansOwnerFreeCta'), href: '/list-property' },
  ],
});

const packPlan = (t, n, deal) => ({
  id: packSlug(deal),
  audience: { label: t('misc1.plansForSeekers'), icon: 'search' },
  name: t(deal === 'buy' ? 'misc1.plansPackBuyName' : 'misc1.plansPackRentName'),
  price: n.pack,
  sub: t('misc1.plansContactPackSub', { count: n.contacts, days: n.packDays }),
  unit: t('misc1.plansPerContact', { price: n.perContact }),
  feats: [
    t(deal === 'buy' ? 'misc1.plansPackBuyFeat1' : 'misc1.plansPackRentFeat1', { count: n.contacts }),
    t('misc1.plansContactPackFeat2', { days: n.packDays }),
    t('misc1.plansContactPackFeat3'),
    t('misc1.plansContactPackFeat4'),
    n.packRefundDays > 0 && t('misc1.refundGuaranteePack', { days: n.packRefundDays }),
  ].filter(Boolean),
  ctas: [{ label: t('misc1.plansContactPackCta'), href: `/checkout?plan=${packSlug(deal)}`, primary: true }],
});

const passPlan = (t, n, deal) => ({
  id: passSlug(deal),
  audience: { label: t('misc1.plansForOwners'), icon: 'building-2' },
  name: t(deal === 'buy' ? 'misc1.plansPassBuyName' : 'misc1.plansPassRentName'),
  price: n.pass,
  sub: t('misc1.plansListingPassSub', { days: n.passDays }),
  unit: t('misc1.plansPerDay', { price: n.perDay }),
  feats: [
    t('misc1.plansListingPassFeat1', { days: n.passDays }),
    t('misc1.plansListingPassFeat2'),
    t('misc1.plansListingPassFeat3'),
    t('misc1.plansListingPassFeat4'),
    n.passGuaranteeDays > 0 && t('misc1.refundGuaranteePass', { days: n.passGuaranteeDays }),
  ].filter(Boolean),
  ctas: [{ label: t('misc1.plansListingPassCta'), href: '/dashboard#properties', primary: true }],
});

const plansFaqs = (t, rentFee, d) => [
  [t('misc1.plansFaq1Q'), t('misc1.plansFaq1A', { rentFee: d.rent.pack, rentCount: d.rent.contacts, rentDays: d.rent.packDays, buyFee: d.buy.pack, buyCount: d.buy.contacts, buyDays: d.buy.packDays })],
  [t('misc1.plansFaq2Q'), t('misc1.plansFaq2A')],
  [t('misc1.plansFaq3Q'), t('misc1.plansFaq3A')],
  [t('misc1.plansFaq4Q'), t('misc1.plansFaq4A', { fee: rentFee })],
  [t('misc1.plansFaq5Q'), t('misc1.plansFaq5A', { rentFee: d.rent.pass, rentDays: d.rent.passDays, buyFee: d.buy.pass, buyDays: d.buy.passDays })],
];

function PlanCard({ p }) {
  const { t } = useTranslation();
  const Name = p.audience ? 'h3' : 'h2';
  return (
    <div className={'glass rounded-2xl px-5 pt-5 pb-2 sm:px-6 sm:pt-6 sm:pb-3 flex flex-col ' + (p.audience ? 'plan-pop' : '')}>
      {p.audience && (
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1.5">
          <Icon name={p.audience.icon} className="w-3.5 h-3.5 text-teal-400" /> {p.audience.label}
        </h2>
      )}
      <Name className="text-lg font-extrabold">{p.name}</Name>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-4xl font-extrabold tabular-nums">{p.price}</span>
        <span className="text-gray-400 text-sm">{p.sub}</span>
      </p>
      <p className="text-teal-300 text-sm font-semibold mt-1">{p.unit}</p>
      <div className="mt-4 flex gap-2">
        {p.ctas.map((c) => (
          <Link key={c.href} to={c.href} className={'flex-1 text-center py-2.5 rounded-xl font-semibold text-sm ' + (c.primary ? 'btn-teal' : 'btn-outline')}>{c.label}</Link>
        ))}
      </div>
      <details className="mt-2">
        <summary className="flex items-center gap-1.5 cursor-pointer text-sm font-medium text-gray-400 hover:text-white min-h-[44px]">
          {t('misc1.plansWhatsIncluded')}<Icon name="chevron-down" className="faq-chevron w-4 h-4 transition-transform" />
        </summary>
        <ul className="space-y-2 pb-1">
          {p.feats.map((f) => <li key={f} className="flex gap-2 text-sm text-gray-300"><Icon name="check" className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> {f}</li>)}
        </ul>
      </details>
    </div>
  );
}

export default function Plans() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { hasEverListed } = useAuth();
  const { fee, prices, referral, refunds, loaded } = usePricing();
  const [catalogue, setCatalogue] = useState({});
  useEffect(() => {
    let alive = true;
    listPlans()
      .then((rows) => {
        if (!alive) return;
        const byslug = {};
        rows.forEach((r) => { if (r.slug) byslug[r.slug] = r; });
        setCatalogue(byslug);
      })
      .catch(() => { if (alive) setCatalogue({}); });
    return () => { alive = false; };
  }, []);
  const RENT_FEE = fee('rentAgreementPlatform');
  const [deal, setDeal] = useState(() => (searchParams.get('deal') === 'buy' ? 'buy' : 'rent'));
  const dealFacts = (d) => {
    const pack = catalogue[packSlug(d)];
    const pass = catalogue[passSlug(d)];
    const buy = d === 'buy';
    const packPrice = pack?.price ?? prices[packPriceKey(d)] ?? 0;
    const passPrice = pass?.price ?? prices[passPriceKey(d)] ?? 0;
    const contacts = pack?.contactLimit ?? 15;
    const passDays = pass?.termDays ?? (buy ? 90 : 60);
    return {
      contacts,
      packDays: pack?.termDays ?? (buy ? 60 : 30),
      passDays,
      pack: rupees(packPrice),
      pass: rupees(passPrice),
      perContact: rupees(Math.round(packPrice / contacts)),
      perDay: rupees(Math.round(passPrice / passDays)),
    };
  };
  const facts = { rent: dealFacts('rent'), buy: dealFacts('buy') };
  const n = {
    ...facts[deal],
    featuredDays: referral.featuredDays,
    contactReplyDays: refunds.contactReplyDays,
    packRefundDays: loaded ? refunds.packRefundDays : 0,
    passGuaranteeDays: loaded ? refunds.passGuaranteeDays : 0,
  };
  const pack = packPlan(t, n, deal);
  const pass = passPlan(t, n, deal);
  const paid = hasEverListed ? [pass, pack] : [pack, pass];
  const FAQS = plansFaqs(t, RENT_FEE, facts);
  const deals = [
    { key: 'rent', label: t('misc1.plansDealRent') },
    { key: 'buy', label: t('misc1.plansDealBuy') },
  ];
  return (
    <div className="pt-8 sm:pt-10 pb-20 max-w-3xl mx-auto px-4 sm:px-6">
      <header className="text-center mb-6 sm:mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold">{t('misc1.plansTitle')}</h1>
        <p className="text-gray-400 mt-2">{t('misc1.plansSubtitle')}</p>
      </header>

      <PlanCard p={freePlan(t, n)} />

      <div className="flex items-center justify-between gap-3 mt-8 mb-3">
        <p className="font-bold">{t('misc1.plansNeedMore')}</p>
        <div className="deal-seg flex w-44 p-1 rounded-full glass border border-white/10" role="radiogroup" aria-label={t('misc1.plansDealSwitch')} data-testid="plans-deal-switch">
          {deals.map((o) => {
            const on = deal === o.key;
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => { if (!on) setDeal(o.key); }}
                className={'deal-seg-btn flex-1 inline-flex items-center justify-center h-11 sm:h-10 px-3 rounded-full text-sm font-semibold t-all ' + (on ? 'is-active' : 'text-gray-400 hover:text-white')}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 items-start gap-4 mb-10">
        {paid.map((p) => <PlanCard key={p.id} p={p} />)}
      </div>

      <div className="mb-10">
        <WhyFee deal={deal} kind={hasEverListed ? 'pass' : 'pack'} price={hasEverListed ? facts[deal].pass : facts[deal].pack} />
      </div>

      <section className="glass rounded-2xl p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center gap-5 mb-10">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgb(var(--dz-c-teal-500) / .14)' }}><Icon name="file-signature" className="w-6 h-6 text-teal-400" /></div>
        <div className="flex-1">
          <h2 className="text-lg font-bold">{t('misc1.plansRentAgreement')}</h2>
          <p className="text-gray-400 text-sm mt-1">{t('misc1.plansRentAgreementBody1')}<span className="text-white font-semibold">{RENT_FEE}</span> <span className="text-white font-semibold">{t('misc1.plansPlatformFee')}</span>{t('misc1.plansRentAgreementBody2')}<span className="text-white font-semibold">{t('misc1.plansGovtCharges')}</span>{t('misc1.plansRentAgreementBody3')}</p>
        </div>
        <Link to="/services/rent-agreement" className="btn-teal px-5 py-2.5 rounded-xl font-semibold text-sm text-center whitespace-nowrap flex-shrink-0">{t('misc1.plansCreateRentAgreement')}</Link>
      </section>

      <section className="mb-12">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2"><Icon name="help-circle" className="w-4 h-4 text-teal-400" /> {t('misc1.plansFrequentlyAsked')}</h2>
        <div className="space-y-3">
          {FAQS.map(([q, a]) => (
            <details key={q} className="glass rounded-xl px-5">
              <summary className="flex items-center justify-between cursor-pointer font-medium text-sm py-4 min-h-[44px]">{q}<Icon name="chevron-down" className="faq-chevron w-4 h-4 text-gray-400 transition-transform flex-shrink-0" /></summary>
              <p className="text-gray-400 text-sm mt-3 pb-4 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="text-center text-gray-500 text-sm">{t('misc1.plansFooter1')}<span className="text-gray-300 font-medium">{t('misc1.plansFooterBold')}</span></p>
    </div>
  );
}
