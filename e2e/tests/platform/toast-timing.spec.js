import { test, expect } from '../../fixtures/live.js';

// Society share copies the link when the OS sheet is absent: a clipboard that works raises a
// success toast, one that throws raises an error toast.
const stubClipboard = (page, works) =>
  page.addInitScript((ok) => {
    localStorage.setItem(
      'dz_cookie_consent_v1',
      JSON.stringify({ necessary: true, functional: true, analytics: true, marketing: true, version: 1, ts: Date.now() }),
    );
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => (ok ? Promise.resolve() : Promise.reject(new Error('denied'))) },
    });
  }, works);

const shareASociety = async (page) => {
  await page.goto('/societies');
  const soc = page.locator('a[href^="/society/"]').first();
  await expect(soc).toBeVisible();
  await soc.click();
  await page.waitForURL(/\/society\//);
  await page.getByRole('button', { name: /^share$/i }).first().click();
};

test('a success toast stays long enough for a second-language reader, then closes itself', async ({ page }) => {
  await page.clock.install();
  await stubClipboard(page, true);
  await shareASociety(page);

  const toast = page.getByTestId('toasts').getByRole('alert');
  await expect(toast).toContainText('Link copied to clipboard');
  await page.clock.fastForward(4_500);
  await expect(toast, 'the old 3 s timeout is gone; the floor is 5 s').toBeVisible();
  await page.clock.fastForward(1_000);
  await expect(toast).toHaveCount(0);
});

test('hovering a success toast holds it open', async ({ page }) => {
  await page.clock.install();
  await stubClipboard(page, true);
  await shareASociety(page);

  const toast = page.getByTestId('toasts').getByRole('alert');
  await expect(toast).toBeVisible();
  await toast.hover();
  await page.clock.fastForward(20_000);
  await expect(toast, 'a toast being read is not pulled away').toBeVisible();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(5_500);
  await expect(toast).toHaveCount(0);
});

test('the same toast raised again while held does not restart its timer', async ({ page }) => {
  await page.clock.install();
  await stubClipboard(page, true);
  await shareASociety(page);

  const toast = page.getByTestId('toasts').getByRole('alert');
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Dismiss' }).focus();
  await page.getByRole('button', { name: /^share$/i }).first().evaluate((b) => b.click());
  await page.clock.fastForward(20_000);
  await expect(toast, 'a repeat of a toast being read does not pull it away').toBeVisible();
});

test('an error toast stays until the user closes it', async ({ page }) => {
  await page.clock.install();
  await stubClipboard(page, false);
  await shareASociety(page);

  const toast = page.getByTestId('toasts').getByRole('alert');
  await expect(toast).toContainText('Could not copy the link');
  await page.clock.fastForward(60_000);
  await expect(toast, 'errors never time out').toBeVisible();
  await toast.getByRole('button', { name: 'Dismiss' }).click();
  await expect(toast).toHaveCount(0);
});
