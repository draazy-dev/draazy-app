import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/Icon.jsx';
import { Link } from 'react-router';
import { usePricing } from '../../context/PricingContext.jsx';
import { listPlans } from '../../services/planService.js';
import { useAuth } from '../../context/AuthContext.jsx';

/** Prices come from the `GET /bootstrap` `plans` catalogue, which is what `POST /me/subscription` bills;
 * `fee()` is only the fallback, because a stale price still converts and a blank one does not. */
const rupees = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

const seekerPlans = (t, fee, n) => [
  { id: 'seeker-free', free: true, name: t('misc1.plansSeekerFreeName'), price: '₹0', sub: t('misc1.plansSeekerFreeSub'), tag: t('misc1.plansSeekerFreeTag'), feats: [t('misc1.plansSeekerFreeFeat1'), t('misc1.plansSeekerFreeFeat2'), t('misc1.plansSeekerFreeFeat3'), t('misc1.plansSeekerFreeFeat4'), t('misc1.contactComesBack', { days: n.contactReplyDays })], cta: t('misc1.plansSeekerFreeCta'), href: '/listings' },
  { id: 'contact-pack', name: t('misc1.plansContactPackName'), price: fee('contactPack'), sub: t('misc1.plansContactPackSub', { count: n.contacts, days: n.packDays }), tag: t('misc1.plansContactPackTag'), feats: [t('misc1.plansContactPackFeat1', { count: n.contacts }), t('misc1.plansContactPackFeat2', { days: n.packDays }), t('misc1.plansContactPackFeat3'), t('misc1.plansContactPackFeat4'), n.packRefundDays > 0 && t('misc1.refundGuaranteePack', { days: n.packRefundDays })].filter(Boolean), cta: t('misc1.plansContactPackCta'), href: '/checkout?plan=contact-pack', pop: true, badge: t('misc1.plansContactPackBadge') },
];
const ownerPlans = (t, fee, n) => [
  { id: 'owner-free', free: true, name: t('misc1.plansOwnerFreeName'), price: '₹0', sub: t('misc1.plansOwnerFreeSub'), tag: t('misc1.plansOwnerFreeTag'), feats: [t('misc1.plansOwnerFreeFeat1'), t('misc1.plansOwnerFreeFeat2'), t('misc1.plansOwnerFreeFeat3'), t('misc1.plansOwnerFreeFeat4', { days: n.featuredDays }), t('misc1.plansOwnerFreeFeat5')], cta: t('misc1.plansOwnerFreeCta'), href: '/list-property' },
  { id: 'listing-pass', name: t('misc1.plansListingPassName'), price: fee('listingPass'), sub: t('misc1.plansListingPassSub', { days: n.passDays }), tag: t('misc1.plansListingPassTag'), feats: [t('misc1.plansListingPassFeat1', { days: n.passDays }), t('misc1.plansListingPassFeat2'), t('misc1.plansListingPassFeat3'), t('misc1.plansListingPassFeat4'), n.passGuaranteeDays > 0 && t('misc1.refundGuaranteePass', { days: n.passGuaranteeDays })].filter(Boolean), cta: t('misc1.plansListingPassCta'), href: '/dashboard#properties', pop: true },
];
/** `price` resolves a plan slug to the card's price so FAQ prose can't quote a different number. */
const plansFaqs = (t, rentFee, price, n) => [
  [t('misc1.plansFaq1Q'), t('misc1.plansFaq1A', { fee: price('contactPack'), count: n.contacts, days: n.packDays })],
  [t('misc1.plansFaq2Q'), t('misc1.plansFaq2A')],
  [t('misc1.plansFaq3Q'), t('misc1.plansFaq3A')],
  [t('misc1.plansFaq4Q'), t('misc1.plansFaq4A', { fee: rentFee })],
  [t('misc1.plansFaq5Q'), t('misc1.plansFaq5A', { fee: price('listingPass'), days: n.passDays })],
];

function PlanCard({ p }) {
  return (
    <div className={'glass rounded-2xl p-6 flex flex-col h-full ' + (p.pop ? 'plan-pop relative' : '')}>
      {p.badge && <span className="dz-tag font-bold uppercase tracking-wider text-teal-300 mb-2 bg-teal-500/15 self-start">{p.badge}</span>}
      <h3 className="text-xl font-extrabold">{p.name}</h3>
      <p className="mt-1"><span className="text-3xl font-extrabold">{p.price}</span> <span className="text-gray-500 text-sm">{p.sub}</span></p>
      <p className="text-teal-300 text-sm font-medium mt-1 mb-4">{p.tag}</p>
      <ul className="space-y-2.5 mb-5">
        {p.feats.map((f) => <li key={f} className="flex gap-2 text-sm text-gray-300"><Icon name="check" className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> {f}</li>)}
      </ul>
      <div className="mt-auto pt-1">
        <Link to={p.href} className={'block text-center w-full py-2.5 rounded-xl font-semibold text-sm ' + (p.free ? 'btn-outline' : 'btn-teal')}>{p.cta}</Link>
      </div>
    </div>
  );
}

// Cards are 82% wide so the next plan peeks as a swipe affordance; desktop keeps the plain grid below.
function PlanCarousel({ plans }) {
  const scrollRef = useRef(null);
  const [active, setActive] = useState(0);

  const syncActive = () => {
    const el = scrollRef.current;
    if (!el) return;
    const left = el.getBoundingClientRect().left;
    let idx = 0;
    let best = Infinity;
    Array.from(el.children).forEach((c, i) => {
      const d = Math.abs(c.getBoundingClientRect().left - left);
      if (d < best) { best = d; idx = i; }
    });
    setActive(idx);
  };

  // Reset to the first card whenever the persona (plan set) changes.
  const plansKey = plans.map((p) => p.id).join('|');
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: 0 });
    setActive(0);
  }, [plansKey]);

  const goTo = (i) => {
    const child = scrollRef.current?.children[i];
    if (child) child.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  };

  return (
    <div>
      <div
        ref={scrollRef}
        onScroll={syncActive}
        className="flex gap-4 overflow-x-auto no-scrollbar -mx-4 px-4 scroll-px-4 py-3"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {plans.map((p) => (
          <div key={p.id} className="flex-shrink-0 w-[82%]" style={{ scrollSnapAlign: 'start' }}>
            <PlanCard p={p} />
          </div>
        ))}
      </div>
      {plans.length > 1 && (
        <div className="flex items-center justify-center mt-1">
          {plans.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-label={p.name}
              aria-current={i === active ? 'true' : undefined}
              onClick={() => goTo(i)}
              /* 24x44, not 44x44: wider dots would overlap; 24px with 32px spacing meets WCAG 2.5.8.
                 data-tap-exempt marks it reviewed. */
              data-tap-exempt
              className="grid h-11 w-6 place-items-center"
            >
              <span
                aria-hidden="true"
                className={'block h-2 rounded-full transition-all ' + (i === active ? 'w-6 bg-teal-400' : 'w-2 bg-white/25')}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Plans() {
  const { t } = useTranslation();
  const { hasEverListed } = useAuth();
  // Fallback price list from `GET /bootstrap`; a compiled-in constant would quote a price nobody could change.
  const { fee, referral, refunds, loaded } = usePricing();
  // The live catalogue, keyed by slug. Empty until it resolves and after a failure; both cases
  // fall through to `fee()` below.
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
      // A pricing page that cannot reach the catalogue still has to render — it is the page that
      // exists to convert. It falls back to the configured fee rather than showing nothing.
      .catch(() => { if (alive) setCatalogue({}); });
    return () => { alive = false; };
  }, []);
  const RENT_FEE = fee('rentAgreementPlatform');
  /** Server price when the catalogue has this plan, otherwise the card's configured fallback. */
  const priced = (p) => (catalogue[p.id] ? { ...p, price: rupees(catalogue[p.id].price) } : p);
  const n = {
    contacts: catalogue['contact-pack']?.contactLimit ?? 15,
    packDays: catalogue['contact-pack']?.termDays ?? 30,
    passDays: catalogue['listing-pass']?.termDays ?? 60,
    featuredDays: referral.featuredDays,
    contactReplyDays: refunds.contactReplyDays,
    packRefundDays: loaded ? refunds.packRefundDays : 0,
    passGuaranteeDays: loaded ? refunds.passGuaranteeDays : 0,
  };
  const SEEKER = seekerPlans(t, fee, n).map(priced);
  const OWNER = ownerPlans(t, fee, n).map(priced);
  /** Falls back to the configured fee only while the catalogue is
   * unreachable, so prose can't quote a different number than the card. */
  const priceOf = (key) => {
    const slug = key === 'listingPass' ? 'listing-pass' : 'contact-pack';
    return catalogue[slug] ? rupees(catalogue[slug].price) : fee(key);
  };
  const FAQS = plansFaqs(t, RENT_FEE, priceOf, n);
  /* `null` means 'not chosen', not 'seeker': seeding from `hasEverListed` would latch a first-render false while
     auth still loads. Deriving follows auth until the user touches the toggle. */
  const [persona, setPersona] = useState(null);
  const activePersona = persona ?? (hasEverListed ? 'owner' : 'seeker');
  const personas = [
    { key: 'seeker', label: t('misc1.plansForSeekers'), icon: 'search' },
    { key: 'owner', label: t('misc1.plansForOwners'), icon: 'building-2' },
  ];
  const activePlans = activePersona === 'owner' ? OWNER : SEEKER;
  return (
    <div className="pt-8 sm:pt-10 pb-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-8 sm:mb-12">
        <span className="dz-tag font-semibold text-emerald-300 mb-3" style={{ background: 'rgb(var(--dz-c-emerald-500) / .12)', border: '1px solid rgb(var(--dz-c-emerald-500) / .25)' }}><Icon name="hand-coins" className="w-3.5 h-3.5" /> {t('misc1.plansBadge')}</span>
        <h1 className="text-3xl sm:text-4xl font-extrabold">{t('misc1.plansTitle')}</h1>
        <p className="text-gray-400 mt-2">{t('misc1.plansSubtitle')}</p>
      </div>

      {/* Mobile: persona toggle + swipeable plan carousel */}
      <div className="md:hidden mb-12">
        <div className="deal-seg flex w-full p-1 rounded-full glass border border-white/10 mb-2" role="radiogroup" aria-label={t('misc1.plansTitle')}>
          {personas.map((o) => {
            const on = activePersona === o.key;
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => { if (!on) setPersona(o.key); }}
                className={'deal-seg-btn flex-1 inline-flex items-center justify-center gap-1.5 h-11 sm:h-10 px-3 rounded-full text-sm font-semibold t-all ' + (on ? 'is-active' : 'text-gray-400 hover:text-white')}
              >
                <Icon name={o.icon} className="w-4 h-4" /> {o.label}
              </button>
            );
          })}
        </div>
        <PlanCarousel plans={activePlans} />
      </div>

      {/* Desktop: both persona sections as grids */}
      <div className="hidden md:block">
        <section className="mb-12">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2"><Icon name="search" className="w-4 h-4 text-teal-400" /> {t('misc1.plansForSeekers')}</h2>
          <div className="grid md:grid-cols-2 gap-5">{SEEKER.map((p) => <PlanCard key={p.id} p={p} />)}</div>
        </section>

        <section className="mb-12">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2"><Icon name="building-2" className="w-4 h-4 text-teal-400" /> {t('misc1.plansForOwners')}</h2>
          <div className="grid md:grid-cols-2 gap-5">{OWNER.map((p) => <PlanCard key={p.id} p={p} />)}</div>
        </section>
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
            /* py-4 sits on the summary, not the card, so the tapped question gets the padding and the card
               measures the same open or closed. */
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
