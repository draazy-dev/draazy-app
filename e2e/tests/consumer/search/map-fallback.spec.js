import { test, expect } from '@playwright/test';
import { localityWithStock } from '../../../helpers/locality.js';

// What Google serves when it refuses the key (referrer, billing, quota): the script loads, then calls gm_authFailure.
const refuseMapsKey = (page) => page.route(/maps\.googleapis\.com\/maps\/api\/js/, (route) => route.fulfill({
  contentType: 'text/javascript',
  body: 'setTimeout(() => window.gm_authFailure && window.gm_authFailure(), 0);',
}));

test('a refused Maps key leaves the app fallback and a way back to the results', async ({ page }) => {
  await refuseMapsKey(page);
  await page.goto('/listings?deal=buy&view=map&loc=baner');
  await expect(page.getByText('Map unavailable', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show as list', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('list');
  await expect(page.locator('main a[href^="/property/"]').first()).toBeVisible();
});

test('the map gate does not claim a search is running', async ({ page }) => {
  await page.goto('/listings?deal=buy&view=map');
  await expect(page.getByText('Focus your map', { exact: false })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByText('Searching Pune', { exact: false })).toHaveCount(0);
});

test('a refusal after the locality map mounted swaps in the fallback and leaving the page does not crash it', async ({ page }) => {
  const busy = await localityWithStock((l) => l.forSale > 0 && l.lat != null, ['buy']);
  await page.goto(`/locality/${busy.slug}`);
  await page.locator('footer').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.gm_authFailure?.());
  await expect(page.getByText('Map unavailable', { exact: true })).toBeVisible();
  await expect(page.getByTestId('error-boundary')).toHaveCount(0);
  await page.locator(`a[href="/listings?deal=buy&loc=${busy.slug}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/listings\\?deal=buy&loc=${busy.slug}`));
  await expect(page.getByTestId('error-boundary')).toHaveCount(0);
});
