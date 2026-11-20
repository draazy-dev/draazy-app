import { classNames } from '../../../lib/format.js';
import { CHIP, CHIP_TONE } from '../../../components/admin/WorkQueue.jsx';
import {
  CONSENT_LABEL, INTENT_LABEL, LEAD_SOURCE_LABEL, LEAD_TYPE_LABEL, SERVICE_LABEL, SOURCE_LABEL, STAGE_BY_VALUE,
} from './leadsFormat.js';

export function TypeChip({ profile }) {
  if (!profile.leadType) return null;
  const text = [LEAD_TYPE_LABEL[profile.leadType], INTENT_LABEL[profile.intent]].filter(Boolean).join(' · ');
  return <span data-testid="lead-type" className={classNames(CHIP, CHIP_TONE.violet)}>{text}</span>;
}

export function LeadSourceChip({ profile }) {
  if (!profile.leadSource) return null;
  return <span data-testid="lead-source" className={classNames(CHIP, CHIP_TONE.neutral)}>via {LEAD_SOURCE_LABEL[profile.leadSource] || profile.leadSource}</span>;
}

export function StageChip({ stage }) {
  const s = STAGE_BY_VALUE[stage];
  return <span data-testid="lead-stage" className={classNames(CHIP, s?.tone || CHIP_TONE.neutral)}>{s?.label || stage}</span>;
}

export function InterestChips({ interests }) {
  return interests.map((v) => (
    <span key={v} className={classNames(CHIP, CHIP_TONE.teal)}>{SERVICE_LABEL[v] || v}</span>
  ));
}

export function SourceChips({ sources }) {
  return sources.map((v) => (
    <span key={v} className={classNames(CHIP, CHIP_TONE.neutral)}>{SOURCE_LABEL[v] || v}</span>
  ));
}

export function ConsentChip({ consent }) {
  const optedIn = consent === 'opted-in';
  return (
    <span data-testid="lead-consent" className={classNames(CHIP, optedIn ? CHIP_TONE.green : CHIP_TONE.amber)}>
      {CONSENT_LABEL[consent] || consent}
    </span>
  );
}

export function OwnerChip({ lead }) {
  if (lead.mine) return <span data-testid="lead-owner" className={classNames(CHIP, CHIP_TONE.green)}>Yours</span>;
  if (lead.ownerId) return <span data-testid="lead-owner" className={classNames(CHIP, CHIP_TONE.violet)}>Owned by {lead.ownerName || 'another staff member'}</span>;
  return <span data-testid="lead-owner" className={classNames(CHIP, CHIP_TONE.sky)}>In pool</span>;
}

export function PickChips({ label, options, value, onChange, disabled }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            className={classNames(
              'min-h-[44px] cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              on ? 'border-brand-teal bg-brand-teal/20 text-teal-100' : 'border-white/10 bg-white/5 text-gray-300',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block text-sm text-gray-300">
      <span className="mb-1.5 block font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-gray-400">{hint}</span> : null}
    </label>
  );
}

export function Section({ title, children, testId }) {
  return (
    <section className="mt-5 border-t border-white/10 pt-4" data-testid={testId}>
      <h3 className="mb-2.5 text-sm font-bold text-white">{title}</h3>
      {children}
    </section>
  );
}
