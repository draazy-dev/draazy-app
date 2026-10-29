import { useState } from 'react';
import { haptic } from './haptics.js';

export function useTapPop() {
  const [taps, setTaps] = useState(0);
  const pop = () => {
    haptic('tick');
    setTaps((n) => n + 1);
  };
  return [taps, pop];
}
