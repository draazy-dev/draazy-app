import { expect, test } from '../../../fixtures/live.js';
import { API, apiLogin, signedInAsNew } from '../../../helpers/liveAuth.js';

/* Stored and reflected text renders as text. The canary is inert markup: if a view ever renders it as HTML, a
   `[data-canary]` element appears in the DOM and the test fails. */

const stamp = () => Date.now().toString(36).slice(-5);
const canary = (tag) => `<b data-canary="${tag}">canary ${tag}</b>`;

async function seedConsent(page) {
  await page.addInitScript(() => {
    localStorage.setItem('dz_cookie_consent_v1',
      JSON.stringify({ necessary: true, functional: true, analytics: true, marketing: false, version: 1, ts: Date.now() }));
  });
}

async function raiseTicket(accessToken, subject, body) {
  const res = await fetch(`${API}/support/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ subject, category: 'payment', body }),
  });
  if (res.status !== 201) throw new Error(`raiseTicket: ${res.status} ${await res.text()}`);
}

const queryWasRead = (page, tag) => expect.poll(() => page.evaluate((t) =>
  document.body.innerText.includes(`canary ${t}`)
  || [...document.querySelectorAll('input')].some((i) => i.value.includes(`canary ${t}`)), tag)).toBe(true);

test.describe('Output encoding (live)', () => {
  test('markup in a ticket renders as literal text for the customer and for the desk', async ({ page, login, browser, baseURL }) => {
    const tag = stamp();
    const subject = `Encoding check ${canary(tag)}`;
    const body = `Body ${canary(tag)} & "quotes" 'single'`;

    const customerContext = await browser.newContext({ baseURL });
    const customer = await customerContext.newPage();
    await seedConsent(customer);
    const mobile = await signedInAsNew(customer);
    const { accessToken } = await apiLogin(mobile);
    await raiseTicket(accessToken, subject, body);

    await test.step('the customer sees the literal markup in the list and the thread', async () => {
      await customer.goto('/support');
      const row = customer.getByText(subject, { exact: true });
      await expect(row).toBeVisible();
      await row.click();
      await expect(customer.getByRole('dialog').getByText(body, { exact: true })).toBeVisible();
      await expect(customer.locator('[data-canary]')).toHaveCount(0);
      await customerContext.close();
    });

    await test.step('the desk sees the literal markup in the queue and the thread', async () => {
      await login.asStaff('rental');
      await page.goto('/ops/support');
      const row = page.getByTestId('queue-row').filter({ hasText: subject });
      await expect(row).toBeVisible();
      await row.getByRole('button', { name: 'Reply' }).click();
      await expect(page.getByRole('dialog').getByText(body, { exact: true })).toBeVisible();
      await expect(page.locator('[data-canary]')).toHaveCount(0);
    });
  });

  for (const route of ['/listings', '/societies', '/help/search']) {
    test(`a search query carrying markup is echoed as text on ${route}`, async ({ page }) => {
      const tag = stamp();
      await seedConsent(page);
      await page.goto(`${route}?q=${encodeURIComponent(canary(tag))}`);
      await queryWasRead(page, tag);
      await expect(page.locator('[data-canary]')).toHaveCount(0);
    });
  }
});
