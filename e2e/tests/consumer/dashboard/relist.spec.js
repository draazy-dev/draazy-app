import { test, expect } from '../../../fixtures/live.js';
import { signedInAs, seedConsent, uniqueMobile } from '../../../helpers/liveAuth.js';
import { pickDate } from '../../../helpers/datePicker.helper.js';
import { call, approve, newListing, seedAgreement, sql } from '../../../helpers/monetisation.js';
import { istInDays, shortLabel } from '../../../helpers/availability.js';

// `uniqueMobile()` can collide within one millisecond, merging distinct accounts.
let seq = 0;
const newMobile = () => `${uniqueMobile().slice(0, -1)}${(seq++) % 10}`;

const TENANCY_ROW = (propertyId) => sql(`select status || ',' || coalesce(end_date::text, '') from tenancies where property_id = '${propertyId}'`).split(/\r?\n/)[0].trim();

/** A rent listing, closed to a tenant who has confirmed the tenancy. */
async function letFlat() {
  const owner = newMobile();
  const tenant = newMobile();
  for (const [mobile, name] of [[owner, 'Zztest Relist Owner'], [tenant, 'Zztest Relist Tenant']]) {
    expect((await call('PATCH', '/auth/me', mobile, { name })).status).toBe(200);
  }
  const listing = await newListing(owner, { title: 'Relist flat', price: 31000 });
  await approve(listing.id);
  const closed = await call('POST', `/me/deals/${listing.id}/close`, owner, { agreedPrice: 31000, counterpartyMobile: tenant });
  expect(closed.status, JSON.stringify(closed.json)).toBe(200);
  const [pending] = (await call('GET', '/me/tenancies', tenant)).json;
  const confirmed = await call('POST', `/me/tenancies/${pending.id}/confirm`, tenant);
  expect(confirmed.status, JSON.stringify(confirmed.json)).toBe(200);
  expect(TENANCY_ROW(listing.id)).toMatch(/^active,/);
  return { owner, tenant, listing };
}

const modal = (page) => page.getByRole('dialog').filter({ hasText: 'List it again' });
const dateField = '[data-testid="availability-field"] .dz-datefield';

test.describe('LIVE: relisting a let flat', () => {
  test('Reopen listing asks for a date; the listing shows "Available from" it and the tenancy ends the day before', async ({ page }) => {
    test.slow();
    await seedConsent(page);
    const { owner, listing } = await letFlat();
    const date = istInDays(25);

    await signedInAs(page, owner);
    await page.goto('/dashboard#properties');
    await page.getByRole('button', { name: 'Reopen listing' }).first().click();
    await expect(modal(page)).toBeVisible({ timeout: 20000 });
    await expect(modal(page).getByText(`When is ${listing.title} available from?`)).toBeVisible();

    await pickDate(page, `[role="dialog"] ${dateField}`, date);
    const reopened = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/me/deals/${listing.id}/reopen`);
    await modal(page).getByRole('button', { name: 'List again', exact: true }).click();
    const response = await reopened;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toEqual({ availableOn: date });

    await expect(page.getByText(/reopened for listing/)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(`Available from ${shortLabel(date)}`).first()).toBeVisible();
    expect(TENANCY_ROW(listing.id)).toBe(`ended,${istInDays(24)}`);
    const mine = (await call('GET', `/me/listings/${listing.id}`, owner)).json;
    expect(mine.availableOn).toBe(date);
  });

  test('"Tenant moving out? List it again" on a renewal strip opens the same question, and Cancel leaves the tenancy alone', async ({ page }) => {
    test.slow();
    await seedConsent(page);
    const { owner, tenant, listing } = await letFlat();
    await seedAgreement(owner, listing.id, tenant, { daysLeft: 40 });

    await signedInAs(page, owner);
    await page.goto('/dashboard#documents');
    await page.getByRole('button', { name: /^Rent Agreement/ }).first().click();
    await page.getByRole('link', { name: 'Tenant moving out? List it again' }).click();

    await expect(modal(page)).toBeVisible({ timeout: 20000 });
    await expect(page).not.toHaveURL(/relist=/);
    await modal(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(modal(page)).toHaveCount(0);
    expect(TENANCY_ROW(listing.id)).toMatch(/^active,/);
  });

  test('a listing that is not let cannot be relisted from a link, and says so', async ({ page }) => {
    await seedConsent(page);
    const owner = newMobile();
    const listing = await newListing(owner, { title: 'Relist not let' });
    await approve(listing.id);

    await signedInAs(page, owner);
    await page.goto(`/dashboard?relist=${listing.id}#properties`);
    await expect(page.getByText("That listing can't be relisted right now.")).toBeVisible({ timeout: 20000 });
    await expect(modal(page)).toHaveCount(0);
  });

  test('the date cannot be in the past', async () => {
    const { owner, listing } = await letFlat();
    const past = await call('POST', `/me/deals/${listing.id}/reopen`, owner, { availableOn: istInDays(-2) });
    expect(past.status).toBe(422);
    expect(TENANCY_ROW(listing.id)).toMatch(/^active,/);
  });
});
