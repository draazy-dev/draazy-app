import { test, expect } from '../../fixtures/live.js';
import { authHeaders, signedInAs, uniqueMobile } from '../../helpers/liveAuth.js';
import { sql } from '../../helpers/monetisation.js';

test('a notification row shows after its entrance and still follows a swipe', async ({ page }) => {
  const mobile = uniqueMobile();
  await authHeaders(mobile);
  const userId = sql(`SELECT id FROM users WHERE mobile = '${mobile}'`);
  sql(`INSERT INTO notifications (user_id, type, title, body, read, link)
       VALUES ('${userId}', 'contact.received', 'Zz swipe me', 'Someone wants to contact you.', false, '/dashboard#leads')`);
  await page.addInitScript(() => {
    localStorage.setItem('dz_cookie_consent_v1', JSON.stringify({
      necessary: true, functional: true, analytics: true, marketing: false, version: 1, ts: Date.now(),
    }));
  });
  await signedInAs(page, mobile);
  await page.goto('/notifications');

  const row = page.locator('.notif', { hasText: 'Zz swipe me' });
  await expect(row).toBeVisible();
  // The entrance keyframe must neither leave the row at opacity 0 nor pin its transform once it ends.
  await expect.poll(() => row.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
  await expect.poll(() => row.evaluate((el) => el.getAnimations().length)).toBe(0);

  const box = await row.boundingBox();
  const at = (dx) => ({
    pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true,
    clientX: box.x + box.width - 20 - dx, clientY: box.y + box.height / 2,
  });
  await row.dispatchEvent('pointerdown', at(0));
  await row.dispatchEvent('pointermove', at(40));
  await row.dispatchEvent('pointermove', at(70));
  const shift = await row.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
  expect(shift, 'the row tracks the finger').toBeLessThan(-10);
});
