import { test, expect } from '@playwright/test';

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
