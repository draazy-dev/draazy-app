import { test, expect } from '../../../fixtures/live.js';

function countApi(page) {
  const seen = new Map();
  page.on('request', (r) => {
    if (!r.url().includes('/api/')) return;
    const url = new URL(r.url());
    const key = `${r.method()} ${url.pathname}${url.search}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  });
  const matching = (method, path) => [...seen].filter(([k]) => k.split('?')[0] === `${method} ${path}`);
  return {
    times: (method, path) => matching(method, path).reduce((n, [, c]) => n + c, 0),
    queries: (method, path) => matching(method, path).map(([k]) => new URLSearchParams(k.split('?')[1] || '')),
    repeatedGets: () => [...seen].filter(([k, c]) => k.startsWith('GET ') && !k.includes('/messages/stream') && c > 1).map(([k]) => k),
  };
}

const heading = (page) => page.locator('.dz-property h1').first();

test.describe('Property page request budget on a phone', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('a buyer opening and closing the contact sheet re-reads nothing the page already has', async ({ page, login, consoleErrors }) => {
    await login.asBuyer();
    const api = countApi(page);
    await page.goto('/property/p5120');
    await expect(heading(page)).toBeVisible({ timeout: 15000 });
    await expect.poll(() => api.times('GET', '/api/offers/mine')).toBe(1);
    const [offers] = api.queries('GET', '/api/offers/mine');
    expect(offers.get('propertyId'), 'buyer offers read scoped to this listing').toMatch(/^[0-9a-f-]{36}$/);

    await page.locator('.dz-sticky-cta button').first().click();
    await page.waitForTimeout(1500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);

    expect.soft(api.times('GET', '/api/contacts/status'), 'contact gate re-read').toBe(1);
    expect.soft(api.times('GET', '/api/me/entitlements'), 'entitlements re-read').toBe(1);
    expect.soft(api.times('GET', '/api/visits'), 'visits re-read').toBe(1);
    expect(api.repeatedGets()).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('hopping to a similar listing and straight back re-reads nothing about the first', async ({ page, login, consoleErrors }) => {
    await login.asBuyer();
    const api = countApi(page);
    await page.goto('/property/p5120');
    await expect(heading(page)).toBeVisible({ timeout: 15000 });
    await expect.poll(() => api.times('GET', '/api/visits')).toBe(1);

    const card = page.locator('a.property-card').first();
    for (let i = 0; i < 8; i += 1) await page.mouse.wheel(0, 900);
    await card.waitFor({ state: 'attached', timeout: 15000 });
    const from = page.url();
    await card.evaluate((el) => el.click());
    await page.waitForURL((u) => u.href !== from);
    await expect(heading(page)).toBeVisible({ timeout: 15000 });
    // Outlasts the 5s page-load cache, so only the 30s revisit window can spare the re-reads.
    await page.waitForTimeout(6000);

    await page.goBack();
    await expect(heading(page)).toBeVisible();
    await page.waitForTimeout(1500);

    expect.soft(api.times('GET', '/api/properties/p5120'), 'listing re-read on return').toBe(1);
    expect.soft(api.queries('GET', '/api/contacts/status').filter((q) => q.get('propertyId') === 'p5120').length, 'contact gate re-read on return').toBe(1);
    expect.soft(api.repeatedGets().filter((k) => !k.includes('/properties/similar')), 'repeated reads on return').toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('an owner\'s deal panel reads offers and finalisation requests for this listing only', async ({ page, login, consoleErrors }) => {
    await login.asOwner();
    const api = countApi(page);
    await page.goto('/property/p5021');
    await expect(heading(page)).toBeVisible({ timeout: 15000 });
    await expect.poll(() => api.times('GET', '/api/me/finalization-requests')).toBe(1);

    for (const path of ['/api/me/offers', '/api/me/finalization-requests']) {
      const reads = api.queries('GET', path);
      expect(reads, `${path} read once`).toHaveLength(1);
      expect(reads[0].get('propertyId'), `${path} scoped to this listing`).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(api.repeatedGets()).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
