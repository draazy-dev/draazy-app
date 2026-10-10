import { expect, test } from '../../../fixtures/live.js';
import { signedInAsNew } from '../../../helpers/liveAuth.js';

/* The cached user in web storage is a paint hint, never an authority: editing it must not unlock anything, and a
   corrupt cache must not take the app down. Token and cookie lifecycle: platform/auth/signin-otp-session.spec.js. */

const isAdminApi = (url) => /\/api\/admin(\/|\?|$)/.test(new URL(url).pathname + new URL(url).search);

test.describe('Client session state (live)', () => {
  test('a buyer who rewrites the cached role to admin is still refused the back office', async ({ page }) => {
    await signedInAsNew(page);
    // An init script, because signedInAsNew re-seeds the genuine user on every navigation; this one runs after it.
    await page.addInitScript(() => {
      const u = JSON.parse(localStorage.getItem('draazyUser'));
      localStorage.setItem('draazyUser', JSON.stringify({ ...u, role: 'admin', permissions: ['*'] }));
    });

    const adminAnswers = [];
    page.on('response', (r) => { if (isAdminApi(r.url())) adminAnswers.push(r.status()); });
    await page.goto('/admin');

    await expect(page).not.toHaveURL(/\/admin(\/|$|\?)/);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('draazyUser') || '{}').role))
      .not.toBe('admin');
    expect(adminAnswers.filter((s) => s >= 200 && s < 300), 'an admin read answered a buyer').toEqual([]);
  });

  test('a corrupt cached session boots signed out without crashing', async ({ page }) => {
    const crashes = [];
    page.on('pageerror', (e) => crashes.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem('draazyUser', '{not json');
      localStorage.setItem('draazyTokens', JSON.stringify({ accessToken: 'not-a-jwt' }));
    });

    await page.goto('/support');

    await expect(page).toHaveURL(/\/signin/);
    expect(crashes).toEqual([]);
  });
});
