import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { fmtDate } from '../../../lib/format.js';
import { getEntitlements } from '../../../services/entitlementService.js';
import { usePricing } from '../../../context/PricingContext';
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
  const held = [
    ent?.contacts?.unlimited && { key: 'unlimited', text: t('dash.billingUnlimited') },
    ...(ent?.listings?.passes || []).map((p) => {
      const title = titleOf(p.propertyId);
      return { key: `pass:${p.propertyId}`, text: t(title ? 'dash.billingPassTitled' : 'dash.billingPass', { title, date: fmtDate(p.expiresAt) }) };
    }),
    ent?.contacts?.packExpiresAt && { key: 'pack', text: t('dash.billingPack', { date: fmtDate(ent.contacts.packExpiresAt) }) },
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <SectionHead icon="receipt-indian-rupee" title={t('dash.billingHave')} action={<Link to="/plans" className="text-teal-400 text-sm font-medium hover:text-teal-300">{t('dash.billingSeePrices')}</Link>} />
        {held.length > 0 ? (
          <ul className="space-y-2">
            {held.map((h) => <li key={h.key} className="text-white text-sm font-semibold">{h.text}</li>)}
          </ul>
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
