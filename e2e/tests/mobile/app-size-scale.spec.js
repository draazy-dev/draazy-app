import { test, expect } from '../../fixtures/live.js';

/* Every page draws its chips, tags, counts and padded buttons from one token scale, so a height that drifts from the
 * token means a utility or route rule is overriding the shared class. */

const PAGES = ['/', '/help', '/services', '/flatmates', '/blog', '/trust'];
const SIZES = {
  '.dz-chip': '--dz-chip-h', '.dz-tag': '--dz-tag-h', '.dz-count': '--dz-count-h',
  // The top-bar pill pins its own mobile height (--dz-nav-pill-h).
  '.h-btn:not(.dz-topbar__pill)': '--btn-h', '.h-btn-sm': '--btn-h-sm', '.h-btn-lg': '--btn-h-lg',
};

test('chips, tags, counts and buttons on every public page take their height from the scale', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dz_cookie_consent_v1', JSON.stringify({
    necessary: true, functional: true, analytics: true, marketing: true, version: 1, ts: Date.now(),
  })));
  let seen = 0;
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const off = await page.evaluate((sizes) => {
      const root = getComputedStyle(document.documentElement);
      return Object.entries(sizes).flatMap(([sel, token]) => {
        const want = parseFloat(root.getPropertyValue(token));
        return [...document.querySelectorAll(sel)]
          .filter((el) => el.getClientRects().length)
          .map((el) => ({ sel, h: el.getBoundingClientRect().height, want, text: el.textContent.trim().slice(0, 30) }));
      });
    }, SIZES);
    seen += off.length;
    expect(off.filter((o) => Math.abs(o.h - o.want) > 0.5), `${path}: off-scale`).toEqual([]);
  }
  expect(seen, 'the pages render scale items at all').toBeGreaterThan(5);
});

test('the Flatmates home tile shows its listing count like every other category', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.cat-card', { hasText: 'Flatmates' })).toContainText(/\d+ listings?/);
});

test('teal gradient numbers carry no ink outline in light theme', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dzAppPrefs', JSON.stringify({ theme: 'light' })));
  await page.goto('/services');
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  const numbers = page.locator('.gradient-text');
  await expect(numbers.first()).toBeVisible();
  expect(await numbers.evaluateAll((els) => els.map((el) => getComputedStyle(el).webkitTextStrokeWidth))).not.toContain('0.25px');
});

test('home FAQ questions are compact rows, not tall padded cards', async ({ page }) => {
  await page.goto('/');
  const rows = page.locator('section[aria-labelledby="faqHeading"] details:not([open])');
  await expect(rows.first()).toBeVisible();
  const heights = await rows.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(Math.min(...heights), 'a one-line question keeps the 44px tap floor').toBeGreaterThanOrEqual(44);
  expect(heights.filter((h) => h > 76), 'only a two-line question grows past a single row').toEqual([]);
});
