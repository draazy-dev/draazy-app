import { useCallback, useEffect, useState } from 'react';
import Modal from '../../../components/ui/Modal.jsx';
import Loading from '../../../components/ui/Loading.jsx';
import { BTN } from '../../../components/admin/WorkQueue.jsx';
import { classNames, fmtINR } from '../../../lib/format.js';
import { listConvertible, listLeadAssignees } from '../../../services/leadService.js';
import { SERVICE_LABEL, leadError, when } from './leadsFormat.js';

const OPTION = 'flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-2 text-left text-sm transition-colors';

function useLoaded(load, toast) {
  const [state, setState] = useState({ status: 'loading', rows: [] });
  useEffect(() => {
    let live = true;
    load()
      .then((rows) => live && setState({ status: 'ready', rows }))
      .catch((e) => {
        if (!live) return;
        toast(leadError(e), 'error');
        setState({ status: 'error', rows: [] });
      });
    return () => { live = false; };
  }, [load, toast]);
  return state;
}

export function ConvertSheet({ leadId, onClose, onSubmit, toast }) {
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => listConvertible(leadId), [leadId]);
  const { status, rows } = useLoaded(load, toast);

  const submit = async () => {
    setBusy(true);
    const ok = await onSubmit(picked);
    if (!ok) setBusy(false);
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Mark as converted"
      footer={(
        <button type="button" disabled={!picked || busy} onClick={submit} className={classNames(BTN.primary, 'min-h-[44px]', (!picked || busy) && 'opacity-50')} data-testid="lead-convert-submit">
          Convert
        </button>
      )}
    >
      {status === 'loading' ? <Loading /> : null}
      {status === 'ready' && !rows.length ? (
        <p className="text-sm text-gray-300" data-testid="lead-convert-empty">No paid service yet.</p>
      ) : null}
      <div className="space-y-2" role="radiogroup" aria-label="Paid services">
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={picked === r.id}
            onClick={() => setPicked(r.id)}
            data-testid="lead-convertible"
            className={classNames(OPTION, picked === r.id ? 'border-brand-teal bg-brand-teal/15 text-white' : 'border-white/10 bg-white/5 text-gray-300')}
          >
            <span>{SERVICE_LABEL[r.type] || r.type}<span className="block text-xs text-gray-400">{when(r.createdAt)}</span></span>
            <span className="font-semibold tabular-nums">{fmtINR(r.amount)}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function StaffPickSheet({ title, onClose, onSubmit, toast, testId }) {
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const { status, rows } = useLoaded(listLeadAssignees, toast);

  const submit = async () => {
    setBusy(true);
    const ok = await onSubmit(picked);
    if (!ok) setBusy(false);
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={title}
      footer={(
        <button type="button" disabled={!picked || busy} onClick={submit} className={classNames(BTN.primary, 'min-h-[44px]', (!picked || busy) && 'opacity-50')} data-testid={testId}>
          Confirm
        </button>
      )}
    >
      {status === 'loading' ? <Loading /> : null}
      {status === 'ready' && !rows.length ? <p className="text-sm text-gray-300">No staff available.</p> : null}
      <div className="space-y-2" role="radiogroup" aria-label="Staff">
        {rows.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={picked === s.id}
            onClick={() => setPicked(s.id)}
            data-testid="lead-staff-option"
            className={classNames(OPTION, picked === s.id ? 'border-brand-teal bg-brand-teal/15 text-white' : 'border-white/10 bg-white/5 text-gray-300')}
          >
            <span>{s.name}</span>
            <span className="text-xs text-gray-400">{s.openLeads} open</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
