import { test, expect } from '../../../fixtures/live.js';

function countApi(page) {
  const seen = new Map();
  page.on('request', (r) => {
    if (r.method() !== 'GET' || !r.url().includes('/api/')) return;
    const url = new URL(r.url());
    const key = `${url.pathname}${url.search}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  });
  return {
    times: (path) => [...seen].filter(([k]) => k.split('?')[0] === path).reduce((n, [, c]) => n + c, 0),
    repeated: () => [...seen].filter(([k, c]) => !k.includes('/messages/stream') && c > 1).map(([k]) => k),
  };
}

const inApp = (page, url) => page.evaluate((to) => {
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}, url);

const SECTION_READS = [
  '/api/me/listings', '/api/me/flatmate-posts', '/api/me/flatmate-rooms', '/api/me/flatmate-groups',
  '/api/visits', '/api/me/visit-requests', '/api/me/flatmate-requests',
  '/api/me/contact-requests', '/api/me/photo-requests', '/api/me/documents/requests', '/api/me/group-applications',
];

test.describe('Dashboard request budget on a phone', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('returning to the tab refreshes every section from one dashboard read', async ({ page, login, consoleErrors }) => {
    await login.asOwner();
    const api = countApi(page);
    const doc = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/me/dashboard');
    await page.goto('/dashboard');
    await doc;
    // Past the 5s page-load reuse window, so the refresh has to go to the network.
    await page.waitForTimeout(5500);

    await page.evaluate(async () => {
      const flip = (state) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      };
      flip('hidden');
      await new Promise((r) => setTimeout(r, 300));
      flip('visible');
    });
    await expect.poll(() => api.times('/api/me/dashboard'), { timeout: 10000 }).toBe(2);
    await page.waitForTimeout(1500);

    for (const path of SECTION_READS) expect.soft(api.times(path), `${path} read on its own`).toBe(0);
    expect(api.times('/api/service-requests')).toBe(2);
    expect(consoleErrors).toEqual([]);
  });

  test('leaving the dashboard and straight back re-reads nothing', async ({ page, login, consoleErrors }) => {
    await login.asBuyer();
    const api = countApi(page);
    await page.goto('/dashboard');
    await expect.poll(() => api.times('/api/properties'), { timeout: 15000 }).toBe(1);
    await page.waitForTimeout(1000);

    await inApp(page, '/saved');
    await expect.poll(() => api.times('/api/me/saved'), { timeout: 10000 }).toBe(1);
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.waitForTimeout(2500);

    expect.soft(api.times('/api/me/dashboard'), 'dashboard re-read on return').toBe(1);
    expect.soft(api.times('/api/service-requests'), 'service requests re-read on return').toBe(1);
    expect.soft(api.times('/api/properties'), 'recommended homes re-read on return').toBe(1);
    expect(api.repeated()).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('moving between listings and billing reads entitlements once', async ({ page, login, consoleErrors }) => {
    await login.asOwner();
    const api = countApi(page);
    const balance = page.locator('[data-balance="contacts"]');
    await page.goto('/dashboard#billing');
    await expect(balance).toBeVisible({ timeout: 20000 });

    // Each hop waits past the 5s page-load reuse window, so only the 30s revisit window can serve it.
    for (const hash of ['properties', 'billing', 'properties']) {
      await page.waitForTimeout(5500);
      await inApp(page, `/dashboard#${hash}`);
      if (hash === 'billing') await expect(balance).toBeVisible({ timeout: 10000 });
    }
    await page.waitForTimeout(1500);

    expect(api.times('/api/me/entitlements')).toBe(1);
    expect(consoleErrors).toEqual([]);
  });
});
