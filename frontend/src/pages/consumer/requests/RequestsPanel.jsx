import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
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
];

const CHAT_KINDS = new Set(['contact', 'flatmate']);

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
  const now = useNow();
  const { received, sent } = inbox.boxes;

  // Received holds only open requests, so listing it first puts everything awaiting you on top.
  const rows = [
    ...received.items.map((item) => ({ item, box: 'received' })),
    ...sent.items.map((item) => ({ item, box: 'sent' })),
  ];
  const tab = TABS.find((t) => t.key === tabKey);
  const shown = rows.filter((row) => inTab(tab, row));
  const tabs = TABS.map((t) => ({ ...t, count: rows.filter((row) => row.box === 'received' && inTab(t, row)).length }));
  const loading = received.status === 'loading' || sent.status === 'loading';
  const failed = ['received', 'sent'].filter((b) => inbox.boxes[b].status === 'error');

  const confirmingItem = confirming ? sent.items.find((it) => requestKey(it) === confirming) : null;

  const confirmWithdraw = () => {
    setConfirming(null);
    if (confirmingItem) actions.remove(confirmingItem);
  };

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
      {!loading && !failed.length && !shown.length ? <Empty tab={tab} /> : null}
      {shown.map(({ item, box }) => (
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
          onOpenChat={box === 'sent' && item.state === 'accepted' && CHAT_KINDS.has(item.kind) ? actions.openAccepted : undefined}
        />
      ))}
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
