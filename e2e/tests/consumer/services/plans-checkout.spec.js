// @ts-check
import { test, expect } from '../../../fixtures/live.js';
import { signedInAs, signedInAsNew, authHeaders, API, uniqueMobile } from '../../../helpers/liveAuth.js';
import { approve, newListing, openOrder, pendingOrderId, settleOrder, CONTACT_PACK_PLAN, LISTING_PASS_PLAN } from '../../../helpers/monetisation.js';

/* Everything upstream of Pay. The catalogue's paid prices are the admin fee schedule's, so the
   page quotes the same figure whether the catalogue or its `pricing` fallback rendered it. */

/** The two products on sale, in both tables. Formatted as the page formats it (`en-IN` grouping). */
const LISTING_PASS = '₹999';
const CONTACT_PACK = '₹199';

/** A price in neither table, via intercepting the catalogue: catalogue and fee schedule quote the same numbers, so
 * only a sentinel shows which was read. It must not collide with any real price on the page. */
const SENTINEL = 111777;
const SENTINEL_TEXT = '₹1,11,777';

/** Serves the catalogue with `name`'s price replaced; keyed on `name` because the slug is derived by `planMapper`
 * and is not on the wire. The caller must run the returned assertion. */
async function catalogueQuoting(page, name, price) {
  let substituted = false;
  await page.route('**/api/bootstrap', async (route) => {
    const res = await route.fetch();
    const doc = await res.json();
    if (!doc.plans.some((r) => r.name === name)) {
      throw new Error(`the catalogue carries no plan named "${name}", so nothing was substituted`);
    }
    substituted = true;
    await route.fulfill({
      response: res,
      json: { ...doc, plans: doc.plans.map((r) => (r.name === name ? { ...r, price } : r)) },
    });
  });
  /* Every caller must assert this: a glob that stops matching silently serves the real catalogue. */
  return () => expect(substituted, `the ${name} price was never substituted — check the route glob`).toBe(true);
}

/* The global cookie banner is also role="dialog" and can overlay the plan-card CTAs. Seeding consent
   is presentation-only — it just stops an unrelated overlay from deciding whether a click lands. */
async function seedConsent(page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'dz_cookie_consent_v1',
      JSON.stringify({ necessary: true, functional: true, analytics: true, marketing: false, version: 1, ts: Date.now() }),
    );
  });
}

/* Both the swipeable mobile carousel and the desktop grid render the cards; the grid comes last in the DOM. */
const desktopLink = (page, name) => page.getByRole('link', { name }).last();

test.describe('LIVE: plans, pricing and the checkout hand-off', () => {
  test('the catalogue and the fee schedule quote the same prices, and the retired subscriptions are gone from it', async () => {
    /* `AdminFeesPriceEverySurfaceTest` pins this in the backend suite; repeated here against the
       database the rest of this file talks to. */
    const { plans, pricing } = await (await fetch(`${API}/bootstrap`)).json();

    const planNamed = (name) => {
      const plan = plans.find((p) => p.name === name);
      expect(plan, `the seeded catalogue must carry a plan named ${name}`).toBeTruthy();
      return plan;
    };

    expect(planNamed('Listing Pass').price, 'the pass is charged the catalogue price, so the schedule the page\n'
      + 'falls back to must name the same number').toBe(pricing.listingPass);
    expect(planNamed('Contact Pack').price).toBe(pricing.contactPack);
    // And they are the numbers this file asserts on screen, so a repricing fails here rather than
    // in several UI assertions whose messages would blame the rendering.
    expect(planNamed('Listing Pass').price).toBe(999);
    expect(planNamed('Contact Pack').price).toBe(199);

    expect(planNamed('Listing Pass')).toMatchObject({ kind: 'listing-pass', termDays: 60 });
    expect(planNamed('Contact Pack')).toMatchObject({ kind: 'contact-pack', termDays: 30, contactLimit: 15 });
    expect(plans.map((p) => p.name).sort(), 'Owner Plus, Owner Pro and Seeker Plus no longer sell').toEqual(['Contact Pack', 'Listing Pass']);
  });

  test('/plans is public and quotes the catalogue price on the cards and in the FAQ, and /checkout sends a signed-out visitor to sign-in', async ({ page }) => {
    await page.context().clearCookies();
    await seedConsent(page);
    /* The catalogue differs from the fee schedule, so the card's price identifies which table was read. */
    const substituted = await catalogueQuoting(page, 'Contact Pack', SENTINEL);
    await page.goto('/plans');

    await expect(page.getByRole('heading', { name: 'Plans & Pricing' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('heading', { name: 'For seekers' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'For owners' })).toBeVisible();
    await expect(desktopLink(page, 'Get a Contact Pack')).toBeVisible();
    await expect(desktopLink(page, 'Open My Listings')).toBeVisible();

    /* Polled, not asserted once: the first paint legitimately shows the fallback. What must not survive is the
       fallback still being on screen once the catalogue has landed. */
    await expect.poll(
      async () => page.getByText(SENTINEL_TEXT, { exact: false }).count(),
      { timeout: 20000, message: 'the Contact Pack card never showed the catalogue price' },
    ).toBeGreaterThan(0);
    // ₹199 is the fee-schedule price: seeing it means the catalogue read was skipped.
    await expect(page.getByText(CONTACT_PACK, { exact: false })).toHaveCount(0);
    // The untouched row still comes through the same read, so this is not an interceptor that
    // replaced the catalogue with one plan.
    await expect(page.getByText(LISTING_PASS, { exact: false }).first()).toBeVisible();

    // The answers live in collapsed `<details>` cards, so open the one quoting the pack price.
    // Clicking the summary rather than setting `open` keeps this honest about the disclosure.
    const question = page.getByText('How do owner contacts work?');
    await expect(question).toBeVisible({ timeout: 20000 });
    await question.click();

    const faq = page.locator('details').filter({ hasText: 'How do owner contacts work?' });
    // With both tables agreeing, an FAQ that had gone back to reading the fee schedule would quote
    // the right number anyway, so it too is checked against the substituted catalogue.
    await expect.poll(
      async () => (await faq.textContent())?.replace(/\s+/g, ' ').trim() ?? '',
      { timeout: 20000, message: 'the FAQ never picked up the catalogue price' },
    ).toContain(`Contact Pack (${SENTINEL_TEXT})`);
    substituted();

    const body = page.locator('body');
    await expect(body).not.toContainText(/owner plus|owner pro|seeker plus/i);

    await page.goto('/checkout?plan=contact-pack');
    await expect(page).toHaveURL(/\/signin/);
    // A guard that bounced to a bare /signin would strand the customer on the dashboard mid-purchase.
    await expect(page).toHaveURL(/next=.*checkout.*contact-pack/);
    await expect(page.getByRole('heading', { name: 'Checkout' })).toHaveCount(0);
  });

  test('a new account holds the free tier, and its Contact Pack CTA hands off to checkout where Pay quotes the price the card did', async ({ page }) => {
    /* A fresh account, because a seeded actor's contact and listing state is an invariant other specs rely on. */
    const mobile = await signedInAsNew(page);
    /* The wire half first: a 404 would render the same free tier through the catch path, so the UI assertion
       alone cannot tell an empty document from an error. */
    const res = await fetch(`${API}/me/subscription`, { headers: await authHeaders(mobile) });
    expect(res.status).toBe(200);
    expect((await res.json())?.status ?? null, 'a brand-new account must hold no plan').not.toBe('active');

    const ent = await (await fetch(`${API}/me/entitlements`, { headers: await authHeaders(mobile) })).json();
    expect(ent.listings).toMatchObject({ allowance: 1, used: 0, passes: [] });
    expect(ent.contacts).toMatchObject({ unlimited: false, allowance: 15, used: 0, remaining: 15, packExpiresAt: null });

    await seedConsent(page);
    const substituted = await catalogueQuoting(page, 'Contact Pack', SENTINEL);
    await page.goto('/plans');
    await expect(desktopLink(page, 'Get a Contact Pack')).toBeVisible({ timeout: 20000 });
    // Nobody is "on" a pass or a pack; there is no Current-plan lock to render.
    await expect(page.getByText('Current plan')).toHaveCount(0);

    await desktopLink(page, 'Get a Contact Pack').click();

    await expect(page).toHaveURL(/\/checkout\?plan=contact-pack/);
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('heading', { name: 'Contact Pack', exact: true })).toBeVisible();
    await expect(page.getByText('Order summary')).toBeVisible();

    // Both pages resolve the catalogue independently; the substituted price makes agreement a catalogue claim.
    const payButton = page.getByRole('button', { name: /^Pay ₹/ });
    await expect.poll(
      async () => (await payButton.first().textContent())?.trim() ?? '',
      { timeout: 20000, message: 'the Pay button never picked up the catalogue price' },
    ).toContain(SENTINEL_TEXT);
    await expect(page.getByRole('button', { name: new RegExp(`Pay ${CONTACT_PACK}`) })).toHaveCount(0);
    substituted();
  });

  test('checkout shows one flat price, for a pack and for a pass', async ({ page }) => {
    const mobile = await signedInAsNew(page);
    await seedConsent(page);
    const listing = await newListing(mobile, { title: 'Flat price probe' });

    await page.goto('/checkout?plan=contact-pack');
    await expect(page.getByText('Order summary')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: new RegExp(`^Pay ${CONTACT_PACK}$`) }).first()).toBeVisible();

    await page.goto(`/checkout?plan=listing-pass&property=${listing.id}`);
    await expect(page.getByText('Order summary')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(listing.title).first()).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`^Pay ${LISTING_PASS}$`) }).first()).toBeVisible();

    // The summary line and the total are the same figure: nothing is added on top at the door.
    const summary = page.locator('div.glass').filter({ hasText: 'Order summary' }).first();
    await expect(summary.getByText(LISTING_PASS, { exact: true })).toHaveCount(2);
    await expect(page.locator('div.max-w-4xl')).not.toContainText(/18\s*%/);
  });

  test('a second checkout while an order is still unpaid names that order, instead of inviting a retry that cannot work; a retired or unknown plan goes back to /plans', async ({ page }) => {
    /* The server caps a user at one open unpaid order and answers 409, so a generic "please try again" tells
       the customer to retry from the one state where retrying cannot work. */
    await signedInAsNew(page);
    await seedConsent(page);

    for (const plan of ['not-a-plan', 'owner2', 'seeker-plus']) {
      await page.goto(`/checkout?plan=${plan}`, { waitUntil: 'commit' });
      await expect(page).toHaveURL(/\/plans$/);
      await expect(page.getByRole('heading', { name: 'Plans & Pricing' })).toBeVisible({ timeout: 20000 });
    }

    await page.goto('/checkout?plan=contact-pack');
    await page.getByRole('button', { name: /^Pay ₹/ }).first().click();
    // The mock gateway hands back a `mock_session_*`, which the checkout lib short-circuits, so the
    // page settles on the pending screen without a real hosted checkout being opened.
    await expect(page.getByRole('heading', { name: 'Payment pending' })).toBeVisible({ timeout: 20000 });
    const orderRef = page.getByText(/Order reference/);
    const firstRef = await orderRef.textContent();

    // Same tab: the saved attempt key resumes that order rather than tripping the one-open-order cap.
    await page.goto('/checkout?plan=contact-pack');
    await page.getByRole('button', { name: /^Pay ₹/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Payment pending' })).toBeVisible({ timeout: 20000 });
    await expect(orderRef).toHaveText(firstRef);

    // Another tab has no saved key, so it asks for a second order and meets the cap.
    await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('dz_co_')).forEach((k) => sessionStorage.removeItem(k)));
    await page.goto('/checkout?plan=contact-pack');
    await page.getByRole('button', { name: /^Pay ₹/ }).first().click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('You already have an order waiting for payment', { timeout: 20000 });
    // The regression itself: the generic copy is what shipped, and it reads as though one more tap
    // would work. Asserting the new message alone would still pass if both were rendered.
    await expect(alert).not.toContainText('please try again');

    // The way out is server-coded, so it shows for any order kind; cancelling frees the cap for a new order.
    await page.getByRole('button', { name: 'Cancel open order and start fresh' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: /^Pay ₹/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Payment pending' })).toBeVisible({ timeout: 20000 });
  });

  test('a payment that clears while the pending screen is open turns into the success screen once the entitlement shows', async ({ page }) => {
    const mobile = await signedInAsNew(page);
    await seedConsent(page);

    await page.goto('/checkout?plan=contact-pack');
    await page.getByRole('button', { name: /^Pay ₹/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Payment pending' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Prototype|saved locally/)).toHaveCount(0);

    settleOrder(await pendingOrderId(mobile), 30);
    await expect(page.getByRole('heading', { name: 'Payment successful!' })).toBeVisible({ timeout: 40000 });
    await expect(page.getByText(/15 contacts added, valid till/)).toBeVisible();
  });

  test('a second pack bought on top of a live one reaches the success screen, though the earliest pack expiry does not move', async ({ page }) => {
    /* Entitlements report the earliest live pack's expiry, so a stacked pack never changes it:
       the paid order is the proof. */
    const mobile = await signedInAsNew(page);
    await seedConsent(page);
    settleOrder((await openOrder(mobile, CONTACT_PACK_PLAN)).id, 10);

    await page.goto('/checkout?plan=contact-pack');
    await page.getByRole('button', { name: /^Pay ₹/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Payment pending' })).toBeVisible({ timeout: 20000 });

    settleOrder(await pendingOrderId(mobile), 30);
    await expect(page.getByRole('heading', { name: 'Payment successful!' })).toBeVisible({ timeout: 40000 });
    await expect(page.getByText(/15 contacts added, valid till/)).toBeVisible();
  });

  test('a declined payment brings Pay back with a decline message, and the retry reopens the same order', async ({ page }) => {
    /* Cashfree keeps a declined order payable; the mock gateway never declines, so the order-status read is stubbed. */
    await signedInAsNew(page);
    await seedConsent(page);
    let declined = true;
    await page.route('**/api/me/subscription/orders/*', (route) =>
      (declined ? route.fulfill({ json: { status: 'failed' } }) : route.fallback()));
    const orders = [];
    page.on('response', async (res) => {
      if (res.request().method() === 'POST' && /\/api\/me\/subscription$/.test(res.url())) orders.push(res);
    });

    await page.goto('/checkout?plan=contact-pack');
    const pay = page.getByRole('button', { name: /^Pay ₹/ }).first();
    await pay.click();
    await expect(page.getByRole('alert')).toContainText("Your payment didn't go through", { timeout: 20000 });
    await expect(page.getByRole('heading', { name: 'Payment pending' })).toHaveCount(0);

    declined = false;
    await pay.click();
    await expect(page.getByRole('heading', { name: 'Payment pending' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(orders.map((r) => r.status())).toEqual([201, 201]);
    const [first, retry] = await Promise.all(orders.map((r) => r.json()));
    expect(retry.paymentRef).toBe(first.paymentRef);
  });

  test('closing the payment window reads as not completed rather than a failure to start, and an order paid before the close still succeeds', async ({ page }) => {
    /* The SDK resolves a closed modal as `{ error }`. The mock gateway's session never reaches the SDK, so the
       session is swapped for a real-looking one and the SDK global is faked. */
    await signedInAsNew(page);
    await seedConsent(page);
    await page.addInitScript(() => { window.Cashfree = () => ({ checkout: async () => ({ error: { message: 'closed' } }) }); });
    await page.route('**/api/me/subscription', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const response = await route.fetch();
      return route.fulfill({ response, json: { ...(await response.json()), paymentSessionId: 'session_e2e' } });
    });
    let status = 'pending';
    await page.route('**/api/me/subscription/orders/*', (route) => route.fulfill({ json: { status } }));

    await page.goto('/checkout?plan=contact-pack');
    const pay = page.getByRole('button', { name: /^Pay ₹/ }).first();
    await pay.click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Payment not completed', { timeout: 20000 });
    await expect(alert).not.toContainText("couldn't start");

    status = 'paid';
    await pay.click();
    await expect(page.getByRole('heading', { name: 'Payment successful!' })).toBeVisible({ timeout: 20000 });
  });

  test('coming back from a bank page with the order id resumes on the pending screen, and an older live pack does not pass for this order', async ({ page }) => {
    const mobile = await signedInAsNew(page);
    await seedConsent(page);
    settleOrder((await openOrder(mobile, CONTACT_PACK_PLAN)).id, 10);
    const order = await openOrder(mobile, CONTACT_PACK_PLAN);

    await page.goto(`/checkout?plan=contact-pack&order_id=${order.paymentRef}`);
    await expect(page.getByRole('heading', { name: 'Payment pending' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(order.paymentRef)).toBeVisible();

    settleOrder(order.id, 30);
    await expect(page.getByRole('heading', { name: 'Payment successful!' })).toBeVisible({ timeout: 40000 });
  });

  test('checkout leaves the payment method to the gateway screen instead of a picker that was never sent', async ({ page }) => {
    await signedInAsNew(page);
    await seedConsent(page);
    await page.goto('/checkout?plan=contact-pack');
    await expect(page.getByText('you pick on the secure Cashfree screen')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('div.max-w-4xl').getByRole('radio')).toHaveCount(0);
  });

  test('the plan cards state what each product grants, with the counts read from the catalogue', async ({ page }) => {
    await page.context().clearCookies();
    await seedConsent(page);
    const { plans } = await (await fetch(`${API}/bootstrap`)).json();
    const pack = plans.find((p) => p.name === 'Contact Pack');
    const pass = plans.find((p) => p.name === 'Listing Pass');
    await page.goto('/plans');

    const card = (name) => page.locator('h3', { hasText: new RegExp(`^${name}$`) }).last().locator('xpath=ancestor::div[contains(@class,"glass")][1]');
    // Three "Free" cards render: the mobile carousel, then the desktop seeker and owner grids.
    const free = page.locator('h3', { hasText: /^Free$/ });
    const cardOf = (heading) => heading.locator('xpath=ancestor::div[contains(@class,"glass")][1]');
    await expect(cardOf(free.nth(1))).toContainText('15 owner contacts within 30 days of your first contact', { timeout: 20000 });
    await expect(cardOf(free.last())).toContainText('Featured for 7 days after verification');
    await expect(cardOf(free.last())).toContainText('1 live listing at a time');
    await expect(card('Contact Pack')).toContainText(`${pack.contactLimit} more owner contacts`);
    await expect(card('Contact Pack')).toContainText(`Valid for ${pack.termDays} days`);
    await expect(card('Contact Pack')).toContainText('No auto-renewal');
    await expect(card('Listing Pass')).toContainText(`Keeps one more listing live for ${pass.termDays} days`);
    await expect(card('Listing Pass')).toContainText('No auto-renewal');
  });

  test('what a buyer holds is named in billing, as a dated purchase and not a subscription', async ({ page }) => {
    const mobile = `${uniqueMobile().slice(0, -1)}7`;
    const listing = await newListing(mobile, { title: 'Billing pass' });
    await approve(listing.id);
    settleOrder((await openOrder(mobile, CONTACT_PACK_PLAN)).id, 30);
    settleOrder((await openOrder(mobile, LISTING_PASS_PLAN, listing.id)).id, 60);

    await signedInAs(page, mobile);
    await seedConsent(page);
    await page.goto('/dashboard#billing');
    await page.getByText('See details').click({ timeout: 20000 });
    await expect(page.getByText(/^Contact pack · till /)).toBeVisible();
    await expect(page.getByText(/^Listing pass · Billing pass \d+ · till /)).toBeVisible();
    await expect(page.getByText(/subscription|auto-renew|renews/i)).toHaveCount(0);
  });

  test('billing shows the contact and listing balances the account holds', async ({ page }) => {
    const mobile = `${uniqueMobile().slice(0, -1)}7`;
    const listing = await newListing(mobile, { title: 'Balance pass' });
    await approve(listing.id);
    settleOrder((await openOrder(mobile, CONTACT_PACK_PLAN)).id, 30);
    settleOrder((await openOrder(mobile, LISTING_PASS_PLAN, listing.id)).id, 60);
    const { contacts, listings } = await (await fetch(`${API}/me/entitlements`, { headers: await authHeaders(mobile) })).json();

    await signedInAs(page, mobile);
    await seedConsent(page);
    await page.goto('/dashboard#billing');
    const balance = (key) => page.locator(`[data-balance="${key}"]`);
    await expect(balance('contacts')).toContainText(`${contacts.remaining}Owner contacts left`, { timeout: 20000 });
    await expect(balance('contacts')).toContainText(`${contacts.used} of ${contacts.allowance} used`);
    await expect(balance('slots')).toContainText(`${Math.max(0, listings.allowance - listings.used)}Free listing slots left`);
    await expect(balance('slots')).toContainText(`${listings.used} of ${listings.allowance} used`);
    await expect(balance('passes')).toContainText(`${listings.passes.length}Listing passes active`);
  });
});