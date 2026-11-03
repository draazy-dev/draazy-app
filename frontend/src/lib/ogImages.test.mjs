import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROUTE_HEADS } from '../data/routeHeads.js';
import { LANDING_PLACES, PUNE, flatmatePath, landingPath } from './landingPages.js';
import { LISTING_OG_TYPES, OG_PAGES, SITE_OG, flatmatesOg, landingOg, listingOg, pageOg, routeOg } from './ogImages.js';

const PUBLIC = fileURLToPath(new URL('../../public', import.meta.url));
const drawn = (p) => assert.ok(existsSync(`${PUBLIC}${p}`), `no card at public${p}; run node scripts/gen-og-cards.mjs`);

drawn(SITE_OG);
for (const path of Object.keys(ROUTE_HEADS)) drawn(routeOg(path));
for (const deal of ['rent', 'buy']) {
  for (const place of [PUNE, ...LANDING_PLACES]) {
    assert.equal(landingPath(deal, place.slug).split('/')[1], deal);
    drawn(landingOg(deal, place.slug));
  }
  for (const t of LISTING_OG_TYPES) drawn(`/og/listing/${deal}-${t.key}.jpg`);
}
for (const target of [{ women: true, place: PUNE }, ...LANDING_PLACES.map((place) => ({ women: false, place }))]) {
  drawn(flatmatesOg(flatmatePath(target).split('/').pop()));
}
for (const name of OG_PAGES) drawn(pageOg(name));

assert.equal(routeOg('/'), SITE_OG);
assert.equal(routeOg('/services/rent-agreement'), '/og/route/services-rent-agreement.jpg');
assert.equal(listingOg('Farm Land', 'buy'), '/og/listing/buy-farmland.jpg');
assert.equal(listingOg('Apartment', 'rent'), '/og/listing/rent-flat.jpg');
assert.equal(listingOg('Shop / Showroom', 'rent'), '/og/listing/rent-commercial.jpg');
assert.equal(listingOg('Open Plot', 'sale'), '/og/listing/buy-plot.jpg');
assert.equal(listingOg('Spaceship', 'rent'), SITE_OG, 'an unknown type falls back to the site card');
assert.equal(listingOg(undefined, undefined), SITE_OG);

console.log('ogImages ok');
