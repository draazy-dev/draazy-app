import { test, expect } from '@playwright/test';
import { apiLogin, signedInAs, uniqueMobile, API } from '../../../helpers/liveAuth.js';
import { openFlatmates, setBudget } from '../../../helpers/app.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const SEARCH = /Try: girl in baner/i;

const chip = (page, key, v) => page.locator(`#sf-desktop-filters [data-q="${key}"] button[data-v="${v}"]`);

// Chips unlock once the viewer has answered three questions, and only for those questions.
async function viewerWhoAnswered(page) {
  const mobile = uniqueMobile();
  const { accessToken } = await apiLogin(mobile);
  const res = await fetch(`${API}/me/living-style`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ answers: { food: 1, smoking: 1, pets: 1 } }) });
  expect(res.status).toBe(200);
  await signedInAs(page, mobile);
}

const param = (page, key) => new URL(page.url()).searchParams.get(key);

const expectParam = (page, key, value) =>
  expect.poll(() => param(page, key), { timeout: 5000 }).toBe(value);

const openFilters = async (page) => {
  const toggle = page.locator('button[aria-controls="sf-desktop-filters"]');
  await expect(toggle).toBeVisible({ timeout: 10000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(page.locator('#sf-desktop-filters')).toBeVisible();
};

test('writes flatmate filters to the URL and restores them after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  await viewerWhoAnswered(page);
  await page.goto(`${BASE}/flatmates?view=flatmates`);
  await page.locator('.sf-card').first().waitFor({ timeout: 10000 });

  await page.getByPlaceholder(SEARCH).fill('baner');
  await expectParam(page, 'q', 'baner');

  await openFilters(page);
  await chip(page, 'smoking', 0).click();
  await expectParam(page, 'vibe', 'smoking:0');

  await setBudget(page, 12000);
  await expectParam(page, 'budget', '0-12000');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByPlaceholder(SEARCH)).toHaveValue('baner');
  await openFilters(page);
  await expect(chip(page, 'smoking', 0)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.rng input[type="range"]:visible').nth(1)).toHaveValue('12000');
});

test('restores the previous flatmate filter state on Back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  await viewerWhoAnswered(page);
  await openFlatmates(page, '?view=flatmates');
  await openFilters(page);

  await chip(page, 'smoking', 0).click();
  await expectParam(page, 'vibe', 'smoking:0');

  await openFilters(page);
  await chip(page, 'food', 0).click();
  await expectParam(page, 'vibe', 'food:0,smoking:0');

  await page.goBack();
  await expectParam(page, 'vibe', 'smoking:0');
  await openFilters(page);
  await expect(chip(page, 'smoking', 0)).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 'food', 0)).toHaveAttribute('aria-pressed', 'false');
});

test('does not overwrite in-progress search text when the URL echo returns', async ({ page }) => {
  await openFlatmates(page, '?view=flatmates');

  const search = page.getByPlaceholder(SEARCH);
  await search.fill('baner ');
  await expectParam(page, 'q', 'baner ');
  await expect(search).toHaveValue('baner ');
});
