const DEFAULT_MAX = 30;
const DEFAULT_TTL = 60_000;

export function createSearchCache({ max = DEFAULT_MAX, ttl = DEFAULT_TTL } = {}) {
  const entries = new Map();
  const inflight = new Map();

  function remember(key, value) {
    entries.set(key, { at: Date.now(), value });
    if (entries.size > max) entries.delete(entries.keys().next().value);
  }

  function recall(key) {
    const hit = entries.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > ttl) { entries.delete(key); return undefined; }
    entries.delete(key);
    entries.set(key, hit);
    return hit;
  }

  function read(key, fetcher, { signal, fresh = false } = {}) {
    if (signal?.aborted) return Promise.reject(abortError());
    if (!fresh) {
      const hit = recall(key);
      if (hit) return Promise.resolve(hit.value);
    }

    let flight = inflight.get(key);
    if (!flight) {
      const ctl = new AbortController();
      flight = { ctl, subscribers: 0, promise: null };
      flight.promise = fetcher(ctl.signal)
        .then((value) => { remember(key, value); return value; })
        .finally(() => { if (inflight.get(key) === flight) inflight.delete(key); });
      inflight.set(key, flight);
    }

    flight.subscribers += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      flight.subscribers -= 1;
      if (flight.subscribers > 0) return;
      if (inflight.get(key) === flight) inflight.delete(key);
      flight.ctl.abort();
    };

    return new Promise((resolve, reject) => {
      const onAbort = () => { release(); reject(abortError()); };
      signal?.addEventListener('abort', onAbort, { once: true });
      flight.promise.then(resolve, reject).finally(() => {
        signal?.removeEventListener('abort', onAbort);
        release();
      });
    });
  }

  return {
    read,
    clear: () => { entries.clear(); },
  };
}

function abortError() {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}
