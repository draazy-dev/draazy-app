import { test, expect } from '../../fixtures/live.js';

/* /listings draws its compact controls from the --dz-* scale in index.css :root, so a row of them
 * reads as one family. Heights are compared to the token, not to a literal, so the scale can move. */

const consent = (page) =>
  page.addInitScript(() => {
    localStorage.setItem(
      'dz_cookie_consent_v1',
      JSON.stringify({ necessary: true, functional: true, analytics: true, marketing: true, version: 1, ts: Date.now() }),
    );
  });

const token = (page, name) =>
  page.evaluate((n) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)), name);

const height = (locator) => locator.evaluate((el) => el.getBoundingClientRect().height);

test.describe('Listings compact size scale', () => {
  test('toolbar, filter chips and tags take their heights from the scale and keep a 44px target', async ({ page }) => {
    await consent(page);
    await page.goto('/listings?deal=buy&loc=baner,wakad,kharadi,aundh,hinjewadi&bhk=1,2,3');

    const chips = page.locator('.af-chip');
    await expect(chips.first()).toBeVisible();
    const [controlH, iconBtn, chipH, tagH] = await Promise.all(['--control-h', '--dz-icon-btn', '--dz-chip-sm-h', '--dz-tag-h'].map((n) => token(page, n)));
    expect(iconBtn, 'the scale is defined').toBeGreaterThan(0);

    await test.step('the view toggle matches the sort trigger, and its segments are --dz-icon-btn', async () => {
      const seg = page.locator('.dz-segmented:visible').first();
      const sort = page.locator('.dz-dd-sort .dz-dropdown__trigger:visible').first();
      expect(await height(seg)).toBeCloseTo(controlH, 0);
      expect(await height(sort)).toBeCloseTo(controlH, 0);
      const grid = seg.getByRole('button', { name: 'Grid view' });
      expect(await height(grid)).toBeCloseTo(iconBtn, 0);
      await expect(grid).toHaveAttribute('aria-pressed', 'true');
    });

    await test.step('active-filter chips are one scrolling row of --dz-chip-sm-h pills, the size of a picked locality', async () => {
      const clear = page.locator('.af-clear-all');
      expect(await height(chips.first())).toBeCloseTo(chipH, 0);
      expect(await height(clear)).toBeCloseTo(chipH, 0);

      const row = await clear.evaluate((el) => {
        const r = el.parentElement;
        const tops = [...r.querySelectorAll('.dz-chip')].map((c) => Math.round(c.getBoundingClientRect().top));
        return { rows: new Set(tops).size, overflows: r.scrollWidth > r.clientWidth };
      });
      expect(row.rows, 'chips wrap onto a second line').toBe(1);
      expect(row.overflows, 'the fixture must overflow a phone row to prove it scrolls').toBe(true);
    });

    await test.step('the first card tag is --dz-tag-h tall', async () => {
      const tag = page.locator('.dz-tag:visible').first();
      await expect(tag).toBeVisible();
      expect(await height(tag)).toBeCloseTo(tagH, 0);
    });

    await test.step('a picked locality in the filter drawer is the same size as an active-filter chip', async () => {
      await page.locator('.filter-fab').click();
      const picked = page.locator('.filter-panel.open').getByRole('button', { name: 'Remove Baner', exact: true });
      await expect(picked).toBeVisible();
      expect(await height(picked)).toBeCloseTo(chipH, 0);
      await page.keyboard.press('Escape');
      await expect(page.locator('.filter-panel.open')).toHaveCount(0);
    });

    await test.step('a tap just outside the drawn chip still lands on it', async () => {
      const clear = page.locator('.af-clear-all');
      await clear.scrollIntoViewIfNeeded();
      const before = await clear.evaluate((el) => parseFloat(getComputedStyle(el, '::before').height));
      expect(before, 'the chip carries a 44px ::before target').toBeGreaterThanOrEqual(44);

      const b = await clear.boundingBox();
      await page.mouse.click(b.x + b.width / 2, b.y - 4);
      await expect(chips).toHaveCount(0);
    });
  });
});
