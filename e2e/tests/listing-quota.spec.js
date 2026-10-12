import { expect, test } from '../fixtures/live.js';
import { ACTORS } from '../fixtures/live.js';
import { signedInAs, authHeaders, API, uniqueMobile } from '../helpers/liveAuth.js';
import { newListing } from '../helpers/monetisation.js';

test.describe('Listing quota — live', () => {
  test('the server, not the browser, decides the ceiling and the count', async ({ request }) => {
    const headers = await authHeaders(ACTORS.owner);

    const ent = await request.get(`${API}/me/entitlements`, { headers });
    expect(ent.status()).toBe(200);
    const { listings, agreements } = await ent.json();
    // Free tier, no granting referrals. Asserted as a number rather than "is defined": the dashboard
    // decides whether to offer a pass from it, and a null would silently hide the offer.
    expect(listings.allowance).toBe(1);
    expect(listings.referralBonus).toBe(0);
    expect(listings.passes).toEqual([]);
    // Present and zero, not absent.
    expect(agreements.free).toBe(0);

    const mine = await request.get(`${API}/me/listings`, { headers });
    expect(mine.status()).toBe(200);
    const body = await mine.json();
    const rows = Array.isArray(body) ? body : (body.content ?? []);
    // `archived` is its own boolean on the wire and the status is left alone, so a take-down has to
    // be read off the flag. Filtering on the status alone counts a freed slot as held.
    const occupying = rows.filter((r) => !r.flatmate && !r.archived
      && !/deleted|archived|rejected/i.test(String(r.status || '')));
    expect(occupying.length).toBe(4);
    expect(listings.used).toBe(4);
    // The whole point: four against a ceiling of one. Nothing in the browser was consulted.
    expect(occupying.length).toBeGreaterThan(listings.allowance);

    const slots = await request.get(`${API}/me/listings/quota`, { headers });
    expect(await slots.json()).toEqual({ used: 4, allowance: 1 });
  });

  test('an over-tier owner still reaches the wizard for a whole flat and for a flatmate room', async ({ page }) => {
    await signedInAs(page, ACTORS.owner);

    await test.step('the form opens: the tier is applied when a listing is approved, not when it is drafted', async () => {
      await page.goto('/list-property', { waitUntil: 'networkidle' });
      await expect(page.getByTestId('listing-wizard')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('[data-err="propertyType"]')).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(/used your free listing/i)).toHaveCount(0);
      await expect(page.getByText(/^\d+ of 1 free live listing used$/)).toBeVisible();
      await expect(page.getByText(/Go live with a ₹999 pass or pause the other/)).toBeVisible();
    });

    // Flatmate rooms do not occupy listing slots, so this path was never tiered.
    await test.step('the flatmate flow opens, and the whole-flat flow is one tap away', async () => {
      await page.goto('/list-property?flatmate=1', { waitUntil: 'networkidle' });
      await expect(page.getByTestId('listing-wizard')).toBeVisible({ timeout: 15000 });
      await page.getByText('Rent out the whole place').click();
      await expect(page.getByTestId('listing-wizard')).toBeVisible();
      await expect(page.getByText('Find a flatmate')).toBeVisible();
    });
  });

  test('an owner with nothing listed gets the wizard, and a withdrawn listing leaves the count at zero', async ({ page, request }) => {
    const mobile = uniqueMobile();
    const headers = await authHeaders(mobile);

    const posted = await newListing(mobile, { title: 'Withdrawal probe' });
    const taken = await request.delete(`${API}/me/listings/${posted.id}`, { headers });
    expect(taken.status()).toBe(200);

    await signedInAs(page, mobile);
    const slots = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/me/listings/quota');
    await page.goto('/list-property', { waitUntil: 'networkidle' });

    await expect(page.getByTestId('listing-wizard')).toBeVisible({ timeout: 15000 });
    expect(await (await slots).json()).toEqual({ used: 0, allowance: 1 });
  });
});
