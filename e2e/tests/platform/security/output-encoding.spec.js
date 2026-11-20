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

async function sendSupportMessage(accessToken, text) {
  const res = await fetch(`${API}/support/chat/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ text, about: null }),
  });
  if (res.status !== 201) throw new Error(`sendSupportMessage: ${res.status} ${await res.text()}`);
}

const queryWasRead = (page, tag) => expect.poll(() => page.evaluate((t) =>
  document.body.innerText.includes(`canary ${t}`)
  || [...document.querySelectorAll('input')].some((i) => i.value.includes(`canary ${t}`)), tag)).toBe(true);

test.describe('Output encoding (live)', () => {
  test('markup in a support chat renders as literal text for the customer and for the desk', async ({ page, login, browser, baseURL }) => {
    const tag = stamp();
    const body = `Body ${canary(tag)} & "quotes" 'single'`;

    const customerContext = await browser.newContext({ baseURL });
    const customer = await customerContext.newPage();
    await seedConsent(customer);
    const mobile = await signedInAsNew(customer);
    const { accessToken } = await apiLogin(mobile);
    await sendSupportMessage(accessToken, body);

    await test.step('the customer sees the literal markup in the Draazy support thread', async () => {
      await customer.goto('/messages?support=general');
      await expect(customer.getByTestId('support-thread').getByText(body, { exact: true })).toBeVisible();
      await expect(customer.locator('[data-canary]')).toHaveCount(0);
      await customerContext.close();
    });

    await test.step('the desk sees the literal markup in the inbox row and the chat', async () => {
      await login.asStaff('rental');
      await page.goto('/ops/support?view=all');
      const row = page.getByTestId('support-chat-row').filter({ hasText: `canary ${tag}` });
      await expect(row).toContainText(body);
      await row.click();
      await expect(page.getByTestId('staff-chat').getByText(body, { exact: true })).toBeVisible();
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
