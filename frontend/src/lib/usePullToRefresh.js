import { useEffect, useRef, useState } from 'react';
import { reducedMotion } from './motion.js';

const TOUCH = '(hover: none) and (pointer: coarse)';

const THRESHOLD = 64;

const MAX_PULL = 96;

const SLOP = 6;

const RESISTANCE = 0.5;

const MIN_SPIN_MS = 350;

function atScrollTop(target, root) {
  for (let n = target; n instanceof Element; n = n.parentElement) {
    if (n.scrollHeight > n.clientHeight + 1) {
      const oy = getComputedStyle(n).overflowY;
      if (oy === 'auto' || oy === 'scroll') return n.scrollTop <= 0;
    }
    if (n === root) break;
  }
  return (document.scrollingElement || document.documentElement).scrollTop <= 0;
}

function optedOut(target, root) {
  for (let n = target; n instanceof Element; n = n.parentElement) {
    if (n.hasAttribute('data-no-ptr')) return true;
    if (n === root) break;
  }
  return false;
}

export default function usePullToRefresh(onRefresh, { enabled = true, threshold = THRESHOLD } = {}) {
  const ref = useRef(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const latest = useRef(onRefresh);
  useEffect(() => { latest.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;
    if (!window.matchMedia?.(TOUCH).matches) return undefined;

    const reduced = reducedMotion();
    let drag = null;
    let refreshing = false;
    let alive = true;
    let timer = null;

    const onStart = (e) => {
      drag = null;
      if (refreshing || e.touches.length !== 1) return;
      if (optedOut(e.target, el)) return;
      if (!atScrollTop(e.target, el)) return;
      drag = { x: e.touches[0].clientX, y: e.touches[0].clientY, active: false, pull: 0 };
    };

    const onMove = (e) => {
      if (!drag) return;
      if (e.touches.length !== 1) { drag = null; setPullDistance(0); return; }
      const delta = e.touches[0].clientY - drag.y;
      const sideways = e.touches[0].clientX - drag.x;

      if (!drag.active) {
        if (delta < 0) { drag = null; return; }
        if (Math.abs(sideways) > Math.abs(delta)) { drag = null; return; }
        if (delta < SLOP) return;
        drag.active = true;
      }

      if (e.cancelable) e.preventDefault();

      drag.pull = Math.min(MAX_PULL, (delta - SLOP) * RESISTANCE);
      setPullDistance(reduced ? (drag.pull >= threshold ? threshold : 0) : drag.pull);
    };

    const onEnd = () => {
      const released = drag;
      drag = null;
      if (!released?.active) return;
      if (released.pull < threshold) { setPullDistance(0); return; }

      refreshing = true;
      setPullDistance(threshold);
      setIsRefreshing(true);
      const startedAt = Date.now();

      const settle = () => {
        const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - startedAt));
        timer = setTimeout(() => {
          refreshing = false;
          if (!alive) return;
          setIsRefreshing(false);
          setPullDistance(0);
        }, wait);
      };

      Promise.resolve()
        .then(() => latest.current?.())
        .then(settle, settle);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      setIsRefreshing(false);
      setPullDistance(0);
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled, threshold]);

  return {
    ref,
    pullDistance,
    progress: Math.min(1, pullDistance / threshold),
    isRefreshing,
  };
}
