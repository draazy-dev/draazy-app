import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../../components/Icon.jsx';
import ReviewRow from './ReviewRow.jsx';
import { fmt, fmtPaise } from './helpers.js';

function ChargeRow({ k, v }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-400">{k}</span>
      <span className="text-gray-200 font-medium">{v}</span>
    </div>
  );
}

export default function ReadyToPayPanel({ request, onPay, busy, unconfirmed }) {
  const { t } = useTranslation();
  const state = request.details?._state;
  const tenantFillsLater = state?.tenantMode === 'invite' && state?.ownerMode !== 'invite';
  const shared = !tenantFillsLater && (!!request.myPartyId || (request.parties || []).some((p) => p.status === 'accepted'));
  const coFilled = shared && !request.myPartyId;
  const [declare, setDeclare] = useState(false);
  return (
    <div className="mt-5 p-4 rounded-xl bg-teal-500/8 border border-teal-500/25 max-w-md mx-auto text-left" data-testid="ra-pay-panel">
      <p className="text-white font-semibold text-sm flex items-center gap-2">
        <Icon name="credit-card" className="w-4 h-4 text-teal-300" />
        {t(unconfirmed ? 'services.ra.donePaymentPendingTitle' : coFilled ? 'services.ra.pay.coFilledTitle' : 'services.ra.pay.title')}
      </p>
      <p className="text-gray-400 text-xs mt-1 leading-relaxed">
        {t(unconfirmed ? 'services.ra.donePaymentPendingDesc' : 'services.ra.pay.desc')}
      </p>
      {shared && !unconfirmed && <p className="text-teal-200/80 text-[11px] mt-1.5" data-testid="ra-pay-either">{t('services.ra.pay.eitherHint')}</p>}
      {request.details?.property && (
        <div className="mt-3" data-testid="ra-pay-summary">
          <ReviewRow k={t('services.ra.review.rowProperty')} v={request.details.property} />
          <ReviewRow k={t('services.ra.review.rowOwner')} v={request.details.ownerName} />
          <ReviewRow k={t('services.ra.review.rowTenants')} v={request.details.tenants} />
          <ReviewRow k={t('services.ra.review.rowMonthlyRent')} v={fmt(request.details.rent)} />
          <ReviewRow k={t('services.ra.review.rowDeposit')} v={fmt(request.details.deposit)} />
        </div>
      )}
      {request.charges && (
        <div className="mt-3 pt-3 border-t border-white/8 space-y-1.5 text-xs" data-testid="ra-pay-breakdown">
          <ChargeRow k={t('services.ra.cost.stampDuty')} v={fmtPaise(request.charges.stampDuty)} />
          {request.charges.exactDutyInPaise != null && <p className="text-[11px] text-gray-500">{t('services.ra.cost.exactDuty', { amount: fmtPaise(request.charges.exactDutyInPaise / 100) })}</p>}
          <ChargeRow k={t('services.ra.cost.registrationFee')} v={fmtPaise(request.charges.registration)} />
          <ChargeRow k={t('services.ra.cost.handling')} v={fmtPaise(request.charges.handling)} />
          <ChargeRow k={t('services.ra.cost.serviceFee')}
            v={request.charges.referralCredit && !request.charges.platformFee ? t('services.ra.pay.feeWaived') : fmtPaise(request.charges.platformFee)} />
          <div className="flex justify-between items-center pt-1.5 border-t border-white/8">
            <span className="text-white font-semibold text-sm">{t('services.ra.cost.totalPayable')}</span>
            <span className="text-white font-bold text-sm">{fmtPaise(request.amount)}</span>
          </div>
        </div>
      )}
      <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
        <input type="checkbox" checked={declare} onChange={(e) => setDeclare(e.target.checked)} className="accent-teal-500 w-4 h-4 mt-0.5 flex-shrink-0" />
        <span className="text-sm text-gray-300 leading-relaxed">{t('services.ra.review.declaration')}</span>
      </label>
      <button type="button" disabled={busy || !declare} onClick={onPay}
        className="btn-teal mt-3 w-full px-4 py-3 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-50">
        <Icon name="credit-card" className="w-4 h-4" />
        {unconfirmed ? t('services.ra.donePaymentPendingCta') : t('services.ra.pay.cta', { amount: fmtPaise(request.amount) })}
      </button>
    </div>
  );
}
