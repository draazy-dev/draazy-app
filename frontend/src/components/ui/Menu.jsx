import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { classNames } from '../../lib/format.js';
import useSheetViewport from '../../lib/useSheetViewport.js';
import useSwipeDismiss from '../../lib/useSwipeDismiss.js';
import Icon from '../Icon.jsx';

/* Portaled to <body> so the panel escapes card overflow/stacking traps; items take
   { icon, label, onClick | href | to, tone, disabled, divider }. */
export default function Menu({ items = [], ariaLabel, className, onNavigate }) {
  const { t } = useTranslation();
  const menuLabel = ariaLabel || t('ui.moreActions');
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  /* Below 640px an anchored kebab panel is a cluster of ~32px targets in a random corner,
     so the items become a floating action card of full-width rows instead. */
  const sheet = useSheetViewport();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      const inRoot = rootRef.current && rootRef.current.contains(e.target);
      const inMenu = menuRef.current && menuRef.current.contains(e.target);
      if (!inRoot && !inMenu) close();
    };
    const onKey = (e) => { if (e.key === 'Escape') { close(); triggerRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const position = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    // Sheet mode is laid out entirely in CSS. Drop any inline geometry a previous
    // desktop-width pass wrote, or it would out-specify the sheet rules.
    if (sheet) { menu.removeAttribute('style'); return; }
    const r = trigger.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.zIndex = '9999';
    const mw = menu.offsetWidth;
    // Right-align the panel to the trigger so it opens inward from the row's edge.
    let left = r.right - mw;
    if (left < 8) left = 8;
    if (left + mw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - mw);
    menu.style.left = `${left}px`;
    let top = r.bottom + 6;
    const mh = menu.offsetHeight;
    if (top + mh > window.innerHeight - 8 && r.top - 6 - mh > 8) top = r.top - 6 - mh;
    menu.style.top = `${top}px`;
  }, [sheet]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    position();
    const onAnchor = () => position();
    window.addEventListener('scroll', onAnchor, true);
    window.addEventListener('resize', onAnchor);
    return () => {
      window.removeEventListener('scroll', onAnchor, true);
      window.removeEventListener('resize', onAnchor);
    };
  }, [open, position]);

  const pick = (it) => {
    close();
    if (it.disabled) return;
    if (it.to && onNavigate) onNavigate(it.to);
    else if (it.href) window.open(it.href, it.target || '_self', it.target === '_blank' ? 'noopener,noreferrer' : '');
    else if (it.onClick) it.onClick();
  };

  /* Drag the card's top edge down to dismiss. Mobile-only by construction. */
  const swipe = useSwipeDismiss(close);

  return (
    <div ref={rootRef} className={classNames('relative inline-flex', className)}>
      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={menuLabel}
        onClick={() => setOpen((o) => !o)}
        className={classNames(
          'tap-target inline-flex items-center justify-center w-8 h-8 sm:min-w-0 sm:min-h-0 rounded-lg text-gray-400 transition-colors',
          'hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60',
          open && 'bg-white/10 text-white',
        )}
      >
        <Icon name="more-horizontal" className="w-4 h-4" />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <>
              {/* The card is a modal surface, so the page behind it must read as dismissed. */}
              {sheet ? <div className="dz-dropdown__scrim" onClick={close} aria-hidden="true" /> : null}
              <div
                ref={menuRef}
                role="menu"
                aria-label={menuLabel}
                {...(sheet ? swipe : null)}
                className={classNames(
                  'rounded-xl border border-white/10 bg-ink-2 p-1.5 shadow-2xl shadow-black/50',
                  sheet
                    ? 'dz-action-sheet flex flex-col gap-0.5'
                    : 'min-w-[11rem] max-w-[16rem]',
                )}
              >
                {items.map((it, i) => {
                  if (it.divider) return <div key={`d${i}`} className="my-1 h-px bg-white/[0.07]" role="separator" />;
                  const danger = it.tone === 'danger';
                  return (
                    <button
                      key={it.label + i}
                      type="button"
                      role="menuitem"
                      disabled={it.disabled}
                      onClick={() => pick(it)}
                      className={classNames(
                        'w-full flex items-center gap-2.5 px-2.5 rounded-lg font-medium text-left transition-colors',
                        // Sheet rows are primary targets, not a compact overflow list.
                        sheet ? 'min-h-[48px] py-3 text-[15px]' : 'py-2 text-[13px]',
                        it.disabled && 'opacity-40 cursor-not-allowed',
                        !it.disabled && (danger
                          ? 'text-rose-300 hover:bg-rose-500/15'
                          : 'text-gray-200 hover:bg-white/[0.06] hover:text-white'),
                      )}
                    >
                      {it.icon ? <Icon name={it.icon} className={classNames('flex-shrink-0', sheet ? 'w-5 h-5' : 'w-4 h-4', danger ? 'text-rose-300' : 'text-gray-400')} /> : null}
                      <span className="truncate">{it.label}</span>
                    </button>
                  );
                })}
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
