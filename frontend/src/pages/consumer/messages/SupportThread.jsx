import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import Icon from '../../../components/Icon.jsx';
import Select from '../../../components/ui/Select.jsx';
import { MessageBubble } from '../../../components/chat/ChatPrimitives.jsx';
import { useSupportChat } from '../../../context/SupportChatContext.jsx';
import { getServiceRequest } from '../../../services/serviceRequestService.js';
import { getPropertyReview } from '../../../services/propertyReviewService.js';
import { getFlatmateCase } from '../../../services/flatmateService.js';
import { isActive, statusMeta } from '../../../lib/serviceRequestStatus.js';
import { detailPath } from '../flatmates/helpers.js';
import { REVIEW_STATUS_MAP } from '../dashboard/constants.js';
import PropChip from './PropChip.jsx';
import { useTargetCard } from './useTargetCard.js';
import { GENERAL, contextKey, contextMeta, parseContextKey } from '../../../lib/supportLink.js';
import { loadSupportChoices, servicePath } from './supportChat.js';

const noop = () => {};

function fallbackLabel(type, id) {
  if (type === GENERAL) return 'Something else';
  if (type === 'invoice') return `Invoice ${id}`;
  if (type === 'request') return 'Service request';
  if (type === 'identity') return 'Identity check';
  return 'A listing';
}

function defaultKey(chat) {
  const last = chat.messages[chat.messages.length - 1];
  const key = contextKey(last?.about);
  const open = chat.cases.find((c) => contextKey(c) === key);
  return key !== GENERAL && open?.replyable ? key : GENERAL;
}

function useRequest(about) {
  const [request, setRequest] = useState(null);
  const id = about.type === 'request' ? about.id : null;
  useEffect(() => {
    if (!id) return undefined;
    let live = true;
    getServiceRequest(id).then((r) => { if (live) setRequest(r); }, () => {});
    return () => { live = false; };
  }, [id]);
  return request && String(request.id).toLowerCase() === String(id).toLowerCase() ? request : null;
}

function useReview(kind, kase) {
  const [review, setReview] = useState(null);
  const key = kind && kase ? `${kind}:${kase.id}:${kase.status}` : null;
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    const load = kind === 'property' ? getPropertyReview(kase.id) : getFlatmateCase(kind, kase.id);
    load.then((r) => { if (live && r) setReview({ key, ...r }); }, () => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures kind, id and status
  }, [key]);
  return review?.key === key ? review : null;
}

function ReviewCard({ kind, kase }) {
  const review = useReview(kind, kase);
  const rs = kase ? REVIEW_STATUS_MAP[review?.status || kase.status] : null;
  if (!rs) return null;
  const open = (review?.checklist || []).filter((c) => !c.pass);
  return (
    <div className="pc-support-card" data-testid="support-review-card">
      <span className={'dz-tag border font-semibold ' + rs.cls}><Icon name={rs.icon} /> {rs.label}</span>
      {review?.reasonNote ? <p className="pc-support-note">{review.reasonNote}</p> : null}
      {open.length ? <ul className="pc-support-list">{open.map((c) => <li key={c.item}>{c.item}</li>)}</ul> : null}
    </div>
  );
}

function ContextCard({ t, about, label, kase, target, request }) {
  const kind = contextMeta(about.type).card;
  if (about.type === 'request') {
    if (!request) return null;
    const meta = statusMeta(request.status);
    return (
      <div className="pc-support-card row" data-testid="support-request-card">
        <Icon name="concierge-bell" className="w-4 h-4 text-teal-300" />
        <span className="pc-support-card-title">{request.service}</span>
        <span className="pc-support-chip" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
        <Link to={servicePath(request)}>Open tracker</Link>
      </div>
    );
  }
  if (!kind) return null;
  return (
    <>
      {target ? <PropChip t={t} propertyId={about.id} property={{ ...target, title: label }} href={kind === 'property' ? undefined : detailPath(kind, about.id)} canSchedule={false} /> : null}
      <ReviewCard kind={kind} kase={kase} />
    </>
  );
}

function Timeline({ messages, labelOf }) {
  let prev = null;
  return messages.map((m) => {
    const key = contextKey(m.about);
    const divider = key !== prev;
    prev = key;
    return (
      <Fragment key={m.id}>
        {divider ? (
          <div className="pc-support-about" data-testid="support-about-divider" data-context={key}>
            <Icon name={contextMeta(m.about.type).icon} className="w-3.5 h-3.5" /> {labelOf(m.about)}
          </div>
        ) : null}
        <MessageBubble m={m} author={m.from === 'them' && m.staffName ? m.staffName : null} onAction={noop} />
      </Fragment>
    );
  });
}

/** The user's one support chat. Each message carries the context picked in the About bar. */
export default function SupportThread({ t, user, contextKey: wanted, opened, onBack, onMinimize, onClose, visible = true }) {
  const { chat, status, reload, send, markRead } = useSupportChat(visible);
  const [choices, setChoices] = useState([]);
  const [picked, setPicked] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const listRef = useRef(null);
  const ready = status === 'ready';

  useEffect(() => {
    let live = true;
    loadSupportChoices(user).then((next) => { if (live) setChoices(next); });
    return () => { live = false; };
  }, [user]);

  useEffect(() => { setPicked(null); }, [wanted, opened]);

  useEffect(() => {
    if (visible && ready && chat.unread > 0) markRead();
  }, [visible, ready, chat.unread, markRead]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chat.messages.length, visible]);

  const selected = picked || wanted || (ready ? defaultKey(chat) : GENERAL);
  const about = parseContextKey(selected) || { type: GENERAL, id: null };
  const kase = chat.cases.find((c) => contextKey(c) === selected) || null;
  const target = useTargetCard(contextMeta(about.type).card, about.id);
  const request = useRequest(about);

  const labels = useMemo(() => {
    const map = new Map();
    chat.messages.forEach((m) => { if (m.about.label) map.set(contextKey(m.about), m.about.label); });
    choices.forEach((c) => map.set(contextKey(c), c.label));
    chat.cases.forEach((c) => { if (c.label) map.set(contextKey(c), c.label); });
    return map;
  }, [chat.messages, chat.cases, choices]);
  const labelOf = (a) => labels.get(contextKey(a)) || a.label
    || (contextKey(a) === selected ? target?.title : null) || fallbackLabel(a.type, a.id);
  const label = labelOf(about);

  const options = useMemo(() => {
    const rows = new Map();
    const add = (a) => {
      const key = contextKey(a);
      if (rows.has(key)) return;
      const meta = contextMeta(a.type);
      rows.set(key, { value: key, label: labelOf(a), sublabel: `· ${meta.group}`, icon: meta.icon });
    };
    chat.cases.filter((c) => c.replyable).forEach(add);
    choices.forEach(add);
    add(about);
    add({ type: GENERAL, id: null });
    return [...rows.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labelOf only reads labels and target
  }, [chat.cases, choices, labels, selected, target?.title]);

  // Finished requests drop out of chat.cases, so their closed state comes from the request itself.
  const closed = kase ? !kase.replyable : !!request && !isActive(request.status);

  const submit = async () => {
    const body = draft.trim();
    if (!body || sending || !ready) return;
    setSending(true);
    setSendError('');
    try {
      await send(body, about);
      setDraft('');
    } catch (err) {
      const gone = err?.status === 409;
      setSendError(gone ? 'That request is closed. Pick another subject or ask a general question.' : (err?.message || 'Message not sent. Please try again.'));
      if (gone) reload();
    } finally {
      setSending(false);
    }
  };

  const sub = chat.assignee ? `${chat.assignee.name} is helping you` : 'Usually replies within a few hours';

  return (
    <section className="pc-thread pc-support-thread" aria-labelledby="pc-support-name" data-testid="support-thread" data-topic={selected}>
      <div className="pc-chat">
        <div className="pc-sticky-top">
          <div className="pc-head">
            {onBack ? <button className="pc-back" onClick={onBack} aria-label={t('misc.msgBackAria')}><Icon name="arrow-left" className="w-5 h-5" /></button> : null}
            <div className="pc-head-av"><div className="pc-av pc-av-support"><Icon name="headset" className="w-5 h-5" /></div></div>
            <div className="pc-head-info">
              <p className="pc-head-name" id="pc-support-name">Draazy support</p>
              <p className="pc-head-sub off">{sub}</p>
            </div>
            {onMinimize ? <button type="button" className="pc-dock-btn" onClick={onMinimize} aria-label="Minimise chat"><Icon name="minus" className="w-4 h-4" /></button> : null}
            {onClose ? <button type="button" className="pc-dock-btn" onClick={onClose} aria-label="Close chat"><Icon name="x" className="w-4 h-4" /></button> : null}
          </div>
          <div className="pc-support-topic">
            <Select value={selected} onChange={setPicked} options={options} ariaLabel="What is this about?" prefix="About" size="sm" />
          </div>
          <ContextCard t={t} about={about} label={label} kase={kase} target={target} request={request} />
        </div>
        <div className="pc-msg-wrap">
          <div className="pc-msgs" ref={listRef} aria-live="polite">
            {status === 'error' ? (
              <div className="pc-empty-list"><p>Couldn&apos;t load this conversation</p><button type="button" onClick={reload}>Retry</button></div>
            ) : !ready ? (
              <div className="pc-support-hint">Loading…</div>
            ) : chat.messages.length ? <Timeline messages={chat.messages} labelOf={labelOf} /> : (
              <div className="pc-support-hint">
                <Icon name="headset" className="w-6 h-6" />
                <p>Ask us anything about your account, a listing, a payment or a request. We reply here.</p>
              </div>
            )}
          </div>
        </div>
        {closed ? (
          <div className="pc-wait" role="status" data-testid="support-closed">
            <Icon name="lock" className="w-4 h-4" /> This is closed.
            <button type="button" onClick={() => setPicked(GENERAL)}>Ask about something else</button>
          </div>
        ) : (
          <>
            {sendError ? <div className="pc-send-error">{sendError}</div> : null}
            <div className="pc-composer">
              <textarea
                className="pc-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
                rows={1}
                maxLength={4000}
                enterKeyHint="send"
                placeholder="Message Draazy support"
                aria-label="Message Draazy support"
              />
              <button className="pc-send" disabled={!draft.trim() || sending || !ready} onClick={submit} aria-label={t('misc.msgSendMessage')}>
                <Icon name={sending ? 'loader-2' : 'send'} className={'w-5 h-5' + (sending ? ' animate-spin' : '')} />
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
