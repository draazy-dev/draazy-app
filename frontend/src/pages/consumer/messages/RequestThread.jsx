import { useEffect, useState } from 'react';
import Icon from '../../../components/Icon.jsx';
import ConfirmModal from '../../../components/ui/ConfirmModal.jsx';
import { MessageBubble } from '../../../components/chat/ChatPrimitives.jsx';
import { getProperty } from '../../../services/propertyService.js';
import { RequestActions, Target } from '../requests/RequestCard.jsx';
import { isPending, kindLabel, requestKey, withdrawCopy } from '../requests/requestMeta.js';
import { useNow } from '../requests/useRequestsInbox.js';
import PropChip from './PropChip.jsx';

const RECEIVED_HINT = {
  contact: 'Approving shares your number and opens the chat.',
  flatmate: 'Accepting opens the chat.',
  group: 'Accepting adds them to your group.',
};

const noop = () => {};

const toCard = (p) => (p
  ? { title: p.title, img: p.image, price: p.price, deal: p.deal, bhk: p.bhk, loc: p.locality, available: true }
  : { available: false });

function useTargetCard(target) {
  const id = target?.type === 'property' ? target.id : null;
  const [card, setCard] = useState(null);
  useEffect(() => {
    if (!id) return undefined;
    let live = true;
    getProperty(id).then((p) => { if (live) setCard({ id, ...toCard(p) }); }, () => {}); // a failed read keeps the title-only chip
    return () => { live = false; };
  }, [id]);
  if (!id) return null;
  const loaded = card?.id === id ? card : null;
  return { title: target.title, ...loaded };
}

export default function RequestThread({ t, thread, actions, onBack }) {
  const [confirming, setConfirming] = useState(false);
  const now = useNow();
  const { request: item, box } = thread;
  const hint = box === 'received' ? RECEIVED_HINT[item.kind] : isPending(item) ? 'The chat opens once they accept.' : '';
  const canOpenChat = box === 'sent' && item.state === 'accepted' && item.kind !== 'group';
  const property = useTargetCard(item.target);

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
            <PropChip t={t} propertyId={item.target.id} property={property} canSchedule={box === 'sent' && property.available === true} />
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
            onOpenChat={canOpenChat ? actions.openAccepted : undefined}
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
