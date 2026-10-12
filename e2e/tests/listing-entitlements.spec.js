import { ACTORS, expect, test } from '../fixtures/live.js';
import { uniqueMobile } from '../helpers/liveAuth.js';
import { approve, call, entitlementsOf, newListing, sql, statusOf } from '../helpers/monetisation.js';

// `uniqueMobile()` can collide within one millisecond, merging distinct owners.
let seq = 0;
const newOwner = () => `${uniqueMobile().slice(0, -1)}${(seq++) % 10}`;

test.describe('listing tier (live)', () => {
  test('creating a listing is never refused for the tier, even for an owner already over it', async () => {
    const before = await entitlementsOf(ACTORS.owner);
    expect(before.listings.used).toBeGreaterThan(before.listings.allowance);

    const created = await newListing(ACTORS.owner, { title: 'One more draft' });
    try {
      expect(await statusOf(ACTORS.owner, created.id)).toMatch(/pending/);

      // Only a LIVE listing occupies the free slot, so a draft in the queue changes nothing.
      expect((await entitlementsOf(ACTORS.owner)).listings.used).toBe(before.listings.used);
    } finally {
      // The seeded owner is shared and a take-down only archives; delete outright to keep the four-listing invariant.
      sql(`delete from properties where id = '${created.id}'`);
    }
  });

  test('a second approved listing is paused rather than live, resume is refused over the tier, and a take-down frees the slot', async () => {
    const owner = newOwner();
    const first = await newListing(owner, { title: 'Tier first' });
    const second = await newListing(owner, { title: 'Tier second' });

    await approve(first.id);
    expect(await statusOf(owner, first.id)).toMatch(/approved/);
    expect((await entitlementsOf(owner)).listings).toMatchObject({ allowance: 1, used: 1, passes: [] });

    await approve(second.id);
    expect(await statusOf(owner, second.id), 'over the free tier the approval parks the listing').toMatch(/paused/);
    expect((await entitlementsOf(owner)).listings.used).toBe(1);

    const refused = await call('POST', `/me/listings/${second.id}/resume`, owner);
    expect(refused.status).toBe(422);
    expect(refused.json.error).toBe('listing_quota_exhausted');
    expect(await statusOf(owner, second.id)).toMatch(/paused/);

    const gone = await call('DELETE', `/me/listings/${first.id}`, owner);
    expect(gone.status).toBe(200);
    expect(gone.json.archived).toBe(true);
    expect((await entitlementsOf(owner)).listings.used).toBe(0);

    const resumed = await call('POST', `/me/listings/${second.id}/resume`, owner);
    expect(resumed.status, JSON.stringify(resumed.json)).toBe(200);
    expect(await statusOf(owner, second.id)).toMatch(/approved/);
    expect((await entitlementsOf(owner)).listings.used).toBe(1);
  });
});
