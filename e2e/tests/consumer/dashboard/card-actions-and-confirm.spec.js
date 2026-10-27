import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, apiLogin, authHeaders, uploadedListingPhotos, signedInAs, uniqueMobile } from '../../../helpers/liveAuth.js';
import { approveListing, rejectListing } from '../../../helpers/moderation.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { roomBasics } from '../../../helpers/roomWizard.js';
import { withSocietyId } from '../../../helpers/liveSociety.js';

const createdListingIds = new Set();
const trackRoom = flatmateCleanup(test);

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
  const badge = status.getByRole('link', { name: 'Get Verified property badge' });
  await expect(badge).toHaveCSS('border-top-width', '1px');
  expect((await badge.boundingBox()).height).toBeGreaterThanOrEqual(44);
});

for (const width of [390, 1280]) {
  test(`flatmate room status and verification actions match property cards at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const mobile = uniqueMobile();
    const { accessToken } = await apiLogin(mobile);
    const headers = await authHeaders(mobile);
    const created = await api('POST', '/flatmates/rooms', headers, {
      ...(await roomBasics(accessToken)),
      ...(await withSocietyId(accessToken, { society: `Zztest Room card ${Date.now()}` })),
      title: 'Zztest Room verification card',
      locality: 'Baner', rentShare: 12000, deposit: 24000,
      bhk: '2', roomType: 'Private room', hostRole: 'tenant',
      ownerConsent: true, ownerConsentMobile: uniqueMobile(),
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    trackRoom('rooms', created.body.id, accessToken);
    await signedInAs(page, mobile);
    await page.goto('/dashboard#properties');
    const panel = page.getByTestId(`flatmate-status-${created.body.id}`);
    await expect(panel).toContainText('Under review');
    const share = panel.getByRole('button', { name: 'Share listing' });
    const verify = panel.getByRole('link', { name: 'Get Verified property badge', exact: true });
    await expect(share).toBeVisible();
    await expect(verify).toHaveAttribute('href', `/dashboard?tab=documents&room=${created.body.id}`);
    await expect(verify).toHaveCSS('border-top-width', '1px');
    const shareBox = await share.boundingBox();
    const verifyBox = await verify.boundingBox();
    const panelBox = await panel.boundingBox();
    expect(shareBox.height).toBeGreaterThanOrEqual(44);
    expect(verifyBox.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(shareBox.y - verifyBox.y)).toBeLessThan(2);
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(width);
    const edit = page.getByRole('link', { name: 'Edit', exact: true });
    expect((await edit.boundingBox()).y).toBeGreaterThanOrEqual(panelBox.y + panelBox.height);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (payload) => { sessionStorage.setItem('shared-room', JSON.stringify(payload)); },
      });
    });
    await share.click();
    const shared = await page.evaluate(() => JSON.parse(sessionStorage.getItem('shared-room')));
    expect(new URL(shared.url).pathname).toBe(`/flatmates/room/${created.body.id}`);
    await verify.click();
    await expect(page.getByTestId('room-badge-request-card')).toHaveAttribute('data-state', 'none');
    expect(errors).toEqual([]);
  });
}

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
  await expect(page.getByTestId('progress-tracker')).toContainText('Not approved');
  await expect(page.getByRole('link', { name: 'Contact support', exact: true })).toBeVisible();
});

test('a fixable rejection reads Changes needed, and an edit sends the listing back to review', async ({ page, request }) => {
  const me = await ownerWithLiveListing(request);
  const rejected = await rejectListing(request, me.id, await authHeaders(ACTORS.admin), { reasonCode: 'wrong_details', reason: 'The carpet area looks wrong.' });
  expect(rejected.status()).toBe(200);
  await signedInAs(page, me.mobile);
  await page.goto('/dashboard#listings');
  const tracker = page.getByTestId('progress-tracker');
  await expect(tracker).toHaveAttribute('data-blocked', 'rejected');
  await expect(tracker).toContainText('Changes needed');
  await expect(page.getByTestId('edit-resubmit')).toHaveAttribute('href', new RegExp(`/list-property\\?edit=${me.id}`));

  const edited = await api('PATCH', `/me/listings/${me.id}`, me.headers, { description: 'Corrected the carpet area after review.' });
  expect(edited.status).toBe(200);
  expect(edited.body.status).toBe('pending');
  await page.reload();
  await expect(page.getByTestId('edit-resubmit')).toHaveCount(0);
  await expect(page.getByTestId('progress-tracker')).not.toHaveAttribute('data-blocked', /./);
  await expect(page.getByTestId('progress-tracker')).toContainText('In review');
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
  await expect(confirm).toContainText('chats about it close');
  await expect(confirm).toContainText('deleted after 30 days');
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
