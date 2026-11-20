import { useTranslation } from 'react-i18next';
import Icon from '../../../../components/Icon.jsx';
import { SUPPORT_PHONE, SUPPORT_TEL } from '../../../../lib/supportContact.js';
import { fmt, fmtPaise } from './helpers.js';

function ChargesUnavailable({ cost }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" className="py-2">
      {cost.status === 'loading' ? (
        <p className="text-gray-500 text-xs flex items-center gap-2">
          <Icon name="circle-notch" className="w-3.5 h-3.5 animate-spin" /> {t('services.ra.cost.loading')}
        </p>
      ) : (
        <>
          <p className="text-gray-400 text-xs leading-relaxed">{t('services.ra.cost.unavailable')}</p>
          {typeof cost.retry === 'function' && (
            <button type="button" onClick={cost.retry} className="text-teal-400 text-xs font-semibold mt-2 inline-flex items-center gap-1.5 min-h-[44px]">
              <Icon name="refresh-cw" className="w-3.5 h-3.5" /> {t('services.ra.cost.retry')}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function CostLines({ cost }) {
  const { t } = useTranslation();
  const ready = cost.status === 'ready';
  const estimated = (cost.computed || []).length > 0;
  return (
    <div className="space-y-2.5 text-sm">
      <div className="flex justify-between"><span className="text-gray-400">{t('services.ra.cost.monthlyRent')}</span><span className="text-white font-medium">{fmt(cost.rent)}</span></div>
      <div className="flex justify-between"><span className="text-gray-400">{t('services.ra.cost.depositRefundable')}</span><span className="text-white font-medium">{fmt(cost.dep)}</span></div>
      <div className="flex justify-between"><span className="text-gray-400">{t('services.ra.cost.term')}</span><span className="text-white font-medium">{t('services.ra.cost.termMonths', { count: cost.months })}</span></div>
      <div className="h-px bg-white/8 my-1" />
      {!ready ? <ChargesUnavailable cost={cost} /> : (
        <>
          <div className="flex justify-between"><span className="text-gray-400">{t('services.ra.cost.stampDuty')}</span><span className="text-white font-medium">{fmtPaise(cost.stamp)}</span></div>
          {cost.exactPaise != null && <p className="text-[11px] text-gray-500 -mt-1.5">{t('services.ra.cost.exactDuty', { amount: fmtPaise(cost.exactPaise / 100) })}</p>}
          <div className="flex justify-between"><span className="text-gray-400">{t('services.ra.cost.registrationFee')}</span><span className="text-white font-medium">{fmtPaise(cost.reg)}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">{t('services.ra.cost.handling')}</span><span className="text-white font-medium">{fmtPaise(cost.dhc)}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">{t('services.ra.cost.serviceFee')}</span><span className="text-white font-medium">{fmtPaise(cost.service)}</span></div>
          {cost.waived > 0 && <p className="text-xs text-emerald-400" data-testid="ra-cost-referral">{t('services.ra.cost.referralWaiver', { percent: cost.discountPercent, amount: fmtPaise(cost.waived) })}</p>}
          <div className="h-px bg-white/8 my-1" />
          <div className="flex justify-between items-center"><span className="text-white font-semibold">{t(estimated ? 'services.ra.cost.estimatedTotal' : 'services.ra.cost.totalPayable')}</span><span className="text-lg font-bold gradient-text">{fmtPaise(cost.total)}</span></div>
        </>
      )}
    </div>
  );
}

function CostFootnote({ cost }) {
  const { t } = useTranslation();
  if (cost.status !== 'ready') return null;
  const text = (cost.computed || []).length > 0 ? t('services.ra.cost.formula') : cost.notes;
  if (!text) return null;
  return <p className="text-gray-600 text-[11px] mt-4 leading-relaxed">{text}</p>;
}

export function MobileCostSummary({ cost }) {
  const { t } = useTranslation();
  return (
    <details className="ra-mcost lg:hidden glass-card rounded-2xl p-4 mb-6 group">
      <summary className="flex items-center justify-between cursor-pointer select-none">
        <span className="text-white font-semibold text-sm flex items-center gap-2"><Icon name="receipt" className="w-4 h-4 text-teal-400" /> {t('services.ra.cost.estimatedTotal')}</span>
        <span className="flex items-center gap-2"><span className="text-lg font-bold gradient-text">{cost.total == null ? '—' : fmtPaise(cost.total)}</span><Icon name="chevron-down" className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" /></span>
      </summary>
      <div className="mt-4 pt-4 border-t border-white/8">
        <p className="text-gray-500 text-xs mb-3">{t('services.ra.cost.subtitle')}</p>
        <CostLines cost={cost} />
      </div>
    </details>
  );
}

export default function CostSidebar({ cost }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-white font-bold mb-1">{t('services.ra.cost.title')}</h3>
        <p className="text-gray-500 text-xs mb-4">{t('services.ra.cost.subtitle')}</p>
        <CostLines cost={cost} />
        <CostFootnote cost={cost} />
      </div>
      <div className="glass-card rounded-2xl p-5">
        <p className="text-white font-semibold text-sm mb-1">{t('services.ra.cost.needHelp')}</p>
        <p className="text-gray-500 text-xs mb-3">{t('services.ra.cost.needHelpSub')}</p>
        <a href={SUPPORT_TEL} className="text-teal-400 text-sm font-semibold flex items-center gap-2"><Icon name="headset" className="w-4 h-4" /> {SUPPORT_PHONE}</a>
      </div>
    </div>
  );
}
