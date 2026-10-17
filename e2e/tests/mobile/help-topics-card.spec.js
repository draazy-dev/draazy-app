import { test, expect } from '@playwright/test';
import { expectFloatingCard } from '../../helpers/floatCard.js';

test('the help topics drawer opens as the shared floating card and Escape closes it', async ({ page }) => {
  await page.goto('/help');
  await page.getByRole('button', { name: /Topics/ }).click();
  const card = page.getByRole('dialog', { name: 'Help topics' });
  await expect(card).toBeVisible();
  await expectFloatingCard(page, card);
  await expect(card.getByRole('link', { name: 'Contact support' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
});
