import { createProvider } from './config.js';
import { isBlacklisted } from '../lib/geoConfig.js';

const provider = createProvider('society');

export const searchSocieties = async (query, localityLabel = '', { mapped = false } = {}) => {
  const rows = await (await provider()).searchSocieties(query, { mapped });
  const locSlug = localityLabel ? localityLabel.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : '';
  const locHead = locSlug.split('-')[0];
  const locMatch = (s) =>
    (locHead && s.localitySlug && (s.localitySlug === locSlug || s.localitySlug.startsWith(locHead))) ? 1 : 0;
  return (Array.isArray(rows) ? rows : [])
    .filter((s) => !isBlacklisted({ name: s.name }))
    .sort((a, b) => (locMatch(b) - locMatch(a)) || a.name.localeCompare(b.name))
    .slice(0, 20);
};

export const listSocietyDirectory = async (opts) => (await provider()).listSocietyDirectory(opts);

export const getSociety = async (slug) => (await provider()).getSociety(slug);

export const getSocietyBrief = async (slug) => (await provider()).getSocietyBrief(slug);

export const listSocietiesPage = async (opts) => (await provider()).listSocietiesPage(opts);

export const topSocieties = async () => (await provider()).topSocieties();

export const listFollowedSocieties = async () => (await provider()).listFollowedSocieties();

export const followSociety = async (slug) => (await provider()).followSociety(slug);

export const unfollowSociety = async (slug) => (await provider()).unfollowSociety(slug);

export const resolveSociety = async ({ placeId, name, lat, lng }) =>
  (await provider()).resolveSociety({ placeId, name, lat, lng });

export const mintSociety = async (body) => {
  if (!body?.placeId) throw new Error('mintSociety needs a Google placeId');
  return (await provider()).mintSociety(body);
};

export const listSocietyCandidates = async (opts) => (await provider()).listSocietyCandidates(opts);

export const listDuplicatesForCandidates = async (slugs, opts) =>
  (await provider()).listDuplicatesForCandidates(slugs, opts);

export const getSocietiesSummary = async () => (await provider()).getSocietiesSummary();

export const listSocietyMerges = async (opts) => (await provider()).listSocietyMerges(opts);

export const mergeSocieties = async (from, into) => (await provider()).mergeSocieties(from, into);

export const undoSocietyMerge = async (slug) => (await provider()).undoSocietyMerge(slug);

export const getSocietyAdminView = async (slug) => (await provider()).getSocietyAdminView(slug);

export const editSociety = async (slug, patch) => (await provider()).editSociety(slug, patch);
