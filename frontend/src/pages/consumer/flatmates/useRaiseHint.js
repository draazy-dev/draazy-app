import { useEffect, useState } from 'react';
import { feed } from '../../../services/flatmateService.js';
import { isAbort } from '../../../services/http.js';
import { BUDGET_MAX, perHead } from './helpers.js';
import { decorateRooms, bestPerPersonRent } from './model.js';

const suggestion = (price) => Math.min(BUDGET_MAX, Math.ceil(price / 1000) * 1000);

const priceOf = (row) => {
  if (!row) return null;
  if (row.kind === 'group') return perHead(row);
  if (row.kind === 'room') return bestPerPersonRent(decorateRooms([row])[0]);
  return row.budget ?? null;
};

export default function useRaiseHint({ tab, filters, query, empty }) {
  const [hint, setHint] = useState(null);

  const ceiling = filters?.budget?.[1];
  const narrowed = ceiling != null && ceiling < BUDGET_MAX;
  const key = JSON.stringify([tab, query, empty, ceiling]);

  useEffect(() => {
    if (!empty || !narrowed) { setHint(null); return undefined; }
    let live = true;
    const ctl = new AbortController();
    const widened = { ...query, budget: undefined, sort: 'budget-low', me: undefined };
    feed(tab, widened, 0, 1, { signal: ctl.signal })
      .then((res) => {
        if (!live) return;
        const price = priceOf(res.items?.[0]);
        if (price == null || !(price > ceiling)) { setHint(null); return; }
        setHint({ price, budget: suggestion(price) });
      })
      .catch((err) => {
        if (isAbort(err) || !live) return;
        setHint(null);
        if (import.meta.env?.DEV) console.warn('[flatmates] raise-budget hint failed', err);
      });
    return () => { live = false; ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the serialised question.
  }, [key]);

  return hint;
}
