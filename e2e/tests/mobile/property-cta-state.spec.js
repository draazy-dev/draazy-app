import { test, expect, ACTORS } from '../../fixtures/live.js';
import { API, authHeaders, uniqueMobile, signedInAs, uploadedListingPhotos } from '../../helpers/liveAuth.js';
import { approveListingWithFetch, rejectListingWithFetch } from '../../helpers/moderation.js';
import { sql } from '../../helpers/monetisation.js';

const created = new Set();

async function api(method, path, headers, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function actor(name) {
  const mobile = uniqueMobile();
  const headers = await authHeaders(mobile);
  const res = await api('PATCH', '/auth/me', headers, { name });
  expect(res.status, `naming ${name}`).toBe(200);
  return { mobile, headers, name };
}

async function listing() {
  const owner = await actor('Zztest CTA Owner');
  const res = await api('POST', '/me/listings', owner.headers, {
    title: `Zztest cta-state ${Date.now()}`,
    deal: 'rent',
    propertyType: 'Flat',
    bhk: 2,
    price: 26000,
    area: 930,
    areaUnit: 'sqft',
    furnishing: 'semi-furnished',
    city: 'Pune',
    locality: 'Baner',
    address: 'D110 CTA State Residency, B-303',
    images: await uploadedListingPhotos(owner.headers),
  });
  expect(res.status, `creating the fixture listing (${JSON.stringify(res.body)})`).toBe(201);
  const id = res.body.id;
  created.add(id);
  const appr = await approveListingWithFetch(id, await authHeaders(ACTORS.admin));
  expect(appr.status, 'approving the fixture listing').toBe(200);
  return { owner, id };
}

async function openAsBuyer(page, id) {
  const buyer = await actor('Zztest CTA Buyer');
  await signedInAs(page, buyer.mobile);
  await page.goto(`/property/${id}`, { waitUntil: 'networkidle' });
  const bar = page.locator('.dz-sticky-cta');
  await expect(bar).toBeVisible({ timeout: 20000 });
  return { buyer, bar };
}

test.afterEach(async () => {
  const admin = await authHeaders(ACTORS.admin);
  for (const id of created) {
    await rejectListingWithFetch(id, admin, { reason: 'Zztest cleanup \u2014 synthetic cta-state fixture' });
  }
  created.clear();
});

test.describe('Property page — used CTAs say so', () => {
  test('Contact Owner turns into Request sent, then Contacted, and still opens the sheet', async ({ page, consoleErrors }) => {
    const { owner, id } = await listing();
    const { bar } = await openAsBuyer(page, id);

    const contact = bar.getByRole('button', { name: /contact owner/i });
    await expect(contact).toHaveAttribute('data-cta-state', 'none');
    await contact.click();
    const sheet = page.locator('.dz-modal');
    await sheet.getByRole('button', { name: /request number/i }).click();
    await expect(sheet).toHaveCount(0);

    const sent = bar.getByRole('button', { name: /request sent/i });
    await expect(sent, 'the button changes without a reload').toHaveAttribute('data-cta-state', 'pending');

    await sent.click();
    await expect(sheet.getByText(/request sent — awaiting/i), 'a used button still opens the sheet').toBeVisible();
    await sheet.getByRole('button', { name: 'Close' }).click();

    const inbox = await api('GET', '/me/contact-requests', owner.headers);
    const row = (inbox.body?.content ?? []).find((r) => r.propertyId === id);
    expect(row, 'the request reached the owner').toBeTruthy();
    const grant = await api('PATCH', `/me/contact-requests/${row.id}`, owner.headers, { status: 'approved' });
    expect(grant.status, 'the owner approving the request').toBe(200);

    await page.reload({ waitUntil: 'networkidle' });
    await expect(bar.getByRole('button', { name: /contacted/i })).toHaveAttribute('data-cta-state', 'approved');
    await expect(bar.getByRole('button', { name: /contact owner/i })).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('a booked visit shows its date and links to Dashboard → Visits', async ({ page, consoleErrors }) => {
    const { id } = await listing();
    const { bar } = await openAsBuyer(page, id);

    await bar.getByRole('button', { name: /^visit$/i }).click();
    const modal = page.locator('.dz-modal');
    await modal.getByRole('button', { name: /confirm visit/i }).click();
    await modal.getByRole('button', { name: 'Done' }).click();
    await expect(modal).toHaveCount(0);

    const booked = bar.getByRole('link', { name: /^visit · \d{1,2} \w{3,4}$/i });
    await expect(booked, 'the button changes without a reload').toHaveAttribute('data-cta-state', 'scheduled');
    await expect(bar.getByRole('button', { name: /^visit$/i })).toHaveCount(0);

    await booked.click();
    await expect(page).toHaveURL(/\/dashboard\?tab=visits/);
    expect(consoleErrors).toEqual([]);
  });

  test('a booked visit whose day has passed still reads as booked, so the page never offers a refused rebooking', async ({ page, consoleErrors }) => {
    const { id } = await listing();
    const { buyer } = await openAsBuyer(page, id);
    const slot = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const res = await api('POST', '/visits', buyer.headers, { propertyId: id, slot, mode: 'in-person' });
    expect(res.status, `booking the visit (${JSON.stringify(res.body)})`).toBe(201);
    sql(`UPDATE visits SET slot = now() - interval '4 days' WHERE id = '${res.body.id}'`);

    await page.reload({ waitUntil: 'networkidle' });
    const bar = page.locator('.dz-sticky-cta');
    await expect(bar.getByRole('link', { name: /^visit · /i })).toHaveAttribute('data-cta-state', 'scheduled');
    await expect(bar.getByRole('button', { name: /^visit$/i })).toHaveCount(0);
    expect(consoleErrors).toEqual([]);

    await page.goto(`/property/${id}?visit=1`, { waitUntil: 'networkidle' });
    const dialog = page.getByRole('dialog', { name: /schedule a visit/i });
    await dialog.getByRole('button', { name: /confirm visit/i }).click();
    await expect(dialog.getByText(/already have a visit booked/i)).toBeVisible();
    await expect(page.getByText(/already have a visit booked/i), 'the refusal is said once, not again in a toast').toHaveCount(1);
  });
});
