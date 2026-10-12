import { test, expect } from '@playwright/test';
import { trackErrors } from '../../../helpers/console.js';

// Loads the real SDK, then stubs only the two Street View libraries so coverage is deterministic.
async function stubStreetView(page, { found }) {
  await page.evaluate(() => window.google.maps.importLibrary('core'));
  await page.waitForFunction(() => window.google?.maps?.version, null, { timeout: 20000 });
  await page.evaluate((hasPano) => {
    const realImport = window.google.maps.importLibrary.bind(window.google.maps);
    const streetView = {
      StreetViewSource: { GOOGLE: 'google' },
      StreetViewService: class {
        async getPanorama() {
          if (!hasPano) throw new Error('ZERO_RESULTS');
          return { data: { location: { pano: 'stub-pano', latLng: {} }, imageDate: '2024-05' } };
        }
      },
    };
    const geometry = { spherical: { computeHeading: () => 123.4 } };
    window.google.maps.importLibrary = async (name) => (
      name === 'streetView' ? streetView : name === 'geometry' ? geometry : realImport(name));
  }, found);
}

async function openLocationTab(page, found) {
  await page.goto('/listings');
  const first = page.locator('a[href^="/property/"]').first();
  await expect(first).toBeVisible({ timeout: 15000 });
  await page.goto(await first.getAttribute('href'));
  await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
  await stubStreetView(page, { found });
  await page.getByRole('tab', { name: 'Location', exact: true }).click();
  await expect(page.getByTestId('location-locality-stats')).toBeVisible({ timeout: 15000 });
}

test.describe('Property Street View tile', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/maps/embed/v1/streetview**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
  });

  test('a pin with Google imagery nearby embeds the panorama facing the pin, plus an Open in Google Maps link', async ({ page }) => {
    const errors = trackErrors(page);
    await openLocationTab(page, true);

    const tile = page.getByTestId('property-street-view');
    await expect(tile).toBeVisible();
    await expect(tile).toContainText('2024-05');
    const src = await tile.locator('iframe').getAttribute('src');
    expect(src).toContain('https://www.google.com/maps/embed/v1/streetview?');
    expect(src).toContain('pano=stub-pano&heading=123');
    await expect(tile.locator('iframe')).toHaveAttribute('referrerpolicy', 'strict-origin');

    const link = tile.getByRole('link', { name: /Open in Google Maps/ });
    await expect(link).toHaveAttribute('href', /map_action=pano&viewpoint=[\d.]+,[\d.]+&pano=stub-pano&heading=123/);
    await expect(link).toHaveAttribute('target', '_blank');
    // A CSP frame-src refusal surfaces here as a console error.
    expect(errors).toEqual([]);
  });

  test('no imagery within reach of the pin shows no tile', async ({ page }) => {
    const errors = trackErrors(page);
    await openLocationTab(page, false);
    await expect(page.getByTestId('property-street-view')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
