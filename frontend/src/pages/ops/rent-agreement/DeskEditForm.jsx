import { useId, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { editServiceRequestDetails } from '../../../services/serviceRequestService.js';
import { useToast } from '../../../context/ToastContext.jsx';
import { userMessage } from '../../../lib/userMessage.js';

const SKIP = /(^o?pan$|aadhaar|^societyId$|^societyNotOnMaps$|^gramPanchayat$|^custom$)/i;
const PRICED = new Set(['rent', 'deposit', 'nrDeposit', 'months', 'increment', 'incrementEvery']);
const ROW_TEMPLATES = {
  furnItems: { name: '', qty: 1, custom: true },
  depositPayments: { mode: 'upi', ref: '', date: '', amount: '' },
  occupants: { type: 'family', relation: '', fullName: '', age: '', mobile: '' },
};
const LABELS = {
  addr: 'Address', dob: 'Date of birth', flatNo: 'Flat', society: 'Society / building',
  lockin: 'Lock-in (months)', costBy: 'Registration cost borne by',
  maint: 'Maintenance paid by', clauses: 'Extra clauses',
  visitAt: 'Biometric visit at', visitSlot: 'Visit time', poaSro: 'POA SRO', poaRegNo: 'POA reg. no.', poaDate: 'POA date',
  poaPrincipal: 'POA principal', furnItems: 'Furniture', depositPayments: 'Deposit payment',
  occupants: 'Occupant', ref: 'Reference', qty: 'Qty', propType: 'Property type',
  visaOci: 'Visa / OCI', frro: 'FRRO',
};
const WIDE = /addr|address|clauses/i;
const field = 'mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white';

const bare = (key) => String(key).replace(/^o(?=[A-Z])/, '');
const human = (key) => {
  if (typeof key === 'number') return String(key + 1);
  const b = bare(key);
  const label = LABELS[key] || LABELS[b[0].toLowerCase() + b.slice(1)] || b.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return label[0].toUpperCase() + label.slice(1);
};

function items(value, path) {
  if (Array.isArray(value)) {
    const list = ROW_TEMPLATES[path.at(-1)];
    const rows = value.flatMap((v, i) => [...(list ? [{ kind: 'row', path: [...path, i] }] : []), ...items(v, [...path, i])]);
    return list ? [...rows, { kind: 'add', path }] : rows;
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => (SKIP.test(k) || PRICED.has(k) ? [] : items(v, [...path, k])));
  }
  return [{ kind: 'leaf', path, value }];
}

const getIn = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
const setIn = (obj, [k, ...rest], value) => {
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  copy[k] = rest.length ? setIn(obj[k], rest, value) : value;
  return copy;
};

function editableItems(state, roots) {
  return roots.flatMap((root) => {
    const value = getIn(state, root);
    return value === undefined ? [] : items(value, root);
  });
}

const asTyped = (original, raw) => (typeof original === 'number' && raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw);

function Input({ id, leaf, numeric, onChange }) {
  const key = String(leaf.path.at(-1));
  if (typeof leaf.value === 'boolean') {
    return <input id={id} type="checkbox" checked={leaf.value} onChange={(e) => onChange(e.target.checked)} className="mt-2 h-4 w-4" />;
  }
  const value = leaf.value ?? '';
  if (WIDE.test(key)) {
    return <textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} className={field} />;
  }
  const date = key === 'dob' || /(Dob|[dD]ate)$/.test(key);
  return (
    <input
      id={id}
      type={date ? 'date' : 'text'}
      inputMode={numeric ? 'decimal' : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={field}
    />
  );
}

export default function DeskEditForm({ request, title, roots, onSaved, onCancel, onError }) {
  const uid = useId();
  const { toast } = useToast();
  const filed = useMemo(() => request.details?._state || {}, [request.details]);
  const [lists, setLists] = useState({});
  const [edits, setEdits] = useState({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const base = useMemo(() => Object.values(lists).reduce((s, l) => setIn(s, l.path, l.value), filed), [lists, filed]);
  const state = useMemo(
    () => Object.values(edits).reduce((s, e) => setIn(s, e.path, asTyped(getIn(base, e.path), e.value)), base),
    [edits, base],
  );
  const rows = editableItems(state, roots).map((l) => {
    const typed = l.kind === 'leaf' && edits[l.path.join('.')];
    return typed ? { ...l, value: typed.value } : l;
  });
  const priced = roots.some((r) => r[0] === 'terms');

  const reshape = (path, next) => {
    const key = path.join('.');
    setLists((l) => ({ ...l, [key]: { path, value: next } }));
    setEdits((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(`${key}.`))));
  };
  const addRow = (path) => reshape(path, [...(getIn(state, path) || []), { ...ROW_TEMPLATES[path.at(-1)] }]);
  const removeRow = (path) => reshape(path.slice(0, -1), getIn(state, path.slice(0, -1)).filter((_, i) => i !== path.at(-1)));

  const save = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      onSaved(await editServiceRequestDetails(request.id, state, note.trim()));
      toast('Saved. The customer was told what changed.', 'success');
      onCancel();
    } catch (err) {
      onError(userMessage(err, 'The details were not saved.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} aria-label={`Edit ${title}`} className="rounded-xl border border-brand-teal/40 bg-brand-teal/5 p-4">
      <h4 className="text-sm font-semibold">Edit {title}</h4>
      {priced ? <p className="mt-1 text-xs text-gray-400">Rent, deposit, term and escalation change through Revise priced terms below.</p> : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {rows.map((leaf) => {
          const id = `${uid}-${leaf.path.join('-')}`;
          if (leaf.kind === 'row') {
            const label = `${human(leaf.path.at(-2))} ${leaf.path.at(-1) + 1}`;
            return (
              <div key={id} className="flex items-center justify-between border-t border-white/10 pt-2 sm:col-span-2">
                <span className="text-xs font-semibold text-gray-300">{label}</span>
                <button type="button" onClick={() => removeRow(leaf.path)} className="inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2 text-xs text-rose-300 hover:bg-white/5" aria-label={`Remove ${label}`}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                </button>
              </div>
            );
          }
          if (leaf.kind === 'add') {
            return (
              <button key={`${id}-add`} type="button" onClick={() => addRow(leaf.path)} className="dz-btn dz-btn-ghost justify-self-start sm:col-span-2">
                <Plus className="h-4 w-4" aria-hidden="true" /> Add {human(leaf.path.at(-1)).toLowerCase()}
              </button>
            );
          }
          const rest = leaf.path.slice(roots.find((r) => r.every((k, i) => leaf.path[i] === k)).length);
          const label = (rest.length ? rest : leaf.path.slice(-1)).map(human).join(' · ');
          return (
            <div key={id} className={WIDE.test(String(leaf.path.at(-1))) ? 'sm:col-span-2' : ''}>
              <label htmlFor={id} className="text-xs text-gray-400">{label}</label>
              <Input id={id} leaf={leaf} numeric={typeof getIn(base, leaf.path) === 'number'}
                onChange={(v) => setEdits((e) => ({ ...e, [leaf.path.join('.')]: { path: leaf.path, value: v } }))} />
            </div>
          );
        })}
      </div>
      <label className="mt-3 block text-xs text-gray-400">
        Note to the customer (optional)
        <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className={field} />
      </label>
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={busy} className="dz-btn dz-btn-primary flex-1 disabled:opacity-40">{busy ? 'Saving…' : 'Save changes'}</button>
        <button type="button" onClick={onCancel} className="dz-btn dz-btn-ghost">Cancel</button>
      </div>
    </form>
  );
}
