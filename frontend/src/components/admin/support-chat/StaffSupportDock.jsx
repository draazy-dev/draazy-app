import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ChevronUp, MessageSquare, X } from 'lucide-react';
import StaffChatPanel from './StaffChatPanel.jsx';
import { useStaffSupportChats } from '../../../context/StaffSupportChatContext.jsx';
import { listSupportChats } from '../../../services/supportService.js';
import { classNames, fmtNum } from '../../../lib/format.js';
import { fmtAgo } from '../../../pages/ops/service-queue/helpers.js';

function RecentChats({ inboxPath, onPick, onClose }) {
  const { pulse } = useStaffSupportChats();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let live = true;
    listSupportChats({ view: 'all', size: 8 })
      .then((res) => { if (live) setRows(res.items); })
      .catch((err) => { console.warn('[support-chats] could not load recent chats', err); if (live) setRows([]); });
    return () => { live = false; };
  }, [pulse.n]);

  return (
    <div className="absolute bottom-full right-0 mb-2 w-80 overflow-hidden rounded-2xl border border-white/10 bg-ink-2 shadow-2xl" data-testid="staff-dock-recent">
      <div className="flex items-center border-b border-white/10 px-3 py-2">
        <span className="text-sm font-bold text-white">Support chats</span>
        <Link to={inboxPath} onClick={onClose} className="ml-auto text-xs font-semibold text-teal-300 hover:underline">Open inbox</Link>
      </div>
      <ul className="max-h-80 overflow-y-auto">
        {rows === null ? <li className="p-4 text-center text-xs text-gray-400">Loading…</li> : null}
        {rows && !rows.length ? <li className="p-4 text-center text-xs text-gray-400">No support chats yet.</li> : null}
        {(rows || []).map((r) => (
          <li key={r.userId}>
            <button type="button" onClick={() => onPick(r)} data-testid="staff-dock-recent-row" className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-white/5">
              <span className="min-w-0 flex-1">
                <span className={classNames('block truncate text-sm', r.staffUnread ? 'font-bold text-white' : 'text-gray-200')}>{r.name}</span>
                <span className="block truncate text-xs text-gray-400">{r.lastFrom === 'staff' ? 'Support: ' : ''}{r.lastPreview}</span>
              </span>
              <span className="shrink-0 text-[11px] text-gray-500">{fmtAgo(r.lastAt)}</span>
              {r.staffUnread ? <span className="h-2 w-2 shrink-0 rounded-full bg-brand-teal" aria-label="Unread" /> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DockWindow({ win }) {
  const { closeWindow, toggleWindow } = useStaffSupportChats();
  if (win.minimized) {
    return (
      <div className="flex w-56 items-center rounded-t-xl border border-b-0 border-white/10 bg-ink-2 shadow-xl" data-testid="staff-dock-window" data-user={win.userId} data-minimized="true">
        <button type="button" onClick={() => toggleWindow(win.userId)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 px-3 py-2 text-left text-sm font-semibold text-white">
          <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" /><span className="truncate">{win.name}</span>
        </button>
        <button type="button" onClick={() => closeWindow(win.userId)} aria-label={`Close chat with ${win.name}`} className="p-2 text-gray-400 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <div className="h-[min(500px,calc(100dvh-5rem))] w-[340px] overflow-hidden rounded-t-xl border border-b-0 border-white/10 bg-ink-2 shadow-2xl" data-testid="staff-dock-window" data-user={win.userId}>
      <StaffChatPanel userId={win.userId} initialAbout={win.about} compact onMinimize={() => toggleWindow(win.userId)} onClose={() => closeWindow(win.userId)} />
    </div>
  );
}

/** Desktop-only chat dock for staff: a launcher with the waiting count and up to three open chats beside it. */
export default function StaffSupportDock({ hidden, inboxPath }) {
  const { counts, windows, openWindow } = useStaffSupportChats();
  const [recentOpen, setRecentOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!recentOpen) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setRecentOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setRecentOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [recentOpen]);

  if (hidden) return null;
  return (
    // Above Modal (z-[1550]) so a desk's "Chat with customer" opens over the case it was launched from.
    <div className="pointer-events-none fixed bottom-0 right-4 z-[1560] hidden items-end gap-3 lg:flex" data-testid="staff-dock">
      {windows.slice().reverse().map((w) => (
        <div key={w.userId} className="pointer-events-auto"><DockWindow win={w} /></div>
      ))}
      <div ref={ref} className="pointer-events-auto relative mb-4">
        {recentOpen ? (
          <RecentChats inboxPath={inboxPath} onClose={() => setRecentOpen(false)} onPick={(r) => { setRecentOpen(false); openWindow(r.userId, r.name); }} />
        ) : null}
        <button
          type="button"
          onClick={() => setRecentOpen((o) => !o)}
          aria-expanded={recentOpen}
          aria-label={`Support chats, ${counts.awaiting} waiting`}
          data-testid="staff-dock-launcher"
          className="relative grid h-12 w-12 cursor-pointer place-items-center rounded-full bg-brand-teal text-ink shadow-xl transition hover:brightness-110"
        >
          <MessageSquare className="h-5 w-5" />
          {counts.awaiting ? (
            <span className="absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-rose-500 px-1 text-[11px] font-bold tabular-nums text-white" data-testid="staff-dock-badge">{fmtNum(counts.awaiting)}</span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
