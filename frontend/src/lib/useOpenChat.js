import { useNavigate } from 'react-router';
import { digits } from './contact.js';
import { getConversation, listConversations, startConversation } from '../services/conversationService.js';

async function findThread(them, pid) {
  if (!pid) return null;
  const candidates = (await listConversations()).filter((c) =>
    !c.staged && !c.group && (c.propertyId === pid || c.propertySlug === pid));
  for (const c of candidates) {
    const detail = await getConversation(c.id);
    if (digits(detail?.party?.mobile).slice(-10) === them) return detail;
  }
  return null;
}

export function useOpenChat(toast) {
  const navigate = useNavigate();
  return async ({ mobile, propertyId, greeting }) => {
    const them = digits(mobile).slice(-10);
    const pid = String(propertyId || '');
    try {
      const conv = await findThread(them, pid) || await startConversation({
        counterpartyMobile: them,
        propertyId: pid || undefined,
        firstMessage: greeting,
        clientId: `open:${pid}:${them}`,
      });
      navigate(`/messages?c=${encodeURIComponent(conv.id)}`);
    } catch (e) {
      toast?.(e?.message || 'Could not open the chat. Please try again.', 'error');
    }
  };
}
