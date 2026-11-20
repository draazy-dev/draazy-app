import { createProvider } from './config.js';
import { myMobile } from '../lib/contact.js';
import { getRecentSearches, pushRecentSearch } from '../lib/localPrefs.js';

const provider = createProvider('recentSearch');

const signedIn = () => !!myMobile();

export const listRecentSearches = async () =>
  (signedIn() ? (await provider()).listRecentSearches() : getRecentSearches());

export const recordRecentSearch = async (rec) => {
  if (!rec || !rec.label || !rec.url) return [];
  return signedIn() ? (await provider()).recordRecentSearch(rec) : pushRecentSearch(rec);
};
