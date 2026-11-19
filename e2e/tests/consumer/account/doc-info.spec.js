import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, authHeaders, signedInAs, signedInAsNew, uniqueMobile, uploadedListingPhotos } from '../../../helpers/liveAuth.js';

async function seedConsent(page) {
  await page.addInitScript(() => {
    localStorage.setItem('dz_cookie_consent_v1', JSON.stringify({
      necessary: true,
      functional: true,
      analytics: true,
      marketing: false,
      version: 1,
      ts: Date.now(),
    }));
  });
}

async function openDocuments(page, mobile, context = 'owner') {
  await seedConsent(page);
  await signedInAs(page, mobile);
  const documentsRead = page.waitForResponse((response) => {
    const path = new URL(response.url()).pathname;
    const isOwnerVault = /^\/api\/me\/documents\/[^/]+$/.test(path)
      && !path.endsWith('/personal') && !path.endsWith('/requests');
    return response.request().method() === 'GET'
      && (context === 'owner' ? isOwnerVault : path === '/api/me/documents/personal');
  });
  await page.goto('/dashboard#documents');
  const response = await documentsRead;
  expect(response.status(), `loading the selected ${context} vault: ${new URL(response.url()).pathname}`).toBe(200);
  await expect(page.getByText('Document Vault', { exact: true })).toBeVisible();
}

async function center(page, locator) {
  await expect(locator).toBeVisible();
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
}

test.describe('Document Vault information — live APIs', () => {
  test('an owner hovering a document-information dot sees its explanatory tooltip', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await openDocuments(page, ACTORS.owner);

    // Index II applies to every property type, deal and stage, so it survives whichever listing is selected.
    const dot = page.getByRole('button', { name: /What is Index II/i }).first();
    await center(page, dot);
    await dot.hover();

    const tooltip = page.locator('.dz-tip[role="tooltip"]');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(/officially registered/i);
    await expect(page.locator('[data-tip][aria-describedby]').first()).toBeVisible();

    await page.mouse.move(2, 2);
    await expect(tooltip).toBeHidden();
  });

  test('the touch version opens and dismisses the same tooltip without a scroll race', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();

    await openDocuments(page, ACTORS.owner);
    const dot = page.getByRole('button', { name: /What is Index II/i }).first();
    await center(page, dot);
    await dot.tap();

    const tooltip = page.locator('.dz-tip[role="tooltip"]');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Index II');

    await page.mouse.click(5, 5);
    await expect(tooltip).toBeHidden();
    await context.close();
  });

  test('tenant agreement information stays in My Tenancy, with no Personal tab beside it', async ({ page }) => {
    await openDocuments(page, ACTORS.tenant, 'tenancy');
    // The seeded tenant also hosts flatmate rooms, so the vault opens on those first.
    await page.getByRole('button', { name: 'My Tenancy', exact: true }).click();

    const agreement = page.getByRole('button', { name: /Rent Agreement/i }).first();
    await expect(agreement).toBeVisible();
    await expect(agreement).toContainText(/for|Registered/i);

    await expect(page.getByRole('button', { name: /^Personal$/ }), 'the HRA form moved to /tools/rent-receipt-generator').toHaveCount(0);
    await expect(page.getByText('Identity & KYC'), 'identity papers are no longer collected').toHaveCount(0);
    await expect(page.getByText(/HRA Rent Receipts/)).toHaveCount(0);
  });

  test('a user with no listing, room or tenancy sees one empty-state line, not an empty vault', async ({ page }) => {
    await openDocuments(page, uniqueMobile(), 'none');
    await expect(page.getByText('Your documents show up here once you list a property or rent a home.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Property docs|My Tenancy|Personal)$/ })).toHaveCount(0);
  });
});

/* A throwaway owner per test, so the selected listing is exactly the one under test and no seeded upload
   can keep an otherwise-irrelevant category on screen. */
async function vaultFor(page, listing) {
  await seedConsent(page);
  const mobile = await signedInAsNew(page);
  const headers = await authHeaders(mobile);
  const res = await fetch(`${API}/me/listings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ city: 'Pune', locality: 'Baner', images: await uploadedListingPhotos(headers), ...listing }),
  });
  expect(res.status, 'creating the listing').toBe(201);
  const { id } = await res.json();
  await page.goto(`/dashboard?tab=documents&prop=${encodeURIComponent(id)}`);
  await expect(page.getByRole('button', { name: /What is Index II/i }).first()).toBeVisible({ timeout: 20000 });
}

const tile = (page, category) => page.getByRole('button', { name: `What is ${category}? Why it’s needed` });

test.describe('Document Vault — only the documents the selected property can have', () => {
  test('a ready flat for rent shows society papers and the rent agreement, not purchase papers or a loan checklist', async ({ page }) => {
    await vaultFor(page, { title: 'Zztest vault rent flat', deal: 'rent', propertyType: 'Flat', price: 23000, bhk: 2, area: 800 });

    await expect(page.getByText('Society & NOC', { exact: true })).toBeVisible();
    await expect(tile(page, 'Occupancy Certificate')).toBeVisible();
    const agreement = page.getByRole('button', { name: /Rent Agreement/i }).first();
    await expect(agreement).toBeVisible();
    await expect(agreement).toContainText(/for this property|Registered agreement for/i);

    await expect(page.getByText('Purchase & Payments', { exact: true })).toHaveCount(0);
    await expect(tile(page, 'Agreement to Sale')).toHaveCount(0);
    await expect(tile(page, '7/12 Extract')).toHaveCount(0);
    await expect(page.getByText('Home Loan Checklist')).toHaveCount(0);
  });

  test('an under-construction flat for sale hides papers that only exist after possession, and has no rent agreement', async ({ page }) => {
    await vaultFor(page, {
      title: 'Zztest vault UC flat', deal: 'buy', propertyType: 'Flat', price: 6500000, bhk: 2, area: 900,
      possession: 'under-construction',
    });

    await expect(page.getByText('Purchase & Payments', { exact: true })).toBeVisible();
    await expect(tile(page, 'Agreement to Sale')).toBeVisible();
    await expect(tile(page, 'Commencement Certificate')).toBeVisible();

    for (const category of ['Sale Deed', 'Occupancy Certificate', 'Possession Letter', 'Share Certificate', 'Electricity Bill']) {
      await expect(tile(page, category), `${category} cannot exist before construction is complete`).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: /Rent Agreement/i })).toHaveCount(0);
  });

  test('an open plot shows land records and no society or building papers', async ({ page }) => {
    await vaultFor(page, {
      title: 'Zztest vault plot', deal: 'buy', propertyType: 'Open Plot', price: 7200000, area: 12, areaUnit: 'guntha',
      landUse: 'residential', formDetails: { plotZone: 'Residential (R1)' },
    });

    await expect(tile(page, '7/12 Extract')).toBeVisible();
    await expect(tile(page, 'NA Order (Non-Agricultural)')).toBeVisible();
    await expect(page.getByText('Society & NOC', { exact: true })).toHaveCount(0);
    await expect(tile(page, 'Occupancy Certificate')).toHaveCount(0);
    await expect(tile(page, 'Floor Plan')).toHaveCount(0);
  });
});
