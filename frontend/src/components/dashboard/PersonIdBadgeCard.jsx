import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon.jsx';
import { useVerification } from '../../context/VerificationContext.jsx';

export default function PersonIdBadgeCard() {
  const { t } = useTranslation();
  const { verified } = useVerification();
  return (
    <div data-testid="person-id-badge-card" data-state={verified ? 'approved' : 'none'} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-400 flex items-center justify-center flex-shrink-0">
          <Icon name="shield-check" className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-white text-sm font-semibold">{t('dash.idBadge.title')}</p>
            <span className={'dz-tag font-semibold ' + (verified ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.08] text-gray-400')}>
              {t(verified ? 'dash.idBadge.verified' : 'dash.idBadge.notVerified')}
            </span>
          </div>
          <p className="text-gray-400 text-xs mt-1">{t(verified ? 'dash.idBadge.lineVerified' : 'dash.idBadge.lineNone')}</p>
          {verified ? null : (
            <Link to="/dashboard?tab=profile" data-testid="person-id-badge-cta" className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-brand-teal px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-teal-1">
              <Icon name="shield-check" className="w-3.5 h-3.5" /> {t('dash.idBadge.cta')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
