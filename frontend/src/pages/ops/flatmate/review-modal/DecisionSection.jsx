import { useState } from 'react';
import { Ban, Check, CheckCircle, EyeOff, History } from 'lucide-react';
import Badge from '../../../../components/ui/Badge.jsx';
import { Block, fmtDate } from '../board.jsx';
import { MOD_LABEL } from '../FlatmateQueueCard.jsx';

const PUBLIC = ['approved', 'live'];
const WITHHELD = ['removed', 'rejected'];

/* The visibility axis. Publishing grants no badge; hiding says nothing about the paperwork. */
export default function DecisionSection({ modStatus, recheck, publishLabel = 'Publish', busy, onDecide }) {
  const [note, setNote] = useState('');
  const noNote = !note.trim();
  const expired = modStatus === 'expired';
  const actions = [
    { id: 'approved', label: publishLabel, icon: Check, cls: 'dz-btn-success', hidden: expired || PUBLIC.includes(modStatus), needsNote: WITHHELD.includes(modStatus) },
    { id: 'flagged', label: 'Hide for review', icon: EyeOff, cls: 'dz-btn-ghost', hidden: expired || modStatus === 'flagged', needsNote: true },
    { id: 'removed', label: 'Remove', icon: Ban, cls: 'dz-btn-danger', hidden: modStatus === 'removed', needsNote: true },
  ].filter((a) => !a.hidden);

  return (
    <Block
      icon={CheckCircle}
      title="Decision"
      aside={<Badge status={modStatus}>{MOD_LABEL[modStatus] || null}</Badge>}
      className="flatmate-decision-section"
    >
      {expired ? (
        <p className="mb-3 text-sm text-gray-400">Expired — only the host&apos;s renewal brings it back.</p>
      ) : null}
      {/* Keyed off the timestamp: the server's own presence test is `recheck_requested_at is not null`. */}
      {recheck?.at && !expired ? (
        <div className="flatmate-mod-recheck mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-3 text-sm text-amber-200">
          <History className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">Re-check: {recheck.reason || 'edited'} · {fmtDate(recheck.at)}</span>
          {/* Re-stamping the current state is the server's "I read the edit and it is fine". */}
          <button type="button" disabled={busy} onClick={() => onDecide(modStatus, note)} className="dz-btn dz-btn-success">
            <Check className="h-4 w-4" />Looks fine
          </button>
        </div>
      ) : null}

      <label htmlFor="flatmate-decision-note" className="text-sm text-gray-300">Internal note</label>
      <textarea
        id="flatmate-decision-note"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-describedby="flatmate-decision-note-hint"
        className="dz-input mt-1 w-full"
      />
      <p id="flatmate-decision-note-hint" className="mt-1 text-xs text-gray-400">Needed to hide, remove, or restore a removed item. Stays internal.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {actions.map((a) => (
          <button key={a.id} type="button" disabled={busy || (a.needsNote && noNote)} aria-describedby={a.needsNote ? 'flatmate-decision-note-hint' : undefined} onClick={() => onDecide(a.id, note)} className={`dz-btn min-h-[44px] ${a.cls}`}>
            <a.icon className="h-4 w-4" />{a.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">Publishing does not grant a trust badge.</p>
    </Block>
  );
}
