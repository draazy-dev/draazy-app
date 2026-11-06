import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Minus, Send, Ticket, UserCheck, X } from 'lucide-react';
import Icon from '../../Icon.jsx';
import Select from '../../ui/Select.jsx';
import ServiceTicketForm from './ServiceTicketForm.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useStaffSupportChats } from '../../../context/StaffSupportChatContext.jsx';
import {
  assignSupportChat, getStaffSupportChat, markStaffSupportChatRead, replyToSupportChat, resolveSupportChat,
} from '../../../services/supportService.js';
import { GENERAL, contextKey, contextMeta, parseContextKey } from '../../../lib/supportLink.js';
import { classNames } from '../../../lib/format.js';
import { fmtAgo } from '../../../pages/ops/service-queue/helpers.js';
import { BTN, CHIP, CHIP_TONE } from '../WorkQueue.jsx';

const POLL_MS = 15000;
const STATUS = {
  awaiting: { label: 'Waiting on us', tone: CHIP_TONE.amber },
  answered: { label: 'Answered', tone: CHIP_TONE.teal },
  resolved: { label: 'Resolved', tone: CHIP_TONE.neutral },
};

export const aboutLabel = (a) => a.label || (a.type === GENERAL ? 'General' : contextMeta(a.type).group);

function useStaffChat(userId) {
  const { pulse } = useStaffSupportChats();
  const [chat, setChat] = useState(null);
  const [error, setError] = useState(false);
  const seen = useRef(0);

  const load = useCallback(async () => {
    try {
      const next = await getStaffSupportChat(userId);
      setChat(next);
      setError(false);
      const last = next.messages[next.messages.length - 1];
      if (last?.from === 'them' && next.messages.length !== seen.current) {
        markStaffSupportChatRead(userId).catch((err) => console.warn('[support-chats] mark read failed', err));
      }
      seen.current = next.messages.length;
    } catch (err) {
      console.warn('[support-chats] could not load chat', err);
      setError(true);
    }
  }, [userId]);

  useEffect(() => {
    setChat(null);
    seen.current = 0;
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!pulse.n || (pulse.userId && pulse.userId !== String(userId))) return;
    const row = pulse.row;
    // Our own mark-read echoes back as a pulse; reload only when the row shows something we don't have.
    const stale = !row || !chat || row.lastAt > chat.at || row.status !== chat.status
      || (row.assignee?.id || null) !== (chat.assignee?.id || null);
    if (stale) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload once per pulse, not when load's identity changes
  }, [pulse.n]);

  return { chat, setChat, error, load };
}

function Timeline({ messages }) {
  let prev = null;
  return messages.map((m) => {
    const key = contextKey(m.about);
    const divider = key !== prev;
    prev = key;
    const staff = m.from === 'me';
    return (
      <Fragment key={m.id}>
        {divider ? (
          <li className="flex max-w-[90%] shrink-0 items-center gap-1.5 self-center rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold text-gray-300" data-testid="staff-chat-about">
            <Icon name={contextMeta(m.about.type).icon} className="h-3.5 w-3.5 shrink-0 text-teal-300" />
            <span className="truncate">{aboutLabel(m.about)}</span>
          </li>
        ) : null}
        <li className={classNames('max-w-[85%] rounded-2xl px-3 py-2 text-sm', staff ? 'self-end bg-teal-500/15 text-teal-50' : 'self-start bg-white/[0.06] text-gray-100')} data-testid="staff-chat-msg">
          <div className="whitespace-pre-wrap break-words">{m.text}</div>
          <div className="mt-0.5 text-[10.5px] text-gray-400">{staff ? `${m.staffName || 'Support'} · ` : ''}{fmtAgo(m.at)}</div>
        </li>
      </Fragment>
    );
  });
}

/** One customer's support chat as staff see it: who they are, what is open for them, and every message in order. */
export default function StaffChatPanel({ userId, initialAbout = null, compact = false, onClose, onMinimize }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { refreshCounts, counts } = useStaffSupportChats();
  const full = !!counts.scope?.full;
  const { chat, setChat, error, load } = useStaffChat(userId);
  const startKey = initialAbout ? contextKey(initialAbout) : null;
  const [picked, setPicked] = useState(startKey);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [ticketing, setTicketing] = useState(false);
  const listRef = useRef(null);

  useEffect(() => { setPicked(startKey); }, [userId, startKey]);
  useEffect(() => { setDraft(''); setTicketing(false); }, [userId]);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [chat?.messages.length]);

  const lastAsked = chat?.messages.slice().reverse().find((m) => m.from === 'them');
  const options = useMemo(() => {
    const rows = new Map();
    const add = (a) => {
      const key = contextKey(a);
      if (!rows.has(key)) rows.set(key, { value: key, label: aboutLabel(a), sublabel: `· ${contextMeta(a.type).group}`, icon: contextMeta(a.type).icon });
    };
    (chat?.cases || []).filter((c) => c.replyable).forEach(add);
    (chat?.messages || []).slice().reverse().forEach((m) => add(m.about));
    if (initialAbout) add(initialAbout);
    if (full) add({ type: GENERAL, id: null });
    return [...rows.values()];
  }, [chat, full, initialAbout]);
  const selected = picked || (lastAsked || full ? contextKey(lastAsked?.about) : options[0]?.value);

  const act = async (fn, okMsg) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast(okMsg, 'success');
      await load();
      refreshCounts();
    } catch (err) {
      toast(err?.message || 'That did not go through. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    act(async () => {
      const msg = await replyToSupportChat(userId, text, parseContextKey(selected));
      setChat((c) => (c ? { ...c, messages: [...c.messages, msg] } : c));
      setDraft('');
    });
  };

  if (error && !chat) {
    return <div className="p-6 text-center text-sm text-gray-300">We could not open this chat. <button type="button" className="underline" onClick={load}>Try again</button></div>;
  }
  if (!chat) return <div className="p-6 text-center text-sm text-gray-400">Loading the chat…</div>;

  const mine = chat.assignee?.id && String(chat.assignee.id) === String(user?.id);
  const status = STATUS[chat.status] || STATUS.awaiting;

  return (
    <section className="flex h-full min-h-0 flex-col" data-testid="staff-chat" data-user={userId} aria-label={`Support chat with ${chat.user.name}`}>
      <header className="flex items-start gap-2 border-b border-white/10 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-white" data-testid="staff-chat-name">{chat.user.name}</span>
            {chat.user.idVerified ? <span className={classNames(CHIP, CHIP_TONE.green)}>ID verified</span> : null}
          </div>
          <div className="truncate text-[11.5px] text-gray-400">
            <span className="tabular-nums">{chat.user.mobile}</span>
            {chat.user.roles.length ? ` · ${chat.user.roles.join(', ')}` : ''}
          </div>
        </div>
        {onMinimize ? <button type="button" onClick={onMinimize} aria-label="Minimise chat" className="rounded-md p-1 text-gray-400 hover:bg-white/5 hover:text-white"><Minus className="h-4 w-4" /></button> : null}
        {onClose ? <button type="button" onClick={onClose} aria-label="Close chat" className="rounded-md p-1 text-gray-400 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button> : null}
      </header>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 px-3 py-2 text-xs">
        <span className={classNames(CHIP, status.tone)} data-testid="staff-chat-status">{status.label}</span>
        <span className="text-gray-400" data-testid="staff-chat-owner">{chat.assignee ? (mine ? 'Handled by you' : `Handled by ${chat.assignee.name}`) : 'Unassigned'}</span>
        <span className="ml-auto flex gap-1.5">
          {full ? (
            <button type="button" onClick={() => setTicketing((t) => !t)} aria-expanded={ticketing} className={BTN.ghost} data-testid="staff-chat-ticket">
              <Ticket className="h-3.5 w-3.5" />Service ticket
            </button>
          ) : null}
          {full && !mine ? (
            <button type="button" disabled={busy} onClick={() => act(() => assignSupportChat(userId, user?.id), chat.assignee ? 'You took over this chat' : 'Assigned to you')} className={BTN.ghost}>
              <UserCheck className="h-3.5 w-3.5" />{chat.assignee ? 'Take over' : 'Assign to me'}
            </button>
          ) : null}
          {full && chat.status !== 'resolved' ? (
            <button type="button" disabled={busy} onClick={() => act(() => resolveSupportChat(userId), 'Chat resolved')} className={BTN.ghost} data-testid="staff-chat-resolve">
              <CheckCircle2 className="h-3.5 w-3.5" />Resolve
            </button>
          ) : null}
        </span>
      </div>

      {ticketing ? (
        <ServiceTicketForm
          userId={userId}
          name={chat.user.name}
          propertyId={parseContextKey(selected)?.type === 'property' ? parseContextKey(selected).id : null}
          onDone={() => setTicketing(false)}
        />
      ) : null}

      {!ticketing && !compact && chat.cases.length ? (
        <div className="flex flex-wrap gap-1.5 border-b border-white/10 px-3 py-2" data-testid="staff-chat-cases">
          {chat.cases.map((c) => (
            <button key={contextKey(c)} type="button" disabled={!c.replyable} onClick={() => setPicked(contextKey(c))} className={classNames(CHIP, c.replyable ? CHIP_TONE.sky : CHIP_TONE.neutral, 'cursor-pointer disabled:cursor-default')}>
              <Icon name={contextMeta(c.type).icon} className="h-3 w-3" /> {c.label || contextMeta(c.type).group} · {c.status.replace(/_/g, ' ').toLowerCase()}
            </button>
          ))}
        </div>
      ) : null}

      <ul ref={listRef} className={classNames('min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-3', ticketing ? 'hidden' : 'flex')} aria-live="polite">
        {chat.messages.length ? <Timeline messages={chat.messages} /> : <li className="m-auto text-sm text-gray-500">No messages yet.</li>}
      </ul>

      <div className={classNames('space-y-2 border-t border-white/10 p-2.5', ticketing && 'hidden')}>
        <Select value={selected} onChange={setPicked} options={options} ariaLabel="Reply about" prefix="About" size="sm" />
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            rows={compact ? 1 : 2}
            maxLength={4000}
            placeholder={`Reply to ${chat.user.name}…`}
            aria-label="Reply to the customer"
            data-testid="staff-chat-input"
            className="dz-input min-h-0 flex-1 resize-none py-2 text-sm"
          />
          <button type="button" onClick={send} disabled={!draft.trim() || busy} aria-label="Send reply" data-testid="staff-chat-send" className="dz-btn dz-btn-primary self-end disabled:opacity-40">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
