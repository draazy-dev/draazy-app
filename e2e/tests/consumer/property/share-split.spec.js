import { test, expect } from '../../../fixtures/live.js';

// Seeded 4 BHK rental at ₹64,000/month in Magarpatta.
const RENTAL = 'p5000';

test('the sharing tile splits the rent per person and sends the renter to teams hunting in that locality', async ({ page }) => {
  await page.goto(`/property/${RENTAL}`);
  const split = page.getByTestId('share-split');
  const toggle = page.getByRole('button', { name: 'Sharing this flat?', exact: true });
  if (await toggle.isVisible()) await toggle.click();

  await test.step('each column states the exact rent per person and what sharing saves', async () => {
    await expect(split).toBeVisible();
    const cells = split.locator(':scope > div');
    await expect(cells).toHaveCount(3);
    await expect(cells.nth(0)).toContainText('₹64,000');
    await expect(cells.nth(0)).toContainText('per month');
    await expect(cells.nth(1)).toContainText('₹32,000');
    await expect(cells.nth(1)).toContainText('Save ₹32,000');
    await expect(cells.nth(2)).toContainText('₹21,333');
    await expect(cells.nth(2)).toContainText('Save ₹42,667');
  });

  await test.step('the CTA lands on the teams tab filtered to the listing locality', async () => {
    const cta = page.getByTestId('share-find-flatmates');
    await expect(cta).toHaveText(/Find flatmates in Magarpatta/);
    await cta.click();
    await expect(page).toHaveURL(/\/flatmates\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get('view')).toBe('teams');
    expect(url.searchParams.get('loc')).toBe('Magarpatta');
    for (const dead of ['startGroup', 'title', 'rent']) expect(url.searchParams.has(dead), dead).toBe(false);
    await expect(page.locator('[data-tab="teams"]')).toHaveAttribute('aria-current', 'page');
  });
});
