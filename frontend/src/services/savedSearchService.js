/** Flat seam: the provider un-nests the server's `filters` jsonb and derives `alerts` from `alertFrequency`.
 * Never derive newCount/matchCount here: the browser only sees one page of the catalogue. */
import { createProvider } from './config.js';

const provider = createProvider('savedSearch');

/** Every saved search for the caller, newest first. Flat facets, not a nested `filters` object. */
export const listSavedSearches = async () => (await provider()).listSavedSearches();

/** `record` is `buildAlertRecord()` output plus optional label, query, channel, kind, criteria. */
export const createSavedSearch = async (record) => (await provider()).createSavedSearch(record);

export const updateSavedSearch = async (id, changes) => (await provider()).updateSavedSearch(id, changes);

/** Replace a listings alert's facets, label and cadence in place; same flat record as `createSavedSearch`. */
export const editSavedSearch = async (id, record) => (await provider()).editSavedSearch(id, record);

export const deleteSavedSearch = async (id) => (await provider()).deleteSavedSearch(id);

/** The server's `alert_frequency` enum in escalating order; the one place it is spelled. */
export const ALERT_FREQUENCIES = ['off', 'instant', 'daily', 'weekly'];

/** The cadence a search gets when it is switched on without an explicit choice — the server's own. */
export const DEFAULT_ALERT_FREQUENCY = 'daily';

/** Refuses an unknown cadence here instead of round-tripping into a 400; `'off'` keeps the search. */
export const setAlertFrequency = async (id, alertFrequency) => {
  if (!ALERT_FREQUENCIES.includes(alertFrequency)) {
    throw new Error(`Unknown alert frequency: ${alertFrequency}`);
  }
  return (await provider()).updateSavedSearch(id, { alertFrequency });
};
