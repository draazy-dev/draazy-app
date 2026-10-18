import { Link } from 'react-router';
import Button from '../../../components/ui/Button.jsx';
import Icon from '../../../components/Icon.jsx';
import { relTime } from '../../../lib/chatFormat.js';
import { initialsOf, isPending, kindLabel, messageOf, remindState, stateLabel } from './requestMeta.js';

const ACCEPT_LABEL = {
  contact: 'Approve & chat',
  visit: 'Confirm',
  photo: 'Photos added',
  flatmate: 'Accept',
  group: 'Accept',
};

const PILL_TONE = { pending: 'pend', accepted: 'ok', declined: 'no', expired: 'muted', withdrawn: 'muted' };

function Target({ item, onOpenStaged }) {
  const title = item.target?.title || 'Listing';
  if (onOpenStaged) {
    return (
      <button type="button" className="pc-req-target" onClick={onOpenStaged} aria-label={`Open your chat draft about ${title}`}>
        {title}
      </button>
    );
  }
  return item.target?.link ? <Link to={item.target.link} className="pc-req-target">{title}</Link> : <span className="pc-req-target">{title}</span>;
}

function ReceivedActions({ item, busy, onDecide }) {
  if (!isPending(item)) return null;
  return (
    <div className="pc-req-actions">
      <Button size="md" className="pc-req-btn" disabled={busy} onClick={() => onDecide(item, true)}>{ACCEPT_LABEL[item.kind]}</Button>
      <Button size="md" variant="secondary" className="pc-req-btn" disabled={busy} onClick={() => onDecide(item, false)}>Decline</Button>
    </div>
  );
}

function SentActions({ item, busy, now, onRemind, onWithdraw, onClear }) {
  if (!isPending(item)) {
    return (
      <div className="pc-req-actions">
        <button type="button" className="pc-req-clear" disabled={busy} onClick={() => onClear(item)}>Clear</button>
      </div>
    );
  }
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

export default function RequestCard({ item, box, now, busy, onOpenStaged, onDecide, onRemind, onWithdraw, onClear }) {
  const name = item.party?.name || 'Someone';
  const reminded = box === 'received' && (item.reminders?.count || 0) > 0;
  const created = Date.parse(item.createdAt);
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
            <span className="dz-tag dz-tag--muted" data-testid="request-kind">{kindLabel(item)}</span>
            {reminded ? <span className="dz-tag dz-tag--muted" data-testid="request-reminded">Reminded</span> : null}
            {box === 'sent' ? <span className={`pc-req-pill ${PILL_TONE[item.state] || 'muted'}`} data-testid="request-state">{stateLabel(item)}</span> : null}
          </div>
        </div>
      </div>
      <Target item={item} onOpenStaged={onOpenStaged} />
      <p className="pc-req-msg">{messageOf(item)}</p>
      {box === 'received'
        ? <ReceivedActions item={item} busy={busy} onDecide={onDecide} />
        : <SentActions item={item} busy={busy} now={now} onRemind={onRemind} onWithdraw={onWithdraw} onClear={onClear} />}
    </article>
  );
}
