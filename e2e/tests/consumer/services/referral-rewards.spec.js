/* The screen half only — quota arithmetic is `consumer/entitlements`, the /refer code and share
 * link are `refer`. Withdrawal of already-earned bonuses is filed in `tasks/DECISIONS-NEEDED.md`. */
import { expect, test, ACTORS } from '../../../fixtures/live.js';
import { API, apiLogin, signedInAs, signIn, uniqueMobile } from '../../../helpers/liveAuth.js';
import { ownersApproveAll } from '../../../helpers/monetisation.js';
import { gotoSettled, reloadSettled } from '../../../helpers/settle.js';

const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });

/** `settings.fees.freeContactLimit`. Mirrored, so a drift in the seed shows up here as a failure. */
const FREE_LIMIT = 15;

const entitlements = (token) =>
  fetch(`${API}/me/entitlements`, { headers: auth(token) }).then((r) => r.json());

/* Borrowed from the seeded catalogue rather than minted: this file has no opinion about the
 * listings beyond existing and belonging to somebody else. */
async function someListings(count) {
  const res = await fetch(`${API}/properties?size=100`);
  expect(res.status).toBe(200);
  const rows = (await res.json()).content;
  expect(rows.length, 'the seeded catalogue has listings to contact').toBeGreaterThanOrEqual(count);
  return rows.map((r) => ({ id: r.id, ref: r.slug || r.id, deal: r.deal }));
}

const askFor = (token, propertyId) =>
  fetch(`${API}/contacts/request`, { method: 'POST', headers: auth(token), body: JSON.stringify({ propertyId }) });

/* Spent over HTTP rather than by clicking fifteen times — the subject is the sixteenth press. A
 * fresh account each time, because the seeded actors publish their quota state as an invariant. */
async function exhaustedBuyer(page) {
  const mobile = uniqueMobile();
  const { accessToken } = await apiLogin(mobile);
  const listings = await someListings(FREE_LIMIT + 1);

  for (const { id } of listings.slice(0, FREE_LIMIT)) {
    expect((await askFor(accessToken, id)).status, 'the free allowance is spendable in full').toBe(200);
    ownersApproveAll(mobile);
  }
  await signedInAs(page, mobile);
  const untouched = listings.slice(FREE_LIMIT).find((l) => l.deal === 'rent');
  expect(untouched, 'a rent listing is left to press on, so the upsell is the rent pack').toBeTruthy();
  return { mobile, accessToken, untouched };
}

/* The button renders in both the desktop sidebar card and the contact sheet and this file has no
   opinion about which answered, so it is reached by role and `.first()`. */
const requestBtn = (page) => page.getByRole('button', { name: /Request number/i }).first();

async function openListing(page, ref, flags) {
  /* Below `lg` the sidebar card is `display:none`, so the sticky CTA's contact sheet is the only
     surface carrying the button. An unset viewport is a maximised window, i.e. the desktop branch. */
  const phone = (page.viewportSize()?.width ?? 1024) < 1024;
  /* With `inAppMessaging` on, that CTA queues a chat and navigates to /messages instead of opening
     the sheet. Written before the page loads — live, the flag is a row, not a localStorage key. */
  if (phone) await flags.disable('inAppMessaging');
  await page.goto(`/property/${ref}`);
  await page.evaluate(() => document.querySelectorAll('.reveal,.fade-up,.fade-in').forEach((el) => el.classList.add('visible')));
  if (phone) {
    await page.locator('.dz-sticky-cta').getByRole('button', { name: /contact owner/i }).click({ timeout: 20000 });
  }
  await requestBtn(page).waitFor({ timeout: 20000 });
}

const exhaustedModal = (page) => page.getByTestId('contacts-exhausted');

/** Press, and hand back the response the press produced. Armed before the click, never after. */
async function pressAndCatch(page) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => /\/api\/contacts\/request$/.test(r.url()) && r.request().method() === 'POST', { timeout: 20000 }),
    requestBtn(page).click(),
  ]);
  return res;
}

test.describe('the free-contact wall, on screen', () => {
  test('an exhausted press is refused by the server and opens the upsell with the paid route only, with or without the flag', async ({ page, viewport, flags }) => {
    const { untouched } = await exhaustedBuyer(page);
    await openListing(page, untouched.ref, flags);

    /* A modal on screen is equally consistent with a browser that decided locally and never asked;
       only the wire tells them apart. */
    const refused = await pressAndCatch(page);
    expect(refused.status(), 'the press left the browser and was turned away by the server').toBe(422);
    expect((await refused.json()).error).toBe('contact_quota_exhausted');

    await expect(exhaustedModal(page)).toBeVisible();
    await expect(exhaustedModal(page).getByTestId('contacts-exhausted-plan')).toHaveAttribute('href', /^\/checkout\?plan=contact-pack&next=/);
    await expect(exhaustedModal(page).getByTestId('contacts-exhausted-refer')).toHaveCount(0);
    await expect(exhaustedModal(page).getByTestId('contacts-exhausted-plan')).toContainText('₹199');

    /* The two sheets only stack below `lg`. On desktop the press comes from the sidebar card, which
       is not a dialog, so there is no pair for one keypress to collapse. */
    if ((viewport?.width ?? 1024) < 1024) {
      const contactForm = page.getByRole('dialog', { name: /contact the owner/i });
      /* The upsell mounts *inside* the contact form and both register a document-level Escape handler,
         so without the top-most-dialog guard one keypress runs both and loses the typed message. */
      await page.keyboard.press('Escape');
      await expect(exhaustedModal(page)).toHaveCount(0);
      await expect(contactForm).toBeVisible();

      // The second press still works, which a guard that never released would break.
      await page.keyboard.press('Escape');
      await expect(contactForm).toHaveCount(0);
    }

    // Referrers do not earn contacts, so the flag must not add a refer route to this modal.
    await flags.disable('referralRewards');
    await openListing(page, untouched.ref, flags);
    await pressAndCatch(page);

    await expect(exhaustedModal(page)).toBeVisible();
    await expect(exhaustedModal(page).getByTestId('contacts-exhausted-refer')).toHaveCount(0);
    await expect(exhaustedModal(page).getByTestId('contacts-exhausted-plan')).toBeVisible();
  });

  test('the countdown on the page is the number the server is holding', async ({ page, flags }) => {
    const mobile = uniqueMobile();
    const { accessToken } = await apiLogin(mobile);
    const [first, second] = await someListings(2);

    expect((await askFor(accessToken, first.id)).status).toBe(200);

    /* Read outside the browser and asserted against that rather than `FREE_LIMIT - 1`: a literal
       would keep passing if the page stopped asking and started counting again. */
    const { contacts } = await entitlements(accessToken);
    expect(contacts.used, 'the fixture spent exactly one').toBe(1);

    await signedInAs(page, mobile);
    await openListing(page, second.ref, flags);
    /* `:visible`, not `.first()`: both surfaces render this countdown, and `toContainText` reads
       `textContent` right through a `display:none` parent. */
    const countdown = page.locator('[data-testid="contacts-left"]:visible');
    await expect(countdown).toHaveCount(1);
    await expect(countdown).toContainText(String(contacts.remaining));
  });
});

test.describe('referralRewards is a server document', () => {
  test('/refer shows the 50% pitch and the server\'s stats with the flag on, and a send is refused as "paused" with it off', async ({ page, flags }) => {
    const mobile = uniqueMobile();
    const { accessToken } = await apiLogin(mobile);

    await flags.enable('referralRewards');
    const summary = await fetch(`${API}/me/referrals`, { headers: auth(accessToken) }).then((r) => r.json());

    await signedInAs(page, mobile);
    await gotoSettled(page, '/refer');

    await expect(page.getByTestId('refer-invite-form')).toBeVisible();
    await expect(page.getByTestId('refer-how')).toContainText(/% off the service fee of your next rent agreement/);
    /* The number on screen is the server's, read from the same endpoint rather than pinned to a literal. */
    await expect(page.getByTestId('refer-rewards-earned')).toHaveText(String(summary.rewards.earned));
    await expect(page.getByTestId('refer-rewards-left')).toHaveText(String(summary.rewards.remaining));

    await flags.disable('referralRewards');
    await reloadSettled(page);

    await page.locator('#refer-friend-mobile').fill('9876543210');
    const [res] = await Promise.all([
      page.waitForResponse((r) => /\/api\/me\/referrals\/invites$/.test(r.url()) && r.request().method() === 'POST'),
      page.getByTestId('refer-invite-send').click(),
    ]);
    expect(res.status()).toBe(409);
    await expect(page.getByTestId('refer-invite-status')).toHaveText('Referrals are paused right now. Please try again later.');
  });

  test('the switch is the server\'s too: a switched-off programme refuses a redeem', async ({ flags }) => {
    const referrer = uniqueMobile();
    const { accessToken: referrerToken } = await apiLogin(referrer);
    const { code } = await fetch(`${API}/me/referrals`, { headers: auth(referrerToken) }).then((r) => r.json());
    const { accessToken } = await apiLogin(uniqueMobile());

    await flags.disable('referralRewards');
    const refused = await fetch(`${API}/referrals/redeem`, { method: 'POST', headers: auth(accessToken), body: JSON.stringify({ code }) });
    expect(refused.status).toBe(409);
  });
  test('Ops switching it off is a confirmed write that lands on the server', async ({ page, flags }) => {
    await flags.enable('referralRewards');
    await signIn(page, ACTORS.admin, { screen: 'staff' });
    await gotoSettled(page, '/admin/settings?tab=flags');

    await page.getByRole('button', { name: /Monetization & Payments/i }).click();
    const row = page.getByRole('switch', { name: 'Toggle Referral rewards' });
    await expect(row).toHaveAttribute('aria-checked', 'true');

    /* Confirmation-gated: the switch alone must not commit. Read back through the public `GET /bootstrap` (`flags`)
       so an optimistic toggle that never reached the server cannot satisfy it. */
    await row.click();
    await expect(page.getByText('Disable Referral Rewards?')).toBeVisible();
    const midFlight = (await (await fetch(`${API}/bootstrap`)).json()).flags;
    expect(midFlight.referralRewards, 'an unconfirmed toggle changed the server').toBe(true);

    await page.getByRole('button', { name: /^Disable$/ }).click();
    await expect(row).toHaveAttribute('aria-checked', 'false');

    /* Polled: the switch flips from optimistic local state, so `aria-checked` settles a turn before
       the write is on the wire. */
    await expect
      .poll(async () => (await (await fetch(`${API}/bootstrap`)).json()).flags.referralRewards,
        { message: 'the disable never reached the settings document' })
      .toBe(false);
  });
});
