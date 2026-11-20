import { useState } from 'react';
import { BTN } from '../../../components/admin/WorkQueue.jsx';
import { classNames, fmtINR } from '../../../lib/format.js';
import {
  InterestChips, LeadSourceChip, PickChips, Section, TypeChip,
} from './LeadParts.jsx';
import {
  ACTIVITY_LABEL, OUTCOME_LABEL, SERVICES, SERVICE_LABEL, SOURCE_LABEL, profileLine, toggle, when,
} from './leadsFormat.js';

export function ProfileSection({ lead, editable, onEdit }) {
  const { profile } = lead;
  const line = profileLine(profile);
  return (
    <Section title="Profile" testId="lead-profile">
      {profile.leadType || profile.leadSource ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            <TypeChip profile={profile} />
            <LeadSourceChip profile={profile} />
          </div>
          {line ? <p className="mt-2 text-sm text-gray-300" data-testid="lead-profile-line">{line}</p> : null}
          {profile.sourceDetail ? <p className="mt-1 text-xs text-gray-400">{profile.sourceDetail}</p> : null}
        </>
      ) : <p className="text-sm text-gray-400">Not filled in yet.</p>}
      {editable ? (
        <button type="button" onClick={onEdit} className={classNames(BTN.ghost, 'mt-3 min-h-[44px]')} data-testid="lead-profile-edit">
          Edit profile
        </button>
      ) : null}
    </Section>
  );
}

export function InterestsSection({ lead, editable, busy, onSave }) {
  const [draft, setDraft] = useState(null);
  const current = draft ?? lead.interests;
  const dirty = draft !== null && [...draft].sort().join() !== [...lead.interests].sort().join();

  if (!editable) {
    return (
      <Section title="Interested in" testId="lead-interests">
        {lead.interests.length
          ? <div className="flex flex-wrap gap-1.5"><InterestChips interests={lead.interests} /></div>
          : <p className="text-sm text-gray-400">None picked yet.</p>}
      </Section>
    );
  }

  const save = async () => {
    if (await onSave(draft)) setDraft(null);
  };

  return (
    <Section title="Interested in" testId="lead-interests">
      <PickChips label="Interested in" options={SERVICES} value={current} disabled={busy} onChange={(v) => setDraft(toggle(current, v))} />
      {dirty ? (
        <button type="button" disabled={busy} onClick={save} className={classNames(BTN.primary, 'mt-3 min-h-[44px]', busy && 'opacity-50')} data-testid="lead-interests-save">
          Save interests
        </button>
      ) : null}
    </Section>
  );
}

export function SignalsSection({ signals }) {
  if (!signals.length) return null;
  return (
    <Section title="Why they’re a lead" testId="lead-signals">
      <ul className="space-y-2">
        {signals.map((s, i) => (
          <li key={`${s.source}-${s.createdAt}-${i}`} className="text-sm text-gray-300">
            <span className="font-medium text-white">{SOURCE_LABEL[s.source] || s.source}</span>
            {s.service ? <span className="text-gray-400"> · {SERVICE_LABEL[s.service] || s.service}</span> : null}
            {s.summary ? <span className="block text-xs text-gray-400">{s.summary}</span> : null}
            <span className="block text-xs text-gray-500">{when(s.createdAt)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function ConversionsSection({ conversions, canCredit, onCredit }) {
  if (!conversions.length) return null;
  return (
    <Section title="Conversions" testId="lead-conversions">
      <ul className="space-y-2">
        {conversions.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 text-sm text-gray-300" data-testid="lead-conversion">
            <span>
              <span className="font-medium text-white">{SERVICE_LABEL[c.service] || c.service}</span>
              <span className="block text-xs text-gray-400">Credited to {c.creditedToName || '—'} · {when(c.createdAt)}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="font-semibold tabular-nums text-emerald-200">{fmtINR(c.amount)}</span>
              {canCredit ? (
                <button type="button" onClick={() => onCredit(c)} className={classNames(BTN.ghost, 'min-h-[44px]')} data-testid="lead-credit">Change credit</button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function Timeline({ activities }) {
  return (
    <Section title="Timeline" testId="lead-timeline">
      {activities.length ? (
        <ol className="space-y-3 border-l border-white/10 pl-4">
          {activities.map((a) => (
            <li key={a.id} className="text-sm text-gray-300" data-testid="lead-activity">
              <p>
                <span className="font-medium text-white">{ACTIVITY_LABEL[a.kind] || a.kind}</span>
                {a.outcome ? <span className="text-gray-300"> · {OUTCOME_LABEL[a.outcome] || a.outcome}</span> : null}
              </p>
              {a.body ? <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-300">{a.body}</p> : null}
              <p className="mt-0.5 text-xs text-gray-500">{a.actorName || 'System'} · {when(a.createdAt)}</p>
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-gray-400">Nothing logged yet.</p>}
    </Section>
  );
}
