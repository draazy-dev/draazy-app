import { ACTORS, test, expect } from '../../fixtures/live.js';
import { API, apiLogin, authHeaders, letterTag, uniqueMobile } from '../../helpers/liveAuth.js';

/* Staff side of support chats against the live API: one chat per customer in one inbox, the reply that
   claims it, resolve and reopen, and the desktop dock that follows staff across the console. */

async function newCustomer() {
  const mobile = uniqueMobile();
  const name = `Chat ${letterTag(mobile.slice(2))}`;
  const { accessToken, user } = await apiLogin(mobile, { name });
  return { mobile, name, token: accessToken, id: String(user.id) };
}

async function call(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function say(customer, text) {
  const res = await call(customer.token, 'POST', '/support/chat/messages', { text, about: null });
  expect(res.status).toBe(201);
  return res.body;
}

const tag = () => Date.now().toString(36).slice(-5);

test.describe('Ops → Support chats (live)', () => {
  test('a customer message waits on us; a reply answers it, claims the chat and reaches the customer', async ({ page, login, consoleErrors }) => {
    const customer = await newCustomer();
    const asked = `Where is my deposit ${tag()}?`;
    await say(customer, asked);

    await login.asStaff('rental');
    await page.goto('/ops/support');
    await expect(page.getByRole('heading', { name: 'Support chats' })).toBeVisible();
    await expect(page.getByTestId('tab-count-awaiting')).toHaveText(/^[1-9][\d,]*$/);

    const row = page.getByTestId('support-chat-row').filter({ hasText: customer.name });
    await expect(row).toContainText(asked);
    await row.click();
    await expect(page).toHaveURL(new RegExp(`chat=${customer.id}`));

    const chat = page.getByTestId('staff-chat');
    await expect(chat.getByTestId('staff-chat-name')).toHaveText(customer.name);
    await expect(chat.getByText(asked)).toBeVisible();
    await expect(chat, 'staff see a masked mobile, never the full number').not.toContainText(customer.mobile);
    await expect(chat.getByTestId('staff-chat-status')).toHaveText('Waiting on us');
    await expect(chat.getByTestId('staff-chat-owner')).toHaveText('Unassigned');

    const reply = `We have raised it with the owner ${tag()}.`;
    await chat.getByTestId('staff-chat-input').fill(reply);
    await chat.getByTestId('staff-chat-send').click();
    await expect(chat.getByText(reply)).toBeVisible();
    await expect(chat.getByTestId('staff-chat-owner')).toHaveText('Handled by you');
    await expect(chat.getByTestId('staff-chat-status')).toHaveText('Answered');

    const mine = await call(customer.token, 'GET', '/support/chat');
    expect(mine.body.status).toBe('answered');
    expect(mine.body.unread).toBeGreaterThan(0);
    expect(mine.body.messages.at(-1)).toMatchObject({ from: 'staff', text: reply, about: { type: 'general' } });

    await page.getByRole('tab', { name: /^Mine/ }).click();
    await expect(page.getByTestId('support-chat-row').filter({ hasText: customer.name })).toBeVisible();
    await page.getByRole('tab', { name: /^Waiting on us/ }).click();
    await expect(page.getByTestId('support-chat-row').filter({ hasText: customer.name })).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('resolving closes the chat and the customer’s next message reopens the same one', async ({ page, login, consoleErrors }) => {
    const customer = await newCustomer();
    await say(customer, `Thanks, that is all ${tag()}.`);

    await login.asStaff('rental');
    await page.goto(`/ops/support?view=all&chat=${customer.id}`);
    const chat = page.getByTestId('staff-chat');
    await chat.getByTestId('staff-chat-resolve').click();
    await expect(chat.getByTestId('staff-chat-status')).toHaveText('Resolved');
    await expect(chat.getByTestId('staff-chat-resolve')).toHaveCount(0);

    const again = `One more thing ${tag()}`;
    await say(customer, again);
    const mine = await call(customer.token, 'GET', '/support/chat');
    expect(mine.body.status).toBe('awaiting');
    expect(mine.body.messages.map((m) => m.text)).toContain(again);

    await page.reload();
    await expect(chat.getByText(again)).toBeVisible();
    await expect(chat.getByTestId('staff-chat-status')).toHaveText('Waiting on us');
    expect(consoleErrors).toEqual([]);
  });

  test('a listing moderator sees and answers only property messages; general stays with Support', async ({ page, login, consoleErrors }) => {
    const customer = await newCustomer();
    const listing = (await (await fetch(`${API}/properties?size=1`)).json()).content[0];
    const general = `Refund question ${tag()}`;
    const aboutListing = `Is this listing still real ${tag()}?`;
    await say(customer, general);
    const sent = await call(customer.token, 'POST', '/support/chat/messages',
      { text: aboutListing, about: { type: 'property', id: String(listing.id) } });
    expect(sent.status).toBe(201);

    const { mobile } = await login.scopeStaff('valuation', ['properties:moderate']);
    const { accessToken } = await apiLogin(mobile);
    const counts = await call(accessToken, 'GET', '/admin/support/chats/counts');
    expect(counts.body.scope).toEqual({ full: false, contexts: ['property'] });
    const outside = await call(accessToken, 'POST', `/admin/support/chats/${customer.id}/messages`, { text: 'Hi', about: null });
    expect(outside.status, 'general replies stay with Support').toBe(403);
    expect((await call(accessToken, 'POST', `/admin/support/chats/${customer.id}/resolve`)).status).toBe(403);

    await login.asStaff('valuation');
    await page.goto(`/ops/support?view=all&chat=${customer.id}`);
    await expect(page.getByRole('tab', { name: /^Waiting on us/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Mine/ })).toHaveCount(0);
    const about = page.getByRole('button', { name: 'About', exact: true });
    await about.click();
    const menu = page.getByRole('listbox', { name: 'About', exact: true });
    await expect(menu.getByRole('option', { name: 'Property' })).toBeVisible();
    await expect(menu.getByRole('option', { name: 'General' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    const chat = page.getByTestId('staff-chat');
    await expect(chat.getByText(aboutListing)).toBeVisible();
    await expect(chat.getByText(general)).toHaveCount(0);
    await expect(chat.getByTestId('staff-chat-resolve')).toHaveCount(0);
    await expect(chat.getByTestId('staff-chat-ticket'), 'raising service tickets is a Support call').toHaveCount(0);
    await expect(chat.getByRole('button', { name: /Assign to me|Take over/ })).toHaveCount(0);

    const reply = `Yes, we verified it ${tag()}.`;
    await chat.getByTestId('staff-chat-input').fill(reply);
    const posted = page.waitForResponse((r) => r.url().endsWith(`/support/chats/${customer.id}/messages`)
      && r.request().method() === 'POST');
    await chat.getByTestId('staff-chat-send').click();
    expect((await posted).status()).toBe(201);
    await expect(chat.getByTestId('staff-chat-owner'), 'a desk reply does not claim the whole chat').toHaveText('Unassigned');

    const mine = await call(customer.token, 'GET', '/support/chat');
    expect(mine.body.messages.at(-1)).toMatchObject({ from: 'staff', text: reply, about: { type: 'property' } });
    expect(mine.body.status, 'the general question still waits on Support').toBe('awaiting');
    expect(consoleErrors).toEqual([]);
  });

  test('a chat lead becomes an internal service ticket for the customer, and the customer sees nothing of it', async ({ page, login, consoleErrors }) => {
    const customer = await newCustomer();
    const listing = (await (await fetch(`${API}/properties?size=1`)).json()).content[0];
    await say(customer, `Can someone help me move house ${tag()}?`);
    for (let i = 0; i < 12; i += 1) await say(customer, `Follow-up ${i} ${tag()}`);
    const before = (await call(customer.token, 'GET', '/support/chat')).body.messages.length;

    await login.asStaff('rental');
    await page.goto(`/ops/support?view=all&chat=${customer.id}&about=property:${listing.id}`);
    const chat = page.getByTestId('staff-chat');
    await expect(chat.getByLabel('Reply about'), 'a desk deep link opens the chat at its case').toContainText('Listing');
    const divider = chat.getByTestId('staff-chat-about').first();
    await divider.scrollIntoViewIfNeeded();
    expect((await divider.boundingBox()).height, 'an overflowing timeline does not squash its context dividers').toBeGreaterThan(14);

    const subject = `Packers lead ${tag()}`;
    await chat.getByTestId('staff-chat-ticket').click();
    const form = chat.getByTestId('staff-chat-ticket-form');
    await expect(chat.getByTestId('staff-chat-input'), 'the ticket form takes the chat body instead of squeezing it').toBeHidden();
    await form.getByLabel('Ticket subject').fill(subject);
    await form.getByLabel('Ticket note').fill('Moving from Baner next month.');
    const created = page.waitForResponse((r) => r.url().endsWith(`/support/chats/${customer.id}/service-ticket`)
      && r.request().method() === 'POST');
    await form.getByTestId('staff-chat-ticket-submit').click();
    const res = await created;
    expect(res.status()).toBe(201);
    const ticket = await res.json();
    await expect(form).toHaveCount(0);
    await expect(chat.getByTestId('staff-chat-input')).toBeVisible();

    const staff = await authHeaders(ACTORS.admin);
    const rows = await (await fetch(`${API}/tickets?q=${encodeURIComponent(subject)}`, { headers: staff })).json();
    expect(rows.content.find((r) => r.id === ticket.id)).toMatchObject({ subject, team: 'rental', customer: customer.name });
    const mine = await call(customer.token, 'GET', '/support/chat');
    expect(mine.body.messages, 'a service ticket is never posted to the customer').toHaveLength(before);
    expect(consoleErrors).toEqual([]);
  });

  test('a failed read is stated as a failure, never as an empty inbox', async ({ page, login }) => {
    await login.asStaff('rental');
    await page.route(/\/api\/admin\/support\/chats\?/, (route) => route.abort());
    await page.goto('/ops/support');
    await expect(page.getByText('This is not an empty inbox')).toBeVisible();
    await expect(page.getByTestId('support-chats-empty')).toHaveCount(0);
  });

  test('on desktop the dock follows staff off the inbox, opens a chat in a window and minimises it', async ({ page, login, consoleErrors }) => {
    const customer = await newCustomer();
    const asked = `Dock question ${tag()}`;
    await say(customer, asked);

    await login.asStaff('rental');
    await page.goto('/ops/support');
    await expect(page.getByRole('heading', { name: 'Support chats' })).toBeVisible();
    await expect(page.getByTestId('staff-dock'), 'the inbox already is the chat surface').toHaveCount(0);

    await page.locator('nav a[href]').filter({ hasNotText: 'Support chats' }).first().click();
    const launcher = page.getByTestId('staff-dock-launcher');
    await expect(launcher).toBeVisible();
    await expect(page.getByTestId('staff-dock-badge')).toHaveText(/^[1-9][\d,]*$/);

    await launcher.click();
    await page.getByTestId('staff-dock-recent-row').filter({ hasText: customer.name }).click();
    const win = page.locator(`[data-testid="staff-dock-window"][data-user="${customer.id}"]`);
    await expect(win.getByText(asked)).toBeVisible();

    const reply = `Answered from the dock ${tag()}`;
    await win.getByTestId('staff-chat-input').fill(reply);
    await win.getByTestId('staff-chat-send').click();
    await expect(win.getByText(reply)).toBeVisible();

    await win.getByRole('button', { name: 'Minimise chat' }).click();
    await expect(win).toHaveAttribute('data-minimized', 'true');
    await win.getByRole('button', { name: customer.name, exact: true }).click();
    await expect(win.getByText(reply)).toBeVisible();
    await win.getByRole('button', { name: 'Close chat' }).click();
    await expect(win).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});
