import { test, expect } from '../../../fixtures/live.js';
import { signedInAs, seedConsent, uniqueMobile } from '../../../helpers/liveAuth.js';
import { call, newListing, seedAgreement } from '../../../helpers/monetisation.js';

/* The strip and the saved-brokerage card come off `GET /me/rent-agreements` rows. The agreement row is filed directly,
   standing in for the registration desk, so its term can end on the day the case needs. */

// `uniqueMobile()` can collide within one millisecond, merging distinct accounts.
let seq = 0;
const newMobile = () => `${uniqueMobile().slice(0, -1)}${(seq++) % 10}`;

const RENT = 24000;

async function agreementOn({ daysLeft, status }) {
  const owner = newMobile();
  const tenant = newMobile();
  const listing = await newListing(owner, { title: 'Renewal probe', price: RENT });
  const agreement = await seedAgreement(owner, listing.id, tenant, { daysLeft, rent: RENT, status });
  return { owner, tenant, listing, agreement };
}

const ownerVault = async (page, mobile) => {
  await signedInAs(page, mobile);
  await page.goto('/dashboard#documents');
  await page.getByRole('button', { name: /^Rent Agreement/ }).first().click();
};

test.describe('LIVE: rent agreement renewal and the brokerage-saved card', () => {
  test('the agreement rows carry the desk case and the end date the strip is built from', async () => {
    const { owner, tenant, listing, agreement } = await agreementOn({ daysLeft: 20 });

    for (const side of [owner, tenant]) {
      const res = await call('GET', '/me/rent-agreements', side);
      expect(res.status).toBe(200);
      const row = res.json.find((r) => r.id === agreement.id);
      expect(row, 'both parties see the agreement').toBeTruthy();
      expect(row).toMatchObject({ propertyId: listing.id, serviceRequestId: agreement.serviceRequestId, status: 'registered', rent: RENT });

      const days = (Date.parse(`${row.endDate}T00:00:00Z`) - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(18);
      expect(days).toBeLessThan(22);
    }
  });

  test('an owner whose agreement ends within 20 days is offered the renewal for ₹499 and a relisting, beside what they saved', async ({ page }) => {
    await seedConsent(page);
    const { owner, listing, agreement } = await agreementOn({ daysLeft: 20 });
    // The agreements answering before the listings must not park the owner in the tenant view.
    await page.route(/\/me\/dashboard(\?|$)/, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await ownerVault(page, owner);

    await expect(page.getByText(/^Ends \d/)).toBeVisible({ timeout: 20000 });
    const renew = page.getByRole('link', { name: 'Renew for ₹499' });
    await expect(renew).toHaveAttribute('href', `/services/rent-agreement?listing=${listing.id}&renew=${agreement.id}`);

    const relist = page.getByRole('link', { name: 'Tenant moving out? List it again' });
    await expect(relist).toHaveAttribute('href', new RegExp(`^/dashboard\\?relist=${listing.id}(&from=\\d{4}-\\d{2}-\\d{2})?#properties$`));

    await expect(page.getByText('You saved ₹24,000 in brokerage')).toBeVisible();
    await expect(page.getByText('You saved ₹24,000 in brokerage').locator('xpath=..').getByRole('button', { name: 'Share' })).toBeVisible();
  });

  test('a tenant is offered the renewal and the saved line, but not the owner’s relisting', async ({ page }) => {
    await seedConsent(page);
    const { tenant } = await agreementOn({ daysLeft: 20 });
    await signedInAs(page, tenant);
    await page.goto('/dashboard#documents');

    await expect(page.getByRole('link', { name: 'Renew for ₹499' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('You saved ₹24,000 in brokerage')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tenant moving out? List it again' })).toHaveCount(0);
  });

  test('across the whole 60-day window the owner is offered both the renewal and a relisting', async ({ page }) => {
    await seedConsent(page);
    const { owner, listing, agreement } = await agreementOn({ daysLeft: 45 });
    await ownerVault(page, owner);

    await expect(page.getByRole('link', { name: 'Renew for ₹499' })).toHaveAttribute('href', `/services/rent-agreement?listing=${listing.id}&renew=${agreement.id}`, { timeout: 20000 });
    await expect(page.getByRole('link', { name: 'Tenant moving out? List it again' }))
      .toHaveAttribute('href', new RegExp(`^/dashboard\\?relist=${listing.id}(&from=\\d{4}-\\d{2}-\\d{2})?#properties$`));
  });
  test('a long-running agreement shows only what was saved', async ({ page }) => {
    await seedConsent(page);
    const running = await agreementOn({ daysLeft: 200 });
    await ownerVault(page, running.owner);
    await expect(page.getByText('You saved ₹24,000 in brokerage')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('link', { name: 'Renew for ₹499' })).toHaveCount(0);
    await expect(page.getByText(/^Ends \d/)).toHaveCount(0);
  });

  test('a draft agreement carries neither the strip nor the saved line', async ({ page }) => {
    await seedConsent(page);
    const draft = await agreementOn({ daysLeft: 20, status: 'draft' });
    await ownerVault(page, draft.owner);
    await expect(page.getByRole('button', { name: /^Rent Agreement/ }).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('You saved')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Renew for ₹499' })).toHaveCount(0);
  });
});

test.describe('LIVE: the renewal prefill', () => {
  const digits = (value) => String(value ?? '').replace(/\D/g, '').slice(-10);

  test('the owner and the tenant whose mobile matches read what a renewal starts from', async () => {
    const { owner, tenant, listing, agreement } = await agreementOn({ daysLeft: 20 });
    const { endDate } = (await call('GET', '/me/rent-agreements', owner)).json.find((r) => r.id === agreement.id);
    const dayAfter = new Date(Date.parse(`${endDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

    for (const side of [owner, tenant]) {
      const res = await call('GET', `/me/rent-agreements/${agreement.id}/renewal`, side);
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      expect(res.json).toMatchObject({
        propertyId: listing.id, serviceRequestId: agreement.serviceRequestId, rent: RENT, deposit: RENT * 5, months: 11, startDate: dayAfter,
      });
      expect(digits(res.json.owner.mobile)).toBe(digits(owner));
      expect(res.json.tenants.map((p) => digits(p.mobile))).toContain(digits(tenant));
    }
  });

  test('a stranger, a draft and an id that is no agreement all get 404', async () => {
    const { owner, agreement } = await agreementOn({ daysLeft: 20 });
    const draft = await agreementOn({ daysLeft: 20, status: 'draft' });

    expect((await call('GET', `/me/rent-agreements/${agreement.id}/renewal`, newMobile())).status).toBe(404);
    expect((await call('GET', `/me/rent-agreements/${draft.agreement.id}/renewal`, draft.owner)).status).toBe(404);
    expect((await call('GET', '/me/rent-agreements/not-an-agreement/renewal', owner)).status).toBe(404);
    expect((await call('GET', `/me/rent-agreements/${agreement.serviceRequestId}/renewal`, owner)).status, 'the desk case id is not the agreement id').toBe(404);
  });

  test('a tenant who follows the renew link reaches the wizard with the renewal read for them', async ({ page }) => {
    await seedConsent(page);
    const { tenant, listing, agreement } = await agreementOn({ daysLeft: 20 });
    await signedInAs(page, tenant);

    const read = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/me/rent-agreements/${agreement.id}/renewal`);
    await page.goto(`/services/rent-agreement?listing=${listing.id}&renew=${agreement.id}`);
    expect((await read).status()).toBe(200);

    await expect(page.getByText(/Renewal\s\S+\scheck the rent and dates, then submit/)).toBeVisible({ timeout: 20000 });
    await expect(page).not.toHaveURL(/renew=/);
  });
});