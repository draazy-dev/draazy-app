import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAppFlags } from '../../context/AppFlagsContext.jsx';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/Icon.jsx';
import { useEffect, useState, useCallback } from 'react';
import { getMyReferralSummary, referralLink } from '../../services/referralService.js';
import { getEntitlements } from '../../services/entitlementService.js';
import { usePricing } from '../../context/PricingContext.jsx';

const Stat = ({ value, label, tone = 'text-white', testId }) => (
  <div className="glass rounded-2xl px-4 py-3 min-w-0">
    <p className={`text-xl font-extrabold ${tone}`} data-testid={testId}>{value}</p>
    <p className="text-gray-500 text-[11px] leading-snug">{label}</p>
  </div>
);

export default function Refer() {
  const { t } = useTranslation();
  const { hasEverListed, isIn } = useAuth();
  const { toast } = useToast();
  const { referral } = usePricing();
  const { flagEnabled } = useAppFlags();
  // Contact rewards are Ops-switchable; the owner track (agreement + Featured) is the base programme.
  const contactRewards = flagEnabled('referralRewards');

  /** Nothing renders until the summary resolves, or Copy would copy ''. */
  const [summary, setSummary] = useState(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const reloadSummary = useCallback(() => {
    let alive = true;
    getMyReferralSummary()
      .then((s) => { if (alive && s) { setSummary(s); setSummaryFailed(false); } })
      .catch(() => { if (alive) setSummaryFailed(true); });
    return () => { alive = false; };
  }, []);
  useEffect(() => reloadSummary(), [reloadSummary]);

  const CODE = summary?.code || '';
  const LINK = referralLink(CODE);
  const [copied, setCopied] = useState(null);
  const [agreements, setAgreements] = useState(null);
  useEffect(() => {
    let alive = true;
    getEntitlements().then((e) => { if (alive) setAgreements(e?.agreements ?? null); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const joined = summary?.friendReward;
  const showJoinedContacts = contactRewards && joined?.contacts > 0;
  const showJoinedFeatured = joined?.featuredDays > 0;

  const shareText = () => t('misc1.referShareMsg', { code: CODE, link: LINK });

  const writeClipboard = async (text) => {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  };

  // Copying is not an invite; only a completed share re-reads the server's count.
  const copyCode = async () => {
    const ok = await writeClipboard(CODE);
    if (ok) { setCopied('code'); setTimeout(() => setCopied((c) => (c === 'code' ? null : c)), 2000); }
    toast(t('misc1.referCodeCopied'), ok ? 'success' : 'error');
  };
  const copyLink = async () => {
    const ok = await writeClipboard(LINK);
    if (ok) { setCopied('link'); setTimeout(() => setCopied((c) => (c === 'link' ? null : c)), 2000); }
    toast(t(ok ? 'misc1.referLinkCopied' : 'misc1.referCodeCopied'), ok ? 'success' : 'error');
  };

  const shareWA = () => {
    reloadSummary();
    window.open('https://wa.me/?text=' + encodeURIComponent(shareText()), '_blank', 'noopener');
  };
  const shareNative = async () => {
    if (!navigator.share) { shareWA(); return; }
    try {
      await navigator.share({ title: t('misc1.referBadge'), text: shareText(), url: LINK });
      reloadSummary();
    } catch { /* cancelled: not an invite */ }
  };
  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="pt-6 pb-14 max-w-3xl mx-auto px-4 sm:px-6">
      <div className="text-center mb-6">
        <span className="dz-tag font-semibold text-amber-300 mb-3" style={{ background: 'rgb(var(--dz-c-amber-500) / .12)', border: '1px solid rgb(var(--dz-c-amber-500) / .25)' }}><Icon name="gift" className="w-3.5 h-3.5" /> {t('misc1.referBadge')}</span>
        <h1 className="text-3xl sm:text-4xl font-extrabold">{t('misc1.referTitle')}</h1>
        <p className="text-gray-400 mt-2">{t('misc1.referSub')}</p>
      </div>

      <section className="glass rounded-2xl p-5 sm:p-6 mb-5 min-w-0">
        {!CODE ? (
          <div className="py-8 text-center">
            {summaryFailed ? (
              <>
                <p className="text-sm text-gray-400">{t('misc1.referCodeUnavailable')}</p>
                <button onClick={reloadSummary} className="btn-outline mt-3 px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold">{t('common.retry', 'Try again')}</button>
              </>
            ) : (
              <p className="text-sm text-gray-500">{t('common.loading', 'Loading…')}</p>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">{t('misc1.referYourCode')}</p>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-dashed border-teal-400/40 px-3.5 sm:px-4 py-3 mb-3">
              <span className="text-lg sm:text-xl font-extrabold tracking-wider text-teal-300 min-w-0 truncate">{CODE}</span>
              <button onClick={copyCode} aria-label={t('misc1.referCopyCode')} className={`text-sm inline-flex items-center gap-1.5 shrink-0 min-h-[44px] transition-colors ${copied === 'code' ? 'text-emerald-300' : 'text-gray-300 hover:text-white'}`}>
                <Icon name={copied === 'code' ? 'check' : 'copy'} className="w-4 h-4" /> {copied === 'code' ? t('misc1.referCopied') : t('misc1.referCopy')}
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">{t('misc1.referYourLink')}</p>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-white/10 px-3.5 sm:px-4 py-3 mb-3">
              <span className="text-sm text-gray-300 truncate min-w-0" title={LINK}>{LINK}</span>
              <button onClick={copyLink} aria-label={t('misc1.referCopyLink')} className={`text-sm inline-flex items-center gap-1.5 shrink-0 min-h-[44px] transition-colors ${copied === 'link' ? 'text-emerald-300' : 'text-gray-300 hover:text-white'}`}>
                <Icon name={copied === 'link' ? 'check' : 'copy'} className="w-4 h-4" /> {copied === 'link' ? t('misc1.referCopied') : t('misc1.referCopy')}
              </button>
            </div>
            <div className={`grid grid-cols-1 gap-3 ${canNativeShare ? 'sm:grid-cols-2' : ''}`}>
              {canNativeShare && (
                <button onClick={shareNative} className="btn-teal px-4 py-3 min-h-[44px] rounded-xl font-semibold inline-flex items-center justify-center gap-2">
                  <Icon name="share-network" className="w-4 h-4" /> {t('misc1.referShare')}
                </button>
              )}
              <button onClick={shareWA} aria-label={t('misc1.referWhatsApp')} className={`px-4 py-3 min-h-[44px] rounded-xl font-semibold inline-flex items-center justify-center gap-2 transition-colors ${canNativeShare ? 'border border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/10' : 'btn-teal'}`}>
                <Icon name="message-circle" className="w-4 h-4" /> {t('misc1.referWhatsApp')}
              </button>
            </div>
          </>
        )}
      </section>

      {joined?.redeemed && (showJoinedContacts || showJoinedFeatured) && (
        <section className="glass rounded-2xl px-4 py-3 mb-5 text-sm text-teal-300" data-testid="refer-joined">
          {showJoinedContacts && <p>{t('misc1.referJoinedContacts', { count: joined.contacts })}</p>}
          {showJoinedFeatured && <p>{t('misc1.referJoinedFeatured', { days: joined.featuredDays })}</p>}
        </section>
      )}

      <section className={`grid gap-4 mb-5 ${contactRewards ? 'md:grid-cols-2' : ''}`}>
        <div className="glass rounded-2xl p-5 relative" data-testid="refer-owner-track">
          {hasEverListed && <span className="dz-tag absolute top-4 right-4 font-bold uppercase tracking-wider text-teal-300 bg-teal-500/15">{t('misc1.referForYou')}</span>}
          <div className="w-10 h-10 rounded-xl bg-teal-500/15 flex items-center justify-center mb-3"><Icon name="file-check-2" className="w-5 h-5 text-teal-400" /></div>
          <h2 className="text-lg font-extrabold">{t('misc1.referOwnerTitle')}</h2>
          <p className="text-gray-300 text-sm mt-2">{t('misc1.referOwnerThey', { days: referral.ownerFeaturedDays })}</p>
          <p className="text-teal-300 text-sm font-medium mt-1">{t('misc1.referOwnerYou', { count: referral.ownerRewardAgreements })}</p>
        </div>
        {contactRewards && (
          <div className="glass rounded-2xl p-5 relative" data-testid="refer-seeker-track">
            {isIn && !hasEverListed && <span className="dz-tag absolute top-4 right-4 font-bold uppercase tracking-wider text-teal-300 bg-teal-500/15">{t('misc1.referForYou')}</span>}
            <div className="w-10 h-10 rounded-xl bg-teal-500/15 flex items-center justify-center mb-3"><Icon name="phone-call" className="w-5 h-5 text-teal-400" /></div>
            <h2 className="text-lg font-extrabold">{t('misc1.referSeekerTitle')}</h2>
            <p className="text-gray-300 text-sm mt-2">{t('misc1.referSeekerThey', { count: referral.seekerBonusContacts })}</p>
            <p className="text-teal-300 text-sm font-medium mt-1">{t('misc1.referSeekerYou', { count: referral.contactBonus })}</p>
          </div>
        )}
      </section>

      <section data-testid="refer-stats">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2"><Icon name="sparkles" className="w-4 h-4 text-teal-400" /> {t('misc1.referYourRewards')}</h2>
        <div className="grid grid-cols-3 gap-3">
          <Stat value={summary ? summary.invited : '—'} label={t('misc1.referStatInvited')} testId="refer-invited" />
          <Stat value={summary ? summary.converted : '—'} label={t('misc1.referStatQualified')} tone="text-emerald-300" />
          <Stat value={summary ? summary.held : '—'} label={t('misc1.referStatChecking')} tone="text-amber-300" testId="refer-held" />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          {contactRewards && <Stat value={summary?.earnedContacts ?? '—'} label={t('misc1.referContactsEarned')} tone="text-teal-300" testId="refer-contacts-earned" />}
          <Stat value={agreements ? `${agreements.used} / ${agreements.free}` : '—'} label={t('misc1.referAgreementsUsed')} tone="text-emerald-300" testId="refer-agreements" />
        </div>
        <p className="text-xs text-gray-500 mt-3">{t('misc1.referCheckingNote', { days: referral.holdDays })}</p>
      </section>
    </div>
  );
}
