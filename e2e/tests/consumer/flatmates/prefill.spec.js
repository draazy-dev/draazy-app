import { test, expect } from '@playwright/test';
import { API, apiLogin, signedInAs, signedInAsNew, shownMobile } from '../../../helpers/liveAuth.js';
import { ACTORS } from '../../../fixtures/live.js';
import { pickDate } from '../../../helpers/datePicker.helper.js';
import { fillRoomDetails, fillRoomLocation, nextStep, uploadRoomPhotos } from '../../../helpers/roomWizard.js';
// Derive assertions from real owner and tenant inventory so prefill cannot pass against fixture literals.
const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });

async function myListings(token) {
  const res = await fetch(`${API}/me/listings?size=50`, { headers: auth(token) });
  expect(res.status, 'the owner should be able to read their own listings').toBe(200);
  return (await res.json()).content || [];
}

async function openPriceStep(page) {
  await page.goto('/list-property?flatmate=1');
  await expect(page.locator('.lp-meter')).toBeVisible({ timeout: 20_000 });
  await fillRoomDetails(page, { bhk: '2 BHK', roomType: 'Single (1 person)' });
  await nextStep(page);
  await fillRoomLocation(page, { society: `Prefill Heights ${Date.now().toString(36)}` });
  await nextStep(page);
  await expect(page.getByRole('heading', { name: 'Rent & terms', exact: true })).toBeVisible();
  await page.locator('input[data-err="rentShare"]').fill('13500');
  await page.locator('input[data-err="deposit"]').fill('27000');
  await pickDate(page, '[data-err="availableFrom"]', '2026-12-01');
  await page.getByRole('spinbutton', { name: 'Notice period (days)' }).fill('30');
  await page.getByRole('spinbutton', { name: 'Minimum stay (months)' }).fill('0');
}

const backStep = (page) => page.getByRole('button', { name: 'Back', exact: true }).click();

const role = (page, name) => page.getByRole('group', { name: 'You are the' }).getByRole('button', { name, exact: true });
const listingPicker = (page) => page.getByRole('button', { name: 'Link your Draazy listing' });
const tenancyPicker = (page) => page.getByRole('button', { name: 'Renting through Draazy? Link your tenancy' });
const bhkPill = (page, bhk) => page.getByRole('group', { name: 'Size', exact: true })
  .getByRole('button', { name: Number(bhk) >= 4 ? '4+ BHK' : `${bhk} BHK`, exact: true });
const localityValue = (page) => page.locator('[data-err="locality"] .dz-dropdown__value');

test.describe('LIVE: room-post prefill from a listing or tenancy', () => {
  test('an owner links an approved listing, gets its locality and size, and the post sends its UUID; unapproved rows are not offered', async ({ page }) => {
    test.slow();
    const { accessToken } = await apiLogin(ACTORS.owner);
    const all = await myListings(accessToken);
    const listing = all.find((row) => row.status === 'approved' && row.deal === 'rent' && row.slug);
    const unapproved = all.find((row) => row.status !== 'approved');
    expect(listing, 'the seeded owner needs an approved rent listing with a slug').toBeTruthy();
    expect(unapproved, 'the seeded owner needs a non-approved listing for this to mean anything').toBeTruthy();
    await signedInAs(page, ACTORS.owner);
    await openPriceStep(page);
    await role(page, 'Owner').click();

    await listingPicker(page).click();
    // An approved row anchors the absent unapproved option against an empty menu.
    await expect(page.getByRole('option', { name: listing.title, exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: unapproved.title, exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: listing.title, exact: true }).click();
    await test.step('the link fills the locality on Location and the size on Details', async () => {
      await backStep(page);
      await expect(localityValue(page)).toHaveText(listing.locality);
      await backStep(page);
      await expect(bhkPill(page, listing.bhk)).toHaveAttribute('aria-pressed', 'true');
      await nextStep(page);
      await nextStep(page);
    });

    await test.step('switching role drops the claim, so a tenant never carries the owner badge', async () => {
      await role(page, 'Tenant').click();
      await role(page, 'Owner').click();
      await expect(listingPicker(page)).toContainText("Don't link");
      await listingPicker(page).click();
      await page.getByRole('option', { name: listing.title, exact: true }).click();
    });

    // Stubbed so the run leaves no room behind; only the body the form sends matters.
    let sent;
    await page.route('**/api/flatmates/rooms', (route) => {
      sent = route.request().postDataJSON();
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"stubbed"}' });
    });
    let photoId = 0;
    await page.route('**/api/me/photos', (route) => {
      photoId += 1;
      return route.fulfill({
        status: 201, contentType: 'application/json', body: JSON.stringify({ url: `https://cdn.example.test/prefill-room-${photoId}.jpg` }),
      });
    });
    await nextStep(page);
    await uploadRoomPhotos(page);
    await page.getByRole('button', { name: /Post & Find Flatmates/i }).click();
    await expect.poll(() => sent?.propertyId).toBe(listing.id);
    expect(sent.hostRole).toBe('owner');
  });

  test('a sitting tenant links their real tenancy and gets its locality and the owner mobile', async ({ page }) => {
    const { accessToken } = await apiLogin(ACTORS.tenant);
    const tenancies = await (await fetch(`${API}/me/tenancies`, { headers: auth(accessToken) })).json();
    const tenancy = (Array.isArray(tenancies) ? tenancies : [tenancies]).find((row) => row.status !== 'ended');
    expect(tenancy, 'the seeded tenant needs an active tenancy').toBeTruthy();
    // Resolve the tenancy property because its DTO carries an id but no locality.
    const flat = await (await fetch(`${API}/properties/${tenancy.propertyId}`)).json();
    expect(flat.locality, 'the tenancy flat needs a locality to derive from').toBeTruthy();

    await signedInAs(page, ACTORS.tenant);
    await openPriceStep(page);
    await expect(role(page, 'Tenant')).toHaveAttribute('aria-pressed', 'true');
    await tenancyPicker(page).click();
    await page.getByRole('option', { name: flat.title, exact: true }).click();

    const ownerMobile = String(tenancy.owner?.mobile || '').replace(/\D/g, '').slice(-10);
    expect(ownerMobile, 'the tenancy should name the landlord').toHaveLength(10);
    await expect(page.locator('input[autocomplete="tel-national"]')).toHaveValue(shownMobile(ownerMobile));
    await expect(page.getByLabel('The owner knows and agrees to sharing'), 'linking fills facts; the host still attests consent').not.toBeChecked();
    await backStep(page);
    await expect(localityValue(page)).toHaveText(flat.locality);
  });

  test('a host with no listing or tenancy on record is not offered a link they cannot use', async ({ page }) => {
    await signedInAsNew(page);
    await openPriceStep(page);
    await expect(page.getByTestId('room-agreement-later')).toBeVisible();
    await expect(tenancyPicker(page)).toHaveCount(0);
    await role(page, 'Owner').click();
    await expect(page.getByTestId('room-agreement-later')).toHaveCount(0);
    await expect(listingPicker(page)).toHaveCount(0);
  });
});
