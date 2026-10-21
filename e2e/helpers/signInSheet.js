import { expect } from '@playwright/test';
import { E2E_OTP } from './liveAuth.js';

// Matched by its form, not its title: the title changes when a new account reaches the profile step.
export const signInSheet = (page) => page.getByRole('dialog').filter({ has: page.locator('#inline-otp-form') });

export async function verifyInSheet(page, mobile, { name = 'Zztest Sheet User' } = {}) {
  const sheet = signInSheet(page);
  await expect(sheet).toBeVisible();
  await sheet.getByLabel(/Mobile Number/i).fill(mobile);
  await sheet.getByRole('button', { name: /Send OTP/i }).click();
  await expect(sheet.getByLabel('OTP digit 1')).toBeVisible();
  for (let i = 0; i < 6; i++) await sheet.getByLabel(`OTP digit ${i + 1}`).fill(E2E_OTP[i]);
  await sheet.getByRole('button', { name: /Verify & Sign In/i }).click();
  const profile = sheet.locator('#inline-profile-name');
  await expect.poll(async () => (await sheet.count()) === 0 || profile.isVisible(), { timeout: 20000 }).toBe(true);
  if (await sheet.count()) {
    await profile.fill(name);
    await sheet.getByRole('button', { name: /^Continue/ }).click();
  }
  await expect(sheet).toHaveCount(0, { timeout: 20000 });
}
