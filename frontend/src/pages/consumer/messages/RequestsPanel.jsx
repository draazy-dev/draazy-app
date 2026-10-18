import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Icon from '../../../components/Icon.jsx';
import ConfirmModal from '../../../components/ui/ConfirmModal.jsx';
import HScroll from '../../../components/ui/HScroll.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import RequestCard from './RequestCard.jsx';
import { requestKey, targetSlug, withdrawCopy } from './requestMeta.js';
import { useRequestActions } from './useRequestActions.js';

const BOXES = [
  { id: 'received', label: 'Received', icon: 'arrow-down-left', empty: 'No requests waiting for you.' },
  { id: 'sent', label: 'Sent', icon: 'arrow-up-right', empty: "You haven't sent any requests yet." },
];

function useNow(everyMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

function Segments({ box, onPick, receivedCount }) {
  return (
    <HScroll role="tablist" aria-label="Request direction" fadeColor="var(--brand-dark)" wrapClassName="mx-2 mb-2.5" className="flex gap-1 sm:gap-2 border-b border-white/10">
      {BOXES.map((b) => (
        <button
          key={b.id}
          type="button"
          role="tab"
          aria-selected={box === b.id}
          data-testid={`requests-box-${b.id}`}
          className={'dz-detail-tab' + (box === b.id ? ' is-active' : '')}
          onClick={() => onPick(b.id)}
        >
          <Icon name={b.icon} className="w-4 h-4" /> <span>{b.label}</span>
          {b.id === 'received' && receivedCount > 0 ? <span className="pc-seg-count">{receivedCount}</span> : null}
        </button>
      ))}
    </HScroll>
  );
}

function Empty({ box }) {
  const { empty } = BOXES.find((b) => b.id === box);
  return (
    <div className="pc-empty-list" data-testid="requests-empty">
      <p>{empty}</p>
      {box === 'sent' ? <Link to="/listings">Browse listings</Link> : null}
    </div>
  );
}

export default function RequestsPanel({ inbox, convs, initialBox = null, onOpenStaged, onStagedChanged }) {
  const { toast } = useToast();
  const actions = useRequestActions({ inbox, toast, onStagedChanged });
  const [chosen, setChosen] = useState(initialBox);
  const [confirming, setConfirming] = useState(null);
  const now = useNow();
  const { received } = inbox.boxes;

  if (chosen === null && received.status !== 'loading') setChosen(received.status === 'ready' && received.items.length ? 'received' : 'sent');
  const box = chosen ?? 'received';
  const { items, status } = inbox.boxes[box];

  const stagedFor = (item) => {
    if (box !== 'sent' || item.kind !== 'contact') return null;
    const keys = [item.target?.id, targetSlug(item)].filter(Boolean);
    return convs.find((c) => c.staged && keys.some((k) => c.propertyId === k || c.propertySlug === k)) || null;
  };

  const confirmingItem = confirming ? inbox.boxes.sent.items.find((it) => requestKey(it) === confirming) : null;

  const confirmWithdraw = () => {
    setConfirming(null);
    if (confirmingItem) actions.remove(confirmingItem);
  };

  return (
    <div className="pc-reqs" data-testid="requests-panel">
      <Segments box={box} onPick={setChosen} receivedCount={received.status === 'ready' ? received.items.length : 0} />
      {status === 'loading' ? Array.from({ length: 3 }, (_, i) => <div key={i} className="pc-skel pc-req-skel" />) : null}
      {status === 'error' ? (
        <div className="pc-empty-list"><p>Couldn't load requests</p><button type="button" onClick={() => inbox.load(box)}>Retry</button></div>
      ) : null}
      {status === 'ready' && !items.length ? <Empty box={box} /> : null}
      {status === 'ready' ? items.map((item) => {
        const staged = stagedFor(item);
        return (
          <RequestCard
            key={requestKey(item)}
            item={item}
            box={box}
            now={now}
            busy={actions.busy.has(requestKey(item))}
            onOpenStaged={staged ? () => onOpenStaged(staged.id) : null}
            onDecide={actions.decide}
            onRemind={actions.remind}
            onWithdraw={(it) => setConfirming(requestKey(it))}
            onClear={actions.remove}
          />
        );
      }) : null}
      {confirmingItem ? (
        <ConfirmModal
          title="Withdraw request?"
          message={withdrawCopy(confirmingItem)}
          confirmLabel="Withdraw"
          cancelLabel="Keep request"
          danger
          onConfirm={confirmWithdraw}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </div>
  );
}
