import { createProvider } from './config.js';

const provider = createProvider('locality');

export const listAdminLocalities = async () => (await provider()).listAdminLocalities();

export const retireLocality = async (slug) => (await provider()).retireLocality(slug);

export const restoreLocality = async (slug) => (await provider()).restoreLocality(slug);

export const getLocality = async (slug) => (await provider()).getLocality(slug);

export const resolveLocality = async (place) => (await provider()).resolveLocality(place);

export const searchLocalities = async (q) => (await provider()).searchLocalities(q);

export async function localitiesIn(text) {
  const words = [...new Set(String(text || '').toLowerCase().match(/[a-z]{4,}/g) || [])].slice(0, 8);
  const hits = (await Promise.all(words.map((w) => searchLocalities(w).catch(() => [])))).flat();
  return [...new Map(hits.map((l) => [l.slug, l])).values()];
}
