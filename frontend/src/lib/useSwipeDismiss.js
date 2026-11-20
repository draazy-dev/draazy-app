import { useCallback, useRef } from 'react';

const MOBILE = '(max-width: 639.98px)';

const THRESHOLD = 72;

const HANDLE_ZONE = 40;

const SLOP = 4;

const DRAG_HANDLES = 'input[type="range"], .rng-thumb-hit';

export default function useSwipeDismiss(onDismiss, { axis = 'y', query = MOBILE, allowScrollableTop = false, scrollableSelector = '.filter-scroll' } = {}) {
  const drag = useRef(null);

  const distance = useCallback((e) => (axis === 'y'
    ? e.clientY - drag.current.y
    : drag.current.x - e.clientX), [axis]);

  const onPointerDown = useCallback((e) => {
    if (!window.matchMedia(query).matches) return;
    if (e.target?.closest?.(DRAG_HANDLES)) return;
    let fromScrollableTop = false;
    if (axis === 'y' && e.clientY - e.currentTarget.getBoundingClientRect().top > HANDLE_ZONE) {
      const scrollable = e.target?.closest?.(scrollableSelector);
      if (!allowScrollableTop || !scrollable || scrollable.scrollTop > 0) return;
      fromScrollableTop = true;
    }
    drag.current = { x: e.clientX, y: e.clientY, active: false, fromScrollableTop };
  }, [allowScrollableTop, axis, query, scrollableSelector]);

  const onPointerMove = useCallback((e) => {
    if (!drag.current) return;
    const d = distance(e);
    if (!drag.current.active) {
      if (drag.current.fromScrollableTop && d < -SLOP) {
        drag.current = null;
        return;
      }
      if (d < SLOP) return;
      drag.current.active = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      e.currentTarget.style.transition = 'none';
    }
    e.currentTarget.style.transform = axis === 'y'
      ? `translateY(${Math.max(0, d)}px)`
      : `translateX(${Math.min(0, -d)}px)`;
  }, [axis, distance]);

  const onPointerEnd = useCallback((e) => {
    if (!drag.current) return;
    const { active } = drag.current;
    const d = distance(e);
    drag.current = null;
    if (!active) return;

    const el = e.currentTarget;
    const dismissing = d > THRESHOLD;
    if (dismissing) {
      el.style.transition = '';
    } else {
      el.style.transition = 'transform 200ms cubic-bezier(.32,.72,0,1)';
      el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
    }
    el.style.transform = '';
    if (dismissing) onDismiss?.();
  }, [distance, onDismiss]);

  return { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd };
}
