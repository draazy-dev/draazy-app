import { useState } from 'react';
import { haptic } from './haptics.js';

/* For a CTA whose action is already taken: a tick plus an icon pop, so it never reads as disabled.
   Use `taps` as the icon's `key` and add `dz-cta-pop` once it is non-zero; the remount replays the pop. */
export function useTapPop() {
  const [taps, setTaps] = useState(0);
  const pop = () => {
    haptic('tick');
    setTaps((n) => n + 1);
  };
  return [taps, pop];
}
