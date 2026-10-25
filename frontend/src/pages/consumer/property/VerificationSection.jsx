import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import { listingFreshness } from '../../../lib/freshness.js';
import { mahaReraSearchUrl } from '../../../lib/maharera.js';

// Every check is backed by a real listing field; nothing is implied that the data cannot show.
export function VerificationSection({ p }) {
  const { t } = useTranslation();
  const fresh = listingFreshness(p);
  const activelyManaged = fresh.state === 'active' || fresh.state === 'aging';
  const isRent = p.deal === 'rent';

  const checks = [
    {
      passed: !!p.ownerVerified,
      icon: 'user-check',
      title: t('property.ownerIdentity'),
      yes: t('property.ownerIdentityYes'),
      no: t('property.ownerIdentityNo'),
      yesLabel: t('property.verified'),
      noLabel: t('property.notVerified'),
    },
    {
      passed: !!p.ownershipVerified,
      icon: 'file-check',
      title: isRent ? t('property.ownershipVerifiedTitle') : t('property.ownershipIndexTitle'),
      yes: isRent
        ? t('property.ownershipYesRent')
        : t('property.ownershipYesBuy'),
      no: t('property.ownershipNo'),
      yesLabel: t('property.verified'),
      noLabel: t('property.pending'),
    },
    {
      passed: activelyManaged,
      icon: 'calendar-check',
      title: t('property.activelyManaged'),
      yes: t('property.activelyManagedYes', { since: fresh.since }),
      no: t('property.activelyManagedNo'),
      yesLabel: t('property.live'),
      noLabel: t('property.unconfirmed'),
    },
  ];

  const passed = checks.filter((c) => c.passed).length;
  const total = checks.length;
  const trustPct = Math.round((passed / total) * 100);

  return (
    <section className="fade-in section-mb">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-6 flex items-center gap-2"><Icon name="shield-check" className="w-5 h-5 text-brand-teal-2" /> {t('property.verificationHeading')}</h2>
      <div className="glass rounded-2xl p-6 sm:p-8">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-white flex items-center gap-2"><Icon name="shield-check" className="w-4 h-4 text-brand-teal-2" /> {t('property.trustScore')}</p>
            <span className="text-sm font-bold text-emerald-300">{t('property.checksPassed', { passed, total })}</span>
          </div>
          <div className="insight-bar"><span style={{ width: `${trustPct}%` }} /></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {checks.map((c) => (
            <div key={c.title} className={'rounded-xl border p-5 flex items-start gap-3 ' + (c.passed ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-white/10 bg-white/[0.03]')}>
              <div className={'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ' + (c.passed ? 'bg-emerald-500/15' : 'bg-white/10')}>
                <Icon name={c.icon} className={'w-5 h-5 ' + (c.passed ? 'text-emerald-400' : 'text-slate-400')} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="font-semibold text-white text-sm">{c.title}</p>
                  <span className={'dz-tag font-semibold ' + (c.passed ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-slate-400')}>{c.passed ? c.yesLabel : c.noLabel}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{c.passed ? c.yes : c.no}</p>
              </div>
            </div>
          ))}
        </div>
        {/* Kept out of `checks`: an owner-shared number is not a check Draazy passed, so it must not
            raise the score. */}
        {p.reraId ? (
          <div data-testid="rera-shared" className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-5 flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-white/10">
              <Icon name="file-text" className="w-5 h-5 text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-white text-sm mb-1">{t('property.reraSharedTitle')}</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t('property.reraSharedDesc')}{' '}
                <a href={mahaReraSearchUrl(p.reraId)} target="_blank" rel="noopener noreferrer" className="text-teal-300 hover:underline">
                  {t('property.mahaReraId', { id: p.reraId })}
                </a>
              </p>
            </div>
          </div>
        ) : null}
        <p className="text-slate-500 text-xs mt-4 flex items-start gap-1.5"><Icon name="info" className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {t('property.verificationFooter', { ownership: isRent ? t('property.ownershipVerifiedTitle') : t('property.ownershipIndexTitle') })}</p>
      </div>
    </section>
  );
}
