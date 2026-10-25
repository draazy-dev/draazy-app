import { test, expect } from '@playwright/test';
import { API, apiLogin, signedInAsNew, uniqueMobile } from '../../../helpers/liveAuth.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { fillRoomDetails, fillRoomLocation, fillRoomPrice, nextStep, uploadRoomPhotos } from '../../../helpers/roomWizard.js';

const track = flatmateCleanup(test);
const unique = (tag) => `Room Tabs ${tag} ${Date.now().toString(36)}`;
const error = (page, text) => page.getByText(text, { exact: true });

test.use({ viewport: { width: 440, height: 956 } });

test.describe('room wizard — four tabs like a property post', () => {
  test('each tab holds its own required fields, the terms are visible, and a room needs 3 labelled photos', async ({ page }) => {
    test.slow();
    const mobile = await signedInAsNew(page);
    const { accessToken } = await apiLogin(mobile);
    const society = unique('Wizard');
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto('/list-property?flatmate=1');
    await expect(page.locator('.lp-meter')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.lp-steps__item')).toHaveText([/Details/, /Location/, /Price/, /Photos/]);

    await test.step('Details: the home and room basics are required', async () => {
      await nextStep(page);
      for (const text of ['Select the flat type.', 'Select the number of bathrooms.', "Select a floor at or below the building's total floors.",
        'Select how many floors the building has.', "Choose the type of room you're offering.", 'Choose attached or shared washroom.']) {
        await expect(error(page, text)).toBeVisible();
      }
      await expect(page).not.toHaveURL(/step=2/);
      await fillRoomDetails(page);
      await nextStep(page);
    });

    await test.step('Location: the flat number is required', async () => {
      await expect(page.locator('.lp-steps__item').nth(1)).toHaveAttribute('aria-current', 'step');
      await fillRoomLocation(page, { society, flatNumber: '' });
      await nextStep(page);
      await expect(error(page, 'Enter the flat / unit number.')).toBeVisible();
      await page.getByRole('textbox', { name: 'Flat no.' }).fill('B-702');
      await nextStep(page);
    });

    await test.step('Price: rent, deposit, move-in, notice and minimum stay are required, terms shown up front', async () => {
      await expect(page.locator('.lp-steps__item').nth(2)).toHaveAttribute('aria-current', 'step');
      await expect(page.getByRole('spinbutton', { name: 'Notice period (days)' })).toBeVisible();
      await expect(page.getByRole('spinbutton', { name: 'Minimum stay (months)' })).toBeVisible();
      await nextStep(page);
      for (const text of ["Enter the room's monthly rent.", 'Enter the deposit. Type 0 if there is none.', 'Select when the room is available.',
        'Enter the notice period in days (0–180). Type 0 if there is none.', 'Enter the minimum stay in months (0–24). Type 0 if there is none.']) {
        await expect(error(page, text)).toBeVisible();
      }
      await fillRoomPrice(page, { notice: '30', lockIn: '0' });
      await nextStep(page);
    });

    await test.step('Photos: fewer than 3 is refused, then 3 labelled photos post the room', async () => {
      await expect(page.locator('.lp-steps__item').nth(3)).toHaveAttribute('aria-current', 'step');
      await expect(page.getByTestId('room-more-details')).toHaveCount(0);
      await page.getByRole('button', { name: /Post & Find Flatmates/i }).click();
      await expect(page.getByText('Add at least 3 photos.')).toBeVisible();

      await uploadRoomPhotos(page);
      const posted = page.waitForResponse((r) => r.url().includes('/flatmates/rooms') && r.request().method() === 'POST');
      await page.getByRole('button', { name: /Post & Find Flatmates/i }).click();
      const response = await posted;
      expect(response.status()).toBe(201);
      const room = await response.json();
      track('rooms', room.id, accessToken);
      expect(response.request().postDataJSON()).toMatchObject({
        homeTypeLabel: 'Flat', bhk: '2', roomType: 'Private room', attachedBath: 'attached', furnishing: 'unfurnished',
        flatNumber: 'B-702', noticePeriodDays: 30, lockInMonths: 0,
        details: { bathrooms: 2, floor: '3', totalFloors: 10 },
      });
      expect(response.request().postDataJSON().photos).toHaveLength(3);
      await expect(page.getByText(/Flatmate Listing Posted/i)).toBeVisible({ timeout: 20_000 });
    });

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('a house is asked how many floors it has instead of a floor and building height', async ({ page }) => {
    await signedInAsNew(page);
    await page.goto('/list-property?flatmate=1');
    await expect(page.locator('.lp-meter')).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-err="homeTypeLabel"]').getByRole('button', { name: 'Independent House', exact: true }).click();
    await expect(page.locator('[data-err="floor"]')).toHaveCount(0);
    await nextStep(page);
    await expect(error(page, 'Select how many floors the house has.')).toBeVisible();
    await page.locator('[data-err="floorsInHouse"]').getByRole('button', { name: 'G+1', exact: true }).click();
    await expect(error(page, 'Select how many floors the house has.')).toHaveCount(0);
  });

  test('the server refuses a new room without the basics', async () => {
    const { accessToken } = await apiLogin(uniqueMobile());
    const res = await fetch(`${API}/flatmates/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ bhk: '2', roomType: 'Private room', locality: 'Baner', rentShare: 12000, deposit: 0, availableFrom: '2026-12-01' }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).message).toMatch(/^A new room needs: home type, washroom, furnishing, flat \/ house number/);
  });
});
