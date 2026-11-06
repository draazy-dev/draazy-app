import { useState } from 'react';
import { FileCheck2, FileUp, Send, UploadCloud } from 'lucide-react';
import { classNames } from '../../../lib/format.js';
import DateField from '../../../components/ui/DateField.jsx';

const DRAFTABLE = new Set(['docs_review', 'draft_shared', 'changes_requested']);

const REGISTRATION_FIELDS = [
  { key: 'documentNo', label: 'Document number', placeholder: 'HVL11-4321-2026', maxLength: 40 },
  { key: 'sro', label: 'Sub-Registrar office', placeholder: 'Haveli 11', maxLength: 60 },
  { key: 'registeredOn', label: 'Registration date', type: 'date' },
  { key: 'grn', label: 'GRAS challan GRN', placeholder: 'MH0045…', maxLength: 30 },
];
const EMPTY_REGISTRATION = Object.fromEntries(REGISTRATION_FIELDS.map(({ key }) => [key, '']));

const DRAFT_CHECKS = [
  { key: 'identity', label: 'PAN numbers in the draft verified on the IGR portal' },
  { key: 'title', label: 'Ownership proof (index II / sale deed / tax bill) names every licensor' },
  { key: 'poa', label: 'Any power of attorney is registered and covers leave & license (or none is used)' },
  { key: 'address', label: 'Flat address in the draft matches the ownership proof' },
  { key: 'terms', label: 'Term, rent, deposit, lock-in and notice match the deed particulars' },
];

export default function StaffWorkflowActions({ request, onShareDraft, onUploadFinal }) {
  const [draftFile, setDraftFile] = useState(null);
  const [draftNote, setDraftNote] = useState('');
  const [checks, setChecks] = useState([]);
  const [finalFile, setFinalFile] = useState(null);
  const [registration, setRegistration] = useState(EMPTY_REGISTRATION);
  const [busy, setBusy] = useState('');
  const needsRecord = request.type === 'rental';
  const draftReady = !!draftFile && (!needsRecord || checks.length === DRAFT_CHECKS.length);
  const finalReady = !!finalFile && (!needsRecord || REGISTRATION_FIELDS.every(({ key }) => registration[key].trim()));
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const toggleCheck = (key) => setChecks((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const share = async (event) => {
    event.preventDefault();
    if (!draftReady || busy) return;
    const form = event.currentTarget;
    setBusy('draft');
    try {
      await onShareDraft({ file: draftFile, note: draftNote, checks: needsRecord ? checks : [] });
      setDraftFile(null);
      setDraftNote('');
      setChecks([]);
      form.reset();
    } catch {
    } finally {
      setBusy('');
    }
  };

  const uploadFinal = async (event) => {
    event.preventDefault();
    if (!finalReady || busy) return;
    const form = event.currentTarget;
    setBusy('final');
    try {
      await onUploadFinal(finalFile, needsRecord ? registration : undefined);
      setFinalFile(null);
      setRegistration(EMPTY_REGISTRATION);
      form.reset();
    } catch {
    } finally {
      setBusy('');
    }
  };

  if (!DRAFTABLE.has(request.status) && request.status !== 'approved') return null;
  const fieldClass = 'mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white';
  return (
    <section className="rounded-xl border border-brand-teal/30 bg-brand-teal/5 p-4" aria-labelledby="workflow-actions-title">
      <h4 id="workflow-actions-title" className="text-sm font-semibold">Drafting workflow</h4>
      {DRAFTABLE.has(request.status) ? (
        <form onSubmit={share} className="mt-3 space-y-3">
          <FilePick id="service-draft-file" label="Draft to share with customer" file={draftFile} onPick={setDraftFile} />
          <div>
            <label className="block text-xs text-gray-400" htmlFor="service-draft-note">Note for the customer <span className="text-gray-500">(optional)</span></label>
            <textarea id="service-draft-note" rows={2} value={draftNote} onChange={(event) => setDraftNote(event.target.value)} maxLength={500} className={classNames(fieldClass, 'resize-none')} placeholder="e.g. Please check the lock-in clause" />
          </div>
          {needsRecord ? (
            <fieldset className="rounded-xl border border-white/10 bg-black/20 p-3">
              <legend className="sr-only">Before the customer sees it</legend>
              <div className="mb-2 flex items-center justify-between text-xs" aria-hidden="true">
                <span className="font-semibold text-gray-300">Before the customer sees it</span>
                <span className={checks.length === DRAFT_CHECKS.length ? 'text-emerald-300' : 'text-gray-500'}>{checks.length}/{DRAFT_CHECKS.length}</span>
              </div>
              <div className="space-y-2">
                {DRAFT_CHECKS.map(({ key, label }) => (
                  <label key={key} className="flex cursor-pointer items-start gap-2 text-xs leading-snug text-gray-300">
                    <input type="checkbox" name="checks" value={key} checked={checks.includes(key)} onChange={() => toggleCheck(key)} className="mt-0.5 h-4 w-4 shrink-0 accent-teal-500" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <button type="submit" disabled={!draftReady || !!busy} className="dz-btn dz-btn-primary w-full disabled:opacity-40"><Send className="h-4 w-4" aria-hidden="true" /> {busy === 'draft' ? 'Sharing…' : 'Share draft'}</button>
          {!draftReady ? <p className="text-center text-xs text-gray-500">{draftFile ? 'Tick every check to share.' : 'Attach the draft to share it.'}</p> : null}
        </form>
      ) : null}
      {request.status === 'approved' ? (
        <form onSubmit={uploadFinal} className="mt-3 space-y-3">
          <FilePick id="service-final-file" label="Registered copy" file={finalFile} onPick={setFinalFile} />
          {needsRecord ? (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs text-gray-400">As printed on the Sub-Registrar's endorsement and the GRAS challan</legend>
              {REGISTRATION_FIELDS.map(({ key, label, ...input }) => {
                const set = (value) => setRegistration((prev) => ({ ...prev, [key]: value }));
                return (
                  <label key={key} className="block text-xs text-gray-400">
                    {label}
                    {input.type === 'date' ? (
                      <DateField value={registration[key]} max={today} onChange={set} ariaLabel={label} className={fieldClass} />
                    ) : (
                      <input
                        {...input}
                        name={key}
                        required
                        value={registration[key]}
                        onChange={(event) => set(event.target.value)}
                        className={fieldClass}
                      />
                    )}
                  </label>
                );
              })}
            </fieldset>
          ) : null}
          <button type="submit" disabled={!finalReady || !!busy} className="dz-btn dz-btn-primary w-full disabled:opacity-40"><FileUp className="h-4 w-4" aria-hidden="true" /> {busy === 'final' ? 'Uploading…' : 'Upload registered copy'}</button>
        </form>
      ) : null}
    </section>
  );
}

function FilePick({ id, label, file, onPick }) {
  return (
    <div>
      <span className="block text-xs text-gray-400">{label}</span>
      <label
        htmlFor={id}
        className={classNames(
          'mt-1 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-3 py-3 focus-within:ring-2 focus-within:ring-teal-400',
          file ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-white/20 bg-white/5 hover:border-brand-teal/50',
        )}
      >
        <input id={id} type="file" accept="application/pdf,image/*" aria-label={label} onChange={(event) => onPick(event.target.files?.[0] || null)} className="sr-only" />
        {file ? <FileCheck2 className="h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" /> : <UploadCloud className="h-5 w-5 shrink-0 text-brand-teal" aria-hidden="true" />}
        <span className="min-w-0 flex-1 truncate text-sm text-gray-300">{file ? file.name : 'Choose a PDF or image'}</span>
        {file ? <span className="text-xs text-gray-400">Change</span> : null}
      </label>
    </div>
  );
}
