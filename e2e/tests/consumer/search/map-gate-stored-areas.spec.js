import { test, expect } from '@playwright/test';

// The gate pre-selects the areas of the last search; one that does not resolve is never drawn, so it must not
// be applied or hold one of the three slots.
test('a stored area that no longer exists is neither pre-selected nor applied by Show Map view', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('draazy.listings.lastSearch.v1', JSON.stringify({
      version: 1, filters: { deal: 'buy', localities: ['zz-gone-area', 'baner'] }, view: 'grid',
    }));
  });
  await page.goto('/listings?deal=buy&view=map');
  await expect(page.getByRole('heading', { name: /Focus your map/i })).toBeVisible();

  const baner = page.getByRole('button', { name: 'Baner', exact: true });
  await expect(baner).toHaveAttribute('aria-pressed', 'true');
  const show = page.getByRole('button', { name: 'Show Map view' });

  await baner.click();
  await expect(show, 'only the unknown area is left selected, and it is not on screen').toBeDisabled();

  await baner.click();
  await show.click();
  await expect(page).toHaveURL(/[?&]loc=baner(&|$)/);
  expect(new URL(page.url()).searchParams.get('loc')).toBe('baner');
});

test('the listings map holds three areas: a fourth sends you back to trim the list', async ({ page }) => {
  await page.goto('/listings?deal=buy&view=map&loc=baner,wakad,aundh');
  await expect(page.getByRole('heading', { name: /Focus your map/i })).toHaveCount(0);

  await page.goto('/listings?deal=buy&view=map&loc=baner,wakad,aundh,kothrud');
  await expect(page.getByText(/Map view stays fast with up to\s*3\s*areas/)).toBeVisible();
  await page.getByRole('button', { name: 'Remove area Kothrud' }).click();
  await expect(page.getByText(/Map view stays fast with up to/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Focus your map/i })).toHaveCount(0);
});
