import { useId, useState } from 'react';
import { CornerUpLeft } from 'lucide-react';
import { askServiceRequestAttention } from '../../../services/serviceRequestService.js';
import { useToast } from '../../../context/ToastContext.jsx';
import { classNames } from '../../../lib/format.js';
import { fmtAgo } from './helpers.js';

const ASKABLE = new Set(['docs_review', 'changes_requested']);
const PARTIES = [['owner', 'Owner'], ['tenant', 'Tenant']];
const REASON_MAX = 500;
const PAPERS_MAX = 10;
const sideOf = (id) => (id.startsWith('tenant-') ? 'tenant' : 'owner');
const field = 'mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white';

export default function SendBackForCorrection({ request, checklist, onUpdated }) {
  const titleId = useId();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [party, setParty] = useState('owner');
  const [reason, setReason] = useState('');
  const [papers, setPapers] = useState([]);
  const [busy, setBusy] = useState(false);
  const asked = request.attention;

  if (request.status === 'action_required' && asked) {
    return (
      <section className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4" aria-labelledby={titleId} data-testid="attention-waiting">
        <h4 id={titleId} className="text-sm font-semibold text-amber-100">Sent back to the {asked.party}</h4>
        {asked.reason ? <p className="mt-1 text-sm text-amber-50/90">{asked.reason}</p> : null}
        {asked.papers?.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Papers to upload again">
            {asked.papers.map((paper) => <li key={paper.id} className="dz-tag border border-amber-400/30 text-amber-100">{paper.name}</li>)}
          </ul>
        ) : null}
        <p className="mt-2 text-xs text-amber-200/70">Asked {fmtAgo(asked.askedAt)} · it comes back here when they mark it done.</p>
      </section>
    );
  }
  if (!request.assignedToMe || !ASKABLE.has(request.status)) return null;

  const sidePapers = (checklist?.items || []).filter((item) => sideOf(item.id) === party);
  const toggle = (id) => setPapers((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  const pick = (value) => { setParty(value); setPapers([]); };
  const ready = reason.trim() || papers.length > 0;

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      onUpdated(await askServiceRequestAttention(request.id, { party, reason: reason.trim(), papers }));
      toast(`Sent back to the ${party}. They have been notified.`, 'success');
      setOpen(false);
      setReason('');
      setPapers([]);
    } catch (err) {
      toast(err?.message || 'It was not sent back.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="dz-btn dz-btn-ghost w-full">
        <CornerUpLeft className="h-4 w-4" aria-hidden="true" /> Send back for correction
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-white/10 bg-black/10 p-4" aria-labelledby={titleId}>
      <h4 id={titleId} className="text-sm font-semibold">Send back for correction</h4>
      <fieldset>
        <legend className="text-xs text-gray-400">Who needs to fix it</legend>
        <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {PARTIES.map(([value, label]) => (
            <label
              key={value}
              className={classNames(
                'flex min-h-[40px] cursor-pointer items-center justify-center rounded-lg text-sm font-medium focus-within:ring-2 focus-within:ring-teal-400',
                party === value ? 'bg-brand-teal/20 text-white' : 'text-gray-400',
              )}
            >
              <input type="radio" name={`${titleId}-party`} value={value} checked={party === value} onChange={() => pick(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {sidePapers.length ? (
        <fieldset>
          <legend className="text-xs text-gray-400">Papers to upload again</legend>
          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            {sidePapers.map((item) => (
              <label key={item.id} className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={papers.includes(item.id)}
                  disabled={!papers.includes(item.id) && papers.length >= PAPERS_MAX}
                  onChange={() => toggle(item.id)}
                  className="h-4 w-4 accent-teal-400"
                />
                <span className="min-w-0 truncate">{item.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <label className="block text-xs text-gray-400">
        {papers.length ? 'Anything to ask them (optional)' : 'What they need to answer or fix'}
        <textarea rows={3} maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} className={field} />
      </label>
      <p className="text-xs text-gray-500">Details you can fix yourself: use Edit on the case instead.</p>
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !ready} className="dz-btn dz-btn-primary flex-1 disabled:opacity-40">
          {busy ? 'Sending…' : 'Send back'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="dz-btn dz-btn-ghost">Cancel</button>
      </div>
    </form>
  );
}
