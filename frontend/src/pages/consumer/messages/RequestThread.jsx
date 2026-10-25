import { useState } from 'react';
import Icon from '../../../components/Icon.jsx';
import ConfirmModal from '../../../components/ui/ConfirmModal.jsx';
import { MessageBubble } from '../../../components/chat/ChatPrimitives.jsx';
import { RequestActions, Target } from '../requests/RequestCard.jsx';
import { isGroupJoin, isPending, kindLabel, requestKey, withdrawCopy } from '../requests/requestMeta.js';
import { useNow } from '../requests/useRequestsInbox.js';
import PropChip from './PropChip.jsx';
import { useTargetCard } from './useTargetCard.js';

const RECEIVED_HINT = {
  contact: 'Approving shares your number and opens the chat.',
  flatmate: 'Accepting opens the chat.',
  group: 'Accepting adds them to your group.',
};
const GROUP_JOIN_HINT = { received: 'Chat first to check the vibe. Accepting adds them to your group.', sent: 'The host may message you before deciding.' };

const noop = () => {};

export default function RequestThread({ t, thread, actions, onBack }) {
  const [confirming, setConfirming] = useState(false);
  const now = useNow();
  const { request: item, box } = thread;
  const hint = !isPending(item) ? ''
    : isGroupJoin(item) ? GROUP_JOIN_HINT[box]
      : box === 'received' ? RECEIVED_HINT[item.kind] : 'The chat opens once they accept.';
  const canOpenChat = item.state === 'accepted' && item.kind !== 'group';
  const targetKind = item.target?.type === 'flatmate-post' ? 'post' : item.target?.type;
  const property = useTargetCard(targetKind, item.target?.id, item.target?.title);
  const isListing = targetKind === 'property';

  return (
    <section className="pc-thread pc-req-thread-view" aria-labelledby="pc-req-thread-name" data-testid="request-thread" data-kind={item.kind} data-state={item.state} data-box={box}>
      <div className="pc-chat">
        <div className="pc-sticky-top">
          <div className="pc-head">
            <button className="pc-back" onClick={onBack} aria-label={t('misc.msgBackAria')}><Icon name="arrow-left" className="w-5 h-5" /></button>
            <div className="pc-head-av"><div className="pc-av pc-av-initials">{thread.party.avatar}</div></div>
            <div className="pc-head-info">
              <p className="pc-head-name" id="pc-req-thread-name">{thread.party.name}</p>
              <p className="pc-head-sub off">{kindLabel(item)}</p>
            </div>
          </div>
          {property ? (
            <PropChip t={t} propertyId={item.target.id} property={property} href={isListing ? undefined : item.target.link} canSchedule={isListing && box === 'sent' && property.available === true} />
          ) : <div className="pc-req-thread"><Target item={item} /></div>}
        </div>
        <div className="pc-msg-wrap">
          <div className="pc-msgs">
            {thread.messages.map((m) => <MessageBubble key={m.id} m={m} onAction={noop} />)}
          </div>
        </div>
        <div className="pc-req-bar">
          {hint ? <p className="pc-req-bar-note">{hint}</p> : null}
          <RequestActions
            item={item}
            box={box}
            busy={actions.busy.has(requestKey(item))}
            now={now}
            onDecide={actions.decide}
            onRemind={actions.remind}
            onWithdraw={() => setConfirming(true)}
            onClear={actions.remove}
            onOpenChat={canOpenChat ? (box === 'sent' ? actions.openAccepted : actions.openReceived) : undefined}
            onChatFirst={actions.openReceived}
          />
        </div>
      </div>
      {confirming && isPending(item) ? (
        <ConfirmModal
          title="Withdraw request?"
          message={withdrawCopy(item)}
          confirmLabel="Withdraw"
          cancelLabel="Keep request"
          danger
          onConfirm={() => { setConfirming(false); actions.remove(item); }}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </section>
  );
}
