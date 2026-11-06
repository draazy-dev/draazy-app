import { Suspense, useEffect, useState } from 'react';
import Icon from '../Icon.jsx';
import { DOCK_QUERY, useSupportChat } from '../../context/SupportChatContext.jsx';
import { contextKey, parseContextKey } from '../../lib/supportLink.js';
import { lazyPage } from '../../i18n/lazyPage.js';
import '../../styles/components/support-dock.css';

const SupportDockWindow = lazyPage(() => import('./SupportDockWindow.jsx'), 'flatmates', 'misc2');

function useDesktop() {
  const [desktop, setDesktop] = useState(() => !!window.matchMedia?.(DOCK_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(DOCK_QUERY);
    if (!mq) return undefined;
    const sync = () => setDesktop(mq.matches);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return desktop;
}

function supportParam(anchor) {
  if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin || url.pathname !== '/messages') return null;
  return url.searchParams.get('support');
}

/** Desktop only: support links open a docked chat over the current page instead of leaving it. */
export default function SupportDock({ hidden }) {
  const desktop = useDesktop();
  const { enabled, chat, dock, openDock, closeDock, minimizeDock } = useSupportChat();
  const active = enabled && desktop && !hidden;

  useEffect(() => {
    if (!active) return undefined;
    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const param = supportParam(event.target.closest?.('a[href]'));
      if (param == null) return;
      event.preventDefault();
      openDock(contextKey(parseContextKey(param)));
    };
    // Capture phase, so the router's own Link handler sees defaultPrevented and stays put.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [active, openDock]);

  useEffect(() => { if (hidden) closeDock(); }, [hidden, closeDock]);

  if (!active || !dock) return null;
  if (dock.minimized) {
    return (
      <div className="dz-support-dock is-min" data-testid="support-dock">
        <button type="button" className="dz-support-dock__tab" onClick={() => minimizeDock(false)} data-testid="support-dock-tab">
          <span className="dz-support-dock__av"><Icon name="headset" className="w-4 h-4" /></span>
          <span className="dz-support-dock__name">Draazy support</span>
          {chat.unread ? <span className="dz-support-dock__badge">{chat.unread}</span> : null}
        </button>
        <button type="button" className="dz-support-dock__x" onClick={closeDock} aria-label="Close chat"><Icon name="x" className="w-3.5 h-3.5" /></button>
      </div>
    );
  }
  return (
    <div className="dz-support-dock" data-testid="support-dock" role="dialog" aria-label="Draazy support chat">
      <Suspense fallback={<div className="dz-support-dock__loading">Loading…</div>}>
        <SupportDockWindow contextKey={dock.key} onMinimize={() => minimizeDock(true)} onClose={closeDock} />
      </Suspense>
    </div>
  );
}
