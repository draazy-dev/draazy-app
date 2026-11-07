import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import Icon from '../../../components/Icon.jsx';
import HScroll from '../../../components/ui/HScroll.jsx';
import ServiceTracker from '../../../components/ServiceTracker.jsx';
import '../../../styles/routes/rent-agreement.css';
import { invitePath } from '../../../lib/serviceRequestStatus.js';
import { STEP_LABELS, LAST_PUBLIC_STEP, REVIEW_STEP } from './rent-agreement/constants.js';
import Hero from './rent-agreement/Hero.jsx';
import DocsRequired from './rent-agreement/DocsRequired.jsx';
import InfoSections from './rent-agreement/InfoSections.jsx';
import StepProperty from './rent-agreement/StepProperty.jsx';
import StepOwner from './rent-agreement/StepOwner.jsx';
import StepTenant from './rent-agreement/StepTenant.jsx';
import StepTerms from './rent-agreement/StepTerms.jsx';
import StepReview from './rent-agreement/StepReview.jsx';
import DeclinedInvitePanel from './rent-agreement/DeclinedInvitePanel.jsx';
import ReadyToPayPanel from './rent-agreement/ReadyToPayPanel.jsx';
import CostSidebar, { MobileCostSummary } from './rent-agreement/CostSidebar.jsx';
import { useRentAgreement } from './rent-agreement/useRentAgreement.js';

// Entering or leaving an invite link remounts, so the invitee's form never leaks into the user's own draft.
export default function RentAgreementRoute() {
  const [params] = useSearchParams();
  return <RentAgreement key={`${params.get('party') || ''}|${params.get('request') || ''}`} />;
}

function RentAgreement() {
  const ctx = useRentAgreement();
  const [localityBusy, setLocalityBusy] = useState(false);
  const {
    rootRef, formRef, tr, navigate,
    step, errors, done, openFaq, setOpenFaq,
    mode, inviteError, inviteResult, copied, signInToInvite,
    withdrawInvite, withdrawing,
    prop, setP, setProp, setSelectedPropertyId, pickListing, myProperties,
    owner, setO, coOwners, setCoOwner, addCoOwner, removeCoOwner, ownerDocs, setOwnerDocs, vaultEnabled, saveOwnerDocToVault,
    ownerMode, chooseOwnerMode, inviteRole, inviteAwaitingPayment,
    tenantMode, setTenantMode, tenants, setTenant, addTenant, removeTenant, tenantDocs, setTenantDocs, invite, setInvite,
    terms, setT, startBounds, maint, setMaint, regArea, furnItems, custom, setCustom, clauses, setClauses,
    isChecked, toggleFurn, bumpQty, removeFurn, addCustom, furnitureText,
    declare, setDeclare, generate, submitting, pendingRequestId, paymentPending, paymentConfirming,
    clearErr, fc, cost, locked, joinedOnly, gated, startNewAgreement, restored, startFresh, myInvites,
    identityReminders,
    stalledInvite, recoverInvite, recovering, payable, payables, payFiled, paying, continuable, continueFiled, coFilledRole, maskedIds, continuableHeld,
    requestCancelled,
    viewOnly, viewedRequest, viewSubmitted, canView, editSubmitted, discardEdits, closeFiled, editingSubmitted, holdingUnpaid,
    copyInviteLink, next, prev,
  } = ctx;
  const compact = locked || viewOnly;
  const invitingOwner = mode === 'owner' && ownerMode === 'invite';
  const inviting = invitingOwner || (mode === 'owner' && tenantMode === 'invite');
  const tenantInvitePaid = inviting && !invitingOwner && !payable;
  const invitedSide = { context: invitingOwner || inviteRole === 'owner' ? 'owner' : undefined };
  const ownStep = inviteRole === 'owner' ? 1 : 2;
  const shownOwnerMode = coFilledRole === 'owner' ? 'fill' : ownerMode;
  const shownTenantMode = coFilledRole === 'tenant' ? 'fill' : tenantMode;
  const ownerReadOnly = viewOnly || (mode === 'invite' && inviteRole !== 'owner') || coFilledRole === 'owner';
  const tenantReadOnly = viewOnly || (mode === 'invite' && inviteRole === 'owner') || coFilledRole === 'tenant';
  const sharedReadOnly = viewOnly || mode === 'invite';
  const canEditFiled = !!viewedRequest?.editableByMe;
  const sidePending = mode === 'invite' && !!viewedRequest && !viewedRequest.mySideSubmitted;
  const summaryCtx = { context: sidePending ? 'pending' : undefined };
  const lockedCtx = { context: joinedOnly ? 'joined' : undefined };

  return (
    <div ref={rootRef} className="ra-page">
      <div>
        <Hero />

        <ServiceTracker key={done ? 'done' : 'open'} typeFilter="rental" title={tr('services.ra.trackerTitle')} onCancelled={requestCancelled} onView={viewSubmitted}         canView={canView} />

        <section ref={formRef} id="ra-form" className="scroll-mt-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 section-y">
          <p role="status" aria-live="polite" className="sr-only" data-testid="ra-error-count">{Object.keys(errors).length ? tr('services.ra.errorCount', { count: Object.keys(errors).length }) : ''}</p>
          <div className={`grid grid-cols-1 gap-6${compact ? '' : ' lg:grid-cols-[1fr_340px]'}`}>
            <div className="glass-card ra-form-card rounded-2xl p-6 sm:p-8">
              {inviteError ? (
                <div className="p-6 rounded-xl bg-amber-500/8 border border-amber-500/25 text-center">
                  <Icon name="alert-triangle" className="w-10 h-10 text-amber-300 mx-auto mb-3" />
                  <p className="text-white font-semibold">{tr(`services.ra.inviteErr.${inviteError.kind}.title`)}</p>
                  <p className="text-gray-400 text-sm mt-1.5 leading-relaxed max-w-md mx-auto">{tr(`services.ra.inviteErr.${inviteError.kind}.desc`, { mobile: inviteError.toMobile ? '••••' + String(inviteError.toMobile).slice(-4) : '', detail: inviteError.detail || '' })}</p>
                  {inviteError.kind === 'signin'
                    ? <button type="button" onClick={signInToInvite} className="btn-teal mt-5 px-6 py-3 rounded-xl text-white text-sm font-semibold inline-flex items-center gap-2"><Icon name="log-in" className="w-4 h-4" /> {tr('services.ra.inviteErr.signIn')}</button>
                    : <button type="button" onClick={() => navigate('/services/rent-agreement')} className="btn-teal mt-5 px-6 py-3 rounded-xl text-white text-sm font-semibold inline-flex items-center gap-2"><Icon name="file-signature" className="w-4 h-4" /> {tr(inviteError.kind === 'blocked' ? 'services.ra.inviteErr.openMine' : 'services.ra.inviteErr.startOwn')}</button>}
                </div>
              ) : (
              <>
              {!locked && (
              <HScroll wrapClassName="mb-6 sm:mb-8" className="flex items-center pb-2">
                {STEP_LABELS.map((s, i) => {
                  const awaitingStep = viewOnly ? -1 : invitingOwner ? 1 : inviting ? 2 : -1;
                  const isLocked = gated && i > LAST_PUBLIC_STEP;
                  const st = isLocked ? 'locked' : (i === step ? 'active' : (i === awaitingStep ? 'pending' : (i < step || viewOnly ? 'done' : '')));
                  return (
                  <div key={s} className={'flex items-start ' + (i < STEP_LABELS.length - 1 ? 'flex-1' : '')}>
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div
                        className={'step-dot w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ' + st}
                        {...(isLocked ? { role: 'img', 'aria-label': tr('services.ra.gate.stepLocked') } : {})}
                      >{st === 'locked' ? <Icon name="lock" className="w-4 h-4" /> : st === 'done' ? <Icon name="check" className="w-4 h-4" /> : st === 'pending' ? <Icon name="clock" className="w-4 h-4" /> : i + 1}</div>
                      <span className={'text-[10px] mt-1.5 whitespace-nowrap ' + (st === 'active' ? 'text-teal-400' : st === 'pending' ? 'text-amber-400' : 'text-gray-500')}>{tr(`services.ra.stepLabel.${i}`)}</span>
                    </div>
                    {i < STEP_LABELS.length - 1 && <div className={'step-line flex-1 h-0.5 mx-1 sm:mx-2 mt-[17px] ' + (i < step || viewOnly ? 'done' : '')} />}
                  </div>
                  );
                })}
              </HScroll>
              )}

              {done ? (
                <div className="space-y-4">
                  {paymentPending ? (
                    <div className="p-6 rounded-xl bg-amber-500/10 text-center">
                      <Icon name="clock" className="w-10 h-10 text-amber-400 mx-auto mb-2" />
                      <p className="text-white font-semibold">{tr('services.ra.donePaymentPendingTitle')}</p>
                      <p className="text-gray-400 text-sm mt-1">{tr('services.ra.donePaymentPendingDesc')}</p>
                      {payable ? (
                        <button type="button" disabled={paying} onClick={() => payFiled()} className="btn-teal inline-flex items-center justify-center gap-2 px-5 py-3 mt-4 rounded-xl text-white text-sm font-semibold min-h-[44px] disabled:opacity-50"><Icon name="credit-card" className="w-4 h-4" /> {tr('services.ra.donePaymentPendingCta')}</button>
                      ) : (
                        <Link to="/dashboard#rental" className="btn-teal inline-flex items-center justify-center gap-2 px-5 py-3 mt-4 rounded-xl text-white text-sm font-semibold min-h-[44px]"><Icon name="credit-card" className="w-4 h-4" /> {tr('services.ra.donePaymentPendingCta')}</Link>
                      )}
                    </div>
                  ) : (
                  <div className="p-6 rounded-xl bg-emerald-500/10 text-center">
                    <Icon name="check-circle-2" className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                    <p className="text-white font-semibold">{tenantInvitePaid ? tr('services.ra.doneInvitePaidTitle') : inviting ? tr('services.ra.doneInviteTitle', invitedSide) : tr('services.ra.doneOwnerTitle')}</p>
                    <p className="text-gray-400 text-sm mt-1">{tenantInvitePaid ? tr('services.ra.doneInvitePaidDesc') : inviting ? tr('services.ra.doneInviteDesc', invitedSide) : tr(inviteAwaitingPayment ? 'services.ra.doneInviteeUnpaidDesc' : 'services.ra.doneOwnerDesc')}</p>
                  </div>
                  )}
                  {payable && !paymentPending && <ReadyToPayPanel request={payable} onPay={() => payFiled()} busy={paying} unconfirmed={false} />}
                  {inviting && inviteResult ? (
                    <div className="p-5 rounded-xl bg-white/[0.03]">
                      <p className="text-white font-semibold text-sm flex items-center gap-2"><Icon name="message-circle" className="w-4 h-4 text-emerald-400" /> {tr(inviteResult.queued ? 'services.ra.invite.sendTitle' : 'services.ra.invite.readyTitle', invitedSide)}</p>
                      <p className="text-gray-400 text-xs mt-1">{tr(inviteResult.queued ? 'services.ra.invite.sendDesc' : 'services.ra.invite.readyDesc', { mobile: inviteResult.toMobile ? '••••' + inviteResult.toMobile.slice(-4) : '' })}</p>
                      {inviteResult.pending ? (
                        <p className="text-amber-200/90 text-[11px] mt-2 flex items-start gap-1.5"><Icon name="clock" className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {tr('services.ra.invite.pendingSignup')}</p>
                      ) : (
                        <p className="text-gray-500 text-[11px] mt-2 flex items-start gap-1.5"><Icon name="clock" className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {tr('services.ra.invite.awaitingReply')}</p>
                      )}
                      <div className="flex flex-col sm:flex-row gap-2 mt-3">
                        <a href={inviteResult.waLink} target="_blank" rel="noopener noreferrer" className="btn-teal h-btn sm:flex-1 inline-flex items-center justify-center gap-2 px-4 rounded-xl text-white text-sm font-semibold"><Icon name="message-circle" className="w-4 h-4" /> {tr('services.ra.invite.sendWhatsapp')}</a>
                        <button type="button" onClick={copyInviteLink} className="btn-outline h-btn sm:flex-1 inline-flex items-center justify-center gap-2 px-4 rounded-xl text-gray-200 text-sm font-semibold"><Icon name={copied ? 'check' : 'copy'} className="w-4 h-4" /> {copied ? tr('services.ra.invite.copied') : tr('services.ra.invite.copyLink')}</button>
                      </div>
                      <p className="text-gray-600 text-[11px] mt-2.5 leading-relaxed">{tr('services.ra.invite.sendNote', invitedSide)}</p>
                      {inviteResult.partyId ? (
                        <button type="button" onClick={withdrawInvite} disabled={withdrawing} className="mt-3 text-gray-500 hover:text-gray-300 disabled:opacity-50 text-[11px] font-semibold underline underline-offset-2">
                          {withdrawing ? tr('services.ra.invite.withdrawing') : tr('services.ra.invite.withdraw')}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : paymentConfirming ? (
                <div className="p-6 rounded-xl bg-teal-500/10 text-center" role="status" aria-live="polite">
                  <Icon name="circle-notch" className="w-10 h-10 text-teal-300 mx-auto mb-2 animate-spin" />
                  <p className="text-white font-semibold">{tr('services.ra.donePaymentConfirmingTitle')}</p>
                  <p className="text-gray-400 text-sm mt-1">{tr('services.ra.donePaymentConfirmingDesc')}</p>
                </div>
              ) : locked ? (
                <div className="text-center py-4">
                  <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mx-auto mb-4">
                    <Icon name="lock" className="w-7 h-7 text-teal-300" />
                  </div>
                  <h3 className="text-white font-bold text-lg">{tr('services.ra.locked.title', lockedCtx)}</h3>
                  <p className="text-gray-400 text-sm mt-2 max-w-md mx-auto leading-relaxed">{tr('services.ra.locked.desc', lockedCtx)}</p>
                  <div className="mt-5 p-4 rounded-xl bg-white/[0.03] border border-white/10 max-w-md mx-auto text-left flex items-start gap-3">
                    <Icon name="info" className="w-4 h-4 text-teal-300 mt-0.5 flex-shrink-0" />
                    <p className="text-gray-300 text-xs leading-relaxed">{tr('services.ra.locked.changesHint', lockedCtx)}</p>
                  </div>
                  {stalledInvite && <DeclinedInvitePanel stalled={stalledInvite} onRecover={recoverInvite} busy={recovering} />}
                  {payables.map((r) => <ReadyToPayPanel key={r.id} request={r} onPay={() => payFiled(r)} busy={paying} unconfirmed={paymentPending} />)}
                  {continuable && (
                    <div className="mt-4 max-w-md mx-auto">
                      <button type="button" onClick={continueFiled} data-testid="ra-continue-filed" className="btn-outline w-full px-4 py-3 rounded-xl text-gray-200 text-sm font-semibold inline-flex items-center justify-center gap-2 min-h-[44px]">
                        <Icon name="file-up" className="w-4 h-4" /> {tr('services.ra.locked.continue', { context: continuableHeld ? 'held' : undefined })}
                      </button>
                      <p className="text-gray-500 text-[11px] mt-2">{continuableHeld ? tr('services.ra.locked.continueHint_held') : continuable.details._state.ownerMode === 'invite' || continuable.details._state.tenantMode === 'invite'
                        ? tr('services.ra.locked.topUpHint', { context: continuable.details._state.ownerMode === 'invite' ? 'owner' : undefined })
                        : tr('services.ra.locked.continueHint')}</p>
                    </div>
                  )}
                  <button type="button" onClick={startNewAgreement} className="btn-outline mt-6 px-6 py-3 rounded-xl text-gray-200 text-sm font-semibold inline-flex items-center gap-2 min-h-[44px]">
                    <Icon name="plus" className="w-4 h-4" /> {tr('services.ra.locked.startNew')}
                  </button>
                  <p className="text-gray-600 text-[11px] mt-2">{tr('services.ra.locked.startNewHint')}</p>
                </div>
              ) : (
                <>
                  {!viewOnly && <MobileCostSummary cost={cost} />}
                  {viewOnly && (
                    <div role="status" className="mb-6 p-3.5 rounded-xl bg-white/5 border border-white/10" data-testid="ra-view-note">
                      <div className="flex items-start gap-2.5">
                        <Icon name="eye" className="w-4 h-4 text-teal-300 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-white font-semibold text-xs">{tr('services.ra.summary.viewTitle', summaryCtx)}</p>
                          <p className="text-gray-400 text-[11px] mt-0.5 leading-relaxed" data-testid={canEditFiled ? undefined : 'ra-view-locked'}>{tr(canEditFiled ? 'services.ra.summary.editableDesc' : 'services.ra.summary.lockedDesc', summaryCtx)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        {canEditFiled && (
                          <button type="button" onClick={editSubmitted} data-testid="ra-view-edit" className="btn-teal h-btn flex-1 inline-flex items-center justify-center gap-2 px-4 rounded-xl text-white text-sm font-semibold">
                            <Icon name="pencil" className="w-4 h-4" /> {tr('services.ra.summary.edit', summaryCtx)}
                          </button>
                        )}
                        <button type="button" onClick={closeFiled} data-testid="ra-view-close" className="btn-outline h-btn flex-1 inline-flex items-center justify-center gap-2 px-4 rounded-xl text-gray-200 text-sm font-semibold">
                          <Icon name="x" className="w-4 h-4" /> {tr('services.ra.summary.close')}
                        </button>
                      </div>
                    </div>
                  )}
                  {gated && (
                    <div role="status" className="mb-6 p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-start gap-2.5">
                      <Icon name="lock" className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-white font-semibold text-xs">{tr('services.ra.gate.title')}</p>
                        <p className="text-gray-400 text-[11px] mt-0.5 leading-relaxed">{tr('services.ra.gate.desc')}</p>
                      </div>
                    </div>
                  )}

                  {editingSubmitted && (
                    <div role="status" className="mb-6 p-3.5 rounded-xl bg-teal-500/8 border border-teal-500/20 flex items-start justify-between gap-3" data-testid="ra-editing-note">
                      <div className="flex items-start gap-2.5">
                        <Icon name="pencil" className="w-4 h-4 text-teal-300 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-white font-semibold text-xs">{tr('services.ra.summary.editingTitle', { context: holdingUnpaid ? 'held' : undefined })}</p>
                          <p className="text-gray-400 text-[11px] mt-0.5 leading-relaxed">{tr('services.ra.summary.editingDesc', { context: holdingUnpaid ? 'held' : mode === 'invite' ? 'invitee' : undefined })}</p>
                        </div>
                      </div>
                      <button type="button" onClick={discardEdits} className="text-gray-400 hover:text-white text-[11px] font-semibold whitespace-nowrap underline underline-offset-2">{tr('services.ra.summary.discard')}</button>
                    </div>
                  )}

                  {restored && mode === 'owner' && !editingSubmitted && !viewOnly && (
                    <div className="mb-6 p-3.5 rounded-xl bg-teal-500/8 border border-teal-500/20 flex items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <Icon name="rotate-ccw" className="w-4 h-4 text-teal-300 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-white font-semibold text-xs">{tr('services.ra.draft.restoredTitle')}</p>
                          <p className="text-gray-400 text-[11px] mt-0.5">{tr('services.ra.draft.restoredDesc')}</p>
                        </div>
                      </div>
                      <button type="button" onClick={startFresh} className="text-gray-400 hover:text-white text-[11px] font-semibold whitespace-nowrap underline underline-offset-2">{tr('services.ra.draft.startFresh')}</button>
                    </div>
                  )}

                  {myInvites.length > 0 && mode === 'owner' && !viewOnly && (
                    <div className="mb-6 p-4 rounded-xl bg-emerald-500/8 border border-emerald-500/25">
                      <p className="text-white font-semibold text-sm flex items-center gap-2"><Icon name="user-plus" className="w-4 h-4 text-emerald-400" /> {tr('services.ra.pendingInvite.title', { count: myInvites.length })}</p>
                      <p className="text-gray-400 text-xs mt-1">{tr('services.ra.pendingInvite.desc')}</p>
                      <div className="mt-3 space-y-2">
                        {myInvites.map((inv) => (
                          <a key={inv.inviteId} href={inv.href || invitePath(inv.inviteId)} className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-white/4 border border-white/8 hover:border-emerald-400/30">
                            <span className="text-gray-200 text-xs">{tr('services.ra.pendingInvite.from', { name: inv.fromName || 'A Draazy user' })}{inv.property ? ' · ' + inv.property : ''}</span>
                            <span className="text-emerald-300 text-xs font-semibold flex items-center gap-1 whitespace-nowrap">{tr('services.ra.pendingInvite.cta')} <Icon name="arrow-right" className="w-3.5 h-3.5" /></span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {mode === 'invite' && !viewOnly && (
                    <div className={`mb-6 p-3.5 rounded-xl flex items-start justify-between gap-3 ${step === ownStep ? 'bg-teal-500/8 border border-teal-500/20' : 'bg-white/5 border border-white/10'}`}>
                      {step === ownStep ? (
                        <div className="flex items-start gap-2.5">
                          <Icon name="pencil" className="w-4 h-4 text-teal-300 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-white font-semibold text-xs">{tr('services.ra.invite.editableTitle')}</p>
                            <p className="text-gray-400 text-[11px] mt-0.5">{tr('services.ra.invite.editableDesc', invitedSide)}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2.5">
                          <Icon name="lock" className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-white font-semibold text-xs">{tr('services.ra.invite.readonlyTitle', invitedSide)}</p>
                            <p className="text-gray-400 text-[11px] mt-0.5">{tr('services.ra.invite.readonlyDesc', invitedSide)}</p>
                          </div>
                        </div>
                      )}
                      {!editingSubmitted && (
                        <button type="button" onClick={closeFiled} data-testid="ra-invite-close" className="text-gray-400 hover:text-white text-[11px] font-semibold whitespace-nowrap underline underline-offset-2">{tr('services.ra.summary.close')}</button>
                      )}
                    </div>
                  )}

                  {coFilledRole && !viewOnly && step === (coFilledRole === 'owner' ? 1 : 2) && (
                    <div className="mb-6 p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-start gap-2.5" data-testid="ra-cofilled-note">
                      <Icon name="lock" className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-white font-semibold text-xs">{tr('services.ra.locked.coFilledTitle', { context: coFilledRole === 'owner' ? 'owner' : undefined })}</p>
                        <p className="text-gray-400 text-[11px] mt-0.5">{tr('services.ra.locked.coFilledDesc')}</p>
                      </div>
                    </div>
                  )}

                  <fieldset disabled={sharedReadOnly} className="contents">
                    <StepProperty step={step} prop={prop} setP={setP} setProp={setProp} setSelectedPropertyId={setSelectedPropertyId} pickListing={pickListing} myProperties={myProperties} readOnly={sharedReadOnly} errors={errors} fc={fc} clearErr={clearErr} onLocalityBusy={setLocalityBusy} />
                  </fieldset>

                  <fieldset disabled={ownerReadOnly} className="contents">
                    <StepOwner step={step} canInvite={mode === 'owner' && !coFilledRole && !editingSubmitted && !viewOnly} ownerMode={shownOwnerMode} chooseOwnerMode={chooseOwnerMode} invite={invite} setInvite={setInvite} owner={owner} setO={setO} coOwners={coOwners} setCoOwner={setCoOwner} addCoOwner={addCoOwner} removeCoOwner={removeCoOwner} errors={errors} fc={fc} clearErr={clearErr} ownerDocs={ownerDocs} setOwnerDocs={setOwnerDocs} vaultEnabled={vaultEnabled} onDocSaved={saveOwnerDocToVault} identityReminders={identityReminders.owner} masked={maskedIds} held={!ownerReadOnly} />
                  </fieldset>

                  <fieldset disabled={tenantReadOnly} className="contents">
                  <StepTenant step={step} canInvite={mode === 'owner' && ownerMode !== 'invite' && !coFilledRole && !editingSubmitted && !viewOnly} tenantMode={shownTenantMode} setTenantMode={setTenantMode} tenants={tenants} setTenant={setTenant} removeTenant={removeTenant} addTenant={addTenant} errors={errors} clearErr={clearErr} tenantDocs={tenantDocs} setTenantDocs={setTenantDocs} invite={invite} setInvite={setInvite} identityReminders={identityReminders.tenant} masked={maskedIds} held={!tenantReadOnly} />
                  </fieldset>

                  <fieldset disabled={sharedReadOnly} className="contents">
                    <StepTerms step={step} terms={terms} setT={setT} startBounds={startBounds} errors={errors} fc={fc} clearErr={clearErr} maint={maint} setMaint={setMaint} furnItems={furnItems} toggleFurn={toggleFurn} isChecked={isChecked} bumpQty={bumpQty} removeFurn={removeFurn} custom={custom} setCustom={setCustom} addCustom={addCustom} clauses={clauses} setClauses={setClauses} />
                  </fieldset>

                  <StepReview step={step} readOnly={viewOnly} prop={prop} owner={owner} coOwners={coOwners} ownerMode={shownOwnerMode} tenantMode={shownTenantMode} invite={invite} tenants={tenants} terms={terms} cost={cost} maint={maint} furnitureText={furnitureText} regArea={regArea} declare={declare} setDeclare={setDeclare} generate={generate} submitting={submitting} retrying={!!pendingRequestId} saving={editingSubmitted && !holdingUnpaid} paysNow={mode === 'owner' && !invitingOwner && (!editingSubmitted || holdingUnpaid)} identityReminders={identityReminders.review} />

                  <div className="flex justify-between items-center gap-3 mt-8">
                    {step !== 0 ? <button type="button" onClick={prev} className="btn-outline px-6 py-3 rounded-xl text-gray-300 text-sm font-semibold flex items-center gap-2"><Icon name="arrow-left" className="w-4 h-4" /> {tr('services.ra.back')}</button> : <div />}
                    {step !== REVIEW_STEP ? <button type="button" onClick={next} disabled={localityBusy} className="btn-teal px-7 py-3 rounded-xl text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-70">{gated ? <><Icon name="lock" className="w-4 h-4" /> {tr('services.ra.gate.nextCta')}</> : <>{tr('services.ra.next')} <Icon name="arrow-right" className="w-4 h-4" /></>}</button> : <div />}
                  </div>
                </>
              )}
              </>
              )}
            </div>
            {!compact && (
            <div className="hidden lg:block">
              <CostSidebar cost={cost} />
            </div>
            )}
          </div>
        </section>

        <DocsRequired />

        <InfoSections openFaq={openFaq} setOpenFaq={setOpenFaq} />
      </div>
    </div>
  );
}
