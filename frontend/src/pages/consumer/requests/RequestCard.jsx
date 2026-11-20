import { Link } from 'react-router';
import '../../../styles/routes/messages.css';
import Button from '../../../components/ui/Button.jsx';
import Icon from '../../../components/Icon.jsx';
import { relTime } from '../../../lib/chatFormat.js';
import { initialsOf, isGroupJoin, isPending, kindLabel, messageOf, remindState, shareLabel, stateLabel, stateTone } from './requestMeta.js';

const ACCEPT_LABEL = {
  contact: 'Approve & chat',
  visit: 'Confirm & chat',
  photo: 'Photos added',
  flatmate: 'Accept & chat',
  group: 'Accept',
  document: 'Share',
  offer: 'Accept & chat',
};

export function Target({ item }) {
  const title = item.target?.title || 'Listing';
  return item.target?.link ? <Link to={item.target.link} className="pc-req-target">{title}</Link> : <span className="pc-req-target">{title}</span>;
}

function NoteLine({ note, onNote }) {
  const followUp = note?.followUpAt ? new Date(note.followUpAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
  return (
    <button type="button" className="pc-req-note" onClick={onNote} data-testid="request-note">
      <Icon name="pencil" className="w-3.5 h-3.5 shrink-0" />
      <span>{note?.note || 'Add a private note'}</span>
      {followUp ? <span className="pc-req-pill pend" data-testid="request-follow-up"><Icon name="calendar-clock" className="inline w-3 h-3" /> {followUp}</span> : null}
    </button>
  );
}

function DecidedActions({ item, busy, onClear, onOpenChat }) {
  return (
    <div className="pc-req-actions">
      {onOpenChat ? <Button size="md" className="pc-req-btn" disabled={busy} onClick={() => onOpenChat(item)}>Open chat</Button> : null}
      <button type="button" className="pc-req-clear" disabled={busy} onClick={onClear}>Clear</button>
    </div>
  );
}

function ReceivedActions({ item, busy, onDecide, onClear, onOpenChat, onChatFirst }) {
  if (!isPending(item)) return <DecidedActions item={item} busy={busy} onClear={() => onClear(item, 'received')} onOpenChat={onOpenChat} />;
  const vet = onChatFirst && isGroupJoin(item);
  return (
    <div className="pc-req-actions">
      {vet ? <Button size="md" className="pc-req-btn" disabled={busy} onClick={() => onChatFirst(item)}>Chat first</Button> : null}
      <Button size="md" variant={vet ? 'secondary' : 'primary'} className="pc-req-btn" disabled={busy} onClick={() => onDecide(item, true)}>{isGroupJoin(item) ? 'Accept' : ACCEPT_LABEL[item.kind]}</Button>
      <Button size="md" variant="secondary" className="pc-req-btn" disabled={busy} onClick={() => onDecide(item, false)}>Decline</Button>
      {item.kind === 'photo' && item.target?.id ? <Link to={`/list-property?edit=${item.target.id}&step=photos`} className="pc-req-clear">Add photos</Link> : null}
      {item.kind === 'offer' && item.target?.link ? <Link to={item.target.link} className="pc-req-clear" data-testid="request-counter">Counter</Link> : null}
    </div>
  );
}

function SentActions({ item, busy, now, onRemind, onWithdraw, onClear, onOpenChat }) {
  if (item.state === 'countered' && item.target?.link) {
    return <div className="pc-req-actions"><Button size="md" className="pc-req-btn" to={item.target.link} data-testid="request-respond">Respond</Button></div>;
  }
  if (!isPending(item)) return <DecidedActions item={item} busy={busy} onClear={() => onClear(item)} onOpenChat={onOpenChat} />;
  const remind = remindState(item, now);
  return (
    <div className="pc-req-actions">
      {remind ? (
        <Button size="md" className="pc-req-btn" disabled={busy || !remind.enabled} onClick={() => onRemind(item)}>{remind.label}</Button>
      ) : null}
      <Button size="md" variant="secondary" className="pc-req-btn" disabled={busy} onClick={() => onWithdraw(item)}>Withdraw</Button>
    </div>
  );
}

export function RequestActions({ item, box, ...handlers }) {
  return box === 'received' ? <ReceivedActions item={item} {...handlers} /> : <SentActions item={item} {...handlers} />;
}

export default function RequestCard({ item, box, now, busy, note, onNote, onDecide, onRemind, onWithdraw, onClear, onOpenChat, onChatFirst }) {
  const name = item.party?.name || 'Someone';
  const reminded = box === 'received' && isPending(item) && (item.reminders?.count || 0) > 0;
  const created = Date.parse(item.createdAt);
  const share = shareLabel(item.share);
  return (
    <article
      className="pc-req"
      data-testid="request-card"
      data-kind={item.kind}
      data-state={item.state}
      data-box={box}
      aria-busy={busy || undefined}
      aria-label={`${kindLabel(item)} ${box === 'sent' ? 'to' : 'from'} ${name}, ${item.target?.title || 'Listing'}`}
    >
      <div className="pc-req-head">
        <div className="pc-av pc-av-initials pc-req-av" aria-hidden="true">{initialsOf(name)}</div>
        <div className="pc-req-who">
          <div className="pc-conv-top">
            <span className="pc-conv-name">
              {name}
              {item.party?.verified ? <Icon name="badge-check" className="pc-req-ver" aria-label="Verified" /> : null}
            </span>
            <span className="pc-conv-time">{relTime(created)}</span>
          </div>
          <div className="pc-req-tags">
            <span className={`pc-req-dir ${box}`} data-testid="request-direction">
              <Icon name={box === 'sent' ? 'arrow-up-right' : 'arrow-down-left'} className="w-3 h-3" aria-hidden="true" />
              {box === 'sent' ? 'Sent' : 'Received'}
            </span>
            <span className="dz-tag dz-tag--muted" data-testid="request-kind">{kindLabel(item)}</span>
            {share ? <span className="dz-tag border border-teal-400/25 bg-teal-400/10 font-semibold text-teal-200" data-testid="request-share">{share}</span> : null}
            {reminded ? <span className="dz-tag dz-tag--muted" data-testid="request-reminded">Reminded</span> : null}
            {box === 'sent' || !isPending(item) ? <span className={`pc-req-pill ${stateTone(item)}`} data-testid="request-state">{stateLabel(item)}</span> : null}
          </div>
        </div>
      </div>
      <Target item={item} />
      <p className="pc-req-msg">{messageOf(item)}</p>
      {onNote ? <NoteLine note={note} onNote={() => onNote(item)} /> : null}
      <RequestActions item={item} box={box} busy={busy} now={now} onDecide={onDecide} onRemind={onRemind} onWithdraw={onWithdraw} onClear={onClear} onOpenChat={onOpenChat} onChatFirst={onChatFirst} />
    </article>
  );
}
