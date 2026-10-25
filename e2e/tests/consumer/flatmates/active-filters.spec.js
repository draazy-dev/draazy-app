import { test, expect } from '@playwright/test';
import { trackErrors } from '../../../helpers/console.js';

const row = (page) => page.getByTestId('active-filters');
const chips = (page) => row(page).locator('.af-chip');
const params = (page) => Object.fromEntries(new URL(page.url()).searchParams);

test.describe('LIVE: flatmates active filter chips', () => {
  test('Rooms: every set filter is a removable chip above the results', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/flatmates?view=move-in&loc=Baner&budget=5000-20000&room=private&furn=semi&v=1&gated=1&bath=1');
    await expect(chips(page)).toHaveText(['₹5,000 – ₹20,000/mo', 'Baner', 'Private room', 'Semi-furnished', 'Verified only', 'Gated society', 'Attached bath'], { timeout: 20_000 });

    await row(page).getByRole('button', { name: 'Remove filter Baner', exact: true }).click();
    await expect(chips(page).filter({ hasText: 'Baner' })).toHaveCount(0);
    await expect.poll(() => params(page).loc).toBeUndefined();
    expect(params(page).furn, 'removing one chip leaves the others applied').toBe('semi');

    await row(page).getByRole('button', { name: 'Clear all' }).click();
    await expect(row(page)).toHaveCount(0);
    await expect.poll(() => Object.keys(params(page)).filter((k) => k !== 'view')).toEqual([]);
    expect(errors, `console errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  test('Flatmates: chips follow the tab, so a rooms-only filter in the URL is not shown', async ({ page }) => {
    await page.goto('/flatmates?view=people&g=female&gonly=1&movein=now&room=shared&furn=semi');
    await expect(chips(page)).toHaveText(['Move-in: Immediate', 'Women', 'Shared room'], { timeout: 20_000 });

    await row(page).getByRole('button', { name: 'Remove filter Move-in: Immediate' }).click();
    await expect.poll(() => params(page).movein).toBeUndefined();
    await expect(chips(page)).toHaveText(['Women', 'Shared room']);
  });

  test('Teams: locality, home policy and group size show and clear', async ({ page }) => {
    await page.goto('/flatmates?view=teams&loc=Wakad&g=male&gonly=1&sharing=3');
    await expect(chips(page)).toHaveText(['Wakad', 'Men-only homes', '3 sharing'], { timeout: 20_000 });

    await row(page).getByRole('button', { name: 'Remove filter Men-only homes' }).click();
    await expect.poll(() => [params(page).g, params(page).gonly]).toEqual([undefined, undefined]);
    await expect(chips(page)).toHaveText(['Wakad', '3 sharing']);
  });
});
