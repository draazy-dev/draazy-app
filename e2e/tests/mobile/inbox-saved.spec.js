import { test, expect } from '../../fixtures/live.js';
import { trackErrors } from '../../helpers/console.js';

// Only consent is seeded because its overlay covers the viewport edges under test.
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

// The seeded Rahul-to-Meera thread.
const THREAD = 'f1c70006-0000-4000-8000-000000000001';

async function seed(page) {
  await page.addInitScript(() => {
    localStorage.setItem('dz_cookie_consent_v1', JSON.stringify({ necessary: true, functional: true, analytics: true, marketing: false, version: 1, ts: Date.now() }));
  });
}

test.describe('Mobile inbox + saved', () => {
  test('Messages keeps the bottom nav, with the composer above it and nothing scrolling the page', async ({ page, login }) => {
    await seed(page);
    await login.asBuyer();
    await page.setViewportSize(MOBILE);
    const nav = page.locator('nav.dz-bottom-nav');
    const pageScrolls = () => page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);

    await page.goto('/messages');
    await expect(page.locator('.pc-list-head h1')).toBeVisible();
    await expect(nav).toBeVisible();
    expect(await pageScrolls(), 'the list pane must end at the bar, not push the page').toBe(false);

    await page.goto(`/messages?c=${THREAD}`);
    const input = page.locator('.pc-input');
    await expect(input).toBeVisible();
    await expect(nav).toBeVisible();
    const composer = await page.locator('.pc-composer').boundingBox();
    const navBox = await nav.boundingBox();
    expect(composer.y + composer.height, 'composer must sit above the bar').toBeLessThanOrEqual(navBox.y + 1);
    expect(await pageScrolls()).toBe(false);

    // Playwright cannot raise a soft keyboard; a focused field plus a shrunk viewport is the proxy.
    await input.focus();
    await page.setViewportSize({ width: MOBILE.width, height: MOBILE.height - 300 });
    await expect(page.locator('html')).toHaveClass(/dz-kbd-open/);
    await expect(nav).toBeHidden();
    await expect.poll(async () => {
      const box = await page.locator('.pc-composer').boundingBox();
      return Math.abs(MOBILE.height - 300 - (box.y + box.height));
    }, { message: 'with the bar gone the composer drops onto the keyboard' }).toBeLessThanOrEqual(1);
  });

  test('Messages is edge-to-edge and Saved tabs fit one row on mobile, with no console errors, while desktop keeps its footer', async ({ page, login }) => {
    test.slow();
    const errors = trackErrors(page);
    await seed(page);
    await login.asBuyer();
    await page.setViewportSize(MOBILE);

    await test.step('Messages is edge-to-edge on mobile: footer hidden, composer visible', async () => {
      await page.goto(`/messages?c=${THREAD}`);
      await expect(page.locator('.pc-input')).toBeVisible();
      // Marketing footer is hidden on the messages route (mobile only).
      await expect(page.locator('footer')).toBeHidden();
      // Edge-to-edge: the chat wrap spans the full viewport width (no side gutter).
      const box = await page.locator('.pc-wrap').boundingBox();
      expect(box.width).toBeCloseTo(390, 0);
      const radius = await page.locator('.pc-wrap').evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
      expect(parseFloat(radius)).toBe(0);
    });

    await test.step('Saved category tabs are on a single row on mobile with the short room label', async () => {
      await page.goto('/saved');
      const tabs = page.locator('.saved-tabs .saved-tab');
      await expect(tabs).toHaveCount(4);
      await expect(page.locator('.saved-tabs')).toContainText('Flatmates');
      const tops = await tabs.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(tops).size).toBe(1);
    });

    await test.step('No console errors on Saved + Messages at 390px', async () => {
      for (const p of ['/saved', '/notifications', '/messages']) {
        await page.goto(p);
        await page.waitForTimeout(400);
      }
      expect(errors, errors.join('\n')).toEqual([]);
    });

    await test.step('Desktop keeps the footer on /messages (mobile-only rule)', async () => {
      await page.setViewportSize(DESKTOP);
      await page.goto(`/messages?c=${THREAD}`);
      await expect(page.locator('footer')).toBeVisible();
      const box = await page.locator('.pc-wrap').boundingBox();
      // Boxed chat on desktop is narrower than the full viewport.
      expect(box.width).toBeLessThan(1280);
    });
  });
});
