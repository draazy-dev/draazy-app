import { test, expect } from '../../../fixtures/live.js';
import { API, apiLogin, signedInAsNew, uploadedListingPhotos } from '../../../helpers/liveAuth.js';
import { active, fillOwner, fillProperty, fillTenant, fillTerms, payAndSubmit } from '../../../helpers/rentAgreementWizard.js';
import { gotoSettled } from '../../../helpers/settle.js';

const RA_READS = ['/api/service-requests', '/api/me/service-request-invites', '/api/me/listings', '/api/me/documents/personal', '/api/me/entitlements', '/api/fees'];

function countApi(page) {
  const seen = [];
  page.on('request', (r) => {
    if (!r.url().includes('/api/')) return;
    const url = new URL(r.url());
    if (url.pathname === '/api/messages/stream') return;
    seen.push({ method: r.method(), path: url.pathname, key: `${r.method()} ${url.pathname}${url.search}` });
  });
  return {
    gets: () => seen.filter((r) => r.method === 'GET').map((r) => r.key),
    times: (path) => seen.filter((r) => r.method === 'GET' && r.path === path).length,
    repeated: () => {
      const keys = seen.filter((r) => r.method === 'GET').map((r) => r.key);
      return [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
    },
    log: () => seen.map((r) => `${r.method} ${r.path}`),
    reset: () => { seen.length = 0; },
  };
}

const inApp = (page, to) => page.evaluate((url) => {
  window.history.pushState({}, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}, to);

test.describe('Services request budget on a phone', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('a rent-agreement revisit within half a minute re-reads nothing', async ({ page, login, consoleErrors }) => {
    await login.asOwner();
    const api = countApi(page);
    await page.goto('/services/rent-agreement');
    await expect(page.locator('main h1')).toBeVisible({ timeout: 15000 });
    await expect.poll(() => RA_READS.filter((p) => api.times(p) > 0).length, { timeout: 15000 }).toBe(RA_READS.length);
    await page.waitForTimeout(1500);
    expect(api.repeated()).toEqual([]);

    api.reset();
    await inApp(page, '/services');
    await expect(page.locator('main h1')).not.toHaveText(/rent agreement/i);
    await inApp(page, '/services/rent-agreement');
    await expect(page.locator('main h1')).toHaveText(/rent agreement/i, { timeout: 15000 });
    await page.waitForTimeout(2000);
    expect(api.gets()).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('filing a rent agreement uploads its papers without re-reading the request after each one', async ({ page }) => {
    test.slow();
    const mobile = await signedInAsNew(page, { api: API });
    const { accessToken } = await apiLogin(mobile, { api: API });
    const made = await fetch(`${API}/me/listings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ title: '2BHK in Baner', deal: 'rent', propertyType: 'apartment', price: 30000, bhk: 2, locality: 'Baner', city: 'Pune', floor: 4, images: await uploadedListingPhotos(accessToken) }),
    });
    expect(made.status).toBeLessThan(400);
    const propertyId = (await made.json()).id;
    await gotoSettled(page, `/services/rent-agreement?listing=${propertyId}`);
    await fillProperty(page);
    await fillOwner(page);
    await fillTenant(page);
    await fillTerms(page, { deposit: '1,50,000' });
    await active(page).getByRole('checkbox').check();

    const api = countApi(page);
    const checkout = page.waitForResponse((r) => r.request().method() === 'POST' && /\/service-requests\/[^/]+\/checkout$/.test(new URL(r.url()).pathname));
    await payAndSubmit(page);
    expect((await checkout).ok()).toBe(true);

    const filed = api.log();
    const beforeCheckout = filed.slice(0, filed.findIndex((r) => /^POST .*\/checkout$/.test(r)));
    expect(beforeCheckout.filter((r) => /^POST \/api\/service-requests\/[^/]+\/docs$/.test(r)).length, 'the owner papers were uploaded').toBeGreaterThan(0);
    expect(beforeCheckout.filter((r) => /^GET \/api\/service-requests\/[^/]+$/.test(r))).toEqual([]);
  });
});
