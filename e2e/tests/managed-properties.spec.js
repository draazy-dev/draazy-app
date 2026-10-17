// @ts-check
// Assert network writes and independent reads so browser-local success cannot pass as persistence.
import { test, expect } from '@playwright/test';
import { PDFDocument } from '../../frontend/node_modules/pdf-lib/cjs/index.js';
import { trackErrors } from '../helpers/console.js';
import { signedInAs, authHeaders, apiLogin, uniqueMobile, API, shownMobile } from '../helpers/liveAuth.js';
import { pickPlaceholderLocality } from '../helpers/locality.js';
import { ensureLocalityStats } from '../helpers/localityStats.js';

async function unsignedPdfBuffer() {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]);
  return Buffer.from(await pdf.save());
}

const OWNER = { mobile: '9470744469' };

// Track created IDs so teardown leaves other specs' managed records intact.
const created = [];

async function estimateAndSave(page) {
  await page.goto('/dashboard#owner-hub');
  await ensureLocalityStats('Baner');
  await pickPlaceholderLocality(page, 'Baner');
  await page.getByRole('button', { name: /Estimate now/i }).click();
  await expect(page.getByText(/Estimated monthly rent/i)).toBeVisible();

  const posted = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/me/managed-properties'
      && r.request().method() === 'POST',
    { timeout: 20000 },
  );
  await page.getByRole('button', { name: /Save as my property/i }).click();
  expect((await posted).status()).toBe(201);

  await page.waitForURL(/\/owner-hub\/property\//, { timeout: 20000 });
  const id = new URL(page.url()).pathname.split('/').pop();
  created.push(id);
  return id;
}

test.describe('LIVE: managed properties against the real API', () => {
  let errors;
  let apiFails;

  test.beforeEach(async ({ page }) => {
    errors = trackErrors(page);
    apiFails = [];
    page.on('response', (r) => {
      if (r.url().includes('/api/') && r.status() >= 400) apiFails.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
  });

  test.afterEach(() => {
    expect(errors, `failed API calls: ${apiFails.join(', ') || 'none'}`).toEqual([]);
  });

  // The suite reseeds once; API cleanup must not depend on the screen under test still working.
  test.afterAll(async () => {
    const headers = await authHeaders(OWNER.mobile);
    for (const id of created) {
      await fetch(`${API}/me/managed-properties/${id}`, { method: 'DELETE', headers });
    }
    created.length = 0;
  });

  test('the Rent-o-meter registers through POST /me/managed-properties, and the record outlives the tab', async ({ page }) => {
    await signedInAs(page, OWNER.mobile);
    const id = await estimateAndSave(page);

    // A server UUID distinguishes the vault's identity from a browser-generated managed ID.
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);

    // An independent read cannot be satisfied by a record stored only in this tab.
    const res = await fetch(`${API}/me/managed-properties/${id}`, { headers: await authHeaders(OWNER.mobile) });
    expect(res.status).toBe(200);
    const rec = await res.json();
    expect(rec.visibility).toBe('private');
    expect(rec.status).toBe('managed');
    // Persist the quoted valuation so later model changes cannot rewrite the owner's evidence.
    expect(rec.valuation).toBeTruthy();
  });

  test('the passport vault round-trips through /me/documents/managed/{id}', async ({ page }) => {
    await signedInAs(page, OWNER.mobile);
    const id = await estimateAndSave(page);

    await expect(page.getByText('Passport completeness')).toBeVisible();

    // A managed vault must work without advertising the property or sharing its documents with buyers.
    const uploaded = page.waitForResponse(
      (r) => new URL(r.url()).pathname === `/api/me/documents/managed/${id}`
        && r.request().method() === 'POST',
      { timeout: 20000 },
    );
    await page.setInputFiles('input[type="file"]', {
      name: 'live-sale-deed.pdf',
      mimeType: 'application/pdf',
      buffer: await unsignedPdfBuffer(),
    });
    expect((await uploaded).status()).toBe(201);
    await expect(page.getByText('live-sale-deed.pdf')).toBeVisible();

    const deleted = page.waitForResponse(
      (r) => new RegExp(`^/api/me/documents/managed/${id}/[^/]+$`).test(new URL(r.url()).pathname)
        && r.request().method() === 'DELETE',
      { timeout: 20000 },
    );
    await page.getByRole('button', { name: /Delete live-sale-deed\.pdf/i }).click();
    expect((await deleted).status()).toBeLessThan(300);
    await expect(page.getByText('live-sale-deed.pdf')).toHaveCount(0);
  });

  test('rent tracking validates, writes through PATCH, edits, and stops', async ({ page }) => {
    await signedInAs(page, OWNER.mobile);
    const id = await estimateAndSave(page);
    const card = page.locator('.glass-card', { has: page.getByRole('heading', { name: 'Rent tracking' }) });
    const read = async () =>
      (await fetch(`${API}/me/managed-properties/${id}`, { headers: await authHeaders(OWNER.mobile) })).json();
    const patchOf = () => page.waitForResponse(
      (r) => new URL(r.url()).pathname === `/api/me/managed-properties/${id}`
        && r.request().method() === 'PATCH',
      { timeout: 20000 },
    );

    await test.step('an empty or wrong form is refused before any request', async () => {
      let patches = 0;
      page.on('request', (r) => { if (r.method() === 'PATCH') patches += 1; });
      await card.getByRole('button', { name: /Start tracking/i }).click();
      await expect(card.getByText("Enter the tenant's full name, letters only.")).toBeVisible();
      await expect(card.getByText("Enter the tenant's 10-digit mobile number.")).toBeVisible();
      await card.getByLabel('Tenant mobile').fill(OWNER.mobile);
      await card.getByLabel('Tenant mobile').blur();
      await expect(card.getByText("That's your own number. Enter the tenant's.")).toBeVisible();
      await card.getByLabel('Monthly rent').fill('');
      await card.getByLabel('Monthly rent').blur();
      await expect(card.getByText('Enter the monthly rent.')).toBeVisible();
      expect(patches).toBe(0);
    });

    await test.step('a valid tenant starts tracking, number normalised', async () => {
      await card.getByPlaceholder('e.g. Rohit More').fill('Rahul Kulkarni');
      await card.getByLabel('Tenant mobile').fill('+91 91234 56780');
      await expect(card.getByLabel('Tenant mobile')).toHaveValue(shownMobile('9123456780'));
      await card.getByLabel('Monthly rent').fill('27500');
      await expect(card.getByLabel('Monthly rent')).toHaveValue('27,500');
      const patched = patchOf();
      await card.getByRole('button', { name: /Start tracking/i }).click();
      expect((await patched).status()).toBe(200);
      await expect(card.getByText('+91 91234 56780')).toBeVisible();
      await expect(card.getByRole('link', { name: 'Invite tenant on WhatsApp' }))
        .toHaveAttribute('href', /^https:\/\/wa\.me\/919123456780\?text=.*dashboard%23rental/);

      // Untouched valuation catches a partial PATCH that accidentally blanks the rest of the record.
      const rec = await read();
      expect(rec).toMatchObject({ rented: true, tenantName: 'Rahul Kulkarni', tenantMobile: '9123456780', monthlyRent: 27500 });
      expect(rec.valuation).toBeTruthy();
    });

    await test.step('edit saves the change', async () => {
      await card.getByRole('button', { name: 'Edit' }).click();
      await card.getByPlaceholder('e.g. Rohit More').fill('Rahul S Kulkarni');
      const patched = patchOf();
      await card.getByRole('button', { name: 'Save changes' }).click();
      expect((await patched).status()).toBe(200);
      await expect(card.getByText(/Rahul S Kulkarni/)).toBeVisible();
      expect((await read()).tenantName).toBe('Rahul S Kulkarni');
    });

    await test.step('stop tracking clears the tenant after a confirm', async () => {
      await card.getByRole('button', { name: 'Edit' }).click();
      await card.getByRole('button', { name: 'Stop tracking' }).click();
      await expect(card.getByRole('alert')).toContainText('Past receipts stay');
      const stopped = page.waitForResponse(
        (r) => new URL(r.url()).pathname === `/api/me/managed-properties/${id}/rent-tracking`
          && r.request().method() === 'DELETE',
        { timeout: 20000 },
      );
      await card.getByRole('button', { name: 'Yes, stop' }).click();
      expect((await stopped).status()).toBe(200);
      await expect(card.getByRole('button', { name: /Start tracking/i })).toBeVisible();
      await expect(card.getByPlaceholder('e.g. Rohit More')).toHaveValue('');
      const rec = await read();
      expect(rec.rented).toBe(false);
      expect(rec.tenantName ?? null).toBeNull();
      expect(rec.tenantMobile ?? null).toBeNull();
    });
  });

  test('a tenant who signs up after being named sees the tracked rent and downloads their receipt', async ({ page }) => {
    const owner = await authHeaders(OWNER.mobile);
    const tenantMobile = uniqueMobile();
    const res = await fetch(`${API}/me/managed-properties`, {
      method: 'POST',
      headers: owner,
      body: JSON.stringify({
        title: '2 BHK in Baner (tracked)', deal: 'rent', propertyType: 'Flat', price: 21500, locality: 'Baner',
        rented: true, tenantName: 'Neha Joshi', tenantMobile, monthlyRent: 21500, dueDay: 5,
      }),
    });
    expect(res.status).toBe(201);
    const { id } = await res.json();
    created.push(id);
    const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' })
      .format(new Date()).slice(0, 7);
    const receipt = await fetch(`${API}/me/managed-properties/${id}/rent-receipts`, {
      method: 'POST', headers: owner, body: JSON.stringify({ rentMonth: month }),
    });
    expect(receipt.status).toBe(201);

    const { accessToken } = await apiLogin(tenantMobile);
    const me = await fetch(`${API}/auth/me`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ name: 'Neha Joshi' }),
    });
    expect(me.ok).toBe(true);
    const user = await me.json();
    await page.addInitScript((session) => {
      localStorage.setItem('draazyTokens', JSON.stringify({ accessToken: session.accessToken }));
      localStorage.setItem('draazyUser', JSON.stringify(session.user));
    }, { accessToken, user });
    await page.goto('/dashboard#rental');

    const card = page.getByTestId('tracked-rent').filter({ hasText: '2 BHK in Baner (tracked)' });
    await expect(card).toContainText('₹21,500/mo');
    await expect(card).toContainText(/rent received by/);
    const download = page.waitForEvent('download');
    await card.getByRole('button', { name: /Download rent receipt/ }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/i);
  });
});
