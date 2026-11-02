import { test, expect } from '../../../fixtures/live.js';
import { API } from '../../../helpers/liveAuth.js';

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

const flatmatesTile = (page) => page.getByRole('link', { name: /^Flatmates\b/ }).first();

async function scrollToBottom(page) {
  for (let i = 0; i < 12; i += 1) await page.mouse.wheel(0, 900);
  await page.waitForTimeout(1000);
}

test.describe('Home request budget on a phone', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('the Flatmates tile counts every tab from one feed read', async ({ page, consoleErrors }) => {
    const totals = await Promise.all(['move-in', 'people', 'teams'].map(async (tab) => {
      const res = await fetch(`${API}/flatmates/feed?tab=${tab}&page=0&size=1`);
      return (await res.json()).totalElements;
    }));
    const expected = new Intl.NumberFormat('en-IN').format(totals.reduce((a, b) => a + b, 0));

    const api = countApi(page);
    await page.goto('/');
    await expect(flatmatesTile(page)).toContainText(`${expected} listings`, { timeout: 15000 });
    await page.waitForTimeout(1000);

    expect(api.times('/api/flatmates/feed'), 'flatmate feed reads on Home').toBe(1);
    expect(api.repeated()).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('recently viewed homes are read only once scrolled near', async ({ page, consoleErrors }) => {
    await page.addInitScript(() => localStorage.setItem('dzRecentProps:anon', JSON.stringify(['p5171'])));
    const api = countApi(page);
    await page.goto('/');
    await expect(flatmatesTile(page)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);
    expect(api.times('/api/properties/cards'), 'cards read before scrolling').toBe(0);

    await scrollToBottom(page);
    await expect(page.getByRole('heading', { name: 'Recently viewed' })).toBeVisible();
    expect(api.times('/api/properties/cards')).toBe(1);
    expect(consoleErrors).toEqual([]);
  });

  test('returning to Home from a listing re-reads no flatmate feed or society list', async ({ page, consoleErrors }) => {
    const api = countApi(page);
    await page.goto('/');
    await expect(flatmatesTile(page)).toContainText('listings', { timeout: 15000 });
    await scrollToBottom(page);
    await expect.poll(() => api.times('/api/societies/top')).toBe(1);

    const card = page.locator('a.property-card').first();
    await card.evaluate((el) => el.click());
    await page.waitForURL(/\/property\//);
    await expect(page.locator('.dz-property h1').first()).toBeVisible({ timeout: 15000 });
    await page.goBack();
    await expect(flatmatesTile(page)).toContainText('listings', { timeout: 15000 });
    await scrollToBottom(page);

    expect.soft(api.times('/api/flatmates/feed'), 'flatmate feed re-read on return').toBe(1);
    expect.soft(api.times('/api/societies/top'), 'society list re-read on return').toBe(1);
    expect(api.repeated()).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
