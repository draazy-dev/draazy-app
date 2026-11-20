import { useEffect } from 'react';

let depth = 0;
let restore = '';

export default function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const root = document.documentElement;
    if (depth === 0) {
      restore = root.style.overflowY;
      root.style.overflowY = 'hidden';
      root.dataset.scrollLocked = 'true';
    }
    depth += 1;
    return () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        root.style.overflowY = restore;
        delete root.dataset.scrollLocked;
      }
    };
  }, [active]);
}
