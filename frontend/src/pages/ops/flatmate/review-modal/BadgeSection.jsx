import { useState } from 'react';
import { BadgeCheck, Check, FileText, Flag, IdCard, KeyRound, ShieldCheck, ShieldOff, X } from 'lucide-react';
import Badge from '../../../../components/ui/Badge.jsx';
import { useToast } from '../../../../context/ToastContext.jsx';
import { openDocFrom, openDocUrl } from '../../../../lib/openDoc.js';
import { getFlatmateReviewDocumentUrl } from '../../../../services/flatmateService.js';
import { Block, claimLabel, fmtDate } from '../board.jsx';

const chip = 'dz-tag border font-semibold';
const OK = `${chip} border-emerald-400/30 bg-emerald-500/10 text-emerald-300`;
const WARN = `${chip} border-amber-400/30 bg-amber-500/10 text-amber-300`;
const NEUTRAL = `${chip} border-white/10 bg-white/5 text-gray-300`;
const LINK = `${chip} border-brand-teal/30 bg-brand-teal/10 text-brand-teal`;

const BILL = 'electricity_bill';
const BILL_MAX_AGE_DAYS = 90;
const isoDay = (d) => d.toLocaleDateString('en-CA');
const daysAgo = (n) => isoDay(new Date(Date.now() - n * 86_400_000));

function EvidenceChip({ review: r }) {
  const { toast } = useToast();
  const bill = r.evidenceType === BILL;
  const label = bill ? 'Light bill' : 'Agreement';
  const view = bill ? 'View light bill' : 'View agreement';
  if (r.agreementViewable) {
    return (
      <button type="button" onClick={() => openDocUrl(r.agreementDoc.dataUrl)} className={`view-agreement-btn ${LINK}`}>
        <FileText className="h-3 w-3" />{view}
      </button>
    );
  }
  if (r.vaultDocId) {
    const open = async () => {
      if (!(await openDocFrom(() => getFlatmateReviewDocumentUrl(r.id)))) toast('Could not open the document.', 'error');
    };
    return (
      <button type="button" onClick={open} data-testid="view-review-document" className={`view-agreement-btn ${LINK}`}>
        <FileText className="h-3 w-3" />{view}
      </button>
    );
  }
  if (r.agreementDoc) {
    return <span className={NEUTRAL}><FileText className="h-3 w-3" />{r.agreementTooLarge ? 'Too large to preview' : `${label} on file`}</span>;
  }
  return r.tier === 'tenant' ? <span className={WARN}><X className="h-3 w-3" />No document</span> : null;
}

function Tick({ checked, onChange, label, hint, testId }) {
  return (
    <label className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-gray-100">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} className="mt-0.5 h-4 w-4 accent-teal-400" />
      <span>{label}<span className="block text-xs text-gray-400">{hint}</span></span>
    </label>
  );
}

/* The server re-checks every one of these; the form exists so the reviewer cannot skip a step by accident. */
function TenantChecklist({ review: r, busy, onApprove }) {
  const bill = r.evidenceType === BILL;
  const today = isoDay(new Date());
  const [nameMatches, setNameMatches] = useState(false);
  const [addressMatches, setAddressMatches] = useState(false);
  const [date, setDate] = useState(bill ? '' : (r.agreementDoc?.validTill || ''));
  const stated = !bill && r.agreementDoc?.validFrom && r.agreementDoc?.validTill
    ? [r.agreementDoc.validFrom, r.agreementDoc.validTill].map((d) => d.split('-').reverse().join('/')).join(' – ')
    : null;
  const dateOk = bill ? date >= daysAgo(BILL_MAX_AGE_DAYS) && date <= today : date > today;
  const blocker = !r.hostVerified ? 'Host has not verified their ID yet.'
    : !r.ownerConsent ? 'Waiting for the owner to consent.'
      : null;
  const ready = !blocker && nameMatches && addressMatches && !!date && dateOk;
  const checks = { nameMatches, addressMatches, ...(bill ? { issuedOn: date } : { validTill: date }) };

  return (
    <div className="mt-3 space-y-2" data-testid="badge-checklist">
      <Tick testId="check-name" checked={nameMatches} onChange={setNameMatches}
        label={bill ? 'Bill is in the owner’s name' : `Agreement names ${r.host || 'the host'}`}
        hint={bill ? 'The name on the bill matches the owner who gave consent.' : 'Same name as on their verified ID.'} />
      <Tick testId="check-address" checked={addressMatches} onChange={setAddressMatches}
        label="Address matches this flat" hint={r.address || 'Compare with the address above.'} />
      <label className="block text-sm text-gray-300">
        {bill ? 'Bill date' : 'Agreement end date'}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="check-date"
          min={bill ? daysAgo(BILL_MAX_AGE_DAYS) : undefined} max={bill ? today : undefined}
          className="dz-input mt-1 w-full sm:w-56" />
        {stated ? <span className="mt-1 block text-xs text-gray-400" data-testid="host-period">Host says: {stated}. Check it against the document.</span> : null}
        {date && !dateOk ? (
          <span className="mt-1 block text-xs text-rose-300">{bill ? `Bill must be from the last ${BILL_MAX_AGE_DAYS} days.` : 'Agreement has already ended.'}</span>
        ) : null}
      </label>
      {blocker ? <p className="text-xs text-amber-300" data-testid="approve-blocker">{blocker}</p> : null}
      <button type="button" disabled={busy || !ready} onClick={() => onApprove(checks)} className="approve-review-btn dz-btn dz-btn-success">
        <BadgeCheck className="h-4 w-4" />Approve Verified property
      </button>
    </div>
  );
}

function ReasonForm({ label, confirm, busy, onSubmit, onCancel }) {
  const [reason, setReason] = useState('');
  return (
    <div className="mt-3 space-y-2">
      <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={label} aria-label={label} className="dz-input w-full" />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !reason.trim()} onClick={() => onSubmit(reason.trim())} className="dz-btn dz-btn-danger">{confirm}</button>
        <button type="button" onClick={onCancel} className="dz-btn dz-btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

const yesNo = (v) => (v == null ? '—' : v ? 'Yes' : 'No');

/* The badge axis: approving grants the badge, rejecting or revoking withholds it and nothing else. */
export default function BadgeSection({ review: r, busy, onDecide, onRevoke }) {
  const [mode, setMode] = useState(null);
  const pending = r.status === 'pending';
  const approved = r.status === 'approved';
  const tenant = r.tier === 'tenant';

  return (
    <Block icon={ShieldCheck} title="Verified property badge" aside={<Badge status={r.status} />} className="flatmate-badge-section">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${chip} border-brand-teal/30 bg-brand-teal/10 text-brand-teal`}>
          <KeyRound className="h-3 w-3" />{claimLabel(r.tier)}
        </span>
        <EvidenceChip review={r} />
        {r.hostVerified ? (
          <span className={OK} data-testid="host-id-verified"><IdCard className="h-3 w-3" />ID verified</span>
        ) : tenant ? (
          <span className={WARN} data-testid="host-id-missing"><IdCard className="h-3 w-3" />ID not verified</span>
        ) : null}
        {r.ownerConsent ? (
          <span className={OK}><Check className="h-3 w-3" />Owner consent</span>
        ) : tenant ? (
          <span className={WARN} data-testid="consent-missing"><X className="h-3 w-3" />Owner consent missing</span>
        ) : null}
        {r.flagForReview ? <span className={WARN}><Flag className="h-3 w-3" />Contested address</span> : null}
      </div>

      <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
        <dt className="text-gray-400">Address</dt>
        <dd className="break-words text-gray-100">{r.address || '—'}</dd>
        <dt className="text-gray-400">Claimed by</dt>
        <dd className="text-gray-100">{r.host || '—'} <span className="text-gray-400">{r.hostMobile || ''}</span> · {fmtDate(r.createdAt)}</dd>
        {!pending && tenant ? (
          <>
            <dt className="text-gray-400">Checks</dt>
            <dd className="text-gray-100">Name {yesNo(r.nameMatches)} · Address {yesNo(r.addressMatches)}</dd>
            {r.evidenceIssuedOn ? (<><dt className="text-gray-400">Bill date</dt><dd className="text-gray-100">{r.evidenceIssuedOn}</dd></>) : null}
            {approved && r.agreementValidTill ? (<><dt className="text-gray-400">Verified until</dt><dd className="text-gray-100">{r.agreementValidTill}</dd></>) : null}
          </>
        ) : null}
        {r.status === 'rejected' && r.reason ? (
          <>
            <dt className="text-gray-400">Rejected because</dt>
            <dd className="text-rose-300">{r.reason}</dd>
          </>
        ) : null}
      </dl>

      {pending && mode !== 'reject' && tenant ? (
        <TenantChecklist review={r} busy={busy} onApprove={(checks) => onDecide('approved', '', checks)} />
      ) : null}
      {pending && mode !== 'reject' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {!tenant ? (
            <button type="button" disabled={busy} onClick={() => onDecide('approved')} className="approve-review-btn dz-btn dz-btn-success">
              <BadgeCheck className="h-4 w-4" />Approve Verified property
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={() => setMode('reject')} className="reject-review-btn dz-btn dz-btn-ghost">
            <X className="h-4 w-4" />Reject Verified property
          </button>
        </div>
      ) : null}
      {pending && mode === 'reject' ? (
        <ReasonForm label="Reason for rejection" confirm="Confirm rejection" busy={busy} onSubmit={(why) => onDecide('rejected', why)} onCancel={() => setMode(null)} />
      ) : null}

      {approved && mode !== 'revoke' ? (
        <div className="mt-3">
          <button type="button" disabled={busy} onClick={() => setMode('revoke')} className="revoke-review-btn dz-btn dz-btn-ghost">
            <ShieldOff className="h-4 w-4" />Revoke Verified property
          </button>
        </div>
      ) : null}
      {approved && mode === 'revoke' ? (
        <ReasonForm label="Reason for revoking" confirm="Confirm revoke" busy={busy} onSubmit={onRevoke} onCancel={() => setMode(null)} />
      ) : null}

      <p className="mt-3 text-xs text-gray-500">Only the Verified property badge. Rejecting or revoking it does not take the post down.</p>
    </Block>
  );
}
