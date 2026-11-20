import { useState } from 'react';
import { Ban, Check, CheckCircle, EyeOff, History, MessageCircleQuestion } from 'lucide-react';
import Badge from '../../../../components/ui/Badge.jsx';
import { Block, fmtDate } from '../board.jsx';
import { MOD_LABEL } from '../FlatmateQueueCard.jsx';

const PUBLIC = ['approved', 'live'];
const WITHHELD = ['removed', 'rejected'];

export const REASON_CODES = [
  ['photos_not_real', 'Photos are not real'],
  ['duplicate', 'Duplicate post'],
  ['broker', 'Looks like a broker'],
  ['wrong_details', 'Details are wrong'],
  ['locality_unclear', 'Locality unclear'],
  ['document_unreadable', 'Document unreadable'],
  ['name_mismatch', 'Name does not match'],
  ['other', 'Other'],
];

export default function DecisionSection({ modStatus, recheck, publishLabel = 'Publish', busy, onDecide, askInfo = false, ticksPending = false }) {
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const noNote = !note.trim();
  const expired = modStatus === 'expired';
  const actions = [
    { id: 'approved', label: publishLabel, icon: Check, cls: 'dz-btn-success', hidden: expired || PUBLIC.includes(modStatus), needsNote: WITHHELD.includes(modStatus), blocked: ticksPending },
    { id: 'needs_info', label: 'Needs info', icon: MessageCircleQuestion, cls: 'dz-btn-ghost', hidden: !askInfo || modStatus !== 'pending', needsReason: true },
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
      {recheck?.at && !expired ? (
        <div className="flatmate-mod-recheck mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-3 text-sm text-amber-200">
          <History className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">Re-check: {recheck.reason || 'edited'} · {fmtDate(recheck.at)}</span>
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
      {askInfo ? (
        <>
          <label htmlFor="flatmate-decision-reason" className="mt-2 block text-sm text-gray-300">Reason</label>
          <select id="flatmate-decision-reason" data-testid="flatmate-reason-code" value={reason} onChange={(e) => setReason(e.target.value)} className="dz-input mt-1 w-full">
            <option value="">Choose a reason</option>
            {REASON_CODES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
          <p className="mt-1 text-xs text-gray-400">The host sees this in Messages from Draazy Support.</p>
        </>
      ) : null}
      {ticksPending ? <p data-testid="flatmate-ticks-hint" className="mt-2 text-xs text-amber-300">Tick all three checks to publish.</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {actions.map((a) => (
          <button key={a.id} type="button" data-testid={`flatmate-decide-${a.id}`} disabled={busy || a.blocked || (a.needsNote && noNote) || (a.needsReason && !reason)} aria-describedby={a.needsNote ? 'flatmate-decision-note-hint' : undefined} onClick={() => onDecide(a.id, note, reason)} className={`dz-btn min-h-[44px] ${a.cls}`}>
            <a.icon className="h-4 w-4" />{a.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">Publishing does not grant a trust badge.</p>
    </Block>
  );
}
