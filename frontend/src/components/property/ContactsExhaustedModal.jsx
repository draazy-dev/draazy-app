import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon.jsx';
import { usePricing } from '../../context/PricingContext';
import { getEntitlements } from '../../services/entitlementService.js';
import useScrollLock from '../../hooks/useScrollLock.js';
import useModalDialog from '../../hooks/useModalDialog.js';
import { dealOf, packPriceKey, packSlug } from '../../lib/dealPlans.js';

export default function ContactsExhaustedModal({ deal, onClose }) {
  const { t } = useTranslation();
  const buy = dealOf(deal) === 'buy';
  const { pathname, search } = useLocation();
  const { fee, refunds } = usePricing();
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    let alive = true;
    getEntitlements()
      .then((e) => { if (alive && e?.contacts) setCounts({ used: e.contacts.used, allowance: e.contacts.allowance }); })
      .catch(() => { if (alive) setCounts(null); });
    return () => { alive = false; };
  }, []);

  useScrollLock();
  const panelRef = useModalDialog(true, onClose);

  return (
    <div ref={panelRef} tabIndex={-1} className="dz-modal-backdrop outline-none" role="dialog" aria-modal="true" aria-label={t('property.contactsExhausted.title')} data-testid="contacts-exhausted" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dz-modal">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">{t('property.contactsExhausted.title')}</h3>
            {counts && <p className="text-xs text-slate-400 mt-0.5">{t('property.contactsExhausted.sub', { used: counts.used, allowance: counts.allowance })}</p>}
          </div>
          <button onClick={onClose} className="dz-modal-x" aria-label={t('property.close')}><Icon name="x" className="w-5 h-5" /></button>
        </div>

        <Link
          to={`/checkout?plan=${packSlug(deal)}&next=${encodeURIComponent(pathname + search)}`}
          onClick={onClose}
          data-testid="contacts-exhausted-plan"
          className="block rounded-xl border border-white/10 bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]"
        >
          <div className="flex items-center gap-2 mb-1">
            <Icon name="ticket" className="w-4 h-4 text-amber-300" />
            <span className="text-sm font-bold text-white">{t(buy ? 'misc1.packTitleBuy' : 'misc1.packTitleRent')}</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{t(buy ? 'misc1.packBodyBuy' : 'misc1.packBodyRent', { price: fee(packPriceKey(deal)) })}</p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-300">
            {t('property.contactsExhausted.planCta', { price: fee(packPriceKey(deal)) })} <Icon name="arrow-right" className="w-4 h-4" />
          </span>
        </Link>
        <p className="mt-3 text-center text-[11px] text-slate-500">{t('misc1.contactComesBack', { days: refunds.contactReplyDays })}</p>
      </div>
    </div>
  );
}
