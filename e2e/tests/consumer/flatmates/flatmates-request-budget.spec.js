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

async function firstGroupId(request) {
  const res = await request.get('/api/flatmates/feed?tab=teams&size=1');
  expect(res.ok()).toBe(true);
  const id = (await res.json()).content?.[0]?.id;
  expect(id, 'a public flatmate group in the seed').toBeTruthy();
  return id;
}

const MY_READS = [
  '/api/me/flatmate-posts', '/api/me/flatmate-groups', '/api/me/flatmate-rooms',
  '/api/me/flatmate-saves/keys', '/api/me/flatmate-interests/keys',
];

test.describe('Flatmates request budget on a phone', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('opening a group and coming back re-reads none of my flatmate state', async ({ page, login, request, consoleErrors }) => {
    const groupId = await firstGroupId(request);
    await login.asBuyer();
    const api = countApi(page);
    await page.goto('/flatmates');
    await expect.poll(() => MY_READS.every((p) => api.times(p) === 1), { timeout: 15000 }).toBe(true);
    // Past the 5s page-load reuse window, so only the 30s revisit window can serve the reads below.
    await page.waitForTimeout(5500);

    const detail = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/flatmates/groups/${groupId}`);
    await inApp(page, `/flatmates/group/${groupId}`);
    await detail;
    await expect(page.locator('main h1').first()).toBeVisible({ timeout: 10000 });
    await page.goBack();
    await expect(page).toHaveURL(/\/flatmates$/);
    await page.waitForTimeout(2500);

    for (const path of MY_READS) expect.soft(api.times(path), `${path} re-read`).toBe(1);
    expect(api.repeated()).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('a signed-in cold detail load does not wait for the session check', async ({ page, login, request, consoleErrors }) => {
    const groupId = await firstGroupId(request);
    await login.asBuyer();
    let release;
    const held = new Promise((r) => { release = r; });
    await page.route('**/api/me/bootstrap', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await held;
      return route.continue();
    });

    // The bootstrap hold, not the timeout, is the assertion: the dev server can take ~10s to load the detail chunk.
    const detail = page.waitForRequest((r) => new URL(r.url()).pathname === `/api/flatmates/groups/${groupId}`, { timeout: 25000 });
    await page.goto(`/flatmates/group/${groupId}`);
    try {
      await detail;
    } finally {
      release();
    }
    await expect(page.locator('main h1').first()).toBeVisible({ timeout: 10000 });
    expect(consoleErrors).toEqual([]);
  });
});
