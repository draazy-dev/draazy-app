import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import Icon from '../../../components/Icon.jsx';
import PropertyImage from '../../../components/ui/PropertyImage.jsx';
import { lastAt, relTime } from '../../../lib/chatFormat.js';
import { fmtINR } from '../../../lib/format.js';
import { isPending, kindLabel, stateLabel, stateTone } from '../requests/requestMeta.js';
import ActionSheet from './ActionSheet.jsx';

const displayPrice = (p) => {
  if (!p?.price) return '';
  if (typeof p.price === 'string' && (p.price.includes('Cr') || p.price.includes('L') || p.price.includes('/mo') || p.price.includes(' '))) return p.price;
  const num = typeof p.price === 'number' ? p.price : parseInt(String(p.price).replace(/[^\d]/g, ''), 10);
  if (!num) return String(p.price);
  return p.deal === 'rent' ? `${fmtINR(num)}/mo` : fmtINR(num);
};

const lineOf = (c) => [c.property?.bhk, c.property?.loc, displayPrice(c.property)].filter(Boolean).join(' · ');
const isServerId = (id) => id && !/^(staged|request):/.test(String(id));
const matches = (q) => (c) => !q || c.party.name.toLowerCase().includes(q) || c.property.title.toLowerCase().includes(q);

function RequestRow({ c, active, onOpen }) {
  const item = c.request;
  const waiting = c.box === 'received' && isPending(item);
  return (
    <div className="pc-conv-wrap">
      <button data-conversation-id={c.id} data-request-kind={item.kind} data-request-box={c.box} className={'pc-conv' + (active ? ' active' : '')} onClick={() => onOpen(c.id)}>
        <div className="pc-conv-av"><div className="pc-av pc-av-initials">{c.party.avatar}</div></div>
        <div className="pc-conv-main">
          <div className="pc-conv-top"><span className="pc-conv-name">{c.party.name}</span><span className="pc-conv-time">{relTime(c.at)}</span></div>
          <div className="pc-conv-bot">
            <span className="pc-conv-last">{c.messages.at(-1).text}</span>
            {waiting ? <span className="pc-pill req">Request</span> : <span className={`pc-req-pill ${stateTone(item)}`}>{stateLabel(item)}</span>}
          </div>
          <div className="pc-conv-prop">{kindLabel(item)} · {c.property.title}</div>
        </div>
      </button>
    </div>
  );
}

export default function Inbox({
  t,
  items,
  requests,
  activeId,
  search,
  setSearch,
  onOpen,
  onRetry,
  onState,
  onBlock,
  loading,
  error,
}) {
  const [archived, setArchived] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [swiped, setSwiped] = useState(null);
  const [searching, setSearching] = useState(false);
  const searchOpen = searching || search !== '';
  const toggleSearch = () => {
    if (searchOpen) setSearch('');
    setSearching(!searchOpen);
  };
  const startX = useRef(0);
  const timer = useRef(null);
  const archivedCount = items.filter((c) => c.archived).length;
  const q = search.trim().toLowerCase();

  const visible = useMemo(() => {
    const base = items.filter((c) => archived ? c.archived : !c.archived)
      .filter((c) => !c.staged)
      .filter(matches(q));
    if (archived) return base;
    const pinned = base.filter((c) => c.awaitingReply && (c.unread || c.messages.at(-1)?.from === 'them')).slice(0, 3);
    const pinnedIds = new Set(pinned.map((c) => c.id));
    const rest = [...base.filter((c) => !pinnedIds.has(c.id)), ...requests.filter(matches(q))]
      .sort((a, b) => lastAt(b) - lastAt(a));
    return [...pinned, ...rest];
  }, [archived, items, q, requests]);

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
        <div className="pc-list-title">
          <h1>{archived ? 'Archived' : t('misc.msgMessages')}</h1>
          <button type="button" className="pc-hbtn relative tap-extend" aria-expanded={searchOpen} data-testid="msg-search-toggle"
            aria-label={searchOpen ? 'Close search' : 'Open search'} onClick={toggleSearch}>
            <Icon name={searchOpen ? 'x' : 'search'} className="w-5 h-5" />
          </button>
        </div>
        {searchOpen ? (
          <div className="pc-search"><Icon name="search" className="w-4 h-4" /><input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} type="text" enterKeyHint="search" placeholder={t('misc.msgSearchPlaceholder')} aria-label={t('misc.msgSearchAria')} /></div>
        ) : null}
      </div>
      <div className="pc-convs">
        {loading && Array.from({ length: 6 }, (_, i) => <div key={i} className="pc-conv pc-skel" />)}
        {!loading && error ? <div className="pc-empty-list"><p>Couldn't load chats</p><button type="button" onClick={onRetry}>Retry</button></div> : null}
        {!loading && !error && visible.length ? visible.map((c, index) => {
          if (c.request) return <RequestRow key={c.id} c={c} active={c.id === activeId} onOpen={onOpen} />;
          const last = c.messages.at(-1);
          const fromMe = last?.from === 'me';
          const previewText = last?.attachments?.length && !last.text ? 'Photo' : last?.text;
          const preview = last ? `${fromMe ? t('misc.msgYouPrefix') : ''}${previewText}` : c.lastMessage;
          const listing = c.group ? t('misc.msgGroupMembers', { count: c.group.memberCount }) : c.property.title || lineOf(c);
          const pinned = !archived && index < 3 && c.awaitingReply && (c.unread || last?.from === 'them');
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
        {!loading && !error && !visible.length ? <div className="pc-empty-list"><p>No chats yet</p><span>Requests you send or receive show up here, and become chats once accepted.</span><Link to="/listings">Browse listings</Link></div> : null}
      </div>
      {!archived && archivedCount > 0 ? <button type="button" className="pc-archived-link" onClick={() => setArchived(true)}>Archived ({archivedCount})</button> : null}
      {archived ? <button type="button" className="pc-archived-link" onClick={() => setArchived(false)}>Back to inbox</button> : null}
      {sheet ? <ActionSheet title={sheet.party.name} actions={rowActions(sheet)} onClose={() => setSheet(null)} /> : null}
    </aside>
  );
}

export function ThreadAvatar({ c }) {
  if (c.group) return <div className="pc-av pc-av-initials"><Icon name="users-round" className="w-5 h-5" /></div>;
  if (!c.propertyId || !c.property?.img) return <div className="pc-av pc-av-initials">{c.party.avatar}</div>;
  return <PropertyImage className="pc-av" src={c.property.img} alt="" />;
}
