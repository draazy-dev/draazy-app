import { useTranslation } from 'react-i18next';
import Icon from '../../../../components/Icon.jsx';
import { useToast } from '../../../../context/ToastContext.jsx';
import { shareOrCopy } from '../../../../lib/share.js';
import { usePrefetchReferralCode } from '../../../../lib/usePrefetchReferralCode.js';

function useShare(text) {
  usePrefetchReferralCode();
  const { t } = useTranslation();
  const { toast } = useToast();
  return async () => {
    const status = await shareOrCopy({ title: text, text, url: window.location.href });
    if (status === 'copied') toast(t('property.shareCopied'), 'success');
    if (status === 'failed') toast(t('property.shareCopyFail'), 'error');
  };
}

export function PhotoShare({ text }) {
  const { t } = useTranslation();
  const share = useShare(text);
  return (
    <button type="button" onClick={() => void share()} aria-label={t('flatmates.detailShare')} className="heart-on-photo absolute top-3 right-3 w-11 h-11 flex items-center justify-center rounded-full cursor-pointer transition-colors">
      <Icon name="share-network" className="w-6 h-6" aria-hidden="true" />
    </button>
  );
}

export function TitleShare({ text }) {
  const { t } = useTranslation();
  const share = useShare(text);
  return (
    <button type="button" onClick={() => void share()} aria-label={t('flatmates.detailShare')} className="seg w-11 h-11 shrink-0 rounded-xl text-gray-300 inline-flex items-center justify-center cursor-pointer">
      <Icon name="share-network" className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}

export function ReportLink({ label, onReport }) {
  return (
    <button type="button" onClick={onReport} className="report-btn inline-flex items-center gap-1.5 min-h-[44px] text-sm font-medium text-slate-400 hover:text-red-400 cursor-pointer transition-colors">
      <Icon name="flag" className="w-4 h-4" aria-hidden="true" /> {label}
    </button>
  );
}
