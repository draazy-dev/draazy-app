import { test, expect } from '../../../fixtures/live.js';

function countApi(page) {
  let seen = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' || !r.url().includes('/api/')) return;
    const url = new URL(r.url());
    seen.push(`${url.pathname}${url.search}`);
  });
  return {
    reset: () => { seen = []; },
    times: (path) => seen.filter((k) => k.split('?')[0] === path).length,
    count: (key) => seen.filter((k) => k === key).length,
    repeated: () => [...new Set(seen)].filter((k) => !k.includes('/messages/stream') && seen.filter((s) => s === k).length > 1),
  };
}

// Playwright cannot hide a real tab, so fake the Page Visibility API the app listens to.
const setVisibility = (page, state) => page.evaluate((st) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => st });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => st === 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
}, state);

const BADGE_READS = ['/api/messages/unread-count', '/api/notifications/unread-count', '/api/me/requests/pending-count'];

async function openInbox(page, login) {
  await login.asBuyer();
  const api = countApi(page);
  const stream = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/messages/stream');
  await page.goto('/messages');
  await expect(page.locator('.pc-conv:not(.pc-skel)').first()).toBeVisible({ timeout: 15000 });
  await stream;
  await page.waitForTimeout(2500);
  return api;
}

test.describe('Chat request budget on a phone', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('a cold inbox reads each resource once', async ({ page, login, consoleErrors }) => {
    const api = await openInbox(page, login);
    expect(api.repeated()).toEqual([]);
    expect(api.count('/api/me/requests?box=received&size=100')).toBe(1);
    // The badge comes from /me/bootstrap; on the dev server StrictMode's
    // second effect run can miss that single-use seed.
    expect(api.times('/api/me/requests/pending-count')).toBeLessThanOrEqual(1);
    expect(consoleErrors).toEqual([]);
  });

  test('sending a message re-reads the thread and the unread badge once', async ({ page, login, consoleErrors }) => {
    await openInbox(page, login);
    const api = countApi(page);
    const thread = page.waitForResponse((r) => /\/api\/messages\/[^/?]+$/.test(new URL(r.url()).pathname));
    await page.locator('.pc-conv[data-staged="false"]').first().click();
    const threadPath = new URL((await thread).url()).pathname;
    await expect(page.locator('.pc-input')).toBeVisible();
    await page.waitForTimeout(2500);

    api.reset();
    const reply = page.waitForResponse((r) => new URL(r.url()).pathname === `${threadPath}/reply`);
    await page.locator('.pc-input').fill(`budget ping ${Date.now()}`);
    await page.locator('.pc-send').click();
    expect((await reply).ok()).toBe(true);
    await page.waitForTimeout(3000);

    expect(api.times(threadPath)).toBeLessThanOrEqual(1);
    expect(api.times('/api/messages/unread-count')).toBeLessThanOrEqual(1);
    expect(consoleErrors).toEqual([]);
  });

  test('a quick tab return with a live stream re-reads no badge or inbox', async ({ page, login, consoleErrors }) => {
    const api = await openInbox(page, login);
    api.reset();
    await setVisibility(page, 'hidden');
    await page.waitForTimeout(2000);
    await setVisibility(page, 'visible');
    await page.waitForTimeout(2500);

    for (const path of BADGE_READS) expect.soft(api.times(path), `${path} re-read`).toBe(0);
    expect(api.times('/api/messages')).toBe(0);
    expect(consoleErrors).toEqual([]);
  });
});
