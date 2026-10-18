import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import Icon from '../../../components/Icon.jsx';
import HScroll from '../../../components/ui/HScroll.jsx';
import PropertyImage from '../../../components/ui/PropertyImage.jsx';
import { lastAt, relTime } from '../../../lib/chatFormat.js';
import { fmtINR } from '../../../lib/format.js';
import ActionSheet from './ActionSheet.jsx';
import RequestsPanel from './RequestsPanel.jsx';
import { useRequestsInbox } from './useRequestsInbox.js';

const REQUESTS_REFRESH_MS = 60000;

const displayPrice = (p) => {
  if (!p?.price) return '';
  if (typeof p.price === 'string' && (p.price.includes('Cr') || p.price.includes('L') || p.price.includes('/mo') || p.price.includes(' '))) return p.price;
  const num = typeof p.price === 'number' ? p.price : parseInt(String(p.price).replace(/[^\d]/g, ''), 10);
  if (!num) return String(p.price);
  return p.deal === 'rent' ? `${fmtINR(num)}/mo` : fmtINR(num);
};

const lineOf = (c) => [c.property?.bhk, c.property?.loc, displayPrice(c.property)].filter(Boolean).join(' · ');
const isServerId = (id) => id && !String(id).startsWith('staged:');

export default function Inbox({
  t,
  items,
  activeId,
  tab,
  setTab,
  search,
  setSearch,
  onOpen,
  onRetry,
  onState,
  onBlock,
  onStagedChanged,
  initialBox,
  loading,
  error,
}) {
  const [archived, setArchived] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [swiped, setSwiped] = useState(null);
  const startX = useRef(0);
  const timer = useRef(null);
  const firstRun = useRef(true);
  const inbox = useRequestsInbox();
  const { load: loadRequests } = inbox;
  const { received } = inbox.boxes;
  const stagedCount = items.filter((c) => c.staged).length;
  const requests = received.status === 'ready' ? received.items.length : received.status === 'error' ? stagedCount : 0;
  const archivedCount = items.filter((c) => c.archived).length;
  const q = search.trim().toLowerCase();
  const onRequests = tab === 'requests';

  useEffect(() => {
    const skip = firstRun.current;
    firstRun.current = false;
    if (tab !== 'requests') return undefined;
    const refresh = () => {
      if (document.hidden) return;
      loadRequests('received', { quiet: true });
      loadRequests('sent', { quiet: true });
    };
    if (!skip) refresh();
    const poll = setInterval(refresh, REQUESTS_REFRESH_MS);
    return () => clearInterval(poll);
  }, [loadRequests, tab]);

  const visible = useMemo(() => {
    const base = items.filter((c) => archived ? c.archived : !c.archived)
      .filter((c) => !c.staged)
      .filter((c) => !q || c.party.name.toLowerCase().includes(q) || c.property.title.toLowerCase().includes(q));
    if (archived) return base;
    const pinned = base.filter((c) => c.awaitingReply && (c.unread || c.messages.at(-1)?.from === 'them')).slice(0, 3);
    const pinnedIds = new Set(pinned.map((c) => c.id));
    return [...pinned, ...base.filter((c) => !pinnedIds.has(c.id))];
  }, [archived, items, q]);

  const rowActions = (c) => [
    { label: c.archived ? 'Unarchive' : 'Archive', icon: 'archive', onClick: () => onState(c.id, { archived: !c.archived }) },
    { label: c.muted ? 'Unmute' : 'Mute', icon: c.muted ? 'bell' : 'bell-off', onClick: () => onState(c.id, { muted: !c.muted }) },
    isServerId(c.id) && { label: c.blocked ? 'Unblock' : 'Block', icon: 'ban', onClick: () => onBlock(c.id, !c.blocked) },
    isServerId(c.id) && { label: 'Report', icon: 'flag', danger: true, onClick: () => onOpen(c.id, { report: true }) },
  ];

  const start = (c, e) => {
    startX.current = e.clientX;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSheet(c), 520);
  };
  const end = (c, e) => {
    clearTimeout(timer.current);
    if (startX.current - e.clientX > 44) setSwiped(c.id);
  };

  return (
    <aside className="pc-list relative">
      <div className="pc-list-head">
        <h1>{archived && !onRequests ? 'Archived' : t('misc.msgMessages')}</h1>
        <HScroll role="tablist" aria-label={t('misc.msgFilters')} fadeColor="var(--brand-dark)" className="flex gap-1 sm:gap-2 border-b border-white/10">
          <button type="button" role="tab" aria-selected={tab === 'chats'} className={'dz-detail-tab' + (tab === 'chats' ? ' is-active' : '')} onClick={() => setTab('chats')}><Icon name="message-square" className="w-4 h-4" /> <span>Chats</span></button>
          <button type="button" role="tab" aria-selected={tab === 'requests'} className={'dz-detail-tab' + (tab === 'requests' ? ' is-active' : '')} onClick={() => setTab('requests')}><Icon name="inbox" className="w-4 h-4" /> <span>Requests</span> {requests > 0 && <span className="pc-reqbadge">{requests}</span>}</button>
        </HScroll>
        {!onRequests ? <div className="pc-search"><Icon name="search" className="w-4 h-4" /><input value={search} onChange={(e) => setSearch(e.target.value)} type="text" enterKeyHint="search" placeholder={t('misc.msgSearchPlaceholder')} aria-label={t('misc.msgSearchAria')} /></div> : null}
      </div>
      <div className="pc-convs">
        {onRequests ? (
          <RequestsPanel key={initialBox || 'auto'} inbox={inbox} convs={items} initialBox={initialBox} onOpenStaged={onOpen} onStagedChanged={onStagedChanged} />
        ) : null}
        {!onRequests && loading && Array.from({ length: 6 }, (_, i) => <div key={i} className="pc-conv pc-skel" />)}
        {!onRequests && !loading && error ? <div className="pc-empty-list"><p>Couldn't load chats</p><button type="button" onClick={onRetry}>Retry</button></div> : null}
        {!onRequests && !loading && !error && visible.length ? visible.map((c, index) => {
          const last = c.messages.at(-1);
          const fromMe = last?.from === 'me';
          const previewText = last?.attachments?.length && !last.text ? 'Photo' : last?.text;
          const preview = last ? `${fromMe ? t('misc.msgYouPrefix') : ''}${previewText}` : c.lastMessage;
          const listing = c.group ? t('misc.msgGroupMembers', { count: c.group.memberCount }) : c.property.title || lineOf(c);
          const pinned = !archived && tab === 'chats' && index < 3 && c.awaitingReply && (c.unread || last?.from === 'them');
          return (
            <div key={c.id} className={'pc-conv-wrap' + (swiped === c.id ? ' swiped' : '')} onPointerDown={(e) => start(c, e)} onPointerUp={(e) => end(c, e)} onPointerCancel={() => clearTimeout(timer.current)} onContextMenu={(e) => { e.preventDefault(); setSheet(c); }}>
              <button data-conversation-id={c.id} data-staged={c.staged ? 'true' : 'false'} className={'pc-conv' + (c.id === activeId ? ' active' : '')} onClick={() => onOpen(c.id)}>
                <div className="pc-conv-av"><ThreadAvatar c={c} />{c.group || c.propertyId ? <span className="pc-conv-badge">{c.party.avatar}</span> : null}</div>
                <div className="pc-conv-main">
                  {pinned ? <div className="pc-awaiting">Awaiting your reply</div> : null}
                  <div className="pc-conv-top"><span className="pc-conv-name">{c.party.name}</span><span className="pc-conv-time">{relTime(lastAt(c), c.time)}</span></div>
                  <div className="pc-conv-bot"><span className="pc-conv-last">{preview}</span>{fromMe ? <Icon name={last?.read || last?.delivered ? 'check-check' : 'check'} className={'pc-row-tick' + (last?.read ? ' read' : '')} /> : null}{c.unread ? <span className="pc-unread">{c.unread}</span> : c.muted ? <Icon name="bell-off" className="pc-muted" /> : c.staged ? <span className="pc-pill pend">Pending</span> : null}</div>
                  <div className="pc-conv-prop">{listing}</div>
                </div>
              </button>
              <div className="pc-row-actions"><button onClick={() => onState(c.id, { archived: !c.archived })}>{c.archived ? 'Unarchive' : 'Archive'}</button><button onClick={() => onState(c.id, { muted: !c.muted })}>{c.muted ? 'Unmute' : 'Mute'}</button></div>
            </div>
          );
        }) : null}
        {!onRequests && !loading && !error && !visible.length ? <div className="pc-empty-list"><p>No chats yet</p><span>When an owner accepts your request, your chat opens here.</span><Link to="/listings">Browse listings</Link></div> : null}
      </div>
      {!onRequests && !archived && archivedCount > 0 ? <button type="button" className="pc-archived-link" onClick={() => setArchived(true)}>Archived ({archivedCount})</button> : null}
      {!onRequests && archived ? <button type="button" className="pc-archived-link" onClick={() => setArchived(false)}>Back to inbox</button> : null}
      {sheet ? <ActionSheet title={sheet.party.name} actions={rowActions(sheet)} onClose={() => setSheet(null)} /> : null}
    </aside>
  );
}

export function ThreadAvatar({ c }) {
  if (c.group) return <div className="pc-av pc-av-initials"><Icon name="users-round" className="w-5 h-5" /></div>;
  if (!c.propertyId || !c.property?.img) return <div className="pc-av pc-av-initials">{c.party.avatar}</div>;
  return <PropertyImage className="pc-av" src={c.property.img} alt="" />;
}
