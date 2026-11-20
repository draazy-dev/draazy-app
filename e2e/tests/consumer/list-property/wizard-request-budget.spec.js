import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, authHeaders, signedInAsNew } from '../../../helpers/liveAuth.js';

const QUOTA = '/api/me/listings/quota';

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
    reset: () => seen.clear(),
  };
}

test.describe('List-property request budget on a phone', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('a flatmate room never reads the listing quota, and toggling room ↔ whole place re-reads none', async ({ page, consoleErrors }) => {
    await signedInAsNew(page);
    const api = countApi(page);
    await page.goto('/list-property?flatmate=1');
    await expect(page.getByRole('heading', { name: 'Room details', exact: true })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2500);
    expect(api.times(QUOTA)).toBe(0);
    expect(api.repeated()).toEqual([]);

    api.reset();
    await page.goto('/list-property');
    await expect.poll(() => api.times(QUOTA), { timeout: 15000 }).toBe(1);
    await page.locator('.radio-pill', { hasText: 'Rent' }).first().click();
    await page.getByRole('button', { name: /^Find a flatmate\b/ }).click();
    await expect(page.getByRole('heading', { name: 'Room details', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Rent out the whole place\b/ }).click();
    await expect(page.getByRole('button', { name: /^Rent out the whole place\b/ })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(1500);
    expect(api.times(QUOTA)).toBe(1);
    expect(api.repeated()).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('a signed-in cold edit reads the listing without waiting for the session check', async ({ page, login, request, consoleErrors }) => {
    const mine = await request.get(`${API}/me/listings?size=1`, { headers: await authHeaders(ACTORS.owner) });
    expect(mine.ok()).toBe(true);
    const id = (await mine.json()).content?.[0]?.id;
    expect(id, 'the seeded owner has a listing').toBeTruthy();
    await login.asOwner();
    const api = countApi(page);
    let release;
    const held = new Promise((r) => { release = r; });
    await page.route('**/api/me/bootstrap', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await held;
      return route.continue();
    });

    // The bootstrap hold, not the timeout, is the assertion: the dev server can take ~10s to boot the app.
    const read = page.waitForRequest((r) => new URL(r.url()).pathname === `/api/me/listings/${id}`, { timeout: 25000 });
    await page.goto(`/list-property?edit=${id}`);
    try {
      await read;
    } finally {
      release();
    }
    await expect(page.locator('.lp-steps')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);
    expect(api.times(`/api/me/listings/${id}`)).toBe(1);
    expect(api.repeated()).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
