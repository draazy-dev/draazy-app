import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, apiLogin, authHeaders, signedInAs, uniqueMobile, uploadedListingPhotos } from '../../../helpers/liveAuth.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { rejectListingWithFetch } from '../../../helpers/moderation.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
const track = flatmateCleanup(test);
const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

async function create(kind, token, body) {
  const res = await fetch(`${API}/flatmates/${kind}`, { method: 'POST', headers: auth(token), body: JSON.stringify(body) });
  const row = await res.json();
  expect(res.status, JSON.stringify(row)).toBe(201);
  track(kind, row.id, token);
  return row;
}

const group = (token, title, over = {}) => create('groups', token, {
  title, locality: 'Baner', rent: 30000, deposit: 50000, seats: 3, seatsOpen: 1, policy: 'any', role: 'tenant', ...over,
});

const strip = (page) => page.getByTestId('my-posts-strip');

async function rentListing(token, title) {
  const res = await fetch(`${API}/me/listings`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({
      title, deal: 'rent', propertyType: 'Flat', price: 23456, bhk: 2, area: 900, locality: 'Baner', city: 'Pune',
      images: await uploadedListingPhotos(token),
    }),
  });
  const listing = await res.json();
  expect(res.status, JSON.stringify(listing)).toBe(201);
  return listing;
}

const dropListing = async (id) =>
  rejectListingWithFetch(id, await authHeaders(ACTORS.admin), { reason: 'Zztest cleanup — my-posts strip fixture' });

test('teams and flatmates: own posts sit in the strip, capped at two with a View all link, and stay out of the feed', async ({ page }) => {
  const mobile = uniqueMobile();
  const { accessToken } = await apiLogin(mobile, { name: 'Strip Host' });
  const post = await create('posts', accessToken, {
    gender: 'female', age: 26, occupation: 'Engineer', budget: 16000,
    localities: ['Baner'], moveIn: '2026-12-01', flatPref: 'any', roomPref: 'private', note: 'Strip test',
  });
  const hunt = { locality: undefined, rent: undefined, deposit: undefined,
    preferences: { localities: ['Baner'], rentMax: 45000, depositMax: 90000, gatedOnly: false, bachelors: false } };
  const first = await group(accessToken, `Strip group A ${stamp()}`, hunt);
  const second = await group(accessToken, `Strip group B ${stamp()}`, hunt);
  const third = await group(accessToken, `Strip group C ${stamp()}`, hunt);

  await signedInAs(page, mobile);
  await page.goto(`${BASE}/flatmates?view=teams`);
  await expect(page.locator('.sf-card').first()).toBeVisible({ timeout: 20_000 });

  await expect(strip(page).locator('.my-post-tile')).toHaveCount(2);
  await expect(strip(page).getByRole('button')).toHaveCount(0);
  const viewAll = strip(page).getByRole('link', { name: 'View all (3)' });
  await expect(viewAll).toHaveAttribute('href', '/dashboard#listings');

  for (const g of [first, second, third]) {
    await expect(page.locator(`[data-sf-id="g:${g.id}"]`)).toHaveCount(0);
  }

  await page.locator('button[data-tab="people"]').click();
  await expect(page.locator('.sf-card').first()).toBeVisible({ timeout: 20_000 });
  await expect(strip(page).locator('.my-post-tile')).toHaveCount(1);
  await expect(page.locator(`[data-sf-id="s:${post.id}"]`)).toHaveCount(0);

  await strip(page).locator(`a[href="/flatmates/post/${post.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/flatmates/post/${post.id}$`));
});

test('a settled team sits in neither strip: Rooms shows only rooms, Teams only hunting teams', async ({ page }) => {
  const mobile = uniqueMobile();
  const { accessToken } = await apiLogin(mobile, { name: 'Strip Host' });
  const settled = await group(accessToken, `Strip flat group ${stamp()}`);
  const hunting = await group(accessToken, `Strip hunting group ${stamp()}`, { locality: undefined, rent: undefined, deposit: undefined,
    preferences: { localities: ['Baner'], rentMax: 45000, depositMax: 90000, gatedOnly: false, bachelors: false } });
  const tileFor = (g) => strip(page).locator(`a[href="/flatmates/group/${g.id}"]`);

  await signedInAs(page, mobile);
  await page.goto(`${BASE}/flatmates?view=teams`);
  await expect(tileFor(hunting)).toBeVisible({ timeout: 20_000 });
  await expect(tileFor(settled)).toHaveCount(0);

  await page.locator('button[data-tab="move-in"]').click();
  await expect(page.locator('[data-sf-id^="r:"]').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('a[href^="/flatmates/group/"]')).toHaveCount(0);
});

test('board tiles carry no action buttons beyond save', async ({ page }) => {
  await page.goto(`${BASE}/flatmates?view=move-in`);
  const card = page.locator('.sf-card').first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  const buttons = card.getByRole('button');
  await expect(buttons).toHaveCount(1);
  await expect(buttons).toHaveAttribute('aria-pressed', /true|false/);
});

test('listings: an owner sees their own rent listing above results on the rent deal only', async ({ page }) => {
  const mobile = uniqueMobile();
  const { accessToken } = await apiLogin(mobile);
  const title = `Zztest strip listing ${stamp()}`;
  const listing = await rentListing(accessToken, title);

  try {
    await signedInAs(page, mobile);
    await page.goto(`${BASE}/listings?deal=rent`);
    const tile = strip(page).locator(`a[href="/property/${listing.id}"]`);
    await expect(tile).toBeVisible({ timeout: 20_000 });
    await expect(tile).toContainText('Your listing · In review');
    await expect(tile).toContainText(title);

    const mineLoaded = page.waitForResponse((r) => r.url().includes('/me/listings') && r.ok());
    await page.goto(`${BASE}/listings?deal=buy`);
    await mineLoaded;
    await expect(page.locator('a[href^="/property/"]').first()).toBeVisible({ timeout: 20_000 });
    await expect(strip(page)).toHaveCount(0);

    await page.goto(`${BASE}/listings?deal=rent`);
    await strip(page).locator(`a[href="/property/${listing.id}"]`).click({ timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`/property/${listing.id}`));
  } finally {
    await dropListing(listing.id);
  }
});
