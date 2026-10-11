/** Locality copy stays client-owned; pointing it at server data would be a content decision. */
import { createProvider } from './config.js';

const provider = createProvider('locality');

/** The back office's locality table: slim rows (pin, retired flag, live count). Staff with `localities:read`. */
export const listAdminLocalities = async () => (await provider()).listAdminLocalities();

/** Closes an area to new listings; its live listings and page stay. Staff with `localities:write`. */
export const retireLocality = async (slug) => (await provider()).retireLocality(slug);

export const restoreLocality = async (slug) => (await provider()).restoreLocality(slug);

/** One locality (`GET /localities/{slug}`); throws on 404. */
export const getLocality = async (slug) => (await provider()).getLocality(slug);

/** A Google place becomes a locality row (found, adopted or minted server-side); 422 for a non-locality place. */
export const resolveLocality = async (place) => (await provider()).resolveLocality(place);

/** Active localities matching `q`; the picker's fallback when Google has nothing. */
export const searchLocalities = async (q) => (await provider()).searchLocalities(q);

/** Localities named in free text. There is no full list to match against, so each longer word is looked up. */
// ponytail: one search per word, capped at 8; a server endpoint that scans the whole text if queries grow longer.
export async function localitiesIn(text) {
  const words = [...new Set(String(text || '').toLowerCase().match(/[a-z]{4,}/g) || [])].slice(0, 8);
  const hits = (await Promise.all(words.map((w) => searchLocalities(w).catch(() => [])))).flat();
  return [...new Map(hits.map((l) => [l.slug, l])).values()];
}
