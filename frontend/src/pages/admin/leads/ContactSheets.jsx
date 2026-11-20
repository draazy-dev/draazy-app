import { useState } from 'react';
import Modal from '../../../components/ui/Modal.jsx';
import { BTN } from '../../../components/admin/WorkQueue.jsx';
import { classNames } from '../../../lib/format.js';
import { Field, PickChips } from './LeadParts.jsx';
import {
  CHANNELS, NEEDS_FOLLOW_UP, OUTCOMES, OUTCOMES_BY_CHANNEL, STAGE_CHANGES, inDays, isFuture, toIso,
} from './leadsFormat.js';

const PRESETS = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'In a week', days: 7 },
];

function FollowUp({ value, onChange, required }) {
  return (
    <div>
      <Field label={required ? 'Next follow-up (required)' : 'Next follow-up (optional)'}>
        <input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} className="dz-input w-full text-base" data-testid="lead-followup" />
      </Field>
      <div className="mt-2 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.days} type="button" onClick={() => onChange(inDays(p.days))} className="min-h-[44px] cursor-pointer rounded-full border border-white/10 bg-white/5 px-4 text-sm text-gray-300">
            {p.label}
          </button>
        ))}
        {!required && value ? (
          <button type="button" onClick={() => onChange('')} className="min-h-[44px] cursor-pointer rounded-full px-3 text-sm text-gray-400">Clear</button>
        ) : null}
      </div>
    </div>
  );
}

function Submit({ ready, busy, onClick, children, testId }) {
  const off = !ready || busy;
  return (
    <button type="button" disabled={off} onClick={onClick} className={classNames(BTN.primary, 'min-h-[44px]', off && 'opacity-50')} data-testid={testId}>
      {children}
    </button>
  );
}

export function OutcomeSheet({ channel: first, mobile, onClose, onSubmit }) {
  const [channel, setChannel] = useState(first);
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [busy, setBusy] = useState(false);
  const allowed = OUTCOMES.filter((o) => OUTCOMES_BY_CHANNEL[channel].includes(o.value));
  const href = channel === 'call' ? `tel:${mobile}` : `https://wa.me/91${mobile}`;
  const ready = Boolean(outcome) && (!followUp || isFuture(followUp));

  const submit = async () => {
    setBusy(true);
    const ok = await onSubmit({ channel, outcome, note: note.trim() || undefined, nextFollowUpAt: toIso(followUp) });
    if (!ok) setBusy(false);
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="How did it go?"
      footer={<Submit ready={ready} busy={busy} onClick={submit} testId="lead-outcome-submit">Save outcome</Submit>}
    >
      <div className="space-y-4">
        <a href={href} target={channel === 'call' ? undefined : '_blank'} rel="noreferrer" className="block text-sm text-teal-200 underline">
          Didn’t open? {channel === 'call' ? 'Call' : 'Message'} {mobile}
        </a>
        <div>
          <p className="mb-1.5 text-sm font-medium text-gray-300">Channel</p>
          <PickChips
            label="Channel"
            options={CHANNELS}
            value={[channel]}
            onChange={(v) => { setChannel(v); setOutcome(''); }}
          />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-gray-300">Outcome</p>
          <PickChips label="Outcome" options={allowed} value={[outcome]} onChange={setOutcome} />
        </div>
        <Field label="Note (optional)">
          <textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} className="dz-input w-full text-base" data-testid="lead-outcome-note" />
        </Field>
        <FollowUp value={followUp} onChange={setFollowUp} />
      </div>
    </Modal>
  );
}

export function StageSheet({ lead, onClose, onSubmit }) {
  const [stage, setStage] = useState('');
  const [note, setNote] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const needsFollowUp = NEEDS_FOLLOW_UP.includes(stage);
  const terminal = stage === 'do-not-call';
  const ready = Boolean(stage) && note.trim().length > 0
    && (!needsFollowUp || isFuture(followUp)) && (!terminal || confirmed);
  const options = STAGE_CHANGES.filter((s) => s.value !== lead.stage);

  const submit = async () => {
    setBusy(true);
    const ok = await onSubmit({ stage, note: note.trim(), nextFollowUpAt: needsFollowUp ? toIso(followUp) : undefined });
    if (!ok) setBusy(false);
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Change stage"
      footer={<Submit ready={ready} busy={busy} onClick={submit} testId="lead-stage-submit">Save stage</Submit>}
    >
      <div className="space-y-4">
        <PickChips label="New stage" options={options} value={[stage]} onChange={setStage} />
        <Field label="Why? (required)">
          <textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} className="dz-input w-full text-base" data-testid="lead-stage-note" />
        </Field>
        {needsFollowUp ? <FollowUp value={followUp} onChange={setFollowUp} required /> : null}
        {terminal ? (
          <label className="flex min-h-[44px] items-start gap-3 text-sm text-rose-200">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 h-5 w-5" data-testid="lead-dnc-confirm" />
            <span>They asked not to be contacted. This can’t be undone.</span>
          </label>
        ) : null}
      </div>
    </Modal>
  );
}

export function NoteSheet({ onClose, onSubmit }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const ok = await onSubmit(text.trim());
    if (!ok) setBusy(false);
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Add note"
      size="sm"
      footer={<Submit ready={text.trim().length > 0} busy={busy} onClick={submit} testId="lead-note-submit">Save note</Submit>}
    >
      <textarea value={text} maxLength={1000} rows={4} onChange={(e) => setText(e.target.value)} aria-label="Note" className="dz-input w-full text-base" data-testid="lead-note-text" />
    </Modal>
  );
}
