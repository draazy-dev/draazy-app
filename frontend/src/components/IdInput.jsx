import { useLayoutEffect, useRef } from 'react';
import { ID_KINDS } from '../lib/idFormat.js';

export default function IdInput({ kind, value, onChange, ...rest }) {
  const { clean, format, ...attrs } = ID_KINDS[kind];
  const ref = useRef(null);
  const caret = useRef(null);
  const shown = format(value);

  useLayoutEffect(() => {
    const at = caret.current;
    caret.current = null;
    if (at == null || document.activeElement !== ref.current) return;
    let pos = 0;
    for (let seen = 0; pos < shown.length && seen < at; pos += 1) if (shown[pos] !== ' ') seen += 1;
    ref.current.setSelectionRange(pos, pos);
  });

  const handle = (e) => {
    const { value: typed, selectionStart } = e.target;
    const current = clean(value);
    let next = clean(typed);
    let at = clean(typed.slice(0, selectionStart ?? typed.length)).length;
    const inputType = e.nativeEvent?.inputType ?? '';
    if (inputType.startsWith('delete') && next === current && typed.length === shown.length - 1) {
      if (inputType !== 'deleteContentForward') at -= 1;
      if (at >= 0) next = clean(current.slice(0, at) + current.slice(at + 1));
      else at = 0;
    }
    caret.current = at;
    onChange(next);
  };

  return <input ref={ref} spellCheck={false} autoCorrect="off" {...attrs} {...rest} value={shown} onChange={handle} />;
}
