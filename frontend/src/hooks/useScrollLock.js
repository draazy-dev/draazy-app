import { useEffect } from 'react';

// Root lock: html sets overflow-x: clip so body overflow is a no-op; ref-counted for nesting.
let depth = 0;
let restore = '';

export default function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const root = document.documentElement;
    if (depth === 0) {
      // overflowY avoids replacing overflow-x: clip with hidden.
      restore = root.style.overflowY;
      root.style.overflowY = 'hidden';
      root.dataset.scrollLocked = 'true';
    }
    depth += 1;
    return () => {
      // Clamped against negative depth during Fast Refresh.
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        root.style.overflowY = restore;
        delete root.dataset.scrollLocked;
      }
    };
  }, [active]);
}
