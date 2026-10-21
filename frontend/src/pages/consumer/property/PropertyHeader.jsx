import { Link } from 'react-router';
import Icon from '../../../components/Icon.jsx';
import Tip from '../../../components/ui/Tip.jsx';
import QualityScoreBadge from '../../../components/ui/QualityScoreBadge.jsx';
import MobileCollapse from '../../../components/ui/MobileCollapse.jsx';
import { fmtINR, fmtNum, timeAgo } from '../../../lib/format.js';
import { listingFreshness } from '../../../lib/freshness.js';
import { cityLabelFor } from '../../../lib/geoConfig.js';
import { OwnerCard } from './OwnerCard.jsx';
import { DealPanel } from './DealPanel.jsx';
import { GroupApplyCard } from './GroupApplyCard.jsx';
import { VisitCta } from './ActionCtas.jsx';

const FRESH_TONE = { emerald: 'text-emerald-300', gray: 'text-slate-400', amber: 'text-amber-300' };

export default function PropertyHeader({ ctx, priceOnHero = false }) {
  const {
    tags, priceStr, isRent, isLand, tr, title, p,
    areaLabel, perUnitVal, showPerUnit, kind, furnishLabel, possessionLabel,
    setReportOpen, isIn, toast, contactApproved, ownerMob, handleContact, handleSchedule, canChat,
    flagEnabled, contactStatus, myVisits,
  } = ctx;
  const deposit = Number(p.deposit) > 0 ? fmtINR(p.deposit) : '';
  const dateKey = p.freshenedAt ? 'property.updatedAgo' : 'property.postedAgo';
  const dateValue = timeAgo(p.freshenedAt || p.createdAt).toLowerCase();
  const preCompletion = p.construction === 'new' || p.construction === 'under';
  const facts = [
    ...(areaLabel !== '—' ? [[areaLabel]] : []),
    ...(showPerUnit ? [[tr('property.perSqftValue', { value: perUnitVal })]] : []),
    ...(isRent && deposit ? [[tr('property.depositValue', { value: deposit })]] : []),
    ...(!isRent && possessionLabel !== '—' ? [[possessionLabel, preCompletion ? 'tag.underConstruction' : 'tag.readyToMove']] : []),
    ...(isRent && !isLand && furnishLabel !== '—' ? [[furnishLabel, 'tag.furnishing']] : []),
  ];
  const fresh = listingFreshness(p);
  // `aging` says only "updated N days ago", which the date already does.
  const freshNote = fresh.buyer.show && fresh.state !== 'aging' ? fresh.buyer.short : '';
  const social = [
    ...(Number(p.views) > 0 ? [['eye', tr('property.viewsCount', { count: Number(p.views), value: fmtNum(p.views) })]] : []),
    ...(Number(p.enquiries) > 0 ? [['message-square-text', tr('property.enquiriesCount', { count: Number(p.enquiries), value: fmtNum(p.enquiries) })]] : []),
  ];
  return (
          <section className="fade-in grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 section-mb">

            <div className="lg:col-span-2">

              {priceOnHero ? null : (
                <div className="mb-1">
                  <span data-testid="property-price" className="text-3xl sm:text-4xl font-extrabold gradient-text">{priceStr}</span>
                </div>
              )}
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 leading-tight">{title}</h1>
              <div className="flex items-center gap-2 text-slate-400">
                <Icon name="map-pin" className="w-4 h-4 text-brand-teal-2 flex-shrink-0" />
                <span className="text-sm sm:text-base">{p.locality}, {cityLabelFor(p)}</span>
              </div>

              {facts.length ? (
                <ul data-testid="property-facts" className="dz-ph-facts mt-3 flex flex-wrap items-center gap-y-1 text-sm sm:text-base font-medium text-slate-200">
                  {facts.map(([text, tipKey]) => (
                    <li key={text} className="after:mx-2 after:text-slate-500 after:content-['·'] last:after:content-none">
                      {tipKey ? <Tip k={tipKey}><span>{text}</span></Tip> : text}
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* Owner-activity signal: tells the buyer whether the owner is keeping this listing current, so they
                 don't chase a ghost listing. */}
              <p
                data-testid="property-freshness"
                className={'mt-2 flex items-start gap-1.5 text-[13px] ' + (fresh.buyer.show ? FRESH_TONE[fresh.buyer.tone] : FRESH_TONE.gray)}
                title={fresh.buyer.show ? fresh.buyer.label : undefined}
              >
                <Icon name={fresh.buyer.show ? fresh.buyer.icon : 'clock'} className="w-3.5 h-3.5 mt-[3px] flex-shrink-0" />
                <span>{tr(dateKey, { time: dateValue })}{freshNote ? ` · ${freshNote}` : ''}</span>
              </p>

              {/* No `weight` prop: `file-check` resolves to a Lucide fallback, which ignores it, so asking for `fill`
                 produced two solid Phosphor glyphs beside one outline. */}
              <div data-testid="property-trust" className="mt-5 rounded-2xl border border-emerald-500/20 px-3.5 pt-3 pb-[5px] lg:p-4" style={{ background: 'linear-gradient(135deg,rgb(var(--dz-c-emerald-500) / .08),rgb(var(--dz-c-teal-500) / .06))' }}>
                <div className="tag-strip">
                  {tags.map(([label, cls, ic, tipKey]) => (
                    <Tip key={label} k={tipKey}>
                      <span className={`tag ${cls}`}>{ic ? <Icon name={ic} className="w-4 h-4" /> : null} {label}</span>
                    </Tip>
                  ))}
                  {p.reraId ? (
                    <a href="https://maharera.maharashtra.gov.in/" target="_blank" rel="noopener noreferrer" className="dz-chip border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15">
                      <Icon name="badge-check" className="h-3.5 w-3.5" /> {tr('property.mahaReraId', { id: p.reraId })}
                      {p.reraChecked ? <span data-testid="rera-checked" className="border-l border-emerald-500/30 pl-1.5">{tr('property.reraChecked')}</span> : null}
                    </a>
                  ) : null}
                </div>

                {/* Every claim in here is a *platform* promise and is byte-for-byte identical on every listing, so it
                   carries no information that helps a buyer choose between two homes. */}
                <MobileCollapse
                  className="mt-2.5 border-t border-white/10 pt-[3px] lg:mt-3 lg:pt-3"
                  label={tr('property.assuredTitle')}
                  header={(
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon name="shield-check" className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                      <h3 className="text-white font-bold text-sm">{tr('property.assuredTitle')}</h3>
                      <span className="dz-tag text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 font-semibold uppercase tracking-wide">{tr('property.trustedListing')}</span>
                    </div>
                  )}
                >
                  <div className="dz-assured-list mt-3 pb-3 lg:pb-0 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <span className="inline-flex items-center gap-2 text-xs text-slate-200 rounded-lg border border-white/10 bg-white/5 px-3 py-2"><Icon name="user-check" className="w-4 h-4 text-emerald-400" /> {tr('property.assuredVerified')}</span>
                    <span className="inline-flex items-center gap-2 text-xs text-slate-200 rounded-lg border border-white/10 bg-white/5 px-3 py-2"><Icon name="phone-off" className="w-4 h-4 text-gray-400" /> {tr('property.numberProtected')}</span>

                    {/* Inside a collapsed panel, so the automated tap-target sweep never reaches it — the 44px
                       minimum has to be asserted here by hand. */}
                    <button type="button" onClick={() => setReportOpen(true)} className="inline-flex items-center gap-2 min-h-[44px] text-xs text-slate-200 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white/10 hover:border-amber-400/30 transition-smooth"><Icon name="flag" className="w-4 h-4 text-amber-400" /> {tr('property.reportReverify')}</button>
                    <Link to="/how-verification-works" className="inline-flex items-center gap-2 min-h-[44px] text-xs text-slate-200 rounded-lg border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10 hover:border-emerald-400/30 transition-smooth"><Icon name="info" className="w-4 h-4 text-emerald-400" /> {tr('property.assuredHow')}</Link>
                  </div>
                </MobileCollapse>
              </div>
              {/* A studio / 1-BHK isn't practical to split, so gate on 2+ BHK. */}
              {isRent && kind === 'residential' && (p.bhkNum || 0) >= 2 && p.price > 0 ? (
                <MobileCollapse
                  className="mt-5 glass-strong rounded-2xl px-3.5 py-[5px] lg:p-5"
                  label={tr('property.sharingFlatTitle')}
                  summary={'₹' + (p.price / 2 / 1000).toFixed(0) + 'k'}
                  header={(
                    <div>
                      <h3 className="font-semibold text-white flex items-center gap-2"><Icon name="users" className="w-4 h-4 text-brand-teal-2" /> {tr('property.sharingFlatTitle')}</h3>
                      <p className="text-xs text-slate-400 mt-1">{tr('property.sharingFlatSub')}</p>
                    </div>
                  )}
                >
                  <div className="dz-share-split mt-3.5 pb-3 lg:pb-0 grid grid-cols-3 gap-3">
                    <div className="glass-strong rounded-xl p-3 text-center">
                      <p className="text-xs text-slate-400 mb-1">{tr('property.shareAlone')}</p>
                      <p className="text-lg font-bold text-white">₹{(p.price / 1000).toFixed(0)}k</p>
                    </div>
                    <div className="glass-strong rounded-xl p-3 text-center">
                      <p className="text-xs text-slate-400 mb-1">{tr('property.share2')}</p>
                      <p className="text-lg font-bold text-brand-teal-3">₹{(p.price / 2 / 1000).toFixed(0)}k</p>
                    </div>
                    <div className="glass-strong rounded-xl p-3 text-center">
                      <p className="text-xs text-slate-400 mb-1">{tr('property.share3')}</p>
                      <p className="text-lg font-bold text-emerald-400">₹{(p.price / 3 / 1000).toFixed(0)}k</p>
                    </div>
                  </div>
                  <Link to={`/flatmates?startGroup=1&title=${encodeURIComponent(title)}&rent=${p.price}&loc=${encodeURIComponent(p.locality)}`} className="h-btn mt-3.5 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-brand-teal-2/30 bg-brand-teal-1/10 text-brand-teal-3 text-sm font-medium hover:bg-brand-teal-1/20 transition-smooth"><Icon name="users-round" className="w-4 h-4" /> {tr('property.findFlatmates')}</Link>
                </MobileCollapse>
              ) : null}

              {social.length || Number.isFinite(p.qualityScore) ? (
                <div className="dz-stat-social mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-400">
                  {social.map(([ic, text]) => (
                    <span key={ic} className="inline-flex items-center gap-1.5 tabular-nums"><Icon name={ic} className="w-3.5 h-3.5" /> {text}</span>
                  ))}
                  <QualityScoreBadge listing={p} variant="inline" />
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-4">
              <h2 className="lg:hidden text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{tr('property.nextSteps')}</h2>

              <div className="dz-owner-rail hidden lg:block">
                <OwnerCard p={p} isIn={isIn} toast={toast} contactApproved={contactApproved} contactStatus={contactStatus} ownerMob={ownerMob} onContact={handleContact} canChat={canChat} />
              </div>

              {/* Hidden on mobile: the sticky bottom bar already exposes "Visit", so this standalone button would be
                 a third copy of the same action. */}
              {flagEnabled('scheduleVisit') && (
                <div className="hidden lg:block">
                  <VisitCta visits={myVisits} onSchedule={handleSchedule} label={tr('property.scheduleVisit')} iconClassName="w-5 h-5" className="btn-teal w-full flex items-center justify-center gap-2 py-3 shadow-none" />
                </div>
              )}

              <DealPanel p={p} isIn={isIn} toast={toast} contactApproved={contactApproved} />

              <GroupApplyCard p={p} isIn={isIn} toast={toast} />

              {!isLand && !isRent && <Link to="/emi-calculator" className="flex min-h-[44px] items-center justify-center gap-1.5 text-sm font-semibold text-brand-teal-3 hover:text-brand-teal-2 transition-smooth"><Icon name="calculator" className="w-4 h-4" /> {tr('property.calculateEmi')}</Link>}
            </div>
          </section>
  );
}
