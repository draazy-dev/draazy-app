import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowLeft, MessageSquare, RefreshCw } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import Loading from '../../../components/ui/Loading.jsx';
import Icon from '../../../components/Icon.jsx';
import StaffChatPanel, { aboutLabel } from '../../../components/admin/support-chat/StaffChatPanel.jsx';
import { BTN, CHIP, CHIP_TONE, PageNav, QueueTabs } from '../../../components/admin/WorkQueue.jsx';
import Select from '../../../components/ui/Select.jsx';
import { useStaffSupportChats } from '../../../context/StaffSupportChatContext.jsx';
import { listSupportChats } from '../../../services/supportService.js';
import { contextMeta, parseContextKey } from '../../../lib/supportLink.js';
import { classNames } from '../../../lib/format.js';
import { fmtAgo } from '../service-queue/helpers.js';

const SIZE = 30;
const CONTEXTS = [
  { value: '', label: 'All' },
  { value: 'property', label: 'Property' },
  { value: 'flatmate', label: 'Flatmates' },
  { value: 'request', label: 'Requests' },
  { value: 'identity', label: 'Identity' },
  { value: 'invoice', label: 'Payments' },
  { value: 'general', label: 'General' },
];
const EMPTY = {
  awaiting: 'Nobody is waiting on us. Every customer message has a reply.',
  mine: 'No chats are assigned to you.',
  all: 'No support chats yet.',
};

function ChatRow({ row, selected, onOpen }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(row.userId)}
        aria-current={selected ? 'true' : undefined}
        data-testid="support-chat-row"
        data-user={row.userId}
        className={classNames('flex w-full cursor-pointer gap-3 border-b border-white/[0.06] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]', selected && 'bg-white/[0.07]')}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-500/15 text-sm font-bold text-teal-200">{row.name.slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={classNames('truncate text-sm', row.staffUnread ? 'font-bold text-white' : 'font-medium text-gray-200')}>{row.name}</span>
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-gray-500">{fmtAgo(row.lastAt)}</span>
          </span>
          <span className={classNames('block truncate text-xs', row.staffUnread ? 'text-gray-200' : 'text-gray-400')}>
            {row.lastFrom === 'staff' ? 'Support: ' : ''}{row.lastPreview}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
            <span className={classNames(CHIP, CHIP_TONE.neutral)}><Icon name={contextMeta(row.lastAbout.type).icon} className="h-3 w-3" /> {aboutLabel(row.lastAbout)}</span>
            {row.status === 'awaiting' ? <span className={classNames(CHIP, CHIP_TONE.amber)}>Waiting</span> : null}
            <span className="truncate">{row.assignee ? `Handled by ${row.assignee.name}` : 'Unassigned'}</span>
          </span>
        </span>
        {row.staffUnread ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-teal" aria-label="Unread" /> : null}
      </button>
    </li>
  );
}

/** The one place staff read and answer customers: every support chat, with the open one beside the list. */
export default function SupportChatsInbox() {
  const [params, setParams] = useSearchParams();
  const { counts, pulse } = useStaffSupportChats();
  const full = !!counts.scope?.full;
  const views = full ? ['awaiting', 'mine', 'all'] : ['awaiting', 'all'];
  const view = views.includes(params.get('view')) ? params.get('view') : 'awaiting';
  const context = params.get('context') || '';
  const open = params.get('chat');
  const aboutKey = params.get('about');
  const openAbout = useMemo(() => (aboutKey ? parseContextKey(aboutKey) : null), [aboutKey]);
  const contexts = full ? CONTEXTS : CONTEXTS.filter((c) => !c.value || counts.scope?.contexts.includes(c.value));
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ status: 'loading', items: [], total: 0 });

  const setParam = (key, value) => setParams((p) => {
    const next = new URLSearchParams(p);
    if (value) next.set(key, value); else next.delete(key);
    if (key === 'chat') next.delete('about');
    return next;
  }, { replace: key !== 'chat' });

  const load = useCallback(async () => {
    try {
      const res = await listSupportChats({ view, context: context || undefined, page: page - 1, size: SIZE });
      setState({ status: 'ready', items: res.items, total: res.total });
    } catch (err) {
      console.warn('[support-chats] could not load the inbox', err);
      setState((s) => (s.status === 'ready' ? s : { status: 'error', items: [], total: 0 }));
    }
  }, [view, context, page]);

  useEffect(() => { setPage(1); }, [view, context]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!pulse.n) return;
    const row = pulse.row;
    const listed = row && state.items.find((r) => r.userId === row.userId);
    const sameSpot = listed && listed.lastAt === row.lastAt && listed.status === row.status
      && (listed.assignee?.id || null) === (row.assignee?.id || null);
    if (sameSpot) {
      setState((s) => ({ ...s, items: s.items.map((r) => (r.userId === row.userId ? row : r)) }));
    } else {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react once per pulse
  }, [pulse.n]);

  const tabs = [
    { key: 'awaiting', label: 'Waiting on us', count: counts.awaiting },
    { key: 'mine', label: 'Mine', count: counts.mine },
    { key: 'all', label: 'All', count: counts.all },
  ].filter((t) => views.includes(t.key));
  const pageCount = Math.max(1, Math.ceil(state.total / SIZE));

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[480px] flex-col">
      <PageHeader title="Support chats" subtitle="One chat per customer. Every message is tagged with what it is about." />
      <QueueTabs label="Support chat views" idPrefix="support-chats" active={view} onChange={(v) => setParam('view', v === 'awaiting' ? '' : v)} tabs={tabs} />

      <div className="dz-card flex min-h-0 flex-1 overflow-hidden p-0" id="support-chats-panel" role="tabpanel" aria-labelledby={`support-chats-tab-${view}`}>
        <aside className={classNames('flex min-h-0 w-full flex-col border-white/10 lg:w-[360px] lg:shrink-0 lg:border-r', open && 'hidden lg:flex')} aria-label="Support chats">
          <div className="flex items-center gap-2 border-b border-white/10 p-2.5">
            <Select value={context} onChange={(v) => setParam('context', v)} options={contexts} ariaLabel="About" prefix="About" size="sm" className="min-w-0 flex-1" />
            <button type="button" onClick={load} className={classNames(BTN.ghost, 'ml-auto')} aria-label="Refresh"><RefreshCw className="h-3.5 w-3.5" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {state.status === 'loading' ? <Loading label="Loading support chats…" /> : null}
            {state.status === 'error' ? (
              <div className="flex flex-col items-center gap-3 p-6 text-center">
                <p className="text-sm text-gray-300">We could not read the support chats. This is not an empty inbox — nothing was loaded.</p>
                <button type="button" onClick={load} className="dz-btn dz-btn-primary"><RefreshCw className="h-4 w-4" /> Try again</button>
              </div>
            ) : null}
            {state.status === 'ready' && !state.items.length ? <p className="p-6 text-center text-sm text-gray-400" data-testid="support-chats-empty">{EMPTY[view]}</p> : null}
            {state.status === 'ready' && state.items.length ? (
              <ul data-testid="support-chat-list">
                {state.items.map((row) => <ChatRow key={row.userId} row={row} selected={row.userId === open} onOpen={(id) => setParam('chat', id)} />)}
              </ul>
            ) : null}
          </div>
          {state.status === 'ready' && pageCount > 1 ? (
            <div className="flex justify-end border-t border-white/10 p-2"><PageNav page={page} pageCount={pageCount} total={state.total} size={SIZE} onPage={setPage} /></div>
          ) : null}
        </aside>

        <div className={classNames('min-h-0 flex-1 flex-col', open ? 'flex' : 'hidden lg:flex')}>
          {open ? (
            <>
              <button type="button" onClick={() => setParam('chat', '')} className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2 text-sm text-gray-300 lg:hidden">
                <ArrowLeft className="h-4 w-4" /> All chats
              </button>
              <div className="min-h-0 flex-1"><StaffChatPanel key={open} userId={open} initialAbout={openAbout} /></div>
            </>
          ) : (
            <div className="m-auto flex flex-col items-center gap-2 p-8 text-center text-sm text-gray-400">
              <MessageSquare className="h-8 w-8 text-gray-600" />
              Pick a chat to read and reply.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
