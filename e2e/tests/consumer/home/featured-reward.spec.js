import { test, expect } from '../../../fixtures/live.js';
import { API, uniqueMobile } from '../../../helpers/liveAuth.js';
import { approve, call, newListing, openOrder, settleOrder, sql, LISTING_PASS_PLAN } from '../../../helpers/monetisation.js';

// The grant is covered end to end in `property-ownership-review`; here its stamp is written directly so the clock can
// move.

const featuredOf = async (owner, id) => {
  const res = await call('GET', '/me/listings', owner);
  expect(res.status).toBe(200);
  const rows = Array.isArray(res.json) ? res.json : res.json.content;
  return rows.find((row) => row.id === id)?.featured;
};

const stamp = (id, interval) => sql(
  `update properties set ownership_verified = true, ownership_verified_at = now() - interval '${interval}',`
  + ` ownership_verified_until = now() + interval '1 year' where id = '${id}'`,
);

test.describe('LIVE: featured as the verification reward', () => {
  test('a live listing is featured for seven days after ownership is verified, and not before or after', async () => {
    const owner = uniqueMobile();
    const listing = await newListing(owner, { title: 'Featured reward' });
    await approve(listing.id);

    expect(await featuredOf(owner, listing.id), 'live but unverified').toBe(false);

    stamp(listing.id, '1 hour');
    expect(await featuredOf(owner, listing.id), 'just verified').toBe(true);

    stamp(listing.id, '6 days');
    expect(await featuredOf(owner, listing.id), 'day six of seven').toBe(true);

    stamp(listing.id, '8 days');
    expect(await featuredOf(owner, listing.id), 'the week has run out, the verification has not').toBe(false);
  });

  test('a paid pass does not feature an unverified listing', async () => {
    const owner = uniqueMobile();
    const listing = await newListing(owner, { title: 'Pass is not a feature' });
    await approve(listing.id);
    settleOrder((await openOrder(owner, LISTING_PASS_PLAN, listing.id)).id, 60);

    expect(await featuredOf(owner, listing.id)).toBe(false);
  });

  test('a verified listing leads the public featured rail', async () => {
    const owner = uniqueMobile();
    const listing = await newListing(owner, { title: 'Featured rail' });
    await approve(listing.id);
    stamp(listing.id, '1 hour');

    const res = await fetch(`${API}/properties/featured`);
    expect(res.status).toBe(200);
    expect((await res.json())[0].id).toBe(listing.id);
  });
});
