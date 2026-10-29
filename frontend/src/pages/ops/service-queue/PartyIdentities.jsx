import { useEffect, useId, useRef, useState } from 'react';
import { Eye, EyeOff, Pencil, ShieldAlert } from 'lucide-react';
import { correctServiceRequestIdentities, readServiceRequestIdentities } from '../../../services/serviceRequestService.js';
import { useToast } from '../../../context/ToastContext.jsx';
import { classNames } from '../../../lib/format.js';
import IdInput from '../../../components/IdInput.jsx';
import { isAadhaar, isPan } from '../../consumer/services/rent-agreement/helpers.js';

const PARTY_LABEL = { owner: 'Owner', tenant: 'Tenant', witness: 'Witness' };
const field = 'mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white';

const formParties = (state = {}) => {
  const list = (v) => (Array.isArray(v) ? v : []);
  const tenants = list(state.tenants);
  return [
    { partyRole: 'owner', partyIndex: 0, partyName: state.owner?.oName },
    ...list(state.coOwners).map((c, i) => ({ partyRole: 'owner', partyIndex: i + 1, partyName: c?.name })),
    ...(tenants.length ? tenants : [{}]).map((t, i) => ({ partyRole: 'tenant', partyIndex: i, partyName: t?.name })),
    { partyRole: 'witness', partyIndex: 0, partyName: state.wit?.w1Name },
    { partyRole: 'witness', partyIndex: 1, partyName: state.wit?.w2Name },
  ];
};

const keyOf = (p) => `${p.partyRole}-${p.partyIndex}`;

const merged = (state, recorded) => {
  const byKey = new Map(recorded.map((r) => [keyOf(r), r]));
  const rows = formParties(state).map((p) => {
    const r = byKey.get(keyOf(p));
    return { ...p, ...r, partyName: p.partyName || r?.partyName || '' };
  });
  const seen = new Set(rows.map(keyOf));
  return [...rows, ...recorded.filter((r) => !seen.has(keyOf(r)))];
};

function CorrectNumbers({ requestId, party, onSaved, onCancel }) {
  const { toast } = useToast();
  const [pan, setPan] = useState(party.pan || '');
  const [aadhaar, setAadhaar] = useState(party.aadhaar || '');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const uid = useId();
  const witness = party.partyRole === 'witness';
  const error = (!pan && !aadhaar && 'Enter a PAN or an Aadhaar.')
    || (pan && !isPan(pan) && 'PAN looks like ABCDE1234F.')
    || (aadhaar && !isAadhaar(aadhaar) && 'That Aadhaar number is not valid.')
    || '';

  const save = async (event) => {
    event.preventDefault();
    if (busy || error) return;
    setBusy(true);
    try {
      await correctServiceRequestIdentities(requestId, [{
        partyRole: party.partyRole,
        partyIndex: party.partyIndex,
        partyName: String(party.partyName || '').slice(0, 120),
        pan: witness ? '' : pan,
        aadhaar,
      }]);
      toast('Saved. The customer has been told their ID was corrected.', 'success');
      if (mounted.current) onSaved();
    } catch (err) {
      toast(err?.message || 'The numbers were not saved.', 'error');
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="mt-2 space-y-2" aria-label={`Correct ${party.partyName || 'party'} ID numbers`}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {witness ? null : (
          <div>
            <label htmlFor={`${uid}-pan`} className="text-xs text-gray-400">PAN</label>
            <IdInput id={`${uid}-pan`} kind="pan" value={pan} onChange={setPan} className={field} />
          </div>
        )}
        <div>
          <label htmlFor={`${uid}-aadhaar`} className="text-xs text-gray-400">Aadhaar</label>
          <IdInput id={`${uid}-aadhaar`} kind="aadhaar" value={aadhaar} onChange={setAadhaar} className={field} />
        </div>
      </div>
      {error && (pan || aadhaar) ? <p className="text-xs text-amber-300" role="alert">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !!error} className="dz-btn dz-btn-primary flex-1 disabled:opacity-40">
          {busy ? 'Saving…' : 'Save numbers'}
        </button>
        <button type="button" onClick={onCancel} className="dz-btn dz-btn-ghost">Cancel</button>
      </div>
    </form>
  );
}

export default function PartyIdentities({ requestId, state, editable = false, className = 'rounded-2xl border border-white/10 p-4' }) {
  const [identities, setIdentities] = useState(null);
  const [status, setStatus] = useState('idle');
  const [refusal, setRefusal] = useState('');
  const [correcting, setCorrecting] = useState('');

  const reveal = async () => {
    if (status === 'loading') return;
    setStatus('loading');
    setRefusal('');
    try {
      setIdentities(await readServiceRequestIdentities(requestId));
      setStatus('ready');
    } catch (err) {
      setIdentities(null);
      setStatus('refused');
      setRefusal(err?.message || 'These numbers are visible only to the person working the matter.');
    }
  };

  const hide = () => {
    setIdentities(null);
    setStatus('idle');
    setRefusal('');
    setCorrecting('');
  };

  const saved = () => {
    setCorrecting('');
    reveal();
  };

  const rows = status === 'ready' ? (editable && state ? merged(state, identities) : identities) : [];

  return (
    <section className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">Parties&rsquo; identity numbers</h4>
        {status === 'ready' ? (
          <button type="button" onClick={hide} className="dz-btn dz-btn-ghost">
            <EyeOff className="h-4 w-4" /> Hide
          </button>
        ) : (
          <button type="button" onClick={reveal} disabled={status === 'loading'} className="dz-btn dz-btn-primary disabled:opacity-40">
            <Eye className="h-4 w-4" /> {status === 'loading' ? 'Checking…' : 'Reveal'}
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-gray-400">
        Holder only. Every attempt is recorded against your name; numbers are discarded once the request closes.
      </p>

      {status === 'refused' ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{refusal}</span>
        </div>
      ) : null}

      {status === 'ready' ? (
        rows.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            Nothing was recorded against this request. Ask the customer to add the parties&rsquo; details before drafting.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((p) => (
              <li key={keyOf(p)} className="rounded-xl border border-white/5 bg-white/5 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="font-semibold">{p.partyName || `${PARTY_LABEL[p.partyRole] || 'Party'} ${p.partyIndex + 1}`}</span>
                  <span className="text-xs uppercase tracking-wide text-gray-500">{PARTY_LABEL[p.partyRole] || p.partyRole}</span>
                  {editable && !p.purged && correcting !== keyOf(p) ? (
                    <button type="button" onClick={() => setCorrecting(keyOf(p))} aria-label={`Correct ${p.partyName || `${PARTY_LABEL[p.partyRole] || 'Party'} ${p.partyIndex + 1}`} ID numbers`} className="ml-auto inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-teal-300 hover:bg-white/5">
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Correct
                    </button>
                  ) : null}
                </div>
                {correcting === keyOf(p) ? (
                  <CorrectNumbers requestId={requestId} party={p} onSaved={saved} onCancel={() => setCorrecting('')} />
                ) : p.purged ? (
                  <div className="mt-1 text-xs text-gray-500">Recorded, and since discarded — this request has closed.</div>
                ) : (
                  <dl className="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    <div className="flex justify-between gap-2 py-0.5">
                      <dt className="text-gray-400">PAN</dt>
                      <dd className={classNames('font-mono', p.pan ? '' : 'text-gray-500')}>{p.pan || 'not supplied'}</dd>
                    </div>
                    <div className="flex justify-between gap-2 py-0.5">
                      <dt className="text-gray-400">Aadhaar</dt>
                      <dd className={classNames('font-mono', p.aadhaar ? '' : 'text-gray-500')}>{p.aadhaar || 'not supplied'}</dd>
                    </div>
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
