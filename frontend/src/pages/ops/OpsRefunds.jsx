import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { approveRefund, listRefunds, rejectRefund } from '../../services/refundService.js';
import { classNames, fmtINR } from '../../lib/format.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { canWriteModule } from '../../lib/adminModules.js';
import { useTabParam } from '../../lib/useTabParam.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Loading from '../../components/ui/Loading.jsx';
import {
  BTN, CHIP, CHIP_TONE, FactRow, PageNav, QueuePanel, QueueTabs, RowCard, RowList,
} from '../../components/admin/WorkQueue.jsx';

const PAGE_SIZE = 20;
const TABS = [
  { key: 'pending', label: 'Pending', status: 'pending_review' },
  { key: 'approved', label: 'Approved', status: 'approved' },
  { key: 'rejected', label: 'Rejected', status: 'rejected' },
  { key: 'auto', label: 'Automatic', status: 'auto' },
  { key: 'disputes', label: 'Disputes', status: 'disputed' },
];
const TAB_KEYS = TABS.map((t) => t.key);
const STATUS_LABEL = { pending_review: 'Pending', approved: 'Approved', rejected: 'Rejected', auto: 'Automatic', disputed: 'Dispute' };
const STATUS_TONE = { pending_review: CHIP_TONE.amber, approved: CHIP_TONE.green, rejected: CHIP_TONE.red, auto: CHIP_TONE.teal, disputed: CHIP_TONE.red };
const NOTE = 'Decide within 2 business days. Approving pays back to the original method; rejecting needs a reason the customer will see.';

const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString('en-IN') : '—');
const Dot = () => <span className="text-gray-600" aria-hidden="true">·</span>;

function ApproveModal({ row, busy, onClose, onConfirm }) {
  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Approve refund"
      size="sm"
      footer={(
        <button type="button" disabled={busy} onClick={onConfirm} className={classNames(BTN.primary, busy && 'opacity-50')} data-testid="refund-approve-confirm">
          <Check className="h-3.5 w-3.5" />Approve
        </button>
      )}
    >
      <p className="text-sm text-gray-300">{row.customerName || 'Customer'}{row.customerMobile ? ` · ${row.customerMobile}` : ''} · {row.label} · {fmtINR(row.amount)}</p>
      <p className="mt-1 font-mono text-xs text-gray-400">{row.orderRef}</p>
      <p className="mt-3 text-xs text-gray-400">This pays {fmtINR(row.amount)} back to the original payment method.</p>
    </Modal>
  );
}

function RejectModal({ row, busy, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const ready = reason.trim().length > 0;
  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Reject refund"
      size="sm"
      footer={(
        <button type="button" disabled={!ready || busy} onClick={() => onConfirm(reason.trim())} className={classNames(BTN.danger, (!ready || busy) && 'opacity-50')} data-testid="refund-reject-confirm">
          <X className="h-3.5 w-3.5" />Reject
        </button>
      )}
    >
      <p className="mb-3 text-sm text-gray-300">{row.customerName}{row.customerMobile ? ` · ${row.customerMobile}` : ''} · {row.label} · {fmtINR(row.amount)}</p>
      <label className="block text-xs text-gray-400">
        Reason (required)
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} className="dz-input mt-1 w-full text-sm" data-testid="refund-reject-reason" />
      </label>
    </Modal>
  );
}

export default function OpsRefunds() {
  const { toast } = useToast();
  const [state, setState] = useState({ status: 'loading', items: [], total: 0, error: '' });
  const [counts, setCounts] = useState({});
  const [tab, setTab] = useTabParam(TAB_KEYS, 'pending');
  const [page, setPage] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const { user } = useAuth();
  const canWrite = canWriteModule(user, 'refunds');
  const [rejecting, setRejecting] = useState(null);
  const [approving, setApproving] = useState(null);
  const busy = useRef(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    const { status } = TABS.find((t) => t.key === tab);
    let live = true;
    setReloading(true);
    listRefunds({ status, page, size: PAGE_SIZE, counts: true })
      .then((res) => {
        if (!live) return;
        if (res.counts) setCounts(res.counts);
        if (!res.items.length && page > 0 && res.total > 0) {
          setPage(Math.ceil(res.total / PAGE_SIZE) - 1);
          return;
        }
        setState({ status: 'ready', items: res.items, total: res.total, error: '' });
        setReloading(false);
      })
      .catch((e) => {
        if (!live) return;
        setState({ status: 'error', items: [], total: 0, error: e.message || 'Could not read the queue.' });
        setReloading(false);
      });
    return () => { live = false; };
  }, [tab, page]);

  useEffect(load, [load, nonce]);

  const reload = () => setNonce((n) => n + 1);
  const switchTab = (key) => { setTab(key); setPage(0); };

  const decide = async (r, act, reason) => {
    if (!canWrite || busy.current) return;
    busy.current = true;
    setBusyId(r.id);
    try {
      if (act === 'approve') {
        await approveRefund(r.id);
        toast('Refund approved');
      } else {
        await rejectRefund(r.id, reason);
        toast('Refund rejected', 'error');
      }
      setRejecting(null);
      setApproving(null);
      reload();
    } catch (e) {
      if (e.status === 409) toast('Already decided or under dispute', 'error');
      else if (e.code === 'refund_not_eligible') toast('The facts changed since the request, so it can no longer be refunded.', 'error');
      else toast(e.message || 'That decision was refused.', 'error');
      if (e.status === 409 || e.code === 'refund_not_eligible') {
        setRejecting(null);
        setApproving(null);
        reload();
      }
    } finally {
      busy.current = false;
      setBusyId(null);
    }
  };

  const paging = {
    page: page + 1,
    pageCount: Math.max(1, Math.ceil(state.total / PAGE_SIZE)),
    total: state.total,
    size: PAGE_SIZE,
    onPage: (p) => setPage(p - 1),
    stale: reloading,
  };

  if (state.status === 'error') {
    return (
      <div>
        <PageHeader title="Refunds" subtitle="Review refund requests, automatic refunds and disputes." />
        <div className="dz-card flex items-start gap-3 p-6 text-sm text-gray-300">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
          <div>
            <div className="font-semibold text-gray-100">The queue could not be read.</div>
            <p className="mt-1 max-w-2xl text-gray-400">{state.error}</p>
            <button type="button" onClick={reload} className="dz-btn dz-btn-ghost mt-3">
              <RefreshCw className="h-4 w-4" />Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'loading') return <Loading />;

  const signalChips = (r) => {
    if (r.status !== 'pending_review' || !r.signals) return null;
    const { refunds12m, linkedAccounts, contactsUsed, enquiries, pausedDuringWindow } = r.signals;
    const chip = (key, text, hot) => <span key={key} className={classNames(CHIP, hot ? CHIP_TONE.red : CHIP_TONE.neutral)}>{text}</span>;
    return [
      chip('r', `${refunds12m} refunds in 12 mo`, refunds12m >= 2),
      chip('l', `${linkedAccounts} linked ${linkedAccounts === 1 ? 'account' : 'accounts'}`, linkedAccounts > 1),
      chip('c', `${contactsUsed} contacts used`, false),
      chip('e', `${enquiries} enquiries`, false),
      pausedDuringWindow ? <span key="p" className={classNames(CHIP, CHIP_TONE.amber)}>Paused during guarantee window</span> : null,
    ];
  };

  const decisions = (r) => {
    if (!canWrite || r.status !== 'pending_review') return null;
    const off = busyId === r.id;
    return (
      <>
        <button type="button" disabled={off} onClick={() => setApproving(r)} className={classNames(BTN.primary, off && 'opacity-50')} data-testid="refund-approve">
          <Check className="h-3.5 w-3.5" />Approve
        </button>
        <button type="button" disabled={off} onClick={() => setRejecting(r)} className={classNames(BTN.ghost, off && 'opacity-50')} data-testid="refund-reject">
          <X className="h-3.5 w-3.5" />Reject
        </button>
      </>
    );
  };

  return (
    <div>
      <PageHeader title="Refunds" subtitle="Review refund requests, automatic refunds and disputes." />

      <QueueTabs
        label="Refund queues"
        active={tab}
        onChange={switchTab}
        tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.status] ?? null }))}
      />

      <QueuePanel
        active={tab}
        note={NOTE}
        toolbar={(
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={reload} className={BTN.ghost}><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
            <PageNav {...paging} />
          </div>
        )}
        footer={paging.pageCount > 1 ? <PageNav {...paging} /> : null}
      >
        <RowList isEmpty={!state.items.length} empty="No refunds here.">
          {state.items.map((r) => (
            <RowCard
              key={r.id}
              id={r.id}
              title={<>{r.customerName || 'Customer'} <span className="font-normal text-gray-500">·</span> {fmtINR(r.amount)}</>}
              badges={<span className={classNames(CHIP, STATUS_TONE[r.status] || CHIP_TONE.neutral)}>{STATUS_LABEL[r.status] || r.status}</span>}
              meta={<><span>{r.label}</span>{r.customerMobile ? <><Dot /><span className="tabular-nums" data-testid="customer-mobile">{r.customerMobile}</span></> : null}<Dot /><span className="font-mono">{r.orderRef}</span><Dot /><span>Requested {fmtDate(r.at)}</span></>}
              facts={(
                <>
                  {r.basis ? <FactRow label="Basis"><span className="col-span-full">{r.basis}</span></FactRow> : null}
                  <FactRow label="Reason"><span className="col-span-full">{r.customerReason || '—'}</span></FactRow>
                  {r.decidedAt ? <FactRow label="Decided"><span className="col-span-full">{fmtDate(r.decidedAt)}</span></FactRow> : null}
                  {r.creditNoteNo ? <FactRow label="Credit note"><span className="col-span-full font-mono">{r.creditNoteNo}</span></FactRow> : null}
                  {r.decisionReason ? <FactRow label="Decision"><span className="col-span-full">{r.decisionReason}</span></FactRow> : null}
                </>
              )}
              chips={signalChips(r)}
              primary={decisions(r)}
            />
          ))}
        </RowList>
      </QueuePanel>

      {canWrite && approving && (
        <ApproveModal row={approving} busy={busyId === approving.id} onClose={() => setApproving(null)} onConfirm={() => decide(approving, 'approve')} />
      )}
      {canWrite && rejecting && (
        <RejectModal row={rejecting} busy={busyId === rejecting.id} onClose={() => setRejecting(null)} onConfirm={(reason) => decide(rejecting, 'reject', reason)} />
      )}
    </div>
  );
}
