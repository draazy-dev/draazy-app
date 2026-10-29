import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../../../../context/AuthContext.jsx';
import { myLivingStyle, saveMyLivingStyle } from '../../../../services/flatmateService.js';
import { answeredCount } from './questions.js';

const EMPTY = { owner: null, status: 'idle', answers: {}, confirmed: {}, version: 0 };
let state = EMPTY;
let writes = Promise.resolve();
let pending = 0;
let dirty = false;
const listeners = new Set();

const emit = (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => state;

function load(owner) {
  dirty = false;
  emit({ ...EMPTY, owner, status: 'loading' });
  myLivingStyle()
    .then((r) => { if (state.owner === owner) emit({ status: 'ready', answers: r.answers, confirmed: r.answers }); })
    .catch(() => { if (state.owner === owner) emit({ status: 'error' }); });
}

function settle(owner) {
  pending -= 1;
  if (!pending && dirty && state.owner === owner) { dirty = false; emit({ version: state.version + 1 }); }
}

export default function useLivingStyle() {
  const { user } = useAuth();
  const owner = user?.mobile || null;
  const snap = useSyncExternalStore(subscribe, snapshot);

  useEffect(() => {
    if (!owner) { if (state.owner) { dirty = false; emit(EMPTY); } return; }
    if (state.owner !== owner) load(owner);
  }, [owner]);

  const save = useCallback((answers) => {
    if (!owner || state.owner !== owner || state.status !== 'ready') return Promise.reject(new Error('not_ready'));
    emit({ answers });
    pending += 1;
    writes = writes.catch(() => {}).then(() => {
      if (state.owner !== owner) throw new Error('signed_out');
      return saveMyLivingStyle(answers);
    });
    return writes.then(
      () => {
        if (state.owner === owner) { dirty = true; emit({ confirmed: answers }); }
        settle(owner);
      },
      (err) => {
        if (state.owner === owner && state.answers === answers) emit({ answers: state.confirmed });
        settle(owner);
        throw err;
      },
    );
  }, [owner]);

  const reload = useCallback(() => { if (owner) load(owner); }, [owner]);

  const mine = snap.owner === owner ? snap : EMPTY;
  return {
    signedIn: !!owner, status: mine.status, answers: mine.answers, count: answeredCount(mine.answers),
    version: mine.version, save, reload,
  };
}