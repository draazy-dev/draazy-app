import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { fmtDate } from '../../../lib/format.js';
import { getEntitlements } from '../../../services/entitlementService.js';
import { usePricing } from '../../../context/PricingContext';
import Icon from '../../../components/Icon.jsx';
import { freeContactsTill } from '../property/useEntitlements.js';
import { Card, SectionHead } from './components.jsx';
import PaymentHistory from './PaymentHistory.jsx';

export default function BillingPanel({ isOwner, listings = [] }) {
  const { t } = useTranslation();
  const { fee } = usePricing();
  const [ent, setEnt] = useState(null);

  useEffect(() => {
    let live = true;
    getEntitlements().then((e) => { if (live) setEnt(e); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const titleOf = (propertyId) => listings.find((l) => !l.flatmate && String(l.uuid || l.id) === String(propertyId))?.title;
  const c = ent?.contacts;
  const l = ent?.listings;
  const a = ent?.agreements;
  const passes = l?.passes || [];
  const usedOf = (used, total) => t('dash.billingUsedOf', { used, total });

  const balances = [
    c && {
      key: 'contacts', icon: 'phone-call', label: t('dash.billingContactsLeft'),
      value: c.unlimited ? t('dash.billingUnlimitedShort') : c.remaining,
      sub: c.unlimited ? t('dash.billingUsed', { used: c.used }) : usedOf(c.used, c.allowance),
    },
    l && (isOwner || passes.length > 0 || l.used > 0) && {
      key: 'slots', icon: 'building-2', label: t('dash.billingSlotsLeft'),
      value: Math.max(0, l.allowance - l.used), sub: usedOf(l.used, l.allowance),
    },
    passes.length > 0 && { key: 'passes', icon: 'ticket-plus', label: t('dash.billingPassesActive'), value: passes.length },
    a?.free > 0 && { key: 'agreements', icon: 'file-text', label: t('dash.billingAgreementsLeft'), value: a.remaining, sub: usedOf(a.used, a.free) },
  ].filter(Boolean);

  const freeTill = freeContactsTill(ent);
  const held = [
    c?.unlimited && { key: 'unlimited', text: t('dash.billingUnlimited') },
    ...passes.map((p) => {
      const title = titleOf(p.propertyId);
      return { key: `pass:${p.propertyId}`, text: t(title ? 'dash.billingPassTitled' : 'dash.billingPass', { title, date: fmtDate(p.expiresAt) }) };
    }),
    c?.packExpiresAt && { key: 'pack', text: t('dash.billingPack', { date: fmtDate(c.packExpiresAt) }) },
  ].filter(Boolean);
  const sources = [
    freeTill && { key: 'free', text: t('dash.billingFreeTill', { date: freeTill }) },
    c?.referralBonus > 0 && { key: 'referral', text: t('dash.billingReferralBonus', { count: c.referralBonus }) },
    c?.friendBonus > 0 && { key: 'friend', text: t('dash.billingFriendBonus', { count: c.friendBonus }) },
  ].filter(Boolean);
  const details = [...held, ...sources];

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <SectionHead icon="receipt-indian-rupee" title={t('dash.billingHave')} action={<Link to="/plans" className="text-teal-400 text-sm font-medium hover:text-teal-300">{t('dash.billingSeePrices')}</Link>} />
        {balances.length > 0 ? (
          <>
            <ul className="grid grid-cols-2 gap-3">
              {balances.map((b) => (
                <li key={b.key} data-balance={b.key} className="rounded-xl bg-white/[0.04] p-3.5">
                  <p className="text-2xl font-bold leading-none text-white">{b.value}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-gray-300"><Icon name={b.icon} className="h-3.5 w-3.5 flex-shrink-0 text-teal-400" />{b.label}</p>
                  {b.sub ? <p className="mt-0.5 text-xs text-gray-500">{b.sub}</p> : null}
                </li>
              ))}
            </ul>
            {held.length === 0 ? <p className="text-gray-500 text-xs mt-3">{isOwner ? t('dash.billingFreeOwner', { price: fee('listingPass') }) : t('dash.billingFreeSeeker')}</p> : null}
            {details.length > 0 ? (
              <details className="mt-4 border-t border-white/10">
                <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-teal-400 pt-3 min-h-[44px]">{t('dash.billingDetails')}<Icon name="chevron-down" className="faq-chevron w-4 h-4 transition-transform flex-shrink-0" /></summary>
                <ul className="space-y-2 pt-1">
                  {details.map((h) => <li key={h.key} className="text-white text-sm font-semibold">{h.text}</li>)}
                </ul>
              </details>
            ) : null}
          </>
        ) : (
          <div>
            <p className="text-white text-xl font-extrabold">{t('dash.billingFree')}</p>
            <p className="text-gray-500 text-xs mt-0.5">{isOwner ? t('dash.billingFreeOwner', { price: fee('listingPass') }) : t('dash.billingFreeSeeker')}</p>
          </div>
        )}
      </Card>
      <Card className="p-6">
        <SectionHead icon="history" title={t('dash.billingHistory')} />
        <PaymentHistory />
      </Card>
    </div>
  );
}
