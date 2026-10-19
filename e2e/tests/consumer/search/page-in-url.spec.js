import { test, expect } from '@playwright/test';

/* Buy holds 34 approved homes, so price-low has a 24-card page 1 and a 10-card page 2. Without the page in the URL,
   Back from a page-2 property landed on page 1 scrolled to page 2's offset. */

const cards = (page) => page.locator('main a[href^="/property/"]')
  .evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
const urlPage = (page) => new URL(page.url()).searchParams.get('page');
const current = (page) => page.locator('.page-btn.active').first();

async function onPage2(page) {
  await page.goto('/listings?deal=buy&sort=price-low');
  await expect(current(page)).toHaveText('1');
  const first = await cards(page);
  await page.locator('.page-btn', { hasText: /^2$/ }).first().click();
  await expect.poll(() => urlPage(page)).toBe('2');
  await expect.poll(async () => (await cards(page))[0]).not.toBe(first[0]);
  return cards(page);
}

test('the page survives a reload and Back from a property', async ({ page }) => {
  const p2 = await onPage2(page);
  await page.reload();
  await expect(current(page)).toHaveText('2');
  await expect.poll(async () => (await cards(page))[0]).toBe(p2[0]);

  await page.locator('main a[href^="/property/"]').nth(3).click();
  await page.waitForURL(/\/property\//);
  await page.goBack();
  await expect(current(page)).toHaveText('2');
  await expect.poll(async () => (await cards(page))[0]).toBe(p2[0]);
});

test('the property breadcrumb returns to the same page and sort', async ({ page }) => {
  const p2 = await onPage2(page);
  await page.locator('main a[href^="/property/"]').nth(3).click();
  await page.waitForURL(/\/property\//);
  const crumb = page.locator('nav[aria-label="Breadcrumb"] a', { hasText: /^Buy$/ });
  expect(new URL(await crumb.getAttribute('href'), page.url()).searchParams.get('sort')).toBe('price-low');
  await crumb.click();
  await expect.poll(() => urlPage(page)).toBe('2');
  expect(new URL(page.url()).searchParams.get('sort')).toBe('price-low');
  await expect.poll(async () => (await cards(page))[0]).toBe(p2[0]);
});

test('a sort change goes back to page 1 and drops the page from the URL', async ({ page }) => {
  await onPage2(page);
  await page.locator('button[aria-label="Sort listings"]:visible').click();
  await page.getByRole('option', { name: 'Newest First', exact: true }).click();
  await expect(current(page)).toHaveText('1');
  await expect.poll(() => urlPage(page)).toBeNull();
});

test('an out-of-range or malformed page settles on a real one', async ({ page }) => {
  await page.goto('/listings?deal=buy&page=99');
  await expect(current(page)).toHaveText('2');
  await expect.poll(() => urlPage(page)).toBe('2');
  expect((await cards(page)).length).toBeGreaterThan(0);
  for (const bad of ['0', '-1', 'abc', '2.5']) {
    await page.goto(`/listings?deal=buy&page=${bad}`);
    await expect(current(page)).toHaveText('1');
    await expect.poll(() => urlPage(page)).toBeNull();
  }
});
