import { test, expect } from '../../../fixtures/live.js';

function countApi(page) {
  const seen = new Map();
  page.on('request', (r) => {
    if (!r.url().includes('/api/')) return;
    const url = new URL(r.url());
    const key = `${r.method()} ${url.pathname}${url.search}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  });
  return {
    times: (method, path) => [...seen].filter(([k]) => k.split('?')[0] === `${method} ${path}`).reduce((n, [, c]) => n + c, 0),
    repeatedGets: () => [...seen].filter(([k, c]) => k.startsWith('GET ') && !k.includes('/messages/stream') && c > 1).map(([k]) => k),
  };
}

const firstCard = (page) => page.locator('a.card-hover').first();

test.describe('Listings request budget on a phone', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('a guest search page asks each question once', async ({ page, consoleErrors }) => {
    const api = countApi(page);
    await page.goto('/rent/baner');
    await expect(firstCard(page)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);

    expect(api.times('GET', '/api/properties')).toBe(1);
    expect(api.times('GET', '/api/bootstrap')).toBe(1);
    expect(api.repeatedGets()).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('coming back from a listing re-reads nothing and logs the same search once', async ({ page, login, consoleErrors }) => {
    await login.asOwner();
    const api = countApi(page);
    await page.goto('/listings?deal=buy&bhks=2');
    await expect(firstCard(page)).toBeVisible({ timeout: 15000 });
    await expect.poll(() => api.times('POST', '/api/demand-signals')).toBe(1);
    expect(api.times('GET', '/api/me/listings')).toBe(1);

    await firstCard(page).click();
    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
    // Outlasts the 5s page-load cache, so only the strip's own 30s maxAge can spare the re-read.
    await page.waitForTimeout(6000);
    const signalsAfterDetail = api.times('POST', '/api/demand-signals');

    await page.goBack();
    await expect(firstCard(page)).toBeVisible();
    await page.waitForTimeout(1500);

    expect.soft(api.times('GET', '/api/me/listings'), 'my-listings strip re-read on return').toBe(1);
    expect.soft(api.times('GET', '/api/properties'), 'search re-asked on return').toBe(1);
    expect.soft(api.times('POST', '/api/demand-signals'), 'same search logged again on return').toBe(signalsAfterDetail);
    expect(api.repeatedGets()).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
