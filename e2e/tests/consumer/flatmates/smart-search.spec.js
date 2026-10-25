import { test, expect } from '@playwright/test';

/* Smart search drops the raw sentence once a structured filter parses, because the search box also literal-matches
   and would zero the results; with no filter understood it stays a plain text search. */

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const SEARCH = /Try: girl in baner/i;

test('smart search turns a sentence into filters and clears the raw query', async ({ page }) => {
  await page.goto(`${BASE}/flatmates?view=flatmates`);
  await page.locator('.sf-card').first().waitFor({ timeout: 10000 });
  const before = await page.locator('.sf-card').count();

  await page.getByPlaceholder(SEARCH).fill('woman in baner');
  await page.getByRole('button', { name: 'Smart search' }).click();

  // The raw sentence is gone (it's now expressed as structured chips)…
  await expect(page.getByPlaceholder(SEARCH)).toHaveValue('');
  /* "Narrowed but not empty" rather than an exact count, which breaks on every seed change. Polled: a slow runner lets
     the typing debounce search the raw sentence first, and its empty page shows until the parsed search lands. */
  await expect.poll(() => page.locator('.sf-card').count(), { timeout: 10000 }).toBeGreaterThan(0);
  expect(await page.locator('.sf-card').count()).toBeLessThan(before);
});

test('smart search keeps an unparseable query as a literal text filter', async ({ page }) => {
  await page.goto(`${BASE}/flatmates?view=flatmates`);
  await page.locator('.sf-card').first().waitFor({ timeout: 10000 });

  await page.getByPlaceholder(SEARCH).fill('zzznotarealmatch');
  await page.getByRole('button', { name: 'Smart search' }).click();

  // Nothing parsed, so the text stays as a plain substring search…
  await expect(page.getByPlaceholder(SEARCH)).toHaveValue('zzznotarealmatch');
  await expect(page.locator('.sf-card')).toHaveCount(0);
  // …and the empty state echoes the query so the user sees WHY it's empty.
  await expect(page.getByText(/zzznotarealmatch/).first()).toBeVisible();
});

test('each tab exposes its live result count to assistive tech', async ({ page }) => {
  await page.goto(`${BASE}/flatmates`);
  await page.locator('.sf-card').first().waitFor({ timeout: 10000 });

  /* The visible count and accessible name must agree: stock a seeker cannot see never makes them switch tabs. */
  const cards = await page.locator('.sf-card').count();
  await expect(page.getByRole('button', { name: `Rooms — ${cards} ${cards === 1 ? 'room' : 'rooms'} to move into` })).toBeVisible();
});

test('raising the budget from the empty state recovers matches', async ({ page }) => {
  // Force an all-but-budget match: cheapest Baner woman is ₹16k, so a ₹10k ceiling
  // yields zero and the empty state should offer to raise the budget.
  await page.goto(`${BASE}/flatmates?view=flatmates`);
  await page.locator('.sf-card').first().waitFor({ timeout: 10000 });

  await page.getByPlaceholder(SEARCH).fill('woman in baner');
  await page.getByRole('button', { name: 'Smart search' }).click();
  // Non-empty rather than a literal count — see the note on the first test.
  await expect(page.locator('.sf-card').first()).toBeVisible();

  // Tighten the budget below the cheapest match via the smart box.
  await page.getByPlaceholder(SEARCH).fill('woman in baner under 10000');
  await page.getByRole('button', { name: 'Smart search' }).click();
  await expect(page.locator('.sf-card')).toHaveCount(0);

  const raise = page.getByRole('button', { name: /Raise budget to/i });
  await expect(raise).toBeVisible({ timeout: 5000 });
  await raise.click();

  // The list comes back once the budget clears the cheapest match.
  await expect(page.locator('.sf-card').first()).toBeVisible({ timeout: 5000 });
});

test('a slow locality lookup neither searches the raw sentence nor lets an older search win', async ({ page }) => {
  await page.route('**/api/localities/search**', async (route) => {
    if (/baner/i.test(route.request().url())) await new Promise((r) => setTimeout(r, 1500));
    return route.fallback();
  });
  const feeds = [];
  page.on('request', (r) => { if (/\/flatmates\/feed\?/.test(r.url())) feeds.push(new URL(r.url()).searchParams); });
  await page.goto(`${BASE}/flatmates?view=flatmates`);
  await page.locator('.sf-card').first().waitFor({ timeout: 10000 });

  const box = page.getByPlaceholder(SEARCH);
  await box.fill('woman in baner');
  await box.press('Enter');
  await page.waitForTimeout(1000);
  await box.fill('man');
  await box.press('Enter');
  await page.waitForTimeout(2000);

  expect(feeds.some((p) => /baner/i.test(p.get('q') || '')), 'the raw sentence reached the server').toBe(false);
  const last = feeds.at(-1);
  expect(last.get('gender')).toBe('male');
  expect(last.get('locality') || '').not.toMatch(/baner/i);
});
