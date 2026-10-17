import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, authHeaders, uploadedListingPhotos, signedInAs, uniqueMobile } from '../../../helpers/liveAuth.js';
import { approveListing, rejectListing } from '../../../helpers/moderation.js';

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

async function ownerWithLiveListing(request) {
  const mobile = uniqueMobile();
  const headers = await authHeaders(mobile);
  expect((await api('PATCH', '/auth/me', headers, { name: 'Zztest Card Actions' })).status).toBe(200);
  const created = await api('POST', '/me/listings', headers, {
    title: `Zztest card actions ${Date.now()}`,
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
  const approved = await approveListing(request, created.body.id, await authHeaders(ACTORS.admin));
  expect(typeof approved.status === 'function' ? approved.status() : approved.status).toBe(200);
  return { mobile, headers, id: created.body.id };
}

test.afterEach(async ({ request }) => {
  const adminHeaders = await authHeaders(ACTORS.admin);
  for (const id of createdListingIds) await rejectListing(request, id, adminHeaders, { reasonCode: 'other', reason: 'Zztest cleanup' });
  createdListingIds.clear();
});

test('a live card of an unverified owner keeps Share beside the verification entry', async ({ page, request }) => {
  const me = await ownerWithLiveListing(request);
  await signedInAs(page, me.mobile);
  await page.goto('/dashboard#listings');
  const status = page.getByTestId('listing-status-card').first();
  await expect(status.getByRole('button', { name: 'Share listing' })).toBeVisible();
  await expect(status.getByRole('link', { name: 'Get Verified property badge' })).toBeVisible();
});

test('a paused card offers View listing once', async ({ page, request }) => {
  const me = await ownerWithLiveListing(request);
  await signedInAs(page, me.mobile);
  await page.goto('/dashboard#listings');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByTestId('confirm-modal-ok').click();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View listing' })).toHaveCount(1);
});

test('a rejected card offers no Edit, since the server refuses edits on it', async ({ page, request }) => {
  const me = await ownerWithLiveListing(request);
  const rejected = await rejectListing(request, me.id, await authHeaders(ACTORS.admin), { reasonCode: 'other', reason: 'Zztest cleanup' });
  expect(rejected.status()).toBe(200);
  expect((await api('PATCH', `/me/listings/${me.id}`, me.headers, { description: 'Edited after rejection' })).status).toBe(409);
  await signedInAs(page, me.mobile);
  await page.goto('/dashboard#listings');
  await expect(page.getByTestId('listing-status-card').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
});

test('Take down asks in the app, not the browser, and Cancel keeps the listing', async ({ page, request }) => {
  const me = await ownerWithLiveListing(request);
  await signedInAs(page, me.mobile);
  await page.goto('/dashboard#listings');
  let native = 0;
  page.on('dialog', (d) => { native += 1; d.dismiss(); });

  await page.getByRole('button', { name: 'Take down', exact: true }).click();
  const confirm = page.getByTestId('confirm-modal');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('Buyers will stop seeing it');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Take down', exact: true })).toBeVisible();
  expect(native).toBe(0);
});

test.describe('on a tablet', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 768, height: 1024 } });

  test('card action buttons reach 44px on touch', async ({ page, request }) => {
    const me = await ownerWithLiveListing(request);
    await signedInAs(page, me.mobile);
    await page.goto('/dashboard#listings');
    const actions = page.getByRole('button', { name: /Pause|Take down|Mark under offer/ });
    await expect(actions.first()).toBeVisible();
    const n = await actions.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) expect((await actions.nth(i).boundingBox()).height).toBeGreaterThanOrEqual(43.5);
  });
});

test('an unread staff message is "Needs info" only for a pending listing in needs_info review', async ({ page }) => {
  await page.goto('/');
  const out = await page.evaluate(async () => {
    const { buildActionItems } = await import('/src/pages/consumer/dashboard/dashboardData.js');
    const base = { isOwner: true, reviewsByProp: {} };
    const items = (listing, review) => buildActionItems({ ...base, listings: [listing], reviewsByProp: { [listing.id]: review } });
    return {
      needsInfo: items({ id: 'a', title: 'A', status: 'pending' }, { status: 'needs_info', unread: 1 }).map((i) => i.kind),
      approved: items({ id: 'b', title: 'B', status: 'approved' }, { status: 'live', unread: 2 }).map((i) => i.kind),
      pendingPlain: items({ id: 'c', title: 'C', status: 'pending' }, { status: 'pending', unread: 1 }).map((i) => i.kind),
      read: items({ id: 'd', title: 'D', status: 'pending' }, { status: 'needs_info', unread: 0 }).map((i) => i.kind),
    };
  });
  expect(out.needsInfo).toEqual(['clarify']);
  expect(out.approved).toEqual(['message']);
  expect(out.pendingPlain).toEqual(['message']);
  expect(out.read).toEqual([]);
});
