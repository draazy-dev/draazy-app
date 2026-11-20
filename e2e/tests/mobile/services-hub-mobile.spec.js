// @ts-check
import { test, expect } from '@playwright/test';
import { trackErrors } from '../../helpers/console.js';
import { seedConsent } from '../../helpers/liveAuth.js';

test.describe('Services hub on a phone', () => {
  test('the rent agreement spotlight leads above the fold and the rest stays compact', async ({ page }) => {
    const errors = trackErrors(page);
    await seedConsent(page);
    await page.goto('/services');

    const cta = page.locator('a.ra-spot .ra-spot-cta');
    await expect(cta).toBeVisible();
    const vw = page.viewportSize()?.width ?? 0;
    const vh = page.viewportSize()?.height ?? 0;
    const box = await cta.boundingBox();
    expect(box?.height ?? 0, 'spotlight CTA is thumb-sized').toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, 'spotlight CTA spans the card').toBeGreaterThan(vw * 0.7);
    const navTop = (await page.getByRole('navigation', { name: 'Primary' }).boundingBox())?.y ?? vh;
    expect((box?.y ?? vh) + (box?.height ?? 0), 'spotlight CTA clears the bottom nav on the first screen').toBeLessThanOrEqual(navTop);

    const grid = page.locator('a.svc-card').first().locator('xpath=..');
    const featured = page.locator('a.svc-card[href="/services/rent-agreement"]');
    const gridW = (await grid.boundingBox())?.width ?? 0;
    expect((await featured.boundingBox())?.width ?? 0, 'rent agreement tile spans the grid').toBeGreaterThan(gridW - 2);
    const other = page.locator('a.svc-card').nth(1);
    expect((await other.boundingBox())?.width ?? 0, 'other tiles sit two to a row').toBeLessThan(gridW / 2);

    await expect(page.locator('li.step p')).toHaveCount(4);
    for (const p of await page.locator('li.step p').all()) await expect(p).toBeHidden();
    const stepTops = await page.locator('li.step').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(stepTops).size, 'the four steps share one row').toBe(1);

    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});
