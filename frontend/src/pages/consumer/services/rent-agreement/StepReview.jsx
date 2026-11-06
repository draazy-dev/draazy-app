import { useTranslation } from 'react-i18next';
import Icon from '../../../../components/Icon.jsx';
import ReviewRow from './ReviewRow.jsx';
import { fmt, fmtPaise, digits, num } from './helpers.js';
import { isForeignParty, isOfflineParty } from './validation.js';
import IdentityReminderNote from './IdentityReminderNote.jsx';
import { REVIEW_STEP } from './constants.js';

export default function StepReview({ step, readOnly, prop, owner, coOwners = [], retrying, saving, paysNow, ownerMode, tenantMode, invite, tenants, terms, cost, maint, furnitureText, regArea, declare, setDeclare, generate, submitting, identityReminders }) {
  const { t: tr } = useTranslation();
  const maintLabel = { Tenant: tr('services.ra.terms.maintOpt.Tenant'), Owner: tr('services.ra.terms.maintOpt.Owner') };
  const addrLine = (a) => [a?.address, a?.village, a?.pincode].filter(Boolean).join(', ');
  const partyIdentity = (dob, row) => [
    dob && `${tr('services.ra.party.dob')}: ${dob}`,
    row?.gender && tr(`services.ra.party.genderOpt.${row.gender}`),
    row?.mother && `${tr('services.ra.party.mother')}: ${row.mother}`,
    addrLine(row?.addr),
  ].filter(Boolean).join(' · ') || '—';
  const offlineParties = [
    ...(ownerMode === 'invite' ? [] : [owner, ...coOwners]),
    ...(tenantMode === 'invite' ? [] : tenants),
  ];
  const offlineRoute = offlineParties.some(isOfflineParty);
  const foreignTenant = tenantMode !== 'invite' && tenants.some(isForeignParty);
  const areaText = (area, unit = 'sqft') => num(area) > 0 ? `${area} ${tr(`services.ra.property.areaUnitOpt.${unit || 'sqft'}`)}` : '';
  const policeAddress = (row, same, fallback) => (same ? fallback : [row?.address, row?.pincode, row?.village, row?.policeStation].filter(Boolean).join(', '));
  const policeLine = (t) => {
    const p = t.police || {};
    const proof = p.addressProofType ? tr(`services.ra.tenant.police.addressProofOpt.${p.addressProofType}`) : '';
    const previousProof = !p.previousSameAsPermanent && p.previousAddressProofType ? tr(`services.ra.tenant.police.addressProofOpt.${p.previousAddressProofType}`) : '';
    return [t.name, proof, policeAddress(p.permanent, p.permanentSameAsCurrent, tr('services.ra.tenant.address')), previousProof, p.workplaceAddress, (p.occupants || []).map((o) => o.fullName).filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  };
  return (
    <div className={'step-panel' + (step === REVIEW_STEP ? ' active' : '')}>
      <h2 className="text-xl font-bold text-white mb-1">{tr('services.ra.review.title')}</h2>
      <p className="text-gray-500 text-sm mb-6">{tr('services.ra.review.subtitle')}</p>
      <IdentityReminderNote fields={identityReminders} />
      <div className="space-y-3">
        <ReviewRow k={tr('services.ra.review.rowAgreement')} v={tr('services.ra.review.residential') + ' · ' + prop.propType} />
        <ReviewRow k={tr('services.ra.review.rowProperty')} v={[prop.flatNo, prop.society, prop.locality, prop.city].filter(Boolean).join(', ')} />
        <ReviewRow k={tr('services.ra.review.rowJurisdiction')} v={prop.taluka || '—'} />
        <ReviewRow k={tr('services.ra.review.rowPropertyAddress')} v={[prop.landmark, prop.policeStation, prop.roadVicinity, prop.roadType].filter(Boolean).join(' · ') || '—'} />
        {num(prop.area) > 0 && <ReviewRow k={tr('services.ra.property.area')} v={areaText(prop.area, prop.areaUnit)} />}
        <ReviewRow k={tr('services.ra.review.rowOwner')} v={ownerMode === 'invite' ? tr('services.ra.review.invitedPending', { name: invite.invName || '••••••' + digits(invite.invMobile).slice(-4) }) : owner.oName + ' · ' + tr(`services.ra.owner.capacityOpt.${owner.capacity || 'owner'}`)} />
        {ownerMode !== 'invite' && coOwners.length > 0 && <ReviewRow k={tr('services.ra.review.rowCoOwners')} v={coOwners.map((c) => c.name.trim()).filter(Boolean).join(', ')} />}
        <ReviewRow k={tr('services.ra.review.rowTenants')} v={tenantMode === 'invite' ? tr('services.ra.review.invitedPending', { name: invite.invName || '••••••' + digits(invite.invMobile).slice(-4) }) : tenants.map((t) => t.name.trim()).filter(Boolean).join(', ')} />
        {tenantMode !== 'invite' && <ReviewRow k={tr('services.ra.review.rowTenantPolice')} v={tenants.map(policeLine).filter(Boolean).join(' | ')} />}
        <ReviewRow k={tr('services.ra.review.rowTerm')} v={tr('services.ra.review.termValue', { count: num(terms.months), date: terms.startDate || '—' })} />
        <ReviewRow k={tr('services.ra.review.rowMonthlyRent')} v={fmt(cost.rent)} />
        {num(terms.months) > (num(terms.incrementEvery) || 11) && Number(terms.increment) > 0 && <ReviewRow k={tr('services.ra.review.rowIncrement')} v={tr('services.ra.review.incrementValue', { pct: terms.increment, months: num(terms.incrementEvery) || 11 })} />}
        {num(terms.months) <= 11 && Number(terms.increment) > 0 && <ReviewRow k={tr('services.ra.terms.incrementRenewal')} v={`${terms.increment}%`} />}
        <ReviewRow k={tr('services.ra.review.rowDeposit')} v={[fmt(num(terms.deposit)), ...(terms.depositPayments || []).map((p) => `${tr(`services.ra.terms.depositPay.modeOpt.${p.mode}`)} ${fmt(num(p.amount))}`)].join(' · ')} />
        <ReviewRow k={tr('services.ra.review.rowMaintenance')} v={maintLabel[maint] || maint} />
        {terms.costBy && <ReviewRow k={tr('services.ra.terms.costBy')} v={tr(`services.ra.terms.payerOpt.${terms.costBy}`)} />}
        {terms.parking && terms.parking !== 'none' && <ReviewRow k={tr('services.ra.terms.parking')} v={[tr(`services.ra.terms.parkingOpt.${terms.parking}`), areaText(terms.parkingArea, terms.parkingAreaUnit)].filter(Boolean).join(' · ')} />}
        <ReviewRow k={tr('services.ra.review.rowFurniture')} v={furnitureText()} />
        <ReviewRow k={tr('services.ra.review.rowRegistration')} v={offlineRoute ? tr('services.ra.review.sroRoute') : (regArea === 'rural' ? tr('services.ra.terms.regRural') : tr('services.ra.terms.regUrban'))} />
        {ownerMode !== 'invite' && <ReviewRow k={tr('services.ra.review.rowOwnerIdentity')} v={partyIdentity(owner.oDob, owner)} />}
        {ownerMode !== 'invite' && coOwners.length > 0 && <ReviewRow k={tr('services.ra.review.rowCoOwnerIdentity')} v={coOwners.map((c) => partyIdentity(c.dob, c)).join('\n')} />}
        {tenantMode !== 'invite' && <ReviewRow k={tr('services.ra.review.rowTenantIdentity')} v={tenants.map((t) => partyIdentity(t.dob, t)).join('\n')} />}
        <ReviewRow k={tr('services.ra.review.rowLanguage')} v={tr(`services.ra.terms.languageOpt.${terms.language || 'English'}`)} />
        <ReviewRow k={tr('services.ra.review.rowVisit')} v={[tr(`services.ra.terms.visitAtOpt.${terms.visitAt || 'property'}`), terms.visitDate || tr('services.ra.review.visitAnyDate'), tr(`services.ra.terms.visitSlotOpt.${terms.visitSlot || 'any'}`)].join(' · ')} />
      </div>
      {offlineRoute && <div className="mt-5 rounded-xl border border-sky-400/20 bg-sky-500/10 p-3 text-xs text-sky-100 leading-relaxed">{tr('services.ra.review.offlineNotice')}</div>}
      {foreignTenant && <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-xs text-amber-100 leading-relaxed">{tr('services.ra.formC.notice')}</div>}
      {!readOnly && (
      <>
      <label className="flex items-start gap-2.5 mt-5 cursor-pointer">
        <input type="checkbox" checked={declare} onChange={(e) => setDeclare(e.target.checked)} className="accent-teal-500 w-4 h-4 mt-0.5 flex-shrink-0" />
        <span className="text-sm text-gray-300 leading-relaxed">{tr('services.ra.review.declaration')}</span>
      </label>
      <button type="button" onClick={generate} disabled={submitting} aria-busy={submitting} className="btn-teal w-full mt-5 py-3.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"><Icon name={submitting ? 'circle-notch' : saving ? 'check' : paysNow ? 'credit-card' : 'file-check-2'} className={'w-4 h-4' + (submitting ? ' animate-spin' : '')} /> {submitting ? tr(saving ? 'services.ra.review.saving' : paysNow ? 'services.ra.review.generating' : 'services.ra.review.submitting') : saving ? tr('services.ra.review.saveChanges') : retrying ? tr('services.ra.review.retry') : paysNow ? tr('services.ra.review.payAndSubmit', { amount: fmtPaise(cost.total) }) : tr('services.ra.review.generate')}</button>
      {paysNow && <p className="text-center text-[11px] text-gray-500 mt-2">{tr('services.ra.review.payNote')}</p>}
      </>
      )}
    </div>
  );
}
