// @ts-check
import { test, expect } from '@playwright/test';
import { API, signedInAsNew } from '../../../helpers/liveAuth.js';
import { gotoSettled } from '../../../helpers/settle.js';
/* Cashfree's modal checkout opens bank/OTP steps in a popup and sends that popup to our return_url. The popup must
   not boot a second copy of the page the user is paying from; a real redirect of the paying tab must. */

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const RETURN = `${BASE}/services/rent-agreement?order_id=ord_e2e`;

test.describe('Payment gateway return', () => {
  test('the gateway popup landing on the return url shows a close-me screen, not the app', async ({ page }) => {
    await signedInAsNew(page, { api: API });
    /* Two history entries keep `window.close()` from closing the test's own page. */
    await gotoSettled(page, `${BASE}/`);
    await page.evaluate(() => localStorage.setItem('dz_pay_open', String(Date.now())));
    await page.goto(RETURN);

    const screen = page.getByTestId('pay-popup-return');
    await expect(screen.getByRole('heading', { name: 'Payment step finished' })).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);

    await screen.getByRole('button', { name: 'Continue in this window' }).click();
    await expect(page.getByText('Checking your payment')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('pay-popup-return')).toHaveCount(0);
  });

  test('the paying tab redirected back renders the page, says the payment is being checked, and drops the order id', async ({ page }) => {
    await signedInAsNew(page, { api: API });
    await gotoSettled(page, RETURN);

    await expect(page.getByText('Checking your payment')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('pay-popup-return')).toHaveCount(0);
    await expect(page).not.toHaveURL(/order_id=/);
  });
});
