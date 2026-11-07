import { useState } from 'react';
import Icon from './Icon.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { addServiceRequestDoc, resolveServiceRequestAttention } from '../services/serviceRequestService.js';
import { userMessage } from '../lib/userMessage.js';

const NOTE_MAX = 500;

const freshSince = (docs, askedAt) => {
  const since = Date.parse(askedAt) || 0;
  return new Set((docs || []).filter((d) => d.uploadedAt > since).map((d) => String(d.category).toLowerCase()));
};

export default function AttentionNeeded({ request, onChanged }) {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState('');
  const [sent, setSent] = useState([]);
  const { attention } = request;
  const papers = attention.papers || [];
  const fresh = freshSince(request.docs, attention.askedAt);
  const isFresh = (paper) => fresh.has(paper.id) || sent.includes(paper.id);
  const left = papers.filter((paper) => !isFresh(paper)).length;

  const upload = async (paper, file) => {
    if (!file || uploading) return;
    setUploading(paper.id);
    try {
      await addServiceRequestDoc(request.id, { file, category: paper.id });
      setSent((prev) => [...prev, paper.id]);
      toast(`${paper.name} uploaded.`, 'success');
    } catch (error) {
      toast(userMessage(error, 'The upload failed. Please try again.'), 'error');
    } finally {
      setUploading('');
    }
  };

  const done = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await resolveServiceRequestAttention(request.id, note.trim());
      toast('Sent back to our team. We will pick it up from here.', 'success');
      setNote('');
      onChanged();
    } catch (error) {
      toast(userMessage(error, 'That did not go through. Please try again.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!attention.forYou) {
    return (
      <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-gray-300" role="status">
        Waiting for the {attention.party} to {papers.length ? `upload ${papers.map((p) => p.name).join(', ')}` : `answer: ${attention.reason}`}
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs" role="region" aria-label="Needs your attention">
      <p className="text-amber-200 font-semibold mb-1.5 flex items-center gap-1.5">
        <Icon name="alert-circle" className="w-3.5 h-3.5" /> Our team needs a correction from you
      </p>
      {attention.reason ? <p className="text-gray-100 text-sm">{attention.reason}</p> : null}
      {papers.length ? (
        <ul className="mt-2 space-y-1.5" aria-label="Papers to upload again">
          {papers.map((paper) => (
            <li key={paper.id} className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5">
              <span className="min-w-0 text-sm text-white">{paper.name}</span>
              {isFresh(paper) ? (
                <span role="status" className="inline-flex shrink-0 items-center gap-1 font-semibold text-emerald-300">
                  <Icon name="check" className="w-3.5 h-3.5" /> Uploaded
                </span>
              ) : (
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 btn-outline px-3 py-1.5 rounded-lg text-gray-200 font-semibold focus-within:ring-2 focus-within:ring-teal-400">
                  <Icon name="upload" className="w-3.5 h-3.5" /> {uploading === paper.id ? 'Uploading…' : 'Upload'}
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="sr-only"
                    disabled={!!uploading}
                    aria-label={`Upload a new copy of ${paper.name}`}
                    onChange={(event) => { upload(paper, event.target.files?.[0]); event.target.value = ''; }}
                  />
                </label>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <label className="mt-3 block text-gray-400">
        {attention.reason ? 'Your reply' : 'Anything we should know (optional)'}
        <textarea
          rows={2}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </label>
      <button
        type="button"
        onClick={done}
        disabled={busy || left > 0}
        aria-describedby={left > 0 ? `${request.id}-papers-left` : undefined}
        className="btn-teal mt-2 w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        <Icon name="check" className="w-3.5 h-3.5" />
        {busy ? 'Sending…' : 'Done — send back to our team'}
      </button>
      {left > 0 ? <p id={`${request.id}-papers-left`} className="mt-1.5 text-gray-400">Upload {left === 1 ? 'the paper' : `all ${left} papers`} above first.</p> : null}
    </div>
  );
}
