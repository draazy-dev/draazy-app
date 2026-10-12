import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon.jsx';
import { useAppFlags } from '../../context/AppFlagsContext.jsx';
import { usePricing } from '../../context/PricingContext';
import { getEntitlements } from '../../services/entitlementService.js';
import useScrollLock from '../../hooks/useScrollLock.js';
import useModalDialog from '../../hooks/useModalDialog.js';

/* Shown when a seeker has no owner contacts left: refer a friend (off when Ops disables
   `referralRewards`) or buy a Contact Pack. The used/allowance line renders only once the server answers. */
export default function ContactsExhaustedModal({ onClose }) {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const { fee, referral } = usePricing();
  const { flagEnabled } = useAppFlags();
  const canRefer = flagEnabled('referralRewards');
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

        {/* Free path — refer. Withdrawn entirely when Ops disables referral rewards. */}
        {canRefer && (
          <Link
            to="/refer"
            onClick={onClose}
            data-testid="contacts-exhausted-refer"
            className="block rounded-xl border border-teal-500/30 bg-teal-500/[0.08] p-4 mb-3 transition-colors hover:bg-teal-500/[0.14]"
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon name="gift" className="w-4 h-4 text-teal-300" />
              <span className="text-sm font-bold text-white">{t('property.contactsExhausted.referTitle')}</span>
              <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-emerald-300 px-2 py-0.5 rounded-full bg-emerald-500/15">{t('property.contactsExhausted.freeBadge')}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{t('property.contactsExhausted.referBody', { count: referral.contactBonus })}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-300">
              {t('property.contactsExhausted.referCta')} <Icon name="arrow-right" className="w-4 h-4" />
            </span>
          </Link>
        )}

        {/* Paid path — always available. */}
        <Link
          to={`/checkout?plan=contact-pack&next=${encodeURIComponent(pathname + search)}`}
          onClick={onClose}
          data-testid="contacts-exhausted-plan"
          className="block rounded-xl border border-white/10 bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]"
        >
          <div className="flex items-center gap-2 mb-1">
            <Icon name="ticket" className="w-4 h-4 text-amber-300" />
            <span className="text-sm font-bold text-white">{t('property.contactsExhausted.planTitle')}</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{t('property.contactsExhausted.planBody', { price: fee('contactPack') })}</p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-300">
            {t('property.contactsExhausted.planCta', { price: fee('contactPack') })} <Icon name="arrow-right" className="w-4 h-4" />
          </span>
        </Link>
      </div>
    </div>
  );
}
