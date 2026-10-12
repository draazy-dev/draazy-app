import { test, expect } from '../../../fixtures/live.js';
import { API, apiLogin, signedInAs, uniqueMobile, seedConsent } from '../../../helpers/liveAuth.js';
import { call, entitlementsOf, openOrder, pendingOrderId, settleOrder, sql, CONTACT_PACK_PLAN } from '../../../helpers/monetisation.js';

/* A signed payment webhook needs a machine-local secret, so the paid state is reached by settling the order row. */

const FREE_CONTACTS = 15;

async function someListings(count) {
  const res = await fetch(`${API}/properties?size=${count}`);
  expect(res.status).toBe(200);
  const rows = (await res.json()).content;
  expect(rows.length, 'the seeded catalogue has listings to contact').toBeGreaterThanOrEqual(count);
  return rows.map((r) => ({ id: r.id, ref: r.slug || r.id }));
}

const ask = (mobile, propertyId) => call('POST', '/contacts/request', mobile, { propertyId });

/** A buyer who has spent every free contact, over HTTP: the subject is the press after the fifteenth. */
async function exhaustedBuyer() {
  const mobile = uniqueMobile();
  await apiLogin(mobile);
  const listings = await someListings(FREE_CONTACTS + 2);
  for (const { id } of listings.slice(0, FREE_CONTACTS)) {
    expect((await ask(mobile, id)).status, 'the free contacts are spendable in full').toBe(200);
  }
  return { mobile, next: listings[FREE_CONTACTS], another: listings[FREE_CONTACTS + 1] };
}

test.describe('LIVE: the contact pack', () => {
  test('past the free contacts the modal offers the pack, checkout is one flat ₹199, and a paid pack opens fifteen more', async ({ page }) => {
    test.slow();
    await seedConsent(page);
    const { mobile, next, another } = await exhaustedBuyer();
    await signedInAs(page, mobile);

    await test.step('the sixteenth press is refused by the server and the modal sells the pack', async () => {
      await page.goto(`/property/${next.ref}`);
      const press = page.getByRole('button', { name: /Request number/i }).first();
      await press.waitFor({ timeout: 20000 });
      const [refused] = await Promise.all([
        page.waitForResponse((r) => /\/api\/contacts\/request$/.test(r.url()) && r.request().method() === 'POST'),
        press.click(),
      ]);
      expect(refused.status()).toBe(422);
      expect((await refused.json()).error).toBe('contact_quota_exhausted');

      const offer = page.getByTestId('contacts-exhausted').getByTestId('contacts-exhausted-plan');
      await expect(offer).toContainText('₹199');
      await offer.click();
    });

    await test.step('checkout charges the flat price and opens an unpaid order', async () => {
      await expect(page).toHaveURL(/\/checkout\?plan=contact-pack/);
      await expect(page.getByRole('button', { name: /^Pay ₹199$/ }).first()).toBeVisible({ timeout: 20000 });
      await expect(page.getByText('Prices include GST.')).toBeVisible();
      await page.getByRole('button', { name: /^Pay ₹199$/ }).first().click();
      await expect(page.getByRole('heading', { name: 'Payment pending' })).toBeVisible({ timeout: 20000 });
      expect((await ask(mobile, next.id)).status, 'an unpaid order opens nothing').toBe(422);
    });

    await test.step('once paid the pack adds fifteen contacts for thirty days, and the next press goes through', async () => {
      settleOrder(await pendingOrderId(mobile), 30);
      const { contacts } = await entitlementsOf(mobile);
      expect(contacts.remaining).toBe(15);
      const days = (Date.parse(contacts.packExpiresAt) - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThanOrEqual(30);

      expect((await ask(mobile, next.id)).status).toBe(200);
      expect((await entitlementsOf(mobile)).contacts.remaining).toBe(14);
      expect((await ask(mobile, another.id)).status).toBe(200);
    });
  });

  test('the free contacts lapse thirty days after the first one, and the pack is then the way on', async () => {
    const mobile = uniqueMobile();
    const { accessToken } = await apiLogin(mobile);
    const [first, second] = await someListings(2);

    expect((await ask(mobile, first.id)).status).toBe(200);
    const me = await call('GET', '/auth/me', mobile);
    const userId = me.json.id;
    expect(userId).toBeTruthy();
    expect(accessToken).toBeTruthy();

    sql(`update contact_requests set first_requested_at = now() - interval '31 days' where requester_id = '${userId.replace(/[^0-9a-f-]/gi, '')}'`);
    const { contacts } = await entitlementsOf(mobile);
    expect(contacts.remaining, 'fourteen free contacts unspent, but the window has closed').toBe(0);
    expect(Date.parse(contacts.freeWindowEndsAt)).toBeLessThan(Date.now());

    const refused = await ask(mobile, second.id);
    expect(refused.status).toBe(422);
    expect(refused.json.error).toBe('contact_quota_exhausted');

    const order = await openOrder(mobile, CONTACT_PACK_PLAN);
    settleOrder(order.id, 30);
    expect((await ask(mobile, second.id)).status).toBe(200);
    expect((await entitlementsOf(mobile)).contacts.remaining).toBe(14);
  });
});
