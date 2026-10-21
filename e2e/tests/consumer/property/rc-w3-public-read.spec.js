import { test, expect } from '../../../fixtures/live.js';
import { API, seedConsent } from '../../../helpers/liveAuth.js';

/* Public read-side contracts: error envelope on refused paths, residential-only reels,
   typo-tolerant locality search, and the BHK-free titles and accessible names on the property page. */

const RESIDENTIAL = /flat|studio|penthouse|independent house|row house|villa/i;

test.describe('error envelope on container-level refusals', () => {
  for (const path of ['/properties/a%2Fb', '/properties/%2e%2e/admin', '/properties/%zz']) {
    test(`${path} answers with the JSON envelope, not Tomcat's HTML page`, async () => {
      const res = await fetch(`${API}${path}`);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.headers.get('content-type')).toMatch(/json/);
      const body = await res.json();
      expect(body).toEqual(expect.objectContaining({ error: expect.any(String), message: expect.any(String), status: res.status }));
    });
  }
});

test('the reels API returns residential homes only', async () => {
  const res = await fetch(`${API}/properties/reels`);
  expect(res.status).toBe(200);
  const reels = await res.json();
  expect(reels.length, 'no reels, so the check below is vacuous').toBeGreaterThan(0);
  for (const r of reels) {
    const detail = await (await fetch(`${API}/properties/${r.id}`)).json();
    expect(detail.propertyType, `a reel must be residential, got "${detail.propertyType}"`).toMatch(RESIDENTIAL);
  }
});

test('locality search forgives a small spelling mistake', async () => {
  const res = await fetch(`${API}/localities/search?q=Banr`);
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect((rows.content || rows).map((l) => l.name)).toContain('Baner');
});

test.describe('property page', () => {
  test('an open plot has no BHK in its heading and the header logo link has a name at 360px', async ({ page }) => {
    await seedConsent(page);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/property/p5032');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).not.toContainText(/\b(BHK|RK)\b/);
    await expect(page.getByRole('link', { name: 'Draazy', exact: true }).first()).toBeVisible();
    await expect(page).toHaveTitle(/^(?!.*\b(BHK|RK)\b)/);
  });

  test('gallery thumbnails and the photos button are named', async ({ page }) => {
    await seedConsent(page);
    await page.goto('/property/p5032');
    await expect(page.getByRole('button', { name: /^Photo 2 of \d+$/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Fullscreen \d+\/\d+$/ })).toBeVisible();
  });
});