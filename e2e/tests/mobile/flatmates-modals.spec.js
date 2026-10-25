import { test, expect } from '@playwright/test';
import { signedInAsNew } from '../../helpers/liveAuth.js';
import { expectFloatingCard, floatBottom } from '../../helpers/floatCard.js';

/* Phone-only: the scroll lock behind a full-screen sheet and a home-indicator inset, neither of
 * which a 1280px run can observe. Both modals need a signed-in account, hence the live half. */

/** `?post=` is the app-wide posting intent, consumed on arrival — see `useFlatmateSupply.jsx`. */
async function openModal(page, intent) {
  await page.goto(`/flatmates?post=${intent}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.sf-modal')).toBeVisible({ timeout: 30_000 });
}

/** The root element's effective overflow — `hidden` exactly while some overlay holds the lock. */
const rootOverflow = (page) => page.evaluate(() => getComputedStyle(document.documentElement).overflowY);

test.describe('Flatmates modals', () => {
  for (const [name, intent] of [['post request', '1'], ['flat-share group', 'group']]) {
    test(`the ${name} sheet takes focus, traps Shift+Tab inside, and names its close button`, async ({ page }) => {
      await signedInAsNew(page);
      await openModal(page, intent);
      const dialog = page.locator('.sf-modal [role="dialog"]');
      await expect(dialog).toBeFocused();

      const close = dialog.getByRole('button', { name: 'Close', exact: true }).first();
      await close.focus();
      await page.keyboard.press('Shift+Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement)), 'focus must wrap inside the sheet').toBe(true);
      await expect(close).not.toBeFocused();
    });
  }

  for (const [name, intent] of [['post request', '1'], ['flat-share group', 'group']]) {
    test(`the ${name} sheet holds the board still behind it`, async ({ page }) => {
      await signedInAsNew(page);
      await openModal(page, intent);

      /* Read off the ROOT: `index.css` gives html `overflow-x: clip`, so body's overflow never
         propagates to the viewport and `document.body.style.overflow = 'hidden'` is a no-op here. */
      expect(await rootOverflow(page), 'the board must not move under the open sheet').toBe('hidden');

      await page.keyboard.press('Escape');
      await expect(page.locator('.sf-modal')).toHaveCount(0);

      // The other half, which a missing or mis-counted release breaks.
      expect(await rootOverflow(page), 'closing must hand scrolling back').not.toBe('hidden');
    });
  }

  test('the sheet is a floating card that contains its own overscroll and clears the home indicator', async ({ page }) => {
    await signedInAsNew(page);
    await openModal(page, '1');
    const card = page.locator('.sf-modal [role="dialog"]');

    /* The card is the scroller, so without containment a thumb that reaches the end of the form
       hands the rest of the gesture to the results behind it. */
    await expect(card).toHaveCSS('overscroll-behavior-y', 'contain');
    await expectFloatingCard(page, card);

    // Emulation reports every `env(safe-area-inset-*)` as 0, so the inset arrives through the token.
    await page.addStyleTag({ content: ':root { --dz-safe-b: 34px; }' });
    const vh = page.viewportSize().height;
    expect(await floatBottom(page), 'the card clears a 34px home indicator').toBeLessThanOrEqual(vh - 34 - 12);
    await expectFloatingCard(page, card);
  });

  test('Escape closes the picker on top of the sheet, not the sheet under it', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('dz_cookie_consent_v1', JSON.stringify({ necessary: true, functional: true, analytics: true, marketing: true, version: 1, ts: Date.now() })));
    await signedInAsNew(page);
    await openModal(page, '1');

    /* The locality picker presents as its own sheet on a phone. Its Escape lives on the menu while
       the form's lives on `document`, so without `stopPropagation` one press dismisses both. */
    const sheet = page.locator('.sf-modal');
    await sheet.getByRole('button', { name: 'Preferred localities' }).click();
    const menu = page.locator('.dz-menu, [role="listbox"]').first();
    await expect(menu).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(sheet).toBeVisible();

    // And the lock survives, because the form that holds it never unmounted.
    expect(await rootOverflow(page)).toBe('hidden');
  });

  test('Escape still closes the sheet with the cookie bar on screen', async ({ page }) => {
    await signedInAsNew(page);
    /* `ConsumerLayout` renders the cookie bar after the outlet as a `role="dialog"`, so a top-most
       guard counting it kills the sheet's Escape. An init script, as the consent seeding is one. */
    await page.addInitScript(() => localStorage.removeItem('dz_cookie_consent_v1'));
    await openModal(page, '1');
    await expect(page.getByRole('dialog', { name: 'Cookie preferences' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.sf-modal')).toHaveCount(0);
  });
});
