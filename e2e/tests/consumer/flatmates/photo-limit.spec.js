import { test, expect } from '../../../fixtures/live.js';
import { signedInAsNew } from '../../../helpers/liveAuth.js';
import { PHOTO_PNG } from '../../../helpers/listingPhotos.helper.js';
import { fillRoomDetails, fillRoomLocation, fillRoomPrice, nextStep } from '../../../helpers/roomWizard.js';

const SMALL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4AWJiYGD4D8IgBpBmYAAAAAD//7vS9wEAAAAGSURBVAMAGDACA6ybwrYAAAAASUVORK5CYII=', 'base64');

async function openRoomPhotoStep(page) {
  await signedInAsNew(page);
  await page.goto('/list-property?flatmate=1');
  await expect(page.locator('.lp-meter')).toBeVisible({ timeout: 20_000 });
  await fillRoomDetails(page, { bhk: '2 BHK', roomType: 'Single (1 person)' });
  await nextStep(page);
  await fillRoomLocation(page, { society: 'Photo Limit Heights' });
  await nextStep(page);
  await fillRoomPrice(page, { rent: '13500', deposit: '27000', availableFrom: '2026-12-01' });
  await nextStep(page);
  await expect(page.locator('[data-err="photos"]')).toBeVisible();
}

test.describe('flatmate room photo limit', () => {
  test('the room wizard follows the limit the server publishes and skips extra picks', async ({ page }) => {
    let photoId = 0;
    await page.route('**/api/bootstrap', async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, json: { ...(await res.json()), listingPolicy: { maxPhotos: 4 } } });
    });
    await page.route('**/api/me/photos', (route) => {
      photoId += 1;
      return route.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify({ url: `https://cdn.example.test/room-limit-${photoId}.jpg` }),
      });
    });

    await openRoomPhotoStep(page);
    const photos = page.locator('[data-err="photos"]');
    const picker = photos.getByLabel('Add property photos', { exact: true });
    await expect(photos).toContainText('Up to 4 photos');
    await expect(photos).toContainText('0 / 4 photos');

    await picker.setInputFiles(Array.from({ length: 5 }, (_, i) => ({
      name: `room-${i}.png`, mimeType: 'image/png', buffer: PHOTO_PNG,
    })));
    await expect(photos.locator('.grid img')).toHaveCount(4);
    await expect(photos).toContainText('4 / 4 photos');
    await expect(picker).toBeDisabled();
  });

  test('picking more than the limit says how many were skipped', async ({ page }) => {
    let photoId = 0;
    await page.route('**/api/bootstrap', async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, json: { ...(await res.json()), listingPolicy: { maxPhotos: 4 } } });
    });
    await page.route('**/api/me/photos', (route) => {
      photoId += 1;
      return route.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify({ url: `https://cdn.example.test/room-skip-${photoId}.jpg` }),
      });
    });

    await openRoomPhotoStep(page);
    const photos = page.locator('[data-err="photos"]');
    await photos.getByLabel('Add property photos', { exact: true }).setInputFiles(Array.from({ length: 6 }, (_, i) => ({
      name: `room-${i}.png`, mimeType: 'image/png', buffer: PHOTO_PNG,
    })));
    await expect(photos.locator('.grid img')).toHaveCount(4);
    await expect(photos).toContainText('Only 4 photos are allowed. Skipped 2 from your selection.');
  });

  test('a photo that failed validation blocks Post, offers no Retry, and nothing is sent', async ({ page }) => {
    await page.route('**/api/me/photos', (route) => route.fulfill({
      status: 201, contentType: 'application/json',
      body: JSON.stringify({ url: 'https://cdn.example.test/room-ok.jpg' }),
    }));
    let posted = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && /\/flatmates\/rooms$/.test(r.url())) posted += 1; });

    await openRoomPhotoStep(page);
    const photos = page.locator('[data-err="photos"]');
    await photos.getByLabel('Add property photos', { exact: true }).setInputFiles([
      { name: 'ok.png', mimeType: 'image/png', buffer: PHOTO_PNG },
      { name: 'tiny.png', mimeType: 'image/png', buffer: SMALL_PNG },
    ]);
    await expect(photos).toContainText(/480 px/);
    await expect(photos.getByRole('button', { name: /retry/i })).toHaveCount(0);

    await page.getByRole('button', { name: /Post & Find Flatmates/i }).click();
    await expect(photos).toContainText('A photo did not upload. Remove it, or add a different one, before posting.');
    expect(posted).toBe(0);
  });
});
