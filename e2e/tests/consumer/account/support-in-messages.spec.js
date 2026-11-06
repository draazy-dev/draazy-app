import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, authHeaders, seedConsent, signedInAsNew, uniqueMobile } from '../../../helpers/liveAuth.js';

/* One continuous "Draazy support" chat per user; the About bar tags each new message with what it is about. */

async function api(method, path, mobile, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(await authHeaders(mobile)) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  expect(res.ok, `${method} ${path}: ${res.status} ${text}`).toBe(true);
  return text ? JSON.parse(text) : null;
}

const chatOf = (mobile) => api('GET', '/support/chat', mobile);
const ticketsOf = (mobile) => api('GET', '/support/tickets', mobile);

async function publicProperty() {
  const rows = (await (await fetch(`${API}/properties?size=1`)).json()).content;
  expect(rows.length, 'the seed holds at least one approved listing').toBeGreaterThan(0);
  return rows[0];
}

const supportRow = (page) => page.getByTestId('support-row');
const thread = (page) => page.getByTestId('support-thread');
const composer = (page) => page.getByRole('textbox', { name: 'Message Draazy support' });
const aboutPicker = (page) => page.getByRole('button', { name: 'What is this about?' });

async function send(page, text) {
  const posted = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/support/chat/messages')
    && r.request().method() === 'POST' && r.ok());
  await composer(page).fill(text);
  await page.getByRole('button', { name: 'Send message' }).click();
  await posted;
  await expect(thread(page).getByText(text)).toBeVisible();
}

async function pickAbout(page, label) {
  await aboutPicker(page).click();
  await page.getByRole('listbox', { name: 'What is this about?' }).getByRole('option').filter({ hasText: label }).click();
}

test.describe('Draazy support chat in Messages — live API', () => {
  test('the inbox pins Draazy support, and a general question starts the one chat', async ({ page, consoleErrors }) => {
    const mobile = await signedInAsNew(page);
    await page.goto('/messages');

    await expect(supportRow(page)).toContainText('Draazy support');
    await expect(supportRow(page)).toContainText('Ask about a listing, payment or request');
    await supportRow(page).click();
    await expect(thread(page)).toHaveAttribute('data-topic', 'general');
    await expect(aboutPicker(page)).toContainText('Something else');

    await send(page, 'How do I change my registered email?');

    const chat = await chatOf(mobile);
    expect(chat.status).toBe('awaiting');
    expect(chat.messages.map((m) => [m.from, m.text, m.about.type])).toEqual([['me', 'How do I change my registered email?', 'general']]);
    await expect(supportRow(page)).toContainText('How do I change my registered email?');
    expect(consoleErrors).toEqual([]);
  });

  test('switching the About subject keeps one timeline, with a divider where the subject changes', async ({ page, consoleErrors }) => {
    const property = await publicProperty();
    const mobile = await signedInAsNew(page);
    const key = `property:${String(property.id).toLowerCase()}`;

    await page.goto(`/messages?support=${key}`);
    await expect(thread(page)).toHaveAttribute('data-topic', key);
    await expect(aboutPicker(page)).toContainText(property.title);
    await send(page, 'Is the parking covered?');

    await pickAbout(page, 'Something else');
    await expect(thread(page)).toHaveAttribute('data-topic', 'general');
    await send(page, 'Also, where do I find my invoices?');

    await page.reload();
    await expect(thread(page).getByText('Is the parking covered?')).toBeVisible();
    await expect(thread(page).getByText('Also, where do I find my invoices?')).toBeVisible();
    await expect(thread(page).getByTestId('support-about-divider')).toHaveCount(2);
    await expect(thread(page).getByTestId('support-about-divider').first()).toHaveAttribute('data-context', key);

    const chat = await chatOf(mobile);
    expect(chat.messages.map((m) => m.about.type)).toEqual(['property', 'general']);
    expect(await ticketsOf(mobile), 'both subjects share one support chat, not a ticket each').toHaveLength(1);
    expect(consoleErrors).toEqual([]);
  });

  test('a staff reply shows as unread on the pinned row, and an old ticket link opens the chat and reads it', async ({ page, consoleErrors }) => {
    const mobile = await signedInAsNew(page);
    await api('POST', '/support/chat/messages', mobile, { text: 'Is my listing live yet?', about: null });
    const [ticket] = await ticketsOf(mobile);
    await api('POST', `/support/tickets/${ticket.id}/messages`, ACTORS.admin, { body: 'Yes, it went live this morning.' });

    await page.goto('/messages');
    await expect(supportRow(page).locator('.pc-unread')).toHaveText('1');

    await page.goto(`/messages?support=ticket:${ticket.id}`);
    await expect(thread(page)).toHaveAttribute('data-topic', 'general');
    await expect(thread(page).getByText('Yes, it went live this morning.')).toBeVisible();
    await expect(supportRow(page).locator('.pc-unread')).toHaveCount(0);
    await expect.poll(async () => (await chatOf(mobile)).unread).toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  test('a finished service request is read-only, and the closed bar hands over to a general question', async ({ page, consoleErrors }) => {
    const mobile = await signedInAsNew(page);
    const request = await api('POST', '/service-requests/co-fill', mobile, {
      request: { type: 'rent-agreement', details: { ownerName: 'Closed Topic Owner', property: 'Flat 3, Wakad, Pune' } },
      role: 'tenant',
      mobile: uniqueMobile(),
    });
    await api('POST', `/service-requests/${request.id}/cancel`, mobile, {});

    await page.goto(`/messages?support=request:${request.id}`);
    await expect(thread(page)).toHaveAttribute('data-topic', `request:${String(request.id).toLowerCase()}`);
    await expect(page.getByTestId('support-closed')).toContainText('This is closed.');
    await expect(composer(page)).toHaveCount(0);

    await page.getByTestId('support-closed').getByRole('button', { name: 'Ask about something else' }).click();
    await expect(thread(page)).toHaveAttribute('data-topic', 'general');
    await expect(composer(page)).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('on desktop a support link opens a docked chat over the page, which minimises to a tab', async ({ page, consoleErrors }) => {
    await page.setViewportSize({ width: 1366, height: 860 });
    await seedConsent(page);
    const mobile = await signedInAsNew(page);
    await page.goto('/help');

    await page.locator('a[href="/messages?support=general"]').first().click();
    const dock = page.getByTestId('support-dock');
    await expect(dock.getByTestId('support-thread')).toBeVisible();
    await expect(page).toHaveURL(/\/help$/);

    await send(page, 'Sent from the docked chat');
    expect((await chatOf(mobile)).messages.map((m) => m.text)).toEqual(['Sent from the docked chat']);

    await dock.getByRole('button', { name: 'Minimise chat' }).click();
    await expect(dock.getByTestId('support-dock-tab')).toBeVisible();
    await expect(dock.getByTestId('support-thread')).toHaveCount(0);
    await dock.getByTestId('support-dock-tab').click();
    await expect(dock.getByText('Sent from the docked chat')).toBeVisible();

    await page.goto('/messages');
    await expect(dock).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('on a phone the support thread slides over the inbox and Back returns to it', async ({ page, consoleErrors }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signedInAsNew(page);
    await page.goto('/messages');

    await supportRow(page).click();
    await expect(thread(page)).toBeVisible();
    await thread(page).getByRole('button', { name: 'Back to conversations' }).click();
    await expect(supportRow(page)).toBeVisible();
    await expect(thread(page)).toBeHidden();
    expect(consoleErrors).toEqual([]);
  });

  test('on a phone a long thread keeps every subject divider at full height', async ({ page, consoleErrors }) => {
    const property = await publicProperty();
    await page.setViewportSize({ width: 360, height: 640 });
    const mobile = await signedInAsNew(page);
    const listing = { type: 'property', id: String(property.id) };
    for (let i = 0; i < 12; i += 1) {
      await api('POST', '/support/chat/messages', mobile, { text: `Question ${i + 1}`, about: i % 3 === 2 ? null : listing });
    }

    await page.goto('/messages?support=general');
    await expect(thread(page).getByText('Question 12')).toBeVisible();
    const dividers = thread(page).getByTestId('support-about-divider');
    await expect(dividers).toHaveCount(8);
    const boxes = await dividers.evaluateAll((els) => els.map((el) => ({ h: el.clientHeight, need: el.scrollHeight })));
    for (const box of boxes) {
      expect(box.h, 'an overflowing thread must not squash a divider').toBeGreaterThanOrEqual(box.need);
      expect(box.h).toBeGreaterThanOrEqual(18);
    }
    expect(consoleErrors).toEqual([]);
  });
});
