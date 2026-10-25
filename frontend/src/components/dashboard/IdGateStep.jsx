import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon.jsx';
import VerifyIdentityRedirect from '../auth/VerifyIdentityRedirect.jsx';
import { useVerification } from '../../context/VerificationContext.jsx';

/* An ID still in review is enough to send a verification request; staff grant the badge only once it is verified. */
export function useIdGate() {
  const { verified, status } = useVerification();
  const inReview = !verified && status === 'pending';
  return { verified, inReview, canRequest: verified || inReview };
}

export default function IdGateStep({ inReview, source }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="badge-id-step" data-state={inReview ? 'in-review' : 'needed'} className="flex items-center gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2.5">
      <Icon name="badge-check" className="w-4 h-4 text-amber-300 flex-shrink-0" />
      <p className="flex-1 text-xs text-gray-200">{t(inReview ? 'dash.idGate.inReview' : 'dash.idGate.first')}</p>
      {!inReview && (
        <button type="button" onClick={() => setOpen(true)} data-testid="badge-verify-id"
          className="min-h-[36px] px-3 rounded-lg bg-white/5 hover:bg-white/10 text-teal-300 text-xs font-semibold whitespace-nowrap">
          {t('dash.idGate.verify')}
        </button>
      )}
      {open && <VerifyIdentityRedirect source={source} onClose={() => setOpen(false)} />}
    </div>
  );
}
