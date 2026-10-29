import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import MobileCollapse from '../../../components/ui/MobileCollapse.jsx';
import { digits } from '../../../lib/contact.js';
import { useSignInGate } from '../../../lib/useSignInGate.js';
import { useAuth } from '../../../context/AuthContext.jsx';
import { listPropertyReviews, createPropertyReview, getPropertyReviewSummary, reviewRefusal, updateReview, deleteReview } from '../../../services/reviewService.js';
import {
  myTenancies,
  listTenancyDeclarations,
  declareTenancy,
  confirmTenancyDeclaration,
  revokeTenancyDeclaration,
} from '../../../services/rentService.js';
import { Stars } from './Stars.jsx';
import { ReviewModal } from './ReviewModal.jsx';
import { OwnReviewBar } from './OwnReviewBar.jsx';

function initials(name) {
  const parts = String(name || 'U').trim().split(/\s+/);
  return ((parts[0]?.[0] || 'U') + (parts[1]?.[0] || '')).toUpperCase();
}

export const RV_CATS = [['locality', 'Locality'], ['condition', 'Condition'], ['value', 'Value'], ['owner', 'Owner'], ['accuracy', 'Accuracy']];

export function ReviewsSection({ p, isIn, myVisits, onReport, toast }) {
  const { t } = useTranslation();
  const sendToSignIn = useSignInGate();
  const { user } = useAuth();
  const [reviews, setReviews] = useState(null);
  const [reviewsFailed, setReviewsFailed] = useState(false);
  const [summary, setSummary] = useState(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(false);

  const propId = String(p.uuid || p.id || '');

  useEffect(() => {
    if (!propId) { setReviews(null); setSummary(null); setReviewsFailed(true); setSummaryFailed(true); return undefined; }
    let alive = true;
    setReviews(null);
    setReviewsFailed(false);
    setSummary(null);
    setSummaryFailed(false);
    listPropertyReviews(propId)
      .then((res) => { if (alive) setReviews(res.items); })
      .catch(() => { if (alive) setReviewsFailed(true); });
    getPropertyReviewSummary(propId)
      .then((s) => { if (alive) setSummary(s); })
      .catch(() => { if (alive) setSummaryFailed(true); });
    return () => { alive = false; };
  }, [propId]);

  const list = reviews || [];
  const myReview = list.find((r) => r.mine) || null;
  const loading = (reviews === null && !reviewsFailed) || (summary === null && !summaryFailed);

  const hasAggregate = !loading && !!summary && summary.count > 0 && Number.isFinite(summary.avg);

  const readFailed = reviewsFailed || summaryFailed;
  const isEmpty = !loading && !readFailed && !hasAggregate && !list.length;
  const isUnreadable = !loading && readFailed && !hasAggregate && !list.length;

  const recommend = useMemo(() => {
    const answered = (reviews || []).filter((r) => r.recommend != null);
    if (!answered.length) return null;
    return Math.round((answered.filter((r) => r.recommend).length / answered.length) * 100);
  }, [reviews]);

  const shown = list.filter((r) => filter === 'all' || r.context === filter);

  const owner = String(p.ownerMobile || '');
  const mine = digits(user?.mobile);
  const idsKnown = !!user?.id && !!p.ownerId;
  const isOwner = isIn && (idsKnown
    ? String(user.id) === String(p.ownerId)
    : (!!mine && mine === digits(owner)));

  const [brokeredTenancy, setBrokeredTenancy] = useState(false);
  useEffect(() => {
    setBrokeredTenancy(false);
    if (!isIn || !propId) return undefined;
    let alive = true;
    myTenancies()
      .then((all) => { if (alive) setBrokeredTenancy(all.some((tn) => tn.confirmed && String(tn.propId) === propId)); })
      .catch(() => { if (alive) setBrokeredTenancy(false); });
    return () => { alive = false; };
  }, [isIn, propId]);

  const [declarations, setDeclarations] = useState([]);
  useEffect(() => {
    setDeclarations([]);
    if (!isIn || !propId) return undefined;
    let alive = true;
    listTenancyDeclarations(propId)
      .then((rows) => { if (alive) setDeclarations(rows); })
      .catch(() => { if (alive) setDeclarations([]); });
    return () => { alive = false; };
  }, [isIn, propId]);

  const myDeclaration = isOwner ? null : (declarations[0] || null);
  const hasTenancy = brokeredTenancy || myDeclaration?.status === 'confirmed';

  const myVisit = myVisits?.completed ? 'completed' : myVisits?.booked ? 'scheduled' : null;

  const eligible = isIn && !isOwner && (myVisit === 'completed' || hasTenancy);

  const openRate = () => {
    if (!isIn) { sendToSignIn('review'); return; }
    if (myReview) { setModal(true); return; }
    if (isOwner) { toast(t('property.cantReviewOwn'), 'info'); return; }
    if (!eligible) {
      if (myVisit === 'scheduled') toast(t('property.visitBookedReview'), 'info');
      else if (myDeclaration) toast(t('property.declarationPending'), 'info');
      else toast(t('property.bookVisitFirst'), 'info');
      return;
    }
    setModal(true);
  };

  const [deciding, setDeciding] = useState(false);
  const outcomeRef = useRef(null);
  const restoreFocus = () => { requestAnimationFrame(() => outcomeRef.current?.focus()); };

  const declare = () => {
    if (deciding) return;
    setDeciding(true);
    declareTenancy(propId)
      .then((row) => { setDeclarations([row]); toast(t('property.declarationSent'), 'success'); restoreFocus(); })
      .catch(() => toast(t('property.declarationFailed'), 'error'))
      .finally(() => setDeciding(false));
  };

  const decide = (id, action) => {
    if (deciding) return;
    setDeciding(true);
    action(id)
      .then((row) => setDeclarations((prev) => prev.map((d) => (d.id === row.id ? row : d))))
      .catch(() => toast(t('property.declarationFailed'), 'error'))
      .finally(() => setDeciding(false));
  };

  const canDeclare = isIn && !!propId && !isOwner && !eligible && myVisit !== 'completed' && !myDeclaration;

  const [busy, setBusy] = useState(false);
  const reload = () => Promise.all([listPropertyReviews(propId), getPropertyReviewSummary(propId)])
    .then(([res, s]) => {
      setReviews(res.items);
      setReviewsFailed(false);
      setSummary(s);
      setSummaryFailed(false);
    });

  const submit = (review) => {
    const editing = !!myReview;
    (editing ? updateReview(myReview.id, review) : createPropertyReview(propId, review))
      .then(reload)
      .then(() => {
        setModal(false);
        toast(t(editing ? 'common.reviewUpdated' : 'property.reviewPosted'), 'success');
      })
      .catch((err) => toast(reviewRefusal(err, t) || t('property.reviewFailed'), 'error'));
  };

  const removeMine = () => {
    if (busy || !myReview || !window.confirm(t('common.deleteReviewConfirm'))) return;
    setBusy(true);
    deleteReview(myReview.id)
      .then(reload)
      .then(() => toast(t('common.reviewDeleted'), 'success'))
      .catch(() => toast(t('common.reviewDeleteFailed'), 'error'))
      .finally(() => setBusy(false));
  };

  return (
    <section className="fade-in section-mb">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2"><Icon name="star" className="w-5 h-5 text-amber-400" /> {t('property.ratingsReviews')}</h2>
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={onReport} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-red-400 transition-smooth"><Icon name="flag" className="w-4 h-4" /> {t('property.reportListing')}</button>
          {!isOwner ? <button type="button" onClick={openRate} className="btn-teal inline-flex items-center gap-2 text-sm py-2.5 px-4"><Icon name={myReview ? 'pencil' : 'star'} className="w-4 h-4" /> {myReview ? t('common.editReview') : t('property.rateProperty')}</button> : null}
        </div>
      </div>

      {canDeclare ? (
        <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 mb-6 flex items-center gap-3 flex-wrap" data-testid="tenancy-declare">
          <Icon name="home" className="w-5 h-5 text-brand-teal-3 flex-shrink-0" />
          <p className="text-slate-300 text-sm flex-1 min-w-[12rem]">{t('property.livedHerePrompt')}</p>
          <button type="button" onClick={declare} disabled={deciding} className="btn-teal inline-flex items-center gap-2 text-sm min-h-[44px] sm:min-h-0 py-2.5 px-4 disabled:opacity-60">{t('property.declareTenancy')}</button>
        </div>
      ) : null}

      {myDeclaration && myDeclaration.status !== 'confirmed' ? (
        <div ref={outcomeRef} tabIndex={-1} role="status" className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 mb-6 flex items-center gap-3" data-testid={'tenancy-declaration-' + myDeclaration.status}>
          <Icon name={myDeclaration.status === 'revoked' ? 'alert-triangle' : 'clock'} className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <p className="text-slate-300 text-sm">{t(myDeclaration.status === 'revoked' ? 'property.declarationRevoked' : 'property.declarationPending')}</p>
        </div>
      ) : null}

      {isOwner && declarations.length ? (
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 mb-6" data-testid="tenancy-claims">
          <h3 className="text-white font-semibold text-sm mb-1">{t('property.tenancyClaims')}</h3>

          <p className="text-slate-400 text-xs mb-3">{t('property.tenancyClaimsHint')}</p>
          {declarations.map((d) => {
            const who = d.declarantName || t('property.someone');
            return (
              <div key={d.id} className="flex items-center gap-3 flex-wrap py-2 border-t border-white/8 first:border-t-0">
                <span className="text-white text-sm font-medium flex-1 min-w-[8rem]">{who}</span>
                {d.livedFrom || d.livedTo ? <span className="text-slate-500 text-xs">{[d.livedFrom, d.livedTo].filter(Boolean).join(' – ')}</span> : null}
                {d.status === 'confirmed' ? (
                  <>
                    <span role="status" className="text-emerald-400 text-xs inline-flex items-center gap-1"><Icon name="badge-check" className="w-3 h-3" /> {t('property.claimConfirmed')}</span>
                    <button type="button" disabled={deciding} aria-label={t('property.claimWithdrawFor', { name: who })} onClick={() => decide(d.id, revokeTenancyDeclaration)} className="text-xs font-medium text-slate-400 hover:text-red-400 min-h-[44px] sm:min-h-0 px-2 disabled:opacity-60">{t('property.claimWithdraw')}</button>
                  </>
                ) : d.status === 'revoked' ? (
                  <span role="status" className="text-slate-500 text-xs">{t('property.claimRevoked')}</span>
                ) : (
                  <>
                    <button type="button" disabled={deciding} aria-label={t('property.claimConfirmFor', { name: who })} onClick={() => decide(d.id, confirmTenancyDeclaration)} className="btn-teal text-xs min-h-[44px] sm:min-h-0 py-2 px-3 disabled:opacity-60">{t('property.claimConfirmAction')}</button>
                    <button type="button" disabled={deciding} aria-label={t('property.claimRejectFor', { name: who })} onClick={() => decide(d.id, revokeTenancyDeclaration)} className="text-xs font-medium text-slate-400 hover:text-red-400 min-h-[44px] sm:min-h-0 px-2 disabled:opacity-60">{t('property.claimRejectAction')}</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6" aria-hidden="true" data-testid="reviews-summary-skeleton">
          <div className="h-44 skeleton rounded-2xl" />
          <div className="h-44 skeleton rounded-2xl" />
          <div className="h-44 skeleton rounded-2xl" />
        </div>
      ) : isUnreadable ? (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 flex items-center gap-3" data-testid="property-reviews-unavailable">
          <Icon name="alert-triangle" className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <p className="text-amber-200/90 text-sm">{t('property.reviewsUnavailable')}</p>
        </div>
      ) : isEmpty ? (
        <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 flex items-center gap-3">
          <Icon name="star" className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <p className="text-slate-300 text-sm">{t('property.noReviewsYet')}</p>
        </div>
      ) : (
        <MobileCollapse

          label={t('property.ratingsReviews')}
          header={(
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
              {hasAggregate ? <><Stars value={summary.avg} size={14} /> {summary.avg.toFixed(1)} · </> : null}

              {t('property.reviews', { count: hasAggregate ? summary.count : list.length })}
            </span>
          )}
        >

          {!hasAggregate && summaryFailed ? (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 mb-4 flex items-center gap-3" data-testid="property-rating-unavailable">
              <Icon name="alert-triangle" className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <p className="text-amber-200/90 text-sm">{t('property.ratingUnavailable')}</p>
            </div>
          ) : null}
          {hasAggregate ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6" data-testid="reviews-aggregate">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 flex flex-col items-center justify-center text-center">
              <div className="text-4xl font-extrabold text-white mb-1" data-testid="reviews-average">{summary.avg.toFixed(1)}</div>
              <div className="mb-1"><Stars value={summary.avg} size={18} /></div>
              <p className="text-slate-400 text-xs">{t('property.reviews', { count: summary.count })}</p>
              {recommend != null ? <p className="text-emerald-400 text-xs mt-2 inline-flex items-center gap-1" data-testid="reviews-recommend"><Icon name="badge-check" className="w-3 h-3" /> {t('property.recommendPct', { pct: recommend })}</p> : null}
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
              {[5, 4, 3, 2, 1].map((s) => {
                const c = summary.dist[s - 1];
                const max = Math.max(...summary.dist) || 1;
                return (
                  <div key={s} className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] text-slate-400 w-3">{s}</span>
                    <Icon name="star" weight="fill" className="w-3 h-3 text-amber-400" />
                    <div className="flex-1 h-2 rounded-full bg-white/8 overflow-hidden"><div className="h-full bg-amber-400" style={{ width: Math.round((c / max) * 100) + '%' }} /></div>
                    <span className="text-[11px] text-slate-500 w-5 text-right" data-testid={'reviews-bar-' + s}>{c}</span>
                  </div>
                );
              })}
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5" data-testid="reviews-cat-averages">
              {Object.keys(summary.catAvg).length ? Object.keys(summary.catAvg).map((k) => (
                <div key={k} className="flex items-center justify-between gap-3 py-1">
                  <span className="text-sm text-slate-300">{t('property.reviewCats.' + k)}</span>
                  <span className="inline-flex items-center gap-1"><Stars value={summary.catAvg[k]} size={13} /><span className="text-[11px] text-slate-400 w-6 text-right">{summary.catAvg[k].toFixed(1)}</span></span>
                </div>
              )) : <p className="text-slate-500 text-sm">{t('property.noCategoryRatings')}</p>}
            </div>
          </div>
          ) : null}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {[['all', t('property.filterAll')], ['visit', t('property.filterVisited')], ['tenant', t('property.filterResidents')]].map(([id, lbl]) => {
              const n = id === 'all' ? (hasAggregate ? summary.count : list.length) : list.filter((r) => r.context === id).length;
              return <button key={id} type="button" onClick={() => setFilter(id)} className={'inline-flex items-center min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg text-xs font-medium ' + (filter === id ? 'bg-brand-teal-1/20 text-brand-teal-3 border border-brand-teal-2/30' : 'text-slate-400 border border-white/8 hover:text-white')}>{lbl} ({n})</button>;
            })}
          </div>
          <div>
            {shown.length ? shown.map((r) => (
              <div key={r.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 mb-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-teal-1 to-brand-indigo-4 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{initials(r.user)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-white font-semibold text-sm">{r.user}</span>

                      {r.context ? (
                        <span className={'dz-tag font-semibold border ' + (r.context === 'tenant' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' : 'bg-teal-500/15 text-teal-300 border-teal-500/25')}><Icon name={r.context === 'tenant' ? 'home' : 'calendar-check'} className="w-2.5 h-2.5" /> {r.context === 'tenant' ? t('property.verifiedResident') : t('property.visited')}</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 mb-2"><Stars value={r.rating} size={14} /><span className="text-[11px] text-slate-500">{r.at}</span></div>
                    {r.text ? <p className="text-slate-300 text-sm leading-relaxed mb-2">{r.text}</p> : null}
                    {r.categories && Object.keys(r.categories).length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {Object.keys(r.categories).map((k) => (
                          <span key={k} className="inline-flex items-center gap-1 text-[11px] text-slate-300 bg-white/5 border border-white/8 rounded-lg px-2 py-1">{t('property.reviewCats.' + k)} <Stars value={r.categories[k]} size={11} /></span>
                        ))}
                      </div>
                    ) : null}
                    {r.recommend != null ? <p className={'text-[11px] mt-2 ' + (r.recommend ? 'text-emerald-400' : 'text-slate-400')}><Icon name={r.recommend ? 'thumbs-up' : 'thumbs-down'} className="w-3 h-3 inline" /> {r.recommend ? t('property.wouldRecommend') : t('property.wouldNotRecommend')}</p> : null}
                                        {r.mine ? <OwnReviewBar onEdit={() => setModal(true)} onDelete={removeMine} busy={busy} /> : null}
                                      </div>
                </div>
              </div>
            )) : reviewsFailed ? (
              <p className="text-amber-200/90 text-sm py-4 inline-flex items-center gap-2" data-testid="property-review-list-unavailable"><Icon name="alert-triangle" className="w-4 h-4 flex-shrink-0" /> {t('property.reviewsUnavailable')}</p>
            ) : <p className="text-slate-500 text-sm py-4">{t('property.noReviewsFilter')}</p>}
          </div>
        </MobileCollapse>
      )}

      {modal ? <ReviewModal initial={myReview} onClose={() => setModal(false)} onSubmit={submit} /> : null}
    </section>
  );
}
