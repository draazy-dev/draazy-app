import { useEffect, useRef, useState } from 'react';
import Icon from '../../../components/Icon.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import DateField from '../../../components/ui/DateField.jsx';
import { avatarFor, timeAgo } from '../../../lib/format.js';
/* Lead detail sheet — progressive disclosure for a single request. */

const toDateInput = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function LeadSheet({ lead, annotation, onClose, onSaveAnnotation }) {
  const [note, setNote] = useState(annotation?.note || '');
  const [followUp, setFollowUp] = useState(toDateInput(annotation?.followUpAt));
  const lastSavedNote = useRef(annotation?.note || '');
  const noteRef = useRef(note);
  const saveRef = useRef(onSaveAnnotation);
  noteRef.current = note;
  saveRef.current = onSaveAnnotation;

  const flushNote = async () => {
    const trimmed = noteRef.current.trim();
    if (lastSavedNote.current === trimmed) return true;
    await saveRef.current({ note: trimmed });
    lastSavedNote.current = trimmed;
    return true;
  };
  const saveFollowUp = (v) => {
    setFollowUp(v);
    // Anchor at local noon so the stored timestamp never drifts to the day before.
    saveRef.current({ followUpAt: v ? new Date(v + 'T12:00').getTime() : null });
  };

  useEffect(() => () => {
    const trimmed = noteRef.current.trim();
    if (lastSavedNote.current !== trimmed) void saveRef.current({ note: trimmed });
  }, []);

  if (!lead) return null;

  const close = async () => {
    await flushNote();
    onClose();
  };
  const statusLabel = { pending: 'Waiting on you', accepted: 'Accepted', declined: 'Declined', expired: 'Expired', withdrawn: 'Withdrawn' }[lead.status] || lead.status;

  return (
    <Modal open onClose={close} title="Lead details" size="sm">
      <div className="space-y-5 pb-[var(--dz-safe-b)]">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-teal to-emerald-500 text-sm font-bold text-white">{avatarFor(lead.name)}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-white">{lead.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
              <Icon name={lead.typeIcon} className="h-3.5 w-3.5 text-brand-teal" /> {lead.typeLabel}
            </p>
          </div>
          {lead.status ? <span className="dz-tag bg-white/10 font-semibold text-gray-200">{statusLabel}</span> : null}
        </div>

        <div className="space-y-2 rounded-xl bg-white/[0.03] p-3.5 text-sm">
          {lead.propLabel ? (
            <p className="flex items-center gap-2 text-gray-300"><Icon name="home" className="h-4 w-4 flex-shrink-0 text-gray-500" /> <span className="min-w-0 truncate">{lead.propLabel}</span></p>
          ) : null}
          {lead.detail ? (
            <p className="flex items-start gap-2 text-gray-400"><Icon name="info" className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-500" /> <span>{lead.detail}</span></p>
          ) : null}
          {lead.requestedAt ? (
            <p className="flex items-center gap-2 text-gray-500"><Icon name="clock" className="h-4 w-4 flex-shrink-0" /> Requested {timeAgo(lead.requestedAt)}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="lead-note" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-300">
            <Icon name="pencil" className="h-3.5 w-3.5 text-gray-500" /> Private note
          </label>
          <textarea
            id="lead-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => { void flushNote(); }}
            rows={2}
            placeholder="Add a private note about this lead…"
            className="field w-full resize-none rounded-xl px-3.5 py-2.5 text-sm"
          />
        </div>

        <div>
          <label htmlFor="lead-followup" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-300">
            <Icon name="calendar-clock" className="h-3.5 w-3.5 text-gray-500" /> Follow-up date
          </label>
          <DateField
            id="lead-followup"
            value={followUp}
            onChange={saveFollowUp}
            ariaLabel="Follow-up date"
            className="field w-full rounded-xl px-3.5 py-2.5 text-sm"
          />
        </div>
      </div>
    </Modal>
  );
}
