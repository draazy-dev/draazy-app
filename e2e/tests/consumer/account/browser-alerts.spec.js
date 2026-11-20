import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, authHeaders, seedConsent, signedInAs, uniqueMobile, uploadedListingPhotos } from '../../../helpers/liveAuth.js';
import { rejectListingWithFetch } from '../../../helpers/moderation.js';

// Headless Chromium reports `denied` and never prompts, so the browser's Notification API is replaced with a
// recorder whose permission and prompt answer each test chooses. The answer survives reloads via sessionStorage.
function fakeNotifications(page, { permission = 'default', answer = 'granted', focused = true } = {}) {
  return page.addInitScript(({ permission: initial, answer: reply, focused: hasFocus }) => {
    window.__alerts = [];
    const read = () => sessionStorage.getItem('fakePermission') || initial;
    window.Notification = class {
      constructor(title, options) { window.__alerts.push({ title, ...options }); }
      close() {}
      static get permission() { return read(); }
      static async requestPermission() {
        sessionStorage.setItem('fakePermission', reply);
        return reply;
      }
    };
    if (!hasFocus) document.hasFocus = () => false;
  }, { permission, answer, focused });
}

const prompt = (page) => page.getByTestId('browser-alerts-prompt');

test.describe('Browser notifications', () => {
  test('a signed-in user is asked once, and turning on sticks across reloads and shows in Profile', async ({ page, consoleErrors }) => {
    await fakeNotifications(page);
    await seedConsent(page);
    await signedInAs(page, uniqueMobile());

    await expect(prompt(page)).toContainText('Draazy sends message and listing alerts through your browser');
    await prompt(page).getByRole('button', { name: 'Turn on' }).click();
    await expect(prompt(page)).toHaveCount(0);
    await expect(page.getByText('Browser notifications are on')).toBeVisible();

    await page.goto('/dashboard#profile');
    await expect(page.getByRole('switch', { name: 'Browser notifications' })).toHaveAttribute('aria-checked', 'true');
    await expect(prompt(page)).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('"Not now" snoozes the ask, and a guest is never asked', async ({ page }) => {
    await fakeNotifications(page);
    await seedConsent(page);
    await page.goto('/');
    await expect(page.locator('#main-content')).toBeVisible();
    await expect(prompt(page)).toHaveCount(0);

    await signedInAs(page, uniqueMobile());
    await prompt(page).getByRole('button', { name: 'Not now' }).click();
    await expect(prompt(page)).toHaveCount(0);
    await page.reload();
    await expect(page.locator('#main-content')).toBeVisible();
    await expect(prompt(page)).toHaveCount(0);
  });

  test('a refusal explains how to unblock, and Profile shows the switch as blocked', async ({ page }) => {
    await fakeNotifications(page, { answer: 'denied' });
    await seedConsent(page);
    await signedInAs(page, uniqueMobile());

    await prompt(page).getByRole('button', { name: 'Turn on' }).click();
    await expect(prompt(page)).toContainText('Notifications are blocked');
    await expect(prompt(page)).toContainText('icon beside the address bar');
    await prompt(page).getByRole('button', { name: 'Got it' }).click();
    await expect(prompt(page)).toHaveCount(0);

    await page.goto('/dashboard#profile');
    const toggle = page.getByRole('switch', { name: 'Browser notifications' });
    await expect(toggle).toBeDisabled();
    await expect(page.getByText(/Blocked in this browser/)).toBeVisible();
  });

  test('a new bell notification raises a browser alert while the tab is unfocused, unless switched off', async ({ page }) => {
    test.slow();
    const mobile = uniqueMobile();
    await fakeNotifications(page, { permission: 'granted', focused: false });
    await seedConsent(page);
    const stream = page.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/messages/stream' && response.status() === 200, { timeout: 30000 });
    await signedInAs(page, mobile);
    await stream;
    const bell = page.getByRole('button', { name: /^Notifications, \d+ unread$/ }).locator('visible=true');
    await expect(bell).toHaveAccessibleName('Notifications, 0 unread');

    const ownerHeaders = await authHeaders(mobile);
    const rejectFreshListing = async () => {
      const posted = await fetch(`${API}/me/listings`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          deal: 'rent', propertyType: 'Flat', price: 24000, city: 'Pune', bhk: 2, area: 720, locality: 'Baner',
          title: `Zztest alert ${Date.now().toString(36)}`,
          images: await uploadedListingPhotos(ownerHeaders),
        }),
      });
      const listing = await posted.json();
      expect(posted.status, JSON.stringify(listing)).toBe(201);
      const rejected = await rejectListingWithFetch(listing.id, await authHeaders(ACTORS.admin));
      expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    };

    await rejectFreshListing();
    await expect(bell).not.toHaveAccessibleName('Notifications, 0 unread', { timeout: 15000 });
    await expect.poll(() => page.evaluate(() => window.__alerts.length)).toBeGreaterThan(0);
    for (const alert of await page.evaluate(() => window.__alerts)) {
      expect(alert).toMatchObject({ title: 'Draazy', body: 'You have a new notification', tag: 'draazy-alert', data: { url: '/notifications' } });
    }

    await page.goto('/dashboard#profile');
    const toggle = page.getByRole('switch', { name: 'Browser notifications' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    const before = await bell.getAttribute('aria-label');
    await rejectFreshListing();
    await expect(bell).not.toHaveAccessibleName(before, { timeout: 15000 });
    expect(await page.evaluate(() => window.__alerts), 'a switched-off device stays silent').toEqual([]);
  });
});
