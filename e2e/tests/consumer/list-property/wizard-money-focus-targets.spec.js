import { test, expect } from '../../../fixtures/live.js';
import { signedInAsNew } from '../../../helpers/liveAuth.js';
import { pickFloors } from '../../../helpers/listingForm.helper.js';
import { fillSociety } from '../../../helpers/places.js';
import { pickLocality } from '../../../helpers/locality.js';

const menuOpen = (page) => expect(page.locator('.dz-dropdown__menu.is-portal-open')).toBeVisible();

async function pickOption(page, dataErr, label) {
  await page.locator(`[data-err="${dataErr}"]`).click();
  await menuOpen(page);
  await page.locator('.dz-dropdown__option', { hasText: label }).first().click();
}

async function gotoDetails(page, deal = 'buy') {
  await signedInAsNew(page);
  await page.goto('/list-property');
  await page.waitForSelector('.lp-steps', { timeout: 20000 });
  await page.locator('.radio-pill', { hasText: deal === 'rent' ? 'Rent' : 'Sale' }).first().click();
  await pickOption(page, 'propertyType', 'Flat / Apartment');
  await page.locator('[data-err="bhk"]').getByRole('button', { name: '2', exact: true }).click();
  await page.locator('input[data-err="carpetArea"]').fill('1200');
}

async function gotoPricing(page, deal = 'buy') {
  await gotoDetails(page, deal);
  await pickFloors(page);
  await page.getByRole('button', { name: /Next Step/i }).click();
  await page.waitForSelector('.gm-style', { timeout: 30000 });
  await pickLocality(page, 'Baner');
  await page.locator('input[data-err="flatNumber"]').fill('B-1204');
  await fillSociety(page, 'Skyline Heights');
  await page.locator('input[data-err="pincode"]').fill('411045');
  await page.getByRole('button', { name: /Next Step/i }).click();
  await page.waitForSelector('text=/Price & terms/i', { timeout: 15000 });
}

test.describe('wizard money, bounds and type-appropriate copy', () => {
  test('a typed decimal is rounded to the rupee and never glued onto the digits', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(async () => {
      const [{ parseAmount }, { formatMoneyInput, formatIndian }, { toMoney, roundMoney }] = await Promise.all([
        import('/src/lib/format.js'),
        import('/src/pages/consumer/list-property/format.js'),
        import('/src/pages/consumer/list-property/sanitize.js'),
      ]);
      return {
        parsed: parseAmount('6500000.5'),
        typed: toMoney('6500000.5'),
        shown: formatMoneyInput('6500000.5'),
        rounded: roundMoney('6500000.5'),
        grouped: formatIndian('6500000.4'),
      };
    });
    expect(out.parsed).toBe(6500001);
    expect(out.typed).toBe('6500000.5');
    expect(out.shown).toContain('.');
    expect(out.rounded).not.toContain('.');
    expect(Number(out.rounded)).toBe(6500001);
    expect(out.grouped).toBe('65,00,000');
  });

  test('price and rent above the ceilings fail validation with a max error', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(async () => {
      const { validatePricingStep } = await import('/src/pages/consumer/list-property/validation.js');
      return {
        sale: validatePricingStep({ deal: 'buy', propertyType: 'flat', price: '10000000001' }, null).price,
        rent: validatePricingStep({ deal: 'rent', propertyType: 'flat', monthlyRent: '10000001', deposit: '0' }, null).monthlyRent,
        saleOk: validatePricingStep({ deal: 'buy', propertyType: 'flat', price: '10000000000' }, null).price,
      };
    });
    expect(out.sale).toBe('max');
    expect(out.rent).toBe('max');
    expect(out.saleOk).toBeUndefined();
  });

  test('co-working is a commercial sub-type with the workspace profile, and copy follows the property type', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(async () => {
      const { COMMERCIAL_SUBTYPES, commercialProfileOf, copyContextOf } = await import('/src/pages/consumer/list-property/constants.js');
      return {
        values: COMMERCIAL_SUBTYPES.map((s) => s.value),
        profile: commercialProfileOf('coworking'),
        office: commercialProfileOf('office'),
        contexts: [copyContextOf('flat'), copyContextOf('commercial'), copyContextOf('openplot')],
      };
    });
    expect(out.values).toContain('coworking');
    expect(out.profile).toBe(out.office);
    expect(out.contexts[0]).toBeUndefined();
    expect(out.contexts[1]).toBe('space');
    expect(out.contexts[2]).toBe('land');
  });

  test('a sale price over the ceiling shows an inline error and blocks Next', async ({ page }) => {
    await gotoPricing(page);
    const price = page.locator('input[data-err="price"]');
    await price.fill('10000000001');
    await page.getByRole('button', { name: /Next Step/i }).click();
    await expect(price).toHaveClass(/dz-invalid/);
    await expect(page.getByText("A sale price can't be more than")).toBeVisible();
    await expect(page.getByRole('heading', { name: /Photos & description/i })).toHaveCount(0);
  });

  test('a decimal price is rounded when the field loses focus', async ({ page }) => {
    await gotoPricing(page);
    const price = page.locator('input[data-err="price"]');
    await price.fill('6500000.5');
    await expect(price).toHaveValue(/\./);
    await price.blur();
    await expect(price).toHaveValue('65,00,001');
  });
});

test.describe('details step floors and dropdown focus', () => {
  test('a floor above the total floors shows an inline error and blocks Next', async ({ page }) => {
    await gotoDetails(page);
    await pickFloors(page, { floor: '9', totalFloors: '5' });
    await page.getByRole('button', { name: /Next Step/i }).click();
    await expect(page.getByText(/at or below the building's total floors/i)).toBeVisible();
    await expect(page.locator('.gm-style')).toHaveCount(0);
  });

  test('choosing an option or pressing Escape returns focus to the dropdown trigger', async ({ page }) => {
    await gotoDetails(page);
    const trigger = page.locator('[data-err="floor"] .dz-dropdown__trigger');
    await trigger.click();
    await menuOpen(page);
    await page.getByRole('option', { name: '9', exact: true }).click();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await menuOpen(page);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });
});

test.describe('touch targets on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('deposit chips are drawn at the compact chip height and keep a 44px tap target', async ({ page }) => {
    await gotoPricing(page, 'rent');
    const chips = page.locator('button.dz-chip');
    const count = await chips.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const size = await chips.nth(i).evaluate((el) => ({
        drawn: el.getBoundingClientRect().height,
        chip: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dz-chip-h')),
        target: parseFloat(getComputedStyle(el, '::before').height),
      }));
      expect(size.drawn, `deposit chip ${i} is drawn at --dz-chip-h`).toBe(size.chip);
      expect(size.target, `deposit chip ${i} keeps the 44px target`).toBeGreaterThanOrEqual(44);
    }
  });
});
