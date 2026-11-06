import { test, expect } from '../../../fixtures/live.js';
import { API, authHeaders, signedInAsNew } from '../../../helpers/liveAuth.js';

/* Every test uses a throwaway account so seeded actors are never mutated. */

/** The cookie-consent banner is also role="dialog"; seed it before load so it cannot cover the page. */
async function seedConsent(page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'dz_cookie_consent_v1',
      JSON.stringify({ necessary: true, functional: true, analytics: true, marketing: false, version: 1, ts: Date.now() }),
    );
  });
}

/** The raiser's own ticket list, read outside the browser. */
async function ticketsOf(mobile) {
  const response = await fetch(`${API}/support/tickets`, { headers: await authHeaders(mobile) });
  const body = await response.text();
  expect(response.status, body).toBe(200);
  return JSON.parse(body);
}

async function raiseTicket(mobile, subject) {
  const response = await fetch(`${API}/support/tickets`, {
    method: 'POST',
    headers: { ...(await authHeaders(mobile)), 'content-type': 'application/json' },
    body: JSON.stringify({ subject, category: 'other', body: `${subject} body` }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body);
}

const thread = (page) => page.getByTestId('support-thread');
const composer = (page) => thread(page).getByRole('textbox', { name: 'Message Draazy support' });

/** One seeded question, quoted exactly. Chosen because its answer is the platform's core claim. */
const ANCHOR_Q = 'Is Draazy really zero brokerage?';

/** A second, from a different category, so the assertion is not about one lucky row. */
const OTHER_Q = 'How do I report a suspicious listing or user?';

/** The categories the nine seeded FAQ rows carry. Asserted as a subset, so adding a tenth is not a failure. */
const FAQ_CATEGORIES = ['General', 'Trust', 'Seekers', 'Owners', 'Payments', 'Services', 'Coverage'];
test.describe('Consumer support — live API', () => {
  test('guards /support behind sign-in, while /contact stays public', async ({ page, consoleErrors }) => {
    await seedConsent(page);
    await page.goto('/support');
    await expect(page).toHaveURL(/\/signin/);
    await expect(page).toHaveURL(/next=/);
    await expect(page.getByRole('heading', { name: 'Help & Support' })).toHaveCount(0);

    await page.goto('/contact');
    await expect(page.getByRole('heading', { name: 'Get in touch' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Send an enquiry' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send enquiry' })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('/support is help only, and on desktop its chat button opens the Draazy support chat docked over the page', async ({ page, consoleErrors }) => {
    await seedConsent(page);
    await signedInAsNew(page);
    await page.goto('/support');

    await expect(page.getByRole('heading', { name: 'Help & Support' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Frequently asked questions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit ticket' })).toHaveCount(0);

    const cta = page.getByTestId('support-chat-cta');
    await expect(cta).toHaveAttribute('href', '/messages?support=general');
    await cta.click();
    await expect(page).toHaveURL(/\/support$/);
    await expect(page.getByTestId('support-dock').getByTestId('support-thread')).toHaveAttribute('data-topic', 'general');
    await expect(composer(page)).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('an old /support?open= link lands on that ticket in Messages, and ?invoice= on the invoice topic', async ({ page }) => {
    await seedConsent(page);
    const mobile = await signedInAsNew(page);
    const ticket = await raiseTicket(mobile, 'Legacy deep link');

    await page.goto(`/support?open=${ticket.id}`);
    await expect(page).toHaveURL(new RegExp(`/messages\\?support=ticket%3A${ticket.id}`));
    await expect(thread(page)).toHaveAttribute('data-topic', 'general');
    await expect(thread(page)).toContainText('Legacy deep link body');

    await page.goto('/support?cat=payment&invoice=DZ-INV-0001');
    await expect(page).toHaveURL(/\/messages\?support=invoice%3ADZ-INV-0001/);
  });

  test('a double-click on Send raises one ticket', async ({ page }) => {
    await seedConsent(page);
    const mobile = await signedInAsNew(page);
    await page.goto('/messages?support=general');

    await composer(page).fill('Pressing send twice must not raise two tickets.');
    await thread(page).getByRole('button', { name: 'Send message' }).dblclick();
    await expect(thread(page)).toContainText('Pressing send twice must not raise two tickets.');

    await expect.poll(async () => (await ticketsOf(mobile)).length).toBe(1);
  });

  test('an ended session signs the user out in the UI and sends them to sign-in', async ({ page }) => {
    await seedConsent(page);
    await signedInAsNew(page);
    await page.goto('/messages?support=general');
    await expect(composer(page)).toBeVisible();

    await page.route('**/api/support/chat/messages', (route) => route.request().method() === 'POST'
      ? route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
      : route.continue());
    await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));

    await composer(page).fill('The session ends while this is sent.');
    await thread(page).getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByText('Your session ended. Please sign in again.')).toBeVisible();
    await expect(page).toHaveURL(/\/signin\?next=%2Fmessages/);
  });
  /* Copy is identical in mock and server, so provenance is the `GET /api/faqs` wait, armed before navigation as it
     fires from an effect during first paint; the API half is read without a browser. */
  test('the FAQ list is a public read that needs no session, and the help page renders what the server returned', async ({ page, login }) => {
    await test.step('GET /api/faqs answers with no Authorization header', async () => {
      // No header at all, not a signed-out session: only that proves the route is genuinely public.
      const res = await fetch(`${API}/faqs`);
      expect(res.status).toBe(200);

      const faqs = await res.json();
      expect(Array.isArray(faqs)).toBe(true);
      expect(faqs.length).toBeGreaterThanOrEqual(9);

      const anchor = faqs.find((f) => f.question === ANCHOR_Q);
      expect(anchor).toBeTruthy();
      expect(anchor.id).toBeTruthy();
      expect(anchor.category).toBe('General');
      expect(anchor.answer).toContain('zero brokerage');

      // A question with no answer would open an accordion onto nothing.
      expect(faqs.every((f) => f.id && f.question && f.answer)).toBe(true);

      const seen = new Set(faqs.map((f) => f.category));
      for (const category of FAQ_CATEGORIES) expect(seen.has(category)).toBe(true);
    });

    await test.step('the help page asks for the list and renders it as openable accordions', async () => {
      await login.asBuyer();

      const faqsRequest = page.waitForResponse(
        (r) => new URL(r.url()).pathname.endsWith('/api/faqs') && r.status() === 200,
      );
      await page.goto('/support');
      await faqsRequest;

      await expect(page.getByRole('heading', { name: 'Frequently asked questions' })).toBeVisible();

      // The button, not the text: a list rendered as inert paragraphs would not open.
      const anchor = page.getByRole('button', { name: ANCHOR_Q });
      await expect(anchor).toBeVisible();
      await expect(page.getByRole('button', { name: OTHER_Q })).toBeVisible();

      await anchor.click();
      await expect(page.getByText('zero brokerage', { exact: false }).first()).toBeVisible();
    });
  });
});
