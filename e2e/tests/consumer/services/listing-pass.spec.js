import { test, expect } from '../../../fixtures/live.js';
import { signedInAsNew, seedConsent, uniqueMobile } from '../../../helpers/liveAuth.js';
import {
  approve, call, entitlementsOf, newListing, openOrder, pendingOrderId, settleOrder, sql, statusOf, LISTING_PASS_PLAN,
} from '../../../helpers/monetisation.js';

// `uniqueMobile()` can collide within one millisecond, merging distinct accounts.
let seq = 0;
const newMobile = () => `${uniqueMobile().slice(0, -1)}${(seq++) % 10}`;

/* The signed payment webhook, which resumes a paused listing the moment a pass is paid, needs a machine-local
   secret, so these specs stand in for it by settling the order row. Resuming is then the owner's tap. */

const subscriptionStatus = (id) => sql(`select status from subscriptions where id = '${id}'`).split(/\r?\n/)[0].trim();

/** A new owner with one live listing and a second one the free tier has parked. */
async function ownerWithParkedListing(page) {
  const mobile = await signedInAsNew(page);
  const live = await newListing(mobile, { title: 'Tier live' });
  const parked = await newListing(mobile, { title: 'Tier parked' });
  await approve(live.id);
  await approve(parked.id);
  expect(await statusOf(mobile, parked.id)).toBe('paused');
  return { mobile, live, parked };
}

test.describe('LIVE: the listing pass', () => {
  test('a parked listing offers the pass, checkout quotes one flat price, and a paid pass lets it go live', async ({ page }) => {
    test.slow();
    await seedConsent(page);
    const { mobile, live, parked } = await ownerWithParkedListing(page);

    await test.step('My Listings offers the pass on the parked listing only', async () => {
      await page.goto('/dashboard#properties');
      const offer = page.getByRole('link', { name: /Go live — ₹999 pass/ });
      await expect(offer).toHaveCount(1, { timeout: 20000 });
      await expect(offer).toHaveAttribute('href', `/checkout?plan=listing-pass&property=${parked.id}`);
      await expect(page.getByText('or pause another listing to bring this one live.')).toBeVisible();
      await offer.click();
    });

    await test.step('checkout names the listing and charges the flat ₹999', async () => {
      await expect(page).toHaveURL(/\/checkout\?plan=listing-pass&property=/);
      await expect(page.getByText(parked.title).first()).toBeVisible({ timeout: 20000 });
      await expect(page.getByRole('button', { name: /^Pay ₹999$/ }).first()).toBeVisible();
      await page.getByRole('button', { name: /^Pay ₹999$/ }).first().click();
      await expect(page.getByRole('heading', { name: 'Payment pending' })).toBeVisible({ timeout: 20000 });
    });

    await test.step('until the payment settles nothing changes', async () => {
      expect(await statusOf(mobile, parked.id)).toBe('paused');
      expect((await entitlementsOf(mobile)).listings.passes).toEqual([]);
    });

    await test.step('once paid, the pass is recorded against that listing and covers its slot', async () => {
      settleOrder(await pendingOrderId(mobile), 60);
      const { listings } = await entitlementsOf(mobile);
      expect(listings.passes).toHaveLength(1);
      expect(listings.passes[0].propertyId).toBe(parked.id);
      expect(Date.parse(listings.passes[0].expiresAt) - Date.now()).toBeGreaterThan(59 * 86_400_000);
      expect(listings.used, 'the covered listing does not take the free slot').toBe(1);

      const resumed = await call('POST', `/me/listings/${parked.id}/resume`, mobile);
      expect(resumed.status, JSON.stringify(resumed.json)).toBe(200);
      expect(await statusOf(mobile, parked.id)).toBe('approved');
      expect(await statusOf(mobile, live.id), 'the first listing stays live').toBe('approved');
    });

    await test.step('My Listings shows the pass instead of the offer', async () => {
      await page.goto('/dashboard#properties');
      await expect(page.getByText(/Pass till/)).toBeVisible({ timeout: 20000 });
      await expect(page.getByRole('link', { name: /Go live — ₹999 pass/ })).toHaveCount(0);
    });
  });

  test('resuming over the free tier is refused with the pass named, and the alert links to the pass', async ({ page }) => {
    test.slow();
    await seedConsent(page);
    const { mobile, parked } = await ownerWithParkedListing(page);

    const refused = await call('POST', `/me/listings/${parked.id}/resume`, mobile);
    expect(refused.status).toBe(422);
    expect(refused.json.error).toBe('listing_quota_exhausted');
    expect(await statusOf(mobile, parked.id)).toBe('paused');

    await page.goto('/dashboard#properties');
    await expect(page.getByRole('link', { name: /Go live — ₹999 pass/ })).toHaveCount(1, { timeout: 20000 });
  });

  test('a pass is sold only for the buyer’s own listing, only with a listing named, and only once while it runs', async () => {
    const [seller, stranger] = [newMobile(), newMobile()];
    const mine = await newListing(seller, { title: 'Pass rules' });

    const foreign = await call('POST', '/me/subscription', stranger, { planId: LISTING_PASS_PLAN, propertyId: mine.id });
    expect(foreign.status, 'a pass for somebody else’s listing').toBe(404);

    const unnamed = await call('POST', '/me/subscription', seller, { planId: LISTING_PASS_PLAN });
    expect(unnamed.status, 'a pass names the listing it covers').toBeGreaterThanOrEqual(400);
    expect(unnamed.status).toBeLessThan(500);

    const order = await openOrder(seller, LISTING_PASS_PLAN, mine.id);
    settleOrder(order.id, 60);
    const again = await call('POST', '/me/subscription', seller, { planId: LISTING_PASS_PLAN, propertyId: mine.id });
    expect(again.status, 'a listing already under a pass').toBe(409);
  });

  test('archiving a listing cancels its unpaid pass checkout and frees the one-open-order slot', async () => {
    const owner = newMobile();
    const doomed = await newListing(owner, { title: 'Pass archived' });
    const order = await openOrder(owner, LISTING_PASS_PLAN, doomed.id);
    expect(subscriptionStatus(order.id)).toBe('pending');

    const another = await newListing(owner, { title: 'Pass second' });
    const blocked = await call('POST', '/me/subscription', owner, { planId: LISTING_PASS_PLAN, propertyId: another.id });
    expect(blocked.status, 'one unpaid order at a time').toBe(409);

    const archived = await call('DELETE', `/me/listings/${doomed.id}`, owner);
    expect(archived.status, JSON.stringify(archived.json)).toBeLessThan(300);
    expect(subscriptionStatus(order.id), 'the checkout can no longer complete').toBe('cancelled');

    const reopened = await openOrder(owner, LISTING_PASS_PLAN, another.id);
    expect(reopened.id).not.toBe(order.id);
  });

  test('archiving a listing also ends the pass that was running on it', async () => {
    const owner = newMobile();
    const listing = await newListing(owner, { title: 'Pass forfeited' });
    const order = await openOrder(owner, LISTING_PASS_PLAN, listing.id);
    settleOrder(order.id, 60);
    expect((await entitlementsOf(owner)).listings.passes).toHaveLength(1);

    const archived = await call('DELETE', `/me/listings/${listing.id}`, owner);
    expect(archived.status, JSON.stringify(archived.json)).toBeLessThan(300);
    expect(subscriptionStatus(order.id)).toBe('expired');
    expect((await entitlementsOf(owner)).listings.passes).toEqual([]);
  });});
