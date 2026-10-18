import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import { useAppFlags } from '../../../context/AppFlagsContext.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useTapPop } from '../../../lib/useTapPop.js';
import { openFlatmateRequestConversation } from '../../../services/conversationService.js';

const ASK_TOAST = { declined: 'flatmates.askDeclinedToast', accepted: 'flatmates.askAcceptedToast' };

export default function RoomAskButton({ ask, onAsk, className }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { flagEnabled } = useAppFlags();
  const [taps, pop] = useTapPop();
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold ' + className;

  if (ask?.status === 'accepted' && flagEnabled('inAppMessaging')) {
    const openChat = async () => {
      try {
        const conv = await openFlatmateRequestConversation(ask.id);
        navigate(`/messages?c=${encodeURIComponent(conv.id)}`);
      } catch (err) {
        toast(err?.message || t('common.somethingWentWrong'), 'error');
      }
    };
    return <button type="button" onClick={openChat} data-testid="room-chat-owner" className={'room-exp-btn btn-teal text-white ' + base}><Icon name="message-circle" className="w-4 h-4 shrink-0" /> <span className="truncate">{t('flatmates.messageOwner')}</span></button>;
  }
  if (ask) {
    const declined = ask.status === 'declined';
    const remind = () => { pop(); toast(t(ASK_TOAST[ask.status] || 'flatmates.askWaitingToast'), 'info'); };
    return (
      <button type="button" onClick={remind} data-ask-state={ask.status || 'pending'} className={(declined ? 'btn-ghost text-gray-300 ' : 'btn-ghost text-emerald-300 ') + base}>
        <Icon key={taps} name={declined ? 'x-circle' : 'check-check'} className={'w-4 h-4 shrink-0' + (taps ? ' dz-cta-pop' : '')} />
        <span className="truncate">{t(declined ? 'flatmates.notAccepted' : 'flatmates.interestSent')}</span>
      </button>
    );
  }
  return <button type="button" onClick={onAsk} className={'room-exp-btn btn-teal text-white ' + base}><Icon name="hand-heart" className="w-4 h-4 shrink-0" /> <span className="truncate">{t('flatmates.sendInterest')}</span></button>;
}
