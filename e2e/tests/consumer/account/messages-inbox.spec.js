import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, authHeaders, signedInAs, uniqueMobile, letterTag } from '../../../helpers/liveAuth.js';
/* Each test creates a thread for a unique buyer: the named seed conversation is shared by other
   specs, so writing to it would leak messages across retries and suppress the next run's replies. */

const OWNER_MESSAGE = 'Thursday after six suits me. I will share the gate code.';
const BANER_FLAT_ID = '615287b3-7a3b-530f-84aa-773753e8682b';

async function actor(request, name) {
  const mobile = uniqueMobile();
  const headers = await authHeaders(mobile);
  const response = await request.patch(`${API}/auth/me`, { headers, data: { name } });
  expect(response.status(), `naming ${name}`).toBe(200);
  return { mobile, headers, name };
}

async function liveThread(request) {
  const suffix = Date.now();
  const buyer = await actor(request, `Live Inbox Buyer ${letterTag(suffix)}`);
  const ownerHeaders = await authHeaders(ACTORS.owner);
  const ownerProfile = await request.patch(`${API}/auth/me`, {
    headers: ownerHeaders,
    data: { hideNumber: false },
  });
  expect(ownerProfile.status(), 'owner allows approved buyers to call').toBe(200);

  const contact = await request.post(`${API}/contacts/request`, {
    headers: buyer.headers,
    data: { propertyId: BANER_FLAT_ID },
  });
  expect(contact.status()).toBe(200);
  expect((await contact.json()).status).toBe('pending');

  const inbox = await request.get(`${API}/me/contact-requests?size=20`, { headers: ownerHeaders });
  expect(inbox.status()).toBe(200);
  const requestRow = (await inbox.json()).content.find((row) =>
    row.propertyId === BANER_FLAT_ID && row.requester?.name === buyer.name,
  );
  expect(requestRow, 'the owner must receive the buyer contact request').toBeTruthy();

  const granted = await request.patch(`${API}/me/contact-requests/${requestRow.id}`, {
    headers: ownerHeaders,
    data: { status: 'approved' },
  });
  expect(granted.status()).toBe(200);

  const created = await request.post(`${API}/messages`, {
    headers: buyer.headers,
    data: { propertyId: BANER_FLAT_ID, body: 'Hello, is this flat still available?' },
  });
  expect(created.status()).toBe(201);
  const conversation = await created.json();

  const ownerReply = await request.post(`${API}/messages/${conversation.id}/reply`, {
    headers: ownerHeaders,
    data: { body: OWNER_MESSAGE },
  });
  expect(ownerReply.status()).toBe(201);

  return { buyer, conversation, propertyTitle: conversation.propertyTitle };
}

const replyResponse = (page, conversationId) => page.waitForResponse((response) => {
  const request = response.request();
  return new URL(response.url()).pathname === `/api/messages/${conversationId}/reply`
    && request.method() === 'POST'
    && response.status() === 201;
});

test.describe('Messages inbox — live API', () => {
  let thread;

  test.beforeEach(async ({ request }) => {
    thread = await liveThread(request);
  });

  test('a buyer sends quick and typed messages through the real thread', async ({ page }) => {
    const typedMessage = `Live inbox message ${Date.now()}`;

    await signedInAs(page, thread.buyer.mobile);
    await page.goto('/');
    // The fixture owner reply is unread, so the app-level indicator has real server data.
    await expect(page.locator('a[href="/messages"]').first().locator('span').first()).toHaveText(/\d+/);

    const detail = page.waitForResponse((response) =>
      new URL(response.url()).pathname === `/api/messages/${thread.conversation.id}` && response.status() === 200,
    );
    await page.goto(`/messages?c=${thread.conversation.id}`);
    await detail;

    await expect(page.locator('.pc-list-head h1')).toHaveText('Messages');
    // The list first renders a real row, then the deliberately unmatched query reaches its empty state.
    await expect(page.locator('.pc-conv').first()).toBeVisible();
    await expect(page.locator('.pc-bubble.them', { hasText: OWNER_MESSAGE })).toBeVisible();
    await expect(page.locator('.pc-head-actions a[href^="tel:+91"]').first()).toHaveAttribute('href', /^tel:\+91\d{10}$/);

    const quickReply = page.locator('.pc-quick-chip').first();
    await expect(quickReply).toBeVisible();
    const quickText = await quickReply.textContent();
    const [quickResponse] = await Promise.all([replyResponse(page, thread.conversation.id), quickReply.click()]);
    expect((await quickResponse.json()).body).toBe(quickText);

    await page.locator('.pc-input').fill(typedMessage);
    const [typedResponse] = await Promise.all([replyResponse(page, thread.conversation.id), page.locator('.pc-send').click()]);
    expect((await typedResponse.json()).body).toBe(typedMessage);
    await expect(page.locator('.pc-bubble.me', { hasText: typedMessage })).toBeVisible();

    await page.reload();
    await expect(page.locator('.pc-bubble.me', { hasText: quickText })).toBeVisible();
    await expect(page.locator('.pc-bubble.me', { hasText: typedMessage })).toBeVisible();
    await expect(page.locator('.pc-conv').first()).toBeVisible();
    await expect(page.locator('.pc-search input')).toHaveCount(0);
    await page.getByTestId('msg-search-toggle').click();
    await page.locator('.pc-search input').fill('zzzz-no-live-conversation');
    await expect(page.locator('.pc-empty-list')).toBeVisible();

    // Reading the thread cleared the only unread message, so the top-bar icon drops its count badge.
    await page.goto('/');
    await expect(page.locator('a[href="/messages"]').first().locator('span')).toHaveCount(0);
  });

  test('the owner sees the requester contact and can open the report modal', async ({ page }) => {
    await signedInAs(page, ACTORS.owner);
    await page.goto(`/messages?c=${thread.conversation.id}`);

    await expect(page.locator('.pc-bubble.them', { hasText: /Hello, is this flat still available/i })).toBeVisible();
    await expect(page.locator('.pc-input')).toBeVisible();
    await expect(page.locator('.pc-head-actions a[href^="tel:+91"]').first()).toHaveAttribute('href', /^tel:\+91\d{10}$/);

    await page.getByRole('button', { name: 'Conversation actions' }).click();
    await page.getByRole('button', { name: 'Report this user' }).click();
    await expect(page.getByRole('dialog', { name: /Report/i })).toBeVisible();
  });

  test('a staged chat never shows in the list, a Sent request thread opens instead, and both are scoped to the signed-in user', async ({ page, request }) => {
    const first = await actor(request, `Staged Buyer A ${letterTag()}`);
    const second = await actor(request, `Staged Buyer B ${letterTag()}`);
    for (const who of [first, second]) {
      const asked = await request.post(`${API}/contacts/request`, { headers: who.headers, data: { propertyId: BANER_FLAT_ID } });
      expect(asked.status()).toBe(200);
    }
    const stagedMessage = `Private staged message ${Date.now()}`;

    await signedInAs(page, first.mobile);
    await page.goto('/');
    const firstUserId = await page.evaluate(() => JSON.parse(localStorage.getItem('draazyUser')).id);
    await page.evaluate(({ userId, propertyId, body }) => {
      localStorage.setItem('dzPendingRequests', JSON.stringify([{
        kind: 'chat',
        userId,
        propertyId,
        at: Date.now(),
        property: { title: 'Staged flat', price: '₹28,000/mo', loc: 'Baner', img: '' },
        party: { name: 'Private Owner', role: 'Owner' },
        firstMessage: body,
      }]));
    }, { userId: firstUserId, propertyId: BANER_FLAT_ID, body: stagedMessage });

    await page.goto(`/messages?openProp=${BANER_FLAT_ID}`);
    await expect(page.locator('.pc-conv[data-request-box="sent"]')).toHaveCount(1, { timeout: 20000 });
    await expect(page.locator('.pc-conv[data-staged="true"]')).toHaveCount(0);
    await expect(page.getByTestId('request-thread')).toHaveAttribute('data-box', 'sent');
    await expect(page.getByText(stagedMessage)).toHaveCount(0);

    await signedInAs(page, second.mobile);
    await page.goto(`/messages?openProp=${BANER_FLAT_ID}`);
    await expect(page.locator('.pc-conv[data-request-box="sent"]')).toHaveCount(1, { timeout: 20000 });
    await expect(page.getByTestId('request-thread')).toHaveAttribute('data-box', 'sent');
    await expect(page.getByText(stagedMessage)).toHaveCount(0);
  });
  test('thread actions reach the server: delete for me, mute, archive and block', async ({ page }) => {
    const id = thread.conversation.id;
    const read = async () => {
      const res = await fetch(`${API}/messages/${id}`, { headers: thread.buyer.headers });
      expect(res.status).toBe(200);
      return res.json();
    };
    const call = (method, suffix) => page.waitForResponse((response) =>
      new URL(response.url()).pathname === `/api/messages/${id}${suffix}`
        && response.request().method() === method && response.ok());

    await signedInAs(page, thread.buyer.mobile);
    await page.goto(`/messages?c=${id}`);
    const ownerBubble = page.locator('.pc-bubble.them', { hasText: OWNER_MESSAGE });
    await expect(ownerBubble).toBeVisible();

    await ownerBubble.click({ button: 'right' });
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'DELETE' && r.url().includes(`/api/messages/${id}/items/`) && r.ok()),
      page.getByRole('menuitem', { name: 'Delete for me' }).click(),
    ]);
    await expect(ownerBubble).toHaveCount(0);
    expect((await read()).messages.some((m) => m.body === OWNER_MESSAGE), 'delete for me is per-account').toBe(false);

    const actions = page.getByRole('button', { name: 'Conversation actions' });
    await actions.click();
    await Promise.all([call('PATCH', '/state'), page.locator('.pc-menu').getByRole('button', { name: 'Mute', exact: true }).click()]);
    expect((await read()).muted).toBe(true);

    await actions.click();
    await Promise.all([call('POST', '/block'), page.locator('.pc-menu').getByRole('button', { name: 'Block', exact: true }).click()]);
    const ownerReply = await fetch(`${API}/messages/${id}/reply`, {
      method: 'POST',
      headers: await authHeaders(ACTORS.owner),
      body: JSON.stringify({ body: 'Are you still there?' }),
    });
    expect(ownerReply.status, 'a blocked counterparty cannot keep messaging').toBe(403);

    await actions.click();
    await Promise.all([call('PATCH', '/state'), page.locator('.pc-menu').getByRole('button', { name: 'Archive', exact: true }).click()]);
    expect((await read()).archived).toBe(true);
    await expect(page.getByRole('button', { name: /Archived \(\d+\)/ })).toBeVisible();
  });

  test('an old dashboard #messages link opens the canonical inbox', async ({ page }) => {
    await signedInAs(page, thread.buyer.mobile);
    const inbox = page.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/messages' && response.status() === 200,
    );
    await page.goto('/dashboard#messages');

    await page.waitForURL(/\/messages/);
    await inbox;
    await expect(page.locator('.pc-list-head h1')).toHaveText('Messages');
    await expect(page.locator('.pc-conv', { hasText: thread.propertyTitle })).toBeVisible();
  });
});

test.describe('Messages inbox — request threads (live API)', () => {
  const askForContact = async (request, buyer, message) => {
    const res = await request.post(`${API}/contacts/request`, {
      headers: buyer.headers,
      data: { propertyId: BANER_FLAT_ID, ...(message ? { message } : {}) },
    });
    expect(res.status()).toBe(200);
    const ownerHeaders = await authHeaders(ACTORS.owner);
    const inbox = await request.get(`${API}/me/contact-requests?size=100`, { headers: ownerHeaders });
    const row = (await inbox.json()).content.find((r) => r.propertyId === BANER_FLAT_ID && r.requester?.name === buyer.name);
    expect(row, 'the owner receives the request').toBeTruthy();
    return row.id;
  };

  test('a new account has no tabs and an empty list that explains where requests go', async ({ page, request }) => {
    const buyer = await actor(request, `Empty Inbox Buyer ${letterTag()}`);
    await signedInAs(page, buyer.mobile);
    await page.goto('/messages');
    await expect(page.locator('.pc-empty-list')).toContainText('No chats yet');
    await expect(page.locator('.pc-empty-list')).toContainText('Requests you send or receive show up here, and become chats once accepted.');
    await expect(page.getByRole('tab', { name: /^(Chats|Requests)$/ })).toHaveCount(0);
  });

  test('the owner sees a received request row, opens its thread, and Approve & chat swaps it for the real chat', async ({ page, request }) => {
    const buyer = await actor(request, `Thread Buyer ${letterTag()}`);
    const message = `Zztest thread note ${Date.now()}`;
    const requestId = await askForContact(request, buyer, message);
    const rowId = `request:contact:${requestId}`;

    await signedInAs(page, ACTORS.owner);
    await page.goto('/messages');
    const row = page.locator(`.pc-conv[data-conversation-id="${rowId}"]`);
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(row).toHaveAttribute('data-request-kind', 'contact');
    await expect(row).toHaveAttribute('data-request-box', 'received');
    await expect(row.locator('.pc-pill.req')).toHaveText('Request');
    await expect(row).toContainText(message);

    await row.click();
    const thread = page.getByTestId('request-thread');
    await expect(thread).toHaveAttribute('data-box', 'received');
    await expect(thread).toHaveAttribute('data-state', 'pending');
    await expect(thread.locator('.pc-bubble.them', { hasText: message })).toBeVisible();
    await expect(page.locator('.pc-input')).toHaveCount(0);
    await expect(thread.getByRole('button', { name: 'Decline' })).toBeVisible();
    const chip = thread.getByTestId('chat-propchip');
    await expect(chip).toBeVisible();
    await expect(chip.getByRole('link', { name: 'View listing' })).toHaveAttribute('href', `/property/${BANER_FLAT_ID}`);
    await expect(chip.getByRole('button', { name: 'Schedule visit' })).toHaveCount(0);

    await thread.getByRole('button', { name: 'Approve & chat' }).click();
    await expect(page).toHaveURL(/\/messages\?c=(?!request:)[^&]+/, { timeout: 20000 });
    await expect(page.locator('.pc-input')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('request-thread')).toHaveCount(0);
    await expect(page.locator(`.pc-conv[data-conversation-id="${rowId}"]`)).toHaveCount(0);

    const gate = await request.get(`${API}/contacts/status?propertyId=${BANER_FLAT_ID}`, { headers: buyer.headers });
    expect((await gate.json()).status, 'approving from the thread opens the gate').toBe('approved');
  });

  test('the owner can decline from the thread, and the row leaves the list', async ({ page, request }) => {
    const buyer = await actor(request, `Decline Thread Buyer ${letterTag()}`);
    const requestId = await askForContact(request, buyer);
    const rowId = `request:contact:${requestId}`;

    await signedInAs(page, ACTORS.owner);
    await page.goto(`/messages?c=${rowId}`);
    const thread = page.getByTestId('request-thread');
    await expect(thread).toHaveAttribute('data-kind', 'contact', { timeout: 20000 });
    await thread.getByRole('button', { name: 'Decline' }).click();
    await expect(page.locator(`.pc-conv[data-conversation-id="${rowId}"]`)).toHaveCount(0);
    await expect(page.getByTestId('request-thread')).toHaveCount(0);

    const gate = await request.get(`${API}/contacts/status?propertyId=${BANER_FLAT_ID}`, { headers: buyer.headers });
    expect((await gate.json()).status).toBe('declined');
  });

  test('the buyer sees a sent request thread, withdraws it, then clears it', async ({ page, request }) => {
    const buyer = await actor(request, `Sent Thread Buyer ${letterTag()}`);
    const requestId = await askForContact(request, buyer);
    const rowId = `request:contact:${requestId}`;

    await signedInAs(page, buyer.mobile);
    await page.goto('/messages');
    const row = page.locator(`.pc-conv[data-conversation-id="${rowId}"]`);
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(row).toHaveAttribute('data-request-box', 'sent');
    await expect(row.locator('.pc-req-pill')).toHaveText('Pending');

    await row.click();
    const thread = page.getByTestId('request-thread');
    await expect(thread).toHaveAttribute('data-box', 'sent');
    await expect(thread.locator('.pc-bubble.me')).toContainText('Could you share your contact details?');
    await expect(page.locator('.pc-input')).toHaveCount(0);
    await expect(thread.getByRole('button', { name: /^Remind/ })).toBeDisabled();
    const chip = thread.getByTestId('chat-propchip');
    await expect(chip.getByRole('link', { name: 'View listing' })).toHaveAttribute('href', `/property/${BANER_FLAT_ID}`);
    await expect(chip.getByRole('button', { name: 'Schedule visit' })).toBeVisible();

    await thread.getByRole('button', { name: 'Withdraw' }).click();
    await page.getByRole('button', { name: 'Keep request' }).click();
    await expect(thread).toHaveAttribute('data-state', 'pending');

    await thread.getByRole('button', { name: 'Withdraw' }).click();
    await expect(page.getByTestId('confirm-modal')).toContainText('Withdraw this request?');
    await page.getByTestId('confirm-modal-ok').click();
    await expect(thread).toHaveAttribute('data-state', 'withdrawn');
    await expect(thread).toContainText('You withdrew this request');
    await expect(row.locator('.pc-req-pill')).toHaveText('Withdrawn');

    const gate = await request.get(`${API}/contacts/status?propertyId=${BANER_FLAT_ID}`, { headers: buyer.headers });
    expect((await gate.json()).status).toBe('none');

    await thread.getByRole('button', { name: 'Clear' }).click();
    await expect(page.locator(`.pc-conv[data-conversation-id="${rowId}"]`)).toHaveCount(0);
  });

  const acceptedRequestThread = async (page, request, label) => {
    const buyer = await actor(request, `${label} ${letterTag()}`);
    const requestId = await askForContact(request, buyer);
    const ownerHeaders = await authHeaders(ACTORS.owner);
    const approved = await request.patch(`${API}/me/contact-requests/${requestId}`, { headers: ownerHeaders, data: { status: 'approved' } });
    expect(approved.status()).toBe(200);

    await signedInAs(page, buyer.mobile);
    await page.goto(`/messages?openProp=${BANER_FLAT_ID}`);
    const thread = page.getByTestId('request-thread');
    await expect(thread).toHaveAttribute('data-state', 'accepted', { timeout: 20000 });
    await expect(thread).toContainText('accepted your request');
    await expect(thread.getByRole('button', { name: 'Clear' })).toBeVisible();
    await thread.getByRole('button', { name: 'Open chat' }).click();
    await expect(page).toHaveURL(/\/messages\?c=(?!request:)[^&]+/, { timeout: 20000 });
    return requestId;
  };

  test('an accepted request shows Open chat from Sent, and ?openProp opens the request thread', async ({ page, request }) => {
    const requestId = await acceptedRequestThread(page, request, 'Accepted Thread Buyer');
    await expect(page.locator(`.pc-conv[data-conversation-id="request:contact:${requestId}"]`)).toHaveCount(0);
    await expect(page.locator('.pc-conv:not([data-request-kind])')).toHaveCount(1);
  });

  test('Open chat on an accepted request selects the real chat with its composer', async ({ page, request }) => {
    await acceptedRequestThread(page, request, 'Composer Thread Buyer');
    await expect(page.locator('.pc-input')).toBeVisible({ timeout: 20000 });
  });
  const ownerNotificationLink = async (request, buyerName) => {
    const res = await request.get(`${API}/notifications?size=20`, { headers: await authHeaders(ACTORS.owner) });
    expect(res.status()).toBe(200);
    return ((await res.json()).content ?? []).find((n) => n.type === 'contact.received' && n.body?.includes(buyerName))?.link;
  };

  test('a contact request notification carries the request thread link', async ({ request }) => {
    const buyer = await actor(request, `Notify Link Buyer ${letterTag()}`);
    const requestId = await askForContact(request, buyer);
    expect(await ownerNotificationLink(request, buyer.name)).toBe(`/messages?c=request:contact:${requestId}`);
  });

  test('tapping a contact request notification opens the request thread', async ({ page, request }) => {
    const buyer = await actor(request, `Notify Tap Buyer ${letterTag()}`);
    const requestId = await askForContact(request, buyer);
    await signedInAs(page, ACTORS.owner);
    await page.goto('/notifications');
    await expect(page.locator(`a[href="/messages?c=request:contact:${requestId}"]`)).toBeVisible({ timeout: 20000 });
  });
  test('?openProp selects the live chat even when the chat list loads after the sent requests', async ({ page, request }) => {
    const buyer = await actor(request, `Slow List Buyer ${letterTag()}`);
    const requestId = await askForContact(request, buyer);
    const ownerHeaders = await authHeaders(ACTORS.owner);
    const approved = await request.patch(`${API}/me/contact-requests/${requestId}`, { headers: ownerHeaders, data: { status: 'approved' } });
    expect(approved.status()).toBe(200);
    const opened = await request.post(`${API}/messages`, { headers: buyer.headers, data: { propertyId: BANER_FLAT_ID, body: 'Zztest slow list hello' } });
    expect(opened.status()).toBe(201);

    await signedInAs(page, buyer.mobile);
    await page.route(/\/api\/messages(\?.*)?$/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    });
    await page.goto(`/messages?openProp=${BANER_FLAT_ID}`);
    await expect(page.locator('.pc-input')).toBeVisible({ timeout: 20000 });
  });
  test('the chat search is hidden until the header icon opens it, and closing clears the query', async ({ page, request }) => {
    const buyer = await actor(request, `Search Toggle Buyer ${letterTag()}`);
    const requestId = await askForContact(request, buyer);
    const row = page.locator(`.pc-conv[data-conversation-id="request:contact:${requestId}"]`);

    await signedInAs(page, ACTORS.owner);
    await page.goto('/messages');
    await expect(row).toBeVisible({ timeout: 20000 });
    const toggle = page.getByTestId('msg-search-toggle');
    const input = page.getByRole('textbox', { name: 'Search conversations' });
    await expect(toggle).toHaveAttribute('aria-label', 'Open search');
    await expect(input).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', 'Close search');
    await expect(input).toBeFocused();
    await input.fill('zzz-no-such-conversation');
    await expect(row).toHaveCount(0);
    await input.fill(buyer.name);
    await expect(row).toBeVisible();
    await input.fill('zzz-no-such-conversation');

    await toggle.click();
    await expect(input).toHaveCount(0);
    await expect(row).toBeVisible();
    await toggle.click();
    await expect(input).toHaveValue('');
  });

  test('the old Requests tab link lands on the dashboard Requests panel', async ({ page, request }) => {
    const buyer = await actor(request, `Legacy Link Buyer ${letterTag()}`);
    await askForContact(request, buyer);

    await signedInAs(page, buyer.mobile);
    await page.goto('/messages?tab=requests&box=sent');
    await expect(page).toHaveURL(/\/dashboard\?tab=leads$/, { timeout: 20000 });
    await expect(page.getByTestId('requests-panel')).toBeVisible();
    await expect(page.getByTestId('request-card').first()).toHaveAttribute('data-box', 'sent');
  });
});