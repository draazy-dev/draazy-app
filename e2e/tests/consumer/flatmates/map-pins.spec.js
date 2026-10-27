import { test, expect } from '@playwright/test';
import { focusFlatmateMap } from '../../../helpers/locality.js';
import { stubGooglePlaces } from '../../../helpers/places.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const PIN_A = { lat: 18.5642, lng: 73.7769 };
const PIN_B = { lat: 18.5531, lng: 73.7921 };

/* Rewrites each Baner room's stored pin, so the test knows exactly where the host "dropped" it. */
const pinBanerRooms = async (page, pinFor) => {
  const ids = new Set();
  await page.route('**/api/flatmates/feed**', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    (body.content || [])
      .filter((r) => (r.roomType || r.roomKind) && /baner/i.test(r.locality || ''))
      .forEach((r, i) => { ids.add(r.id); Object.assign(r, pinFor(i)); });
    await route.fulfill({ response: res, json: body });
  });
  return ids;
};

/* `gmp-advanced-marker.position` is the coordinate the map was handed, so this reads placement, not pixels. */
const roomMarkerPositions = (page) => page.$$eval('gmp-advanced-marker', (els) => els
  .filter((el) => el.querySelector('[data-fm-pin="room"]'))
  .map((el) => {
    const p = el.position;
    const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
    const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
    return `${lat.toFixed(4)},${lng.toFixed(4)}`;
  })
  .sort());

const openRoomsMap = async (page) => {
  await page.goto(`${BASE}/flatmates`);
  await page.getByRole('button', { name: 'Map' }).click();
  await focusFlatmateMap(page, ['Baner']);
  await expect(page.locator('[data-fm-pin="room"]').first()).toBeVisible({ timeout: 20000 });
};

test('a room sits on the pin its host dropped, not on the locality centre', async ({ page }) => {
  await pinBanerRooms(page, (i) => (i === 0 ? PIN_A : PIN_B));
  await openRoomsMap(page);

  await expect.poll(() => roomMarkerPositions(page)).toEqual(['18.5531,73.7921', '18.5642,73.7769']);
  await expect(page.locator('.price-marker[data-fm-pin="room"]').first()).toHaveText(/^₹\d+k$/);
});

test('rooms of one flat share its pin and one marker that counts them', async ({ page }) => {
  const rooms = await pinBanerRooms(page, () => PIN_A);
  await openRoomsMap(page);

  await expect.poll(() => roomMarkerPositions(page)).toEqual(['18.5642,73.7769']);
  expect(rooms.size, 'the seed needs two Baner rooms to share a pin').toBeGreaterThanOrEqual(2);
  const shared = page.locator('[data-fm-pin="room"]');
  await expect(shared).toHaveText(String(rooms.size));
  const marker = page.locator('gmp-advanced-marker', { has: shared });
  await marker.focus();
  await marker.press('Enter');
  await expect(page.locator('.dz-sp-row')).toHaveCount(Math.min(rooms.size, 3));
});

test('the map view keeps the active-filter chips above it, and focus stops at three areas', async ({ page }) => {
  await page.goto(`${BASE}/flatmates?view=flatmates&near=18.559,73.776&nearlabel=Baner&nearr=5`);
  await page.getByRole('button', { name: 'Map' }).click();
  const chips = page.getByTestId('active-filters');
  await expect(chips.getByRole('button', { name: /^Remove filter Near Baner/ })).toBeVisible();
  await expect(page.locator('[data-fm-pin]').first()).toBeVisible({ timeout: 20000 });
  const chipsBox = await chips.boundingBox();
  const mapBox = await page.locator('.sf-map').boundingBox();
  expect(chipsBox.y + chipsBox.height, 'chips sit above the map').toBeLessThanOrEqual(mapBox.y);

  await chips.getByRole('button', { name: /^Remove filter Near Baner/ }).click();
  await expect(page.getByRole('heading', { name: /Focus your map/i })).toBeVisible();
  await expect(page.getByText('Pick up to 3 areas to zoom in on.')).toBeVisible();

  await stubGooglePlaces(page, { empty: true });
  const search = page.getByPlaceholder('Search any Pune locality');
  for (const name of ['Baner', 'Wakad', 'Aundh', 'Kothrud']) {
    await search.fill(name);
    await page.getByRole('option', { name: new RegExp(`^${name}`) }).first().click({ timeout: 15000 });
  }
  await expect(page.locator('[data-sf-area]')).toHaveCount(3);
  await expect(page.locator('[data-sf-area="Kothrud"]')).toHaveCount(0);
});
