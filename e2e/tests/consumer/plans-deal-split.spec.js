// @ts-check
import { test, expect } from '../../fixtures/live.js';
import { signedInAsNew, seedConsent } from '../../helpers/liveAuth.js';

/* Packs and passes are priced per deal. The Plans page shows one deal at a time behind a Rent / Buy switch. */

const cardOf = (page, name) =>
  page.locator('h3', { hasText: new RegExp(`^${name}$`) }).last().locator('xpath=ancestor::div[contains(@class,"glass")][1]');

test.describe('LIVE: rent and buy plans', () => {
  test('the Plans page quotes the rent prices first and the buy prices after the switch', async ({ page }) => {
    await page.context().clearCookies();
    await seedConsent(page);
    await page.goto('/plans');

    const dealSwitch = page.getByTestId('plans-deal-switch');
    await expect(dealSwitch).toBeVisible({ timeout: 20000 });
    await expect(dealSwitch.getByRole('radio', { name: 'Rent' })).toHaveAttribute('aria-checked', 'true');

    await expect(cardOf(page, 'Rent Contact Pack')).toContainText('₹199');
    await expect(cardOf(page, 'Rent Contact Pack')).toContainText('≈ ₹13 per owner contact');
    await expect(cardOf(page, 'Rent Listing Pass')).toContainText('₹999');
    await expect(cardOf(page, 'Rent Listing Pass')).toContainText('≈ ₹17 a day');

    await dealSwitch.getByRole('radio', { name: 'Buy' }).click();
    await expect(dealSwitch.getByRole('radio', { name: 'Buy' })).toHaveAttribute('aria-checked', 'true');
    await expect(cardOf(page, 'Buy Contact Pack')).toContainText('₹399');
    await expect(cardOf(page, 'Buy Contact Pack')).toContainText('≈ ₹27 per owner contact');
    await expect(cardOf(page, 'Sale Listing Pass')).toContainText('₹1,999');
    await expect(cardOf(page, 'Sale Listing Pass')).toContainText('≈ ₹22 a day');
    await expect(page.locator('h3', { hasText: /^Rent Contact Pack$/ })).toHaveCount(0);
  });

  test('a sale owner\'s "Why?" link lands on the Buy tab', async ({ page }) => {
    await page.context().clearCookies();
    await seedConsent(page);
    await page.goto('/plans?deal=buy');

    const dealSwitch = page.getByTestId('plans-deal-switch');
    await expect(dealSwitch.getByRole('radio', { name: 'Buy' })).toHaveAttribute('aria-checked', 'true', { timeout: 20000 });
    await expect(cardOf(page, 'Sale Listing Pass')).toContainText('₹1,999');
  });

  test('the Plans page says why the fee is charged, and quotes the broker saving for the chosen deal', async ({ page }) => {
    await page.context().clearCookies();
    await seedConsent(page);
    await page.goto('/plans');

    const why = page.getByTestId('why-fee');
    await expect(why.getByRole('heading', { name: 'Why a small fee?' })).toBeVisible({ timeout: 20000 });
    await expect(why).toContainText('Brokers kept out');
    await expect(why).toContainText('Every listing checked');
    await expect(why).toContainText('Verified seekers only');
    await expect(why).toContainText('Your number stays private');
    await expect(why).toContainText('No auto-renewal');
    await expect(page.getByTestId('why-fee-savings')).toContainText('a month\'s rent');

    await page.getByTestId('plans-deal-switch').getByRole('radio', { name: 'Buy' }).click();
    await expect(page.getByTestId('why-fee-savings')).toContainText('1–2%');
  });

  test('checkout for the buy contact pack charges ₹399 and carries the short reasons for the fee', async ({ page }) => {
    await signedInAsNew(page);
    await seedConsent(page);
    await page.goto('/checkout?plan=contact-pack-buy');

    await expect(page.getByRole('button', { name: /^Pay ₹399$/ }).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('why-fee')).toContainText('Why a small fee?');
    await expect(page.getByTestId('why-fee-savings')).toContainText('1–2%');
  });
});
