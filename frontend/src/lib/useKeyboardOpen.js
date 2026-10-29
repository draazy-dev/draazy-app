import { useEffect } from 'react';

const KEYBOARD_CLASS = 'dz-kbd-open';
const MIN_SHRINK_PX = 150;
const TEXT_ENTRY = 'textarea, input:not([type=checkbox], [type=radio], [type=range], [type=button], [type=submit], [type=reset], [type=file], [type=color], [type=image]), [contenteditable=""], [contenteditable="true"]';

export default function useKeyboardOpen() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const root = document.documentElement.classList;
    let baseline = vv.height;
    let width = vv.width;

    const sync = () => {
      const typing = !!document.activeElement?.matches?.(TEXT_ENTRY);
      if (!typing || vv.width !== width) { baseline = vv.height; width = vv.width; }
      root.toggle(KEYBOARD_CLASS, typing && baseline - vv.height > MIN_SHRINK_PX);
    };
    const syncSoon = () => setTimeout(sync, 0);

    vv.addEventListener('resize', sync);
    document.addEventListener('focusin', syncSoon);
    document.addEventListener('focusout', syncSoon);
    return () => {
      vv.removeEventListener('resize', sync);
      document.removeEventListener('focusin', syncSoon);
      document.removeEventListener('focusout', syncSoon);
      root.remove(KEYBOARD_CLASS);
    };
  }, []);
}
