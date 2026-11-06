import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useStaffSupportChats } from '../../../context/StaffSupportChatContext.jsx';
import { locateSupportChat } from '../../../services/supportService.js';
import { portalPath } from '../../../lib/adminModules.js';
import { contextKey } from '../../../lib/supportLink.js';
import { fmtNum } from '../../../lib/format.js';

const DESKTOP = '(min-width: 1024px)';

/** A desk's way into the customer's support chat, opened at this case: dock window on desktop, inbox on phone. */
export default function OpenSupportChat({ about, label = 'Chat with customer', hint }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { enabled, openWindow, pulse } = useStaffSupportChats();
  const [target, setTarget] = useState(null);
  const [failed, setFailed] = useState(false);
  const ready = enabled && about?.type && about?.id;
  const type = about?.type;
  const id = about?.id;

  const locate = useCallback(() => {
    if (!ready) return Promise.resolve();
    return locateSupportChat({ type, id })
      .then((found) => { setTarget(found); setFailed(false); })
      .catch((err) => { console.warn('[support-chats] could not locate the chat for this case', err); setFailed(true); });
  }, [ready, type, id]);

  useEffect(() => { setTarget(null); setFailed(false); locate(); }, [locate]);
  useEffect(() => {
    if (pulse.n && target && (!pulse.userId || pulse.userId === target.userId)) locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recount once per pulse for this customer
  }, [pulse.n]);

  if (!ready) return null;
  if (failed && !target) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-rose-400/20 bg-rose-500/[0.06] px-3 py-2.5" data-testid="open-support-chat-failed">
        <p className="min-w-0 flex-1 text-xs text-rose-200">Couldn&apos;t reach this customer&apos;s support chat.</p>
        <button type="button" onClick={locate} className="dz-btn dz-btn-ghost shrink-0 py-1.5 text-xs">Retry</button>
      </div>
    );
  }
  if (!target) return null;

  const open = () => {
    if (window.matchMedia(DESKTOP).matches) {
      openWindow(target.userId, target.name, about);
      return;
    }
    const q = new URLSearchParams({ view: 'all', chat: target.userId, about: contextKey(about) });
    navigate(`${portalPath(user, '/admin/support')}?${q}`);
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5" data-testid="open-support-chat-card">
      <MessageSquare className="h-4 w-4 shrink-0 text-teal-300" />
      <p className="min-w-0 flex-1 truncate text-xs text-gray-400">{hint || `Messages with ${target.name} live in Support chats.`}</p>
      <button type="button" onClick={open} className="dz-btn dz-btn-primary shrink-0 py-1.5 text-xs" data-testid="open-support-chat">
        {label}{target.count ? ` (${fmtNum(target.count)})` : ''}
      </button>
    </div>
  );
}
