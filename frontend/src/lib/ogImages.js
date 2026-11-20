import { SEARCH_TYPES, matchTypeKey } from '../data/propertyTypes.js';

// Every path here must have a card drawn by scripts/gen-og-cards.mjs; ogImages.test.mjs checks the files exist.
export const OG_SIZE = [1200, 630];
export const SITE_OG = '/og-image.jpg';
export const SITE_OG_ALT = 'Draazy: broker-free homes in Pune';

export const LISTING_OG_TYPES = SEARCH_TYPES.filter((t) => t.matches);
export const OG_PAGES = ['society', 'flatmates-room', 'flatmates-group', 'flatmates-post', 'signup'];

const dealKey = (deal) => (deal === 'rent' ? 'rent' : 'buy');

export function listingOg(type, deal) {
  const t = LISTING_OG_TYPES.find((x) => matchTypeKey(x.key, type));
  return t ? `/og/listing/${dealKey(deal)}-${t.key}.jpg` : SITE_OG;
}

export const routeOg = (path) => (path === '/' ? SITE_OG : `/og/route/${path.slice(1).replace(/\//g, '-')}.jpg`);
export const landingOg = (deal, placeSlug) => `/og/${dealKey(deal)}/${placeSlug}.jpg`;
export const flatmatesOg = (slug) => `/og/flatmates/${slug}.jpg`;
export const pageOg = (name) => `/og/page/${name}.jpg`;
