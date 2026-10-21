import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { classNames } from '../../lib/format.js';
import useModalDialog from '../../hooks/useModalDialog.js';
import useSwipeDismiss from '../../lib/useSwipeDismiss.js';
import useScrollLock from '../../hooks/useScrollLock.js';
import ScrollRail from '../ScrollRail.jsx';

export default function Modal({ open, onClose, title, children, footer, size = 'md', bare = false }) {
  const { t } = useTranslation();
  const swipe = useSwipeDismiss(onClose);

  useScrollLock(open);
  const panelRef = useModalDialog(open, onClose);

  if (!open) return null;

  const width = { sm: 'max-w-sm', lg: 'max-w-2xl', xl: 'max-w-6xl' }[size] || 'max-w-lg';
  const closeLabel = title ? t('common.closeTitle', { title }) : t('common.close');
  // Below 640px the dialog is a floating card above the bottom nav, and `z-[1550]` places it in the app's
  // floating-chrome band — see docs/system/design-system.md § Floating cards.

  return createPortal(
    <div className="fixed inset-0 z-[1550] flex items-end justify-center px-[var(--dz-float-edge)] pt-[var(--dz-float-top)] pb-[var(--dz-float-bottom)] sm:items-center sm:p-4">
      <div className="dz-float-scrim absolute inset-0 sm:bg-black/75 sm:backdrop-blur-md" onClick={onClose} />
      {/* Escape and the close button remain the accessible ways out; the drag is additive. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        {...swipe}
        className={classNames(
          'dz-modal-panel dz-modal-sheet relative w-full p-0 border border-white/10 shadow-2xl outline-none',
          'flex max-h-full flex-col rounded-[var(--dz-float-radius)]',
          'sm:block sm:max-h-none sm:rounded-2xl',
          width,
        )}
      >
        {/* `bare`: the body draws its own heading, so only the close button floats over it. */}
        {bare ? (
          <button onClick={onClose} aria-label={closeLabel} className="tap-target absolute right-2 top-2 z-10 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition sm:right-3 sm:top-3 sm:min-h-0 sm:min-w-0 sm:p-1.5">
            <X className="h-5 w-5" />
          </button>
        ) : (
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4">
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <button onClick={onClose} aria-label={closeLabel} className="tap-target -mr-2 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition sm:mr-0 sm:min-h-0 sm:min-w-0 sm:p-1.5">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <ScrollRail className={classNames('min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:flex-none sm:px-6 sm:py-5 sm:max-h-[calc(100dvh-12rem)]', bare && 'pt-6 sm:pt-8')}>{children}</ScrollRail>
        {footer ? <div className={classNames('flex flex-wrap justify-end gap-2 px-4 py-3 sm:px-6 sm:py-4', bare ? 'pt-0 sm:pt-0 sm:pb-6' : 'border-t border-white/10')}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
