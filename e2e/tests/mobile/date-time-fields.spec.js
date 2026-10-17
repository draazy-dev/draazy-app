import { test, expect } from '../../fixtures/live.js';
import { openRescheduleDialog } from '../../helpers/visits.js';
import { expectFloatingCard } from '../../helpers/floatCard.js';

/* Below 640px the pickers are floating cards; the CSS (`.dz-cal`, 639.98px) and `place()` must share the
   breakpoint. Use `getBoundingClientRect()`: `boundingBox()` is document-relative, wrong for fixed elements. */

const dateField = (page) => page.locator('.dz-datefield').first();
const rect = (locator) => locator.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom };
});

/** Open the first date field on a route and return the settled card. */
async function openSheet(page) {
  const field = dateField(page);
  await expect(field).toBeVisible({ timeout: 20_000 });
  await field.click();
  const cal = page.locator('.dz-cal');
  await expect(cal).toBeVisible();
  await expectFloatingCard(page, cal);
  return cal;
}

test.describe('Mobile date & time pickers', () => {
  test('the calendar floats above the nav, keeps every day on screen and dismisses', async ({ page, login }) => {
    await login.asTenant();
    await page.goto('/tenant-profile');
    const cal = await openSheet(page);
    const viewport = page.viewportSize();

    await test.step('the calendar spans the width between the card insets', async () => {
      expect((await rect(cal)).width).toBeGreaterThanOrEqual(viewport.width - 26);

      // The inline anchoring `place()` writes on desktop must have been cleared,
      // or it would fight the sheet rules and win.
      expect(await cal.evaluate((el) => ({ left: el.style.left, top: el.style.top })))
        .toEqual({ left: '', top: '' });
    });

    await test.step('every day cell stays on screen and the sheet dismisses', async () => {
      // A card whose grid runs off the bottom is unusable.
      const last = await rect(cal.locator('.dz-cal__day').last());
      expect(last.bottom).toBeLessThanOrEqual(viewport.height);

      // Tapping above the sheet lands on the backdrop, not the page underneath, and closes it.
      const backdrop = page.locator('.dz-cal-backdrop');
      expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className, [viewport.width / 2, 20]))
        .toBe('dz-cal-backdrop');
      await page.mouse.click(viewport.width / 2, 20);
      await expect(cal).toBeHidden();
      await expect(backdrop).toHaveCount(0);
    });
  });

  test('the reschedule date and time pickers float as cards rather than anchoring inside their dialog', async ({ page }) => {
    const viewport = page.viewportSize();

    await test.step('the date picker floats', async () => {
      const dialog = await openRescheduleDialog(page);
      await dialog.locator('.dz-datefield').first().click();
      const cal = page.locator('.dz-cal');
      await expect(cal).toBeVisible();
      const box = await expectFloatingCard(page, cal);
      expect(box.width).toBeGreaterThanOrEqual(viewport.width - 26);
    });

    await test.step('the time picker floats too — both dialogs share the breakpoint', async () => {
      await page.reload();
      await page.getByRole('button', { name: /^Reschedule$/ }).first().click();
      const time = page.getByRole('dialog').locator('.dz-datefield').last();
      await expect(time).toBeVisible({ timeout: 20_000 });
      await time.click();

      /* .dz-timepicker reuses the .dz-cal shell, but its later width can beat the card-width rule. */
      const picker = page.locator('.dz-cal');
      await expect(picker).toBeVisible();
      await expect(page.locator('.dz-timepicker')).toBeVisible();
      const box = await expectFloatingCard(page, picker);
      expect(box.width).toBeGreaterThanOrEqual(viewport.width - 26);
    });
  });

  test('the HRA receipt months pick from a floating card, not the OS month picker', async ({ page, login }) => {
    await login.asBuyer();
    await page.goto('/dashboard?tab=documents');
    await page.getByRole('button', { name: 'Personal', exact: true }).click();
    await page.getByRole('button', { name: /HRA Rent Receipts/ }).click();
    const from = page.getByRole('button', { name: /^From month/ });
    await expect(from).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('input[type="month"]')).toHaveCount(0);

    await from.click();
    const card = page.locator('.dz-dropdown__menu--portal.is-portal-open');
    await expectFloatingCard(page, card);
    const first = card.getByRole('option').first();
    const label = (await first.innerText()).trim();
    await first.click();
    await expect(card).toHaveCount(0);
    await expect(from).toContainText(label);
  });
});
