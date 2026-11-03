import { test, expect } from '@playwright/test';
import { API, apiLogin, signedInAs, signedInAsNew, uniqueMobile } from '../../../helpers/liveAuth.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { trackErrors } from '../../../helpers/console.js';
import { fillRoomDetails, fillRoomLocation, fillRoomPrice, nextStep, uploadRoomPhotos } from '../../../helpers/roomWizard.js';
import { istInDays } from '../../../helpers/availability.js';

const track = flatmateCleanup(test);
const tile = (page, label) => page.locator('.detail-card').filter({ has: page.getByText(label, { exact: true }) });
const params = (page) => Object.fromEntries(new URL(page.url()).searchParams);

test.use({ viewport: { width: 440, height: 956 } });

test.describe('LIVE: room must-haves', () => {
  test('a host picks parking and amenities in the wizard and the room page shows them with the minimum stay', async ({ page }) => {
    test.slow();
    const mobile = await signedInAsNew(page);
    const { accessToken } = await apiLogin(mobile);
    const errors = trackErrors(page);

    await page.goto('/list-property?flatmate=1');
    await expect(page.locator('.lp-meter')).toBeVisible({ timeout: 20_000 });
    await fillRoomDetails(page);
    const amenities = page.getByTestId('room-amenities');
    await expect(amenities.getByRole('button')).toHaveText(['Wi-Fi', 'AC', 'Washing machine', 'Lift', 'Power backup']);
    await page.getByRole('group', { name: 'Parking', exact: true }).getByRole('button', { name: 'Car', exact: true }).click();
    await amenities.getByRole('button', { name: 'Wi-Fi', exact: true }).click();
    await amenities.getByRole('button', { name: 'AC', exact: true }).click();
    await expect(amenities.getByRole('button', { name: 'AC', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await nextStep(page);
    await fillRoomLocation(page, { society: `Must Haves ${Date.now().toString(36)}` });
    await nextStep(page);
    await fillRoomPrice(page, { notice: '30', lockIn: '6' });
    await nextStep(page);
    await uploadRoomPhotos(page);

    const posted = page.waitForResponse((r) => r.url().includes('/flatmates/rooms') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /Post & Find Flatmates/i }).click();
    const response = await posted;
    expect(response.status()).toBe(201);
    const room = await response.json();
    track('rooms', room.id, accessToken);
    expect(response.request().postDataJSON()).toMatchObject({ parking: 'car', amenities: ['wifi', 'ac'], lockInMonths: 6 });
    expect(room).toMatchObject({ parking: 'car', amenities: ['wifi', 'ac'], lockInMonths: 6 });

    await page.goto(`/flatmates/room/${room.id}`);
    await expect(tile(page, 'Parking')).toContainText('Car', { timeout: 20_000 });
    await expect(tile(page, 'Minimum stay')).toContainText('6 months');
    const chips = page.getByTestId('room-amenity-chips');
    await expect(chips).toContainText('Wi-Fi');
    await expect(chips).toContainText('AC');
    await expect(chips).not.toContainText('Lift');
    expect(errors, `console errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  test('the server refuses an unknown amenity or parking on a room', async () => {
    const { accessToken } = await apiLogin(uniqueMobile());
    const post = (body) => fetch(`${API}/flatmates/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ bhk: '2', roomType: 'Private room', locality: 'Baner', rentShare: 12000, deposit: 0, availableFrom: istInDays(28), ...body }),
    });
    expect((await post({ amenities: ['jacuzzi'] })).status).toBe(422);
    expect((await post({ parking: 'helicopter' })).status).toBe(422);
  });

  test('a seeker opens the room feed already filtered by their must-haves', async ({ page }) => {
    const mobile = uniqueMobile();
    const { accessToken } = await apiLogin(mobile, { name: 'Matching Seeker' });
    const created = await fetch(`${API}/flatmates/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        gender: 'female', age: 26, occupation: 'Engineer', budget: 12000, budgetMax: 18000, localities: ['Baner'],
        moveIn: istInDays(28), flatPref: 'women', roomPref: 'private', furnishing: 'furnished', gatedOnly: true, attachedBath: true,
      }),
    });
    expect(created.status, 'seeding a seeker post').toBe(201);
    const post = await created.json();
    track('posts', post.id, accessToken);
    await signedInAs(page, mobile);
    const errors = trackErrors(page);

    await page.goto(`/flatmates/post/${post.id}`);
    await page.getByTestId('see-matching-rooms').click();
    await expect(page).toHaveURL(/\/flatmates\?/);
    await expect.poll(() => params(page)).toMatchObject({ view: 'move-in', loc: 'Baner', furn: 'furnished', gated: '1', bath: '1', budget: '0-18000' });

    const chips = page.getByTestId('active-filters').locator('.af-chip');
    await expect(chips.filter({ hasText: 'Baner' })).toHaveCount(1, { timeout: 20_000 });
    await expect(chips.filter({ hasText: /^Furnished$/ })).toHaveCount(1);
    await expect(chips.filter({ hasText: 'Gated society' })).toHaveCount(1);
    await expect(chips.filter({ hasText: 'Attached bath' })).toHaveCount(1);
    expect(errors, `console errors: ${errors.join('\n')}`).toHaveLength(0);
  });
});
