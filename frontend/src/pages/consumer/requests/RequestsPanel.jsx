import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import Icon from '../../../components/Icon.jsx';
import ConfirmModal from '../../../components/ui/ConfirmModal.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { myLeadNotes, saveLeadNote } from '../../../services/leadNoteService.js';
import { SubNav } from '../dashboard/components.jsx';
import LeadSheet from '../dashboard/LeadSheet.jsx';
import RequestCard from './RequestCard.jsx';
import { isPending, kindLabel, leadKey, messageOf, requestKey, withdrawCopy } from './requestMeta.js';
import { useRequestActions } from './useRequestActions.js';
import { useNow, useRequestsInbox } from './useRequestsInbox.js';

const TABS = [
  { key: 'all', label: 'All', icon: 'inbox', empty: 'No requests yet.' },
  { key: 'numbers', label: 'Number requests', icon: 'lock-keyhole', kinds: ['contact'], empty: 'No number requests yet.' },
  { key: 'photos', label: 'Photo requests', icon: 'image', kinds: ['photo'], empty: 'No photo requests yet.' },
  { key: 'documents', label: 'Documents', icon: 'folder-check', kinds: ['document'], empty: 'No document requests yet.' },
  { key: 'flatmate', label: 'Flatmate', icon: 'users', kinds: ['flatmate', 'group'], empty: 'No flatmate requests yet.' },
  { key: 'visits', label: 'Visits', icon: 'calendar-check', kinds: ['visit'], empty: 'No visit requests yet.' },
  { key: 'offers', label: 'Offers', icon: 'hand-coins', kinds: ['offer'], empty: 'No offers yet.' },
];

const CHAT_KINDS = new Set(['contact', 'flatmate', 'visit', 'offer']);

const inTab = (tab, row) => !tab.kinds || tab.kinds.includes(row.item.kind);

function Empty({ tab }) {
  return (
    <div className="pc-empty-list" data-testid="requests-empty">
      <p>{tab.empty}</p>
      <Link to="/listings">Browse listings</Link>
    </div>
  );
}

function useLeadNotes(toast) {
  const [notes, setNotes] = useState({});
  // Read synchronously so a follow-up saved right after a note blur merges onto that note, not the older one.
  const latest = useRef(notes);
  latest.current = notes;
  useEffect(() => {
    let live = true;
    myLeadNotes()
      .then((rows) => { if (live) setNotes(Object.fromEntries(rows.map((r) => [r.leadKey, r]))); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  // The endpoint takes the whole annotation, so the sheet's one-field patch is merged here.
  const save = async (key, patch) => {
    const merged = { note: null, followUpAt: null, ...latest.current[key], ...patch };
    latest.current = { ...latest.current, [key]: merged };
    try {
      const saved = await saveLeadNote(key, { note: merged.note, followUpAt: merged.followUpAt });
      setNotes((prev) => {
        const next = { ...prev };
        if (saved) next[key] = saved;
        else delete next[key];
        return next;
      });
    } catch {
      toast('That note did not save. Please try again.', 'error');
    }
  };
  return { notes, save };
}

const asLead = (item) => ({
  id: leadKey(item),
  name: item.party?.name || 'Someone',
  typeIcon: 'inbox',
  typeLabel: kindLabel(item),
  status: item.state,
  propLabel: item.target?.title || '',
  detail: messageOf(item),
  requestedAt: Date.parse(item.createdAt) || null,
});

export default function RequestsPanel({ onChanged }) {
  const { toast } = useToast();
  const inbox = useRequestsInbox();
  const actions = useRequestActions({ inbox, toast, onChanged });
  const leadNotes = useLeadNotes(toast);
  const [tabKey, setTabKey] = useState('all');
  const [confirming, setConfirming] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const now = useNow();
  const { received, sent } = inbox.boxes;

  const all = [
    ...received.items.map((item) => ({ item, box: 'received' })),
    ...sent.items.map((item) => ({ item, box: 'sent' })),
  ];
  const tab = TABS.find((t) => t.key === tabKey);
  const shown = all.filter((row) => inTab(tab, row));
  const open = shown.filter((row) => isPending(row.item));
  const past = shown.filter((row) => !isPending(row.item));
  const tabs = TABS.map((t) => ({ ...t, count: all.filter((row) => row.box === 'received' && isPending(row.item) && inTab(t, row)).length }));
  const loading = received.status === 'loading' || sent.status === 'loading';
  const failed = ['received', 'sent'].filter((b) => inbox.boxes[b].status === 'error');
  const settled = !loading && !failed.length;

  const confirmingItem = confirming ? sent.items.find((it) => requestKey(it) === confirming) : null;

  const confirmWithdraw = () => {
    setConfirming(null);
    if (confirmingItem) actions.remove(confirmingItem);
  };

  const renderCard = ({ item, box }) => (
    <RequestCard
      key={requestKey(item)}
      item={item}
      box={box}
      now={now}
      busy={actions.busy.has(requestKey(item))}
      note={box === 'received' ? leadNotes.notes[leadKey(item)] : undefined}
      onNote={box === 'received' ? (it) => setSheet(asLead(it)) : undefined}
      onDecide={actions.decide}
      onRemind={actions.remind}
      onWithdraw={(it) => setConfirming(requestKey(it))}
      onClear={actions.remove}
      onOpenChat={item.state === 'accepted' && CHAT_KINDS.has(item.kind) ? (box === 'sent' ? actions.openAccepted : actions.openReceived) : undefined}
      onChatFirst={box === 'received' ? actions.openReceived : undefined}
    />
  );

  return (
    <div className="pc-reqs" data-testid="requests-panel">
      <SubNav items={tabs} active={tabKey} onChange={setTabKey} variant="underline" />
      {loading && !shown.length ? Array.from({ length: 3 }, (_, i) => <div key={i} className="pc-skel pc-req-skel" />) : null}
      {failed.length ? (
        <div className="pc-empty-list">
          <p>Couldn't load requests</p>
          <button type="button" onClick={() => failed.forEach((b) => inbox.load(b))}>Retry</button>
        </div>
      ) : null}
      {settled && !shown.length ? <Empty tab={tab} /> : null}
      {open.map(renderCard)}
      {settled && !open.length && past.length ? <p className="py-6 text-center text-sm text-gray-500" data-testid="requests-caught-up">Nothing waiting on you.</p> : null}
      {past.length ? (
        <button
          type="button"
          onClick={() => setShowPast((v) => !v)}
          aria-expanded={showPast}
          aria-controls="requests-past"
          data-testid="requests-past-toggle"
          className="mt-1 mb-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 text-sm font-semibold text-gray-300 hover:bg-white/5"
        >
          {showPast ? 'Hide past requests' : `Show past requests (${past.length})`}
          <Icon name="chevron-down" className={'h-4 w-4 transition-transform' + (showPast ? ' rotate-180' : '')} />
        </button>
      ) : null}
      {showPast && past.length ? (
        <section id="requests-past" data-testid="requests-past">
          <h2 className="mb-3 mt-3 px-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">Past requests</h2>
          {past.map(renderCard)}
        </section>
      ) : null}
      {confirmingItem && isPending(confirmingItem) ? (
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
      {sheet ? (
        <LeadSheet
          key={sheet.id}
          lead={sheet}
          annotation={leadNotes.notes[sheet.id] || null}
          onClose={() => setSheet(null)}
          onSaveAnnotation={(patch) => leadNotes.save(sheet.id, patch)}
        />
      ) : null}
    </div>
  );
}
