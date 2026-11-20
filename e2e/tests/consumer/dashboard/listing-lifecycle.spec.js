import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, authHeaders, uploadedListingPhotos, signedInAs, uniqueMobile } from '../../../helpers/liveAuth.js';
import { approveListing, rejectListing } from '../../../helpers/moderation.js';
import { withSocietyId } from '../../../helpers/liveSociety.js';
import { istInDays } from '../../../helpers/availability.js';
import { uploadPublishablePhotos } from '../../../helpers/listingPhotos.helper.js';

const createdListingIds = new Set();

async function api(method, path, headers, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function owner() {
  const mobile = uniqueMobile();
  const headers = await authHeaders(mobile);
  const updated = await api('PATCH', '/auth/me', headers, { name: 'Zztest Lifecycle' });
  expect(updated.status).toBe(200);
  return { mobile, headers };
}

async function listing(request, headers, status = 'approved') {
  const created = await api('POST', '/me/listings', headers, {
    title: `Zztest lifecycle listing ${Date.now()}`,
    deal: 'rent',
    propertyType: 'Flat',
    price: 26000,
    city: 'Pune',
    locality: 'Baner',
    bhk: 2,
    area: 850,
    images: await uploadedListingPhotos(headers),
  });
  expect(created.status).toBe(201);
  createdListingIds.add(created.body.id);
  if (status !== 'pending') {
    const adminHeaders = await authHeaders(ACTORS.admin);
    const reviewed = status === 'approved'
      ? await approveListing(request, created.body.id, adminHeaders)
      : await api('PATCH', `/properties/${created.body.id}/status`, adminHeaders, { status });
    const reviewedStatus = typeof reviewed.status === 'function' ? reviewed.status() : reviewed.status;
    expect(reviewedStatus).toBe(200);
  }
  return created.body.id;
}

test.afterEach(async ({ request }) => {
  const adminHeaders = await authHeaders(ACTORS.admin);
  for (const id of createdListingIds) {
    await rejectListing(request, id, adminHeaders, { reasonCode: 'other', reason: 'Zztest cleanup' });
  }
  createdListingIds.clear();
});

test('owner can pause and resume an approved listing from My listings', async ({ page, request }) => {
  const me = await owner();
  await listing(request, me.headers);

  await signedInAs(page, me.mobile);
  await page.goto('/dashboard#listings');
  await expect(page.getByText('1 of 1 free live listing used')).toBeVisible();

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByTestId('confirm-modal-ok').click();
  await expect(page.getByText('Paused', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
});

test('pending owner listing explains the 24 hour moderation SLA', async ({ page, request }) => {
  const me = await owner();
  await listing(request, me.headers, 'pending');

  await signedInAs(page, me.mobile);
  await page.goto('/dashboard#listings');

  await expect(page.getByText('Under review', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Our team usually reviews listings within 24 hours.')).toBeVisible();
  const tracker = page.getByTestId('progress-tracker');
  await expect(tracker).toHaveAttribute('data-track', 'owner');
  await expect(tracker).toHaveAttribute('data-step', 'submitted');
  await expect(tracker).toContainText('1/3');
});

test('a clarification request shows the owner the review is paused on them', async ({ page, request }) => {
  const me = await owner();
  const id = await listing(request, me.headers, 'pending');
  const admin = await authHeaders(ACTORS.admin);
  const started = await request.post(`${API}/properties/${id}/verification/start`, { headers: admin });
  expect(started.status(), await started.text()).toBe(200);
  const asked = await request.post(`${API}/properties/${id}/verification/decision`, {
    headers: admin,
    data: { decision: 'needs_info', reasonCode: 'other', note: 'Please confirm the floor.' },
  });
  expect(asked.status(), await asked.text()).toBe(200);

  await signedInAs(page, me.mobile);
  await page.goto('/dashboard#listings');

  const tracker = page.getByTestId('progress-tracker');
  await expect(tracker).toHaveAttribute('data-step', 'in_review');
  await expect(tracker).toHaveAttribute('data-blocked', 'needs_info');
  await expect(tracker).toContainText('Waiting on you');
});

test('a staff-posted listing is completed to the new-listing bar in the wizard before its owner can confirm it', async ({ page }) => {
  const mobile = uniqueMobile();
  const title = `Zztest confirm listing ${Date.now()}`;
  const admin = await authHeaders(ACTORS.admin);
  // Everything but photos: the desk may post without them, the owner may not confirm without them.
  const listing = await withSocietyId(admin.authorization.replace(/^Bearer\s+/i, ''), {
    title, deal: 'rent', propertyType: 'Flat', price: 26000, deposit: 52000, city: 'Pune', locality: 'Baner',
    bhk: 2, bathrooms: 2, area: 850, carpetArea: 850, floor: 3, totalFloors: 12, pincode: '411045',
    availableOn: istInDays(10), society: `Zztest Claim Homes ${Date.now().toString(36)}`, formDetails: { flatNumber: 'B-402' },
  });
  const posted = await api('POST', '/admin/properties', admin, { ownerMobile: mobile, ownerName: 'Zztest Confirm Owner', listing });
  expect(posted.status, JSON.stringify(posted.body)).toBe(201);
  createdListingIds.add(posted.body.id);
  const refused = await api('POST', `/me/listings/${posted.body.id}/confirm`, await authHeaders(mobile));
  expect(refused.status).toBe(409);
  expect(refused.body.error).toBe('listing_incomplete');

  await signedInAs(page, mobile);
  await page.goto('/dashboard#listings');

  await expect(page.getByText('Confirm your listing', { exact: true }).first()).toBeVisible();
  const tracker = page.getByTestId('progress-tracker');
  await expect(tracker).toHaveAttribute('data-step', 'created');
  await expect(tracker).not.toContainText('Link sent');
  await expect(page.getByTestId('report-listing-wrong')).toBeVisible();

  await page.getByTestId('confirm-listing').click();
  await expect(page).toHaveURL(new RegExp(`/list-property\\?edit=${posted.body.id}`));
  await expect(page.getByTestId('claim-banner')).toBeVisible();
  for (const heading of ['Location', 'Price & terms', 'Photos & description']) {
    await page.getByRole('button', { name: 'Next Step', exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }

  const submit = page.getByRole('button', { name: 'Confirm & send for review', exact: true });
  await submit.click();
  await expect(page.locator('[data-err="photos"]')).toContainText(/photo/i);
  await expect(page).toHaveURL(/\/list-property/);

  await uploadPublishablePhotos(page, { count: 1, categories: [] });
  await submit.click();
  await expect(page.locator('[data-err="photos"]')).toContainText('Add at least 3 photos.');

  await uploadPublishablePhotos(page, { count: 2 });
  const confirmed = page.waitForResponse((r) => r.request().method() === 'POST'
    && new URL(r.url()).pathname === `/api/me/listings/${posted.body.id}/confirm`);
  await submit.click();
  expect((await confirmed).status()).toBe(204);
  await expect(page).toHaveURL(/\/dashboard#listings/);
  await expect(tracker).toHaveAttribute('data-step', 'owner_confirmed');
  await expect(page.getByTestId('confirm-listing')).toHaveCount(0);
  await expect(page.getByText('Under review', { exact: true }).first()).toBeVisible();
});
