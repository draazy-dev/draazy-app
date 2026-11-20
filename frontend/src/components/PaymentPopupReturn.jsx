import { useTranslation } from 'react-i18next';
import Icon from './Icon.jsx';
import { continueInThisWindow } from '../lib/paymentReturn.js';

export default function PaymentPopupReturn() {
  const { t } = useTranslation();
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-card rounded-2xl p-6 max-w-sm w-full text-center" data-testid="pay-popup-return">
        <Icon name="credit-card" className="w-10 h-10 text-teal-300 mx-auto mb-3" />
        <h1 className="text-white font-semibold text-lg">{t('common.payReturnTitle')}</h1>
        <p className="text-gray-400 text-sm mt-2 leading-relaxed">{t('common.payReturnBody')}</p>
        <button type="button" onClick={continueInThisWindow} className="btn-outline mt-5 w-full px-4 py-3 rounded-xl text-gray-200 text-sm font-semibold min-h-[44px]">
          {t('common.payReturnContinue')}
        </button>
      </div>
    </main>
  );
}
