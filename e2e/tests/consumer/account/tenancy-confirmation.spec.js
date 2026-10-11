import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, authHeaders, uploadedListingPhotos, signedInAs, uniqueMobile, letterTag } from '../../../helpers/liveAuth.js';
import { approveListingWithFetch, rejectListingWithFetch } from '../../../helpers/moderation.js';

const createdListings = new Map();
let actorSequence = 0;

async function api(method, path, headers, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function newActor(name) {
  const base = uniqueMobile();
  const mobile = `${base.slice(0, -1)}${actorSequence++ % 10}`;
  const headers = await authHeaders(mobile);
  const named = await api('PATCH', '/auth/me', headers, { name });
  expect(named.status, `naming ${name}`).toBe(200);
  return { mobile, headers, name };
}

async function closedRentDeal(owner, tenant) {
  const created = await api('POST', '/me/listings', owner.headers, {
    title: `Zztest tenancy listing ${Date.now()}`,
    deal: 'rent',
    propertyType: 'Flat',
    price: 31000,
    city: 'Pune',
    locality: 'Baner',
    bhk: 2,
    area: 900,
    images: await uploadedListingPhotos(owner.headers),
  });
  expect(created.status, 'creating the tenancy listing').toBe(201);
  createdListings.set(created.body.id, owner.headers);

  const approved = await approveListingWithFetch(created.body.id, await authHeaders(ACTORS.admin));
  expect(approved.status, 'approving the tenancy listing').toBe(200);

  const closed = await api('POST', `/me/deals/${created.body.id}/close`, owner.headers, {
    agreedPrice: 31000,
    counterpartyMobile: tenant.mobile,
  });
  expect(closed.status, 'closing the rent deal as the owner').toBe(200);
  return created.body;
}

async function tenanciesOf(actor) {
  const response = await api('GET', '/me/tenancies', actor.headers);
  expect(response.status, 'reading the tenant tenancies').toBe(200);
  return response.body;
}

test.afterEach(async () => {
  const adminHeaders = await authHeaders(ACTORS.admin);
  for (const [id, ownerHeaders] of createdListings) {
    let rejected = await rejectListingWithFetch(id, adminHeaders, {
      reason: 'Zztest cleanup - tenancy confirmation fixture',
    });
    if (rejected.status === 409) {
      const reopened = await api('POST', `/me/deals/${id}/reopen`, ownerHeaders, {});
      expect(reopened.status, `reopening closed isolated listing ${id}`).toBe(200);
      rejected = await rejectListingWithFetch(id, adminHeaders, {
        reason: 'Zztest cleanup - tenancy confirmation fixture',
      });
    }
    expect(rejected.status, `cleaning up isolated listing ${id}`).toBe(200);
  }
  createdListings.clear();
});

test('a closed rent deal reaches the named tenant as a pending tenancy they confirm', async ({ page }) => {
  const owner = await newActor(`Zztest Tenancy Owner ${letterTag()}`);
  const tenant = await newActor(`Zztest Tenancy Tenant ${letterTag()}`);
  const listing = await closedRentDeal(owner, tenant);

  const pending = await tenanciesOf(tenant);
  expect(pending).toHaveLength(1);
  expect(pending[0].status, 'a close only proposes the tenancy').toBe('pending');

  await signedInAs(page, tenant.mobile);
  await page.goto('/dashboard#rental', { waitUntil: 'domcontentloaded' });

  const banner = page.getByTestId('pending-tenancies');
  await expect(banner).toBeVisible({ timeout: 60000 });
  await expect(banner.getByText('Confirm your tenancy')).toBeVisible();
  await expect(banner.getByText(owner.name)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rent payments' })).toHaveCount(0);
  await expect(page.getByText('Active tenancy')).toHaveCount(0);

  const confirmed = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/me/tenancies/${pending[0].id}/confirm`
    && response.request().method() === 'POST'
    && response.status() === 200,
  );
  await banner.getByRole('button', { name: 'Confirm', exact: true }).click();
  await confirmed;

  await expect(page.getByTestId('pending-tenancies')).toHaveCount(0);
  await expect(page.getByText('Active tenancy')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rent payments' })).toBeVisible();

  const [active] = await tenanciesOf(tenant);
  expect(active.status).toBe('active');
  expect(active.propertyId).toBe(listing.id);
});

test('the named tenant can decline, and the deal stays closed with no active tenancy', async ({ page }) => {
  const owner = await newActor(`Zztest Decline Owner ${letterTag()}`);
  const tenant = await newActor(`Zztest Decline Tenant ${letterTag()}`);
  const listing = await closedRentDeal(owner, tenant);

  await signedInAs(page, tenant.mobile);
  await page.goto('/dashboard#rental', { waitUntil: 'domcontentloaded' });

  const banner = page.getByTestId('pending-tenancies');
  await expect(banner).toBeVisible({ timeout: 60000 });
  const declined = page.waitForResponse((response) =>
    /\/api\/me\/tenancies\/[^/]+\/decline$/.test(new URL(response.url()).pathname)
    && response.request().method() === 'POST'
    && response.status() === 200,
  );
  page.once('dialog', (dialog) => dialog.accept());
  await banner.getByRole('button', { name: 'Decline', exact: true }).click();
  await declined;

  await expect(page.getByTestId('pending-tenancies')).toHaveCount(0);
  await expect(page.getByText('No rental on Draazy yet')).toBeVisible();
  expect(await tenanciesOf(tenant)).toEqual([]);

  const deal = await api('GET', `/me/deals/${listing.id}`, owner.headers);
  expect(deal.body.status, 'declining leaves the deal closed').toBe('closed');
});

test('anyone but the named tenant is told the tenancy does not exist', async () => {
  const owner = await newActor(`Zztest Stranger Owner ${letterTag()}`);
  const tenant = await newActor(`Zztest Stranger Tenant ${letterTag()}`);
  const stranger = await newActor(`Zztest Stranger Other ${letterTag()}`);
  await closedRentDeal(owner, tenant);
  const [pending] = await tenanciesOf(tenant);

  for (const who of [stranger, owner]) {
    for (const action of ['confirm', 'decline']) {
      const refused = await api('POST', `/me/tenancies/${pending.id}/${action}`, who.headers, {});
      expect(refused.status, `${action} by someone who is not the tenant`).toBe(404);
    }
  }
  expect((await tenanciesOf(tenant))[0].status, 'the refusals changed nothing').toBe('pending');
});
