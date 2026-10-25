import { test, expect } from '@playwright/test';
import { signedInAsNew, uniqueMobile } from '../../../helpers/liveAuth.js';
import { signInSheet, verifyInSheet } from '../../../helpers/signInSheet.js';
// Real sessions exercise posting guards; each test mints its own actor because posting changes account state.
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const POST_BUTTON = /^Post(?: Property| property — Free)?$/;
// A static control proves the lazy board mounted even when no fixture supplies feed rows.
const openBoard = async (page, query = '') => {
  await page.goto(`${BASE}/flatmates${query}`);
  await expect(page.locator('button[data-tab="move-in"]')).toBeVisible({ timeout: 20000 });
};
// Scope chooser controls to the dialog because room cards repeat their labels.
const sheet = (page) => page.getByRole('dialog', { name: /What do you want to post/ });
const flatmateSheet = (page) => page.getByRole('dialog', { name: /^Flatmates$/ });
// This anchored button locator spans breakpoints without matching chooser copy or the desktop link.
const openSheet = async (page) => {
  await page.getByRole('button', { name: POST_BUTTON }).first().click();
  await expect(sheet(page)).toBeVisible();
};

test.describe('Flatmates posting (live)', () => {
  test('the page posting CTA opens the shared posting sheet', async ({ page }) => {
    // Shared sheet state must reset on close so an abandoned branch does not reopen mid-flow.
    await openBoard(page);
    await openSheet(page);

    await expect(sheet(page).getByRole('button', { name: /A property to rent out or sell/ })).toBeVisible();
    await expect(sheet(page).getByRole('button', { name: /^Flatmates/ })).toBeVisible();
    await expect(sheet(page).getByRole('button', { name: /I have a room to fill/ })).toHaveCount(0);
  });

  test('"Flatmates" offers the three flatmate posts, can go back, and a mid-fork close reopens at the first question', async ({ page }) => {
    await openBoard(page);
    await openSheet(page);
    await sheet(page).getByRole('button', { name: /^Flatmates/ }).click();

    await expect(flatmateSheet(page).getByRole('button', { name: /I have a room to fill/ })).toBeVisible();
    await expect(flatmateSheet(page).getByRole('button', { name: /I need a room/ })).toBeVisible();
    await expect(flatmateSheet(page).getByRole('button', { name: /Team up to rent a flat/ })).toBeVisible();

    await flatmateSheet(page).getByRole('button', { name: /^Back$/ }).click();
    await expect(sheet(page)).toBeVisible();

    await sheet(page).getByRole('button', { name: /^Flatmates/ }).click();
    await flatmateSheet(page).getByRole('button', { name: /^Close/ }).click();

    await openSheet(page);
    await expect(sheet(page).getByRole('button', { name: /A property to rent out or sell/ })).toBeVisible();
  });

  test('a guest gets the sign-in sheet, and the chosen branch opens after sign-in', async ({ page }) => {
    await openBoard(page);
    await openSheet(page);
    await sheet(page).getByRole('button', { name: /^Flatmates/ }).click();
    await flatmateSheet(page).getByRole('button', { name: /I need a room/ }).click();

    await expect(signInSheet(page)).toBeVisible();
    await expect(page).not.toHaveURL(/\/signin/);
    await expect(page.getByText('Post your flatmate request')).toHaveCount(0);

    await verifyInSheet(page, uniqueMobile());

    // The sheet returns the poster to the selected branch; the one-shot intent is then cleared.
    await expect(page.getByText('Post your flatmate request')).toBeVisible({ timeout: 15000 });
    await expect(page).not.toHaveURL(/post=/);
  });

  test('a signed-in user is routed to the branch each posting choice names', async ({ page }) => {
    test.slow();
    await signedInAsNew(page);

    await test.step('"I have a room to fill" routes a signed-in user to the room flow', async () => {
      await openBoard(page);
      await openSheet(page);
      await sheet(page).getByRole('button', { name: /^Flatmates/ }).click();
      await flatmateSheet(page).getByRole('button', { name: /I have a room to fill/ }).click();

      await expect(page).toHaveURL(/\/list-property\?flatmate=1/);
    });

    await test.step('"a property" routes a signed-in user to the plain listing wizard', async () => {
      await openBoard(page);
      await openSheet(page);
      await sheet(page).getByRole('button', { name: /A property to rent out or sell/ }).click();

      await expect(page).toHaveURL(/\/list-property$/);
    });

    await test.step('"I need a room" opens the request form for a signed-in user, and clears the intent', async () => {
      await openBoard(page);
      await openSheet(page);
      await sheet(page).getByRole('button', { name: /^Flatmates/ }).click();
      await flatmateSheet(page).getByRole('button', { name: /I need a room/ }).click();

      await expect(page.getByText('Post your flatmate request')).toBeVisible();
      await expect(page).not.toHaveURL(/\/signin/);
      // Remove this one-shot instruction so reloads and shared URLs do not reopen the form.
      await expect(page).not.toHaveURL(/post=/);
    });

    await test.step('"Team up to rent a flat" opens the group builder for a signed-in user', async () => {
      await openBoard(page);
      await openSheet(page);
      await sheet(page).getByRole('button', { name: /^Flatmates/ }).click();
      await flatmateSheet(page).getByRole('button', { name: /Team up to rent a flat/ }).click();

      await expect(page.getByText('Create a flatmate group')).toBeVisible();
      await expect(page).not.toHaveURL(/post=/);
    });

    await test.step('?post=1 deep link opens the request form directly', async () => {
      await openBoard(page, '?post=1');
      // Legacy `1` remains a direct, shareable seeker-form route.
      await expect(page.getByText('Post your flatmate request')).toBeVisible();
      await expect(sheet(page)).toHaveCount(0);
    });
  });

  test('the ?post=1 deep link opens the sign-in sheet for a guest, not the form', async ({ page }) => {
    // Skip `openBoard`: the sheet can open before the lazy board mounts.
    await page.goto(`${BASE}/flatmates?post=1`);

    await expect(signInSheet(page)).toBeVisible();
    await expect(page).toHaveURL(/\/flatmates\?post=1/);
    await expect(page.getByText('Post your flatmate request')).toHaveCount(0);

    await verifyInSheet(page, uniqueMobile());

    await expect(page.getByText('Post your flatmate request')).toBeVisible({ timeout: 15000 });
    await expect(page).not.toHaveURL(/post=/);
  });
});
