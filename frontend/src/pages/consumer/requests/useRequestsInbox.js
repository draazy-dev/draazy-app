import { useCallback, useEffect, useRef, useState } from 'react';
import { listRequests } from '../../../services/requestInboxService.js';
import { requestKey } from './requestMeta.js';

const EMPTY = { items: [], status: 'loading' };

export function useNow(everyMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

export function useRequestsInbox({ refreshMs = 60000 } = {}) {
  const [boxes, setBoxes] = useState({ received: EMPTY, sent: EMPTY });
  const seq = useRef({ received: 0, sent: 0 });

  const load = useCallback(async (box, { quiet = false } = {}) => {
    const mine = ++seq.current[box];
    const latest = () => seq.current[box] === mine;
    if (!quiet) setBoxes((cur) => ({ ...cur, [box]: { items: cur[box].items, status: 'loading' } }));
    try {
      const items = await listRequests(box);
      if (latest()) setBoxes((cur) => ({ ...cur, [box]: { items, status: 'ready' } }));
    } catch {
      if (!latest()) return;
      // A failed background refresh must not blank a list the user is reading.
      setBoxes((cur) => (quiet && cur[box].status === 'ready' ? cur : { ...cur, [box]: { items: [], status: 'error' } }));
    }
  }, []);

  useEffect(() => {
    load('received');
    load('sent');
    const poll = setInterval(() => {
      if (document.hidden) return;
      load('received', { quiet: true });
      load('sent', { quiet: true });
    }, refreshMs);
    return () => clearInterval(poll);
  }, [load, refreshMs]);

  // Bumping the seq drops any list fetched before the change, which would otherwise undo it.
  const patchItem = useCallback((box, item, patch) => {
    const key = requestKey(item);
    seq.current[box] += 1;
    setBoxes((cur) => ({
      ...cur,
      [box]: { ...cur[box], items: cur[box].items.map((it) => (requestKey(it) === key ? patch(it) : it)) },
    }));
  }, []);

  const removeItem = useCallback((box, item) => {
    const key = requestKey(item);
    seq.current[box] += 1;
    setBoxes((cur) => ({ ...cur, [box]: { ...cur[box], items: cur[box].items.filter((it) => requestKey(it) !== key) } }));
  }, []);

  return { boxes, load, patchItem, removeItem };
}
