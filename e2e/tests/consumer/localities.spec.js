/* A locality read against the live API: `liveListings` counts bound listings, which cannot exceed what the
 * slug's property search finds (it also matches pins within 2 km). Fixtures: `R__zz_DML_dev_live_localities.sql`. */
import { test, expect } from '../../fixtures/live.js';
import { API } from '../../helpers/liveAuth.js';

const ANCHOR = 'wakad';

test('a locality is a public read with computed counts that fit inside a search for the same slug', async () => {
  const res = await fetch(`${API}/localities/${ANCHOR}`);
  expect(res.status, 'a locality is public').toBe(200);

  const anchor = await res.json();
  expect(anchor.slug).toBe(ANCHOR);
  expect(anchor.name).toBeTruthy();
  expect(typeof anchor.liveListings, 'a locality carries a live-listing count').toBe('number');
  expect(typeof anchor.archived, 'a locality says whether it is retired').toBe('boolean');
  expect(anchor.forSale + anchor.forRent).toBe(anchor.liveListings);

  const search = await fetch(`${API}/properties?locality=${ANCHOR}&size=1`);
  expect(search.status).toBe(200);
  expect(anchor.liveListings, 'a search for the slug also matches nearby pins, so it finds at least the bound listings')
    .toBeLessThanOrEqual((await search.json()).totalElements);
});

test('the search endpoint answers with live rows only', async () => {
  const res = await fetch(`${API}/localities/search?q=wak`);
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect(rows.map((r) => r.slug)).toContain(ANCHOR);
  for (const row of rows) expect(Object.keys(row).sort()).toEqual(['city', 'lat', 'lng', 'name', 'slug']);
});
