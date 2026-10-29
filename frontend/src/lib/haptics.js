import { getAppPrefs } from './localPrefs.js';

const PATTERN = {
  tick: 10,
  step: [10, 40, 10],
};

function suppressed() {
  if (typeof window === 'undefined') return true;
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
    if (getAppPrefs().reduceMotion) return true;
  } catch {
    return true;
  }
  return false;
}

export function haptic(kind = 'tick') {
  if (suppressed()) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(PATTERN[kind] ?? PATTERN.tick);
  } catch { }
}
