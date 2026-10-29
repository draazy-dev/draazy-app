import { createProvider } from './config.js';

const provider = createProvider('savedSearch');

export const listSavedSearches = async () => (await provider()).listSavedSearches();

export const createSavedSearch = async (record) => (await provider()).createSavedSearch(record);

export const updateSavedSearch = async (id, changes) => (await provider()).updateSavedSearch(id, changes);

export const editSavedSearch = async (id, record) => (await provider()).editSavedSearch(id, record);

export const deleteSavedSearch = async (id) => (await provider()).deleteSavedSearch(id);

export const ALERT_FREQUENCIES = ['off', 'instant', 'daily', 'weekly'];

export const DEFAULT_ALERT_FREQUENCY = 'daily';

export const setAlertFrequency = async (id, alertFrequency) => {
  if (!ALERT_FREQUENCIES.includes(alertFrequency)) {
    throw new Error(`Unknown alert frequency: ${alertFrequency}`);
  }
  return (await provider()).updateSavedSearch(id, { alertFrequency });
};
