import { test, expect } from '@playwright/test';
import { focusFlatmateMap } from '../../../helpers/locality.js';

/* Map view gates on a "Focus your map" locality search; a ?near=lat,lng&nearr=km deep link self-focuses it and
   narrows posts to the radius deterministically, with no live Places call. */

const BASE = process.env.BASE_URL || 'http://localhost:5173';

test('map view opens on the focus gate, picking an area unlocks the bubbles, and switching tabs re-gates', async ({ page }) => {
  await page.goto(`${BASE}/flatmates?view=flatmates`);
  await page.getByRole('button', { name: 'Map' }).click();

  await test.step('map view opens on the focus gate, not the bubble map', async () => {
    await expect(page.getByRole('heading', { name: /Focus your map/i })).toBeVisible();
    await expect(page.locator('[data-fm-pin]')).toHaveCount(0);
  });

  await test.step('searching a focus area and showing the map unlocks the bubbles', async () => {
    const show = page.getByRole('button', { name: 'Show Map view' });
    await expect(show, 'nothing picked yet').toBeDisabled();
    await focusFlatmateMap(page, ['Baner']);
    await expect(page.locator('[data-fm-pin]').first()).toBeVisible({ timeout: 20000 });
  });

  await test.step('switching tabs re-gates the map', async () => {
    // Still in map view, but a new tab starts unfocused — the gate returns.
    await page.locator('button[data-tab="people"]').click();
    await expect(page.getByRole('heading', { name: /Focus your map/i })).toBeVisible();
    await expect(page.locator('[data-fm-pin]')).toHaveCount(0);
  });

  await test.step('a picked area chip shows the locality name alone, with no post count beside it', async () => {
    await page.getByPlaceholder('Search any Pune locality').fill('Baner');
    await page.getByRole('option', { name: /^Baner/ }).first().click({ timeout: 15000 });
    await expect(page.locator('[data-sf-area="Baner"]')).toHaveText('Baner');
  });
});
test('a Near-a-Place radius deep link narrows the list to nearby posts', async ({ page }) => {
  await page.goto(`${BASE}/flatmates?view=flatmates`);
  await page.locator('.sf-card').first().waitFor({ timeout: 10000 });
  const before = await page.locator('.sf-card').count();

  // Baner centroid, 5 km — keeps only flatmates whose primary area sits nearby.
  await page.goto(`${BASE}/flatmates?view=flatmates&near=18.559,73.776&nearlabel=Baner&nearr=5`);
  await page.locator('.sf-card').first().waitFor({ timeout: 10000 });
  const after = await page.locator('.sf-card').count();

  expect(after).toBeGreaterThan(0);
  expect(after).toBeLessThan(before);
});

test('a proximity deep link self-focuses the map (no gate)', async ({ page }) => {
  await page.goto(`${BASE}/flatmates?view=flatmates&near=18.559,73.776&nearlabel=Baner&nearr=5`);
  await page.getByRole('button', { name: 'Map' }).click();
  // Near is set, so the map opens straight to bubbles — no focus gate.
  await expect(page.locator('[data-fm-pin]').first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('heading', { name: /Focus your map/i })).toHaveCount(0);
});
