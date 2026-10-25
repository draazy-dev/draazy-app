import { test, expect } from '@playwright/test';
import { API, apiLogin, signedInAs, uniqueMobile } from '../../../helpers/liveAuth.js';
import { ACTORS } from '../../../fixtures/live.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { roomBasics } from '../../../helpers/roomWizard.js';
import { withSocietyId } from '../../../helpers/liveSociety.js';
/* Accept is verified by reading `GET /me/flatmate-requests` from an independent API client, not by
   the optimistic UI flip — a handler that dropped the write would still hide the button. */

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
const track = flatmateCleanup(test);

async function approve(id) {
  const { accessToken } = await apiLogin(ACTORS.admin);
  const res = await fetch(`${API}/admin/flatmates/${id}/moderation`, {
    method: 'PATCH',
    headers: auth(accessToken),
    body: JSON.stringify({ modStatus: 'live', note: 'e2e' }),
  });
  expect(res.status, `approve ${id}: ${await res.clone().text()}`).toBeLessThan(300);
}

test('host sees a seeker\'s room interest in the dashboard, and Accept persists to the server', async ({ page }) => {
  const hostMobile = uniqueMobile();
  const { accessToken: hostToken } = await apiLogin(hostMobile);

  const society = `Inbox Host ${Date.now().toString(36)}`;
  const roomRes = await fetch(`${API}/flatmates/rooms`, {
    method: 'POST',
    headers: auth(hostToken),
    body: JSON.stringify({
      ...(await roomBasics(hostToken)),
      ...(await withSocietyId(hostToken, { society })),
      roomType: 'Private room',
      locality: 'Baner',
      rentShare: 15000,
      deposit: 30000,
      bhk: '2',
      attachedBath: 'attached',
      furnishing: 'semi',
      hostRole: 'owner',
    }),
  });
  const roomBody = await roomRes.text();
  expect(roomRes.status, roomBody).toBe(201);
  const room = JSON.parse(roomBody);
  track('rooms', room.id, hostToken);

  await approve(room.id);

  const seekerMobile = uniqueMobile();
  const { accessToken: seekerToken } = await apiLogin(seekerMobile);

  const interestRes = await fetch(`${API}/flatmates/rooms/${room.id}/interest`, {
    method: 'POST',
    headers: auth(seekerToken),
    body: JSON.stringify({ message: 'I am interested in this room', share: 'bring' }),
  });
  expect(interestRes.status, await interestRes.clone().text()).toBeLessThan(300);
  // --- Browser: sign the host in and open the Requests panel ---
  await signedInAs(page, hostMobile);
  await page.goto(`${BASE}/dashboard?tab=leads`);
  // --- Assert the request renders as a flatmate card carrying the room's society name ---
  const card = page.getByTestId('request-card').filter({ hasText: society });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toHaveAttribute('data-kind', 'flatmate');
  await expect(card.getByTestId('request-kind')).toHaveText('Flatmate');
  await expect(card.getByTestId('request-direction')).toHaveText('Received');
  await expect(card.getByTestId('request-share')).toHaveText('Coming as 2');
  await expect(page.getByRole('tab', { name: /^Flatmate/ }).locator('.dz-count')).toHaveText('1');
  await page.getByRole('tab', { name: /^Number requests/ }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole('tab', { name: /^Flatmate/ }).click();
  await expect(card).toBeVisible();
  // --- Accept and prove it reaches the server, then lands in the chat ---
  await card.getByRole('button', { name: 'Accept & chat' }).click();
  // Poll API with a fresh client so browser state cannot satisfy the assertion.
  const { accessToken: freshHostToken } = await apiLogin(hostMobile);
  await expect
    .poll(async () => {
      const res = await fetch(`${API}/me/flatmate-requests?size=100`, {
        headers: auth(freshHostToken),
      });
      expect(res.status).toBe(200);
      const row = (await res.json()).content.find((r) => r.targetId === room.id);
      return row?.status ?? 'missing';
    }, { message: 'Accept must reach the server, not just flip the button', timeout: 15_000 })
    .toBe('accepted');

  await expect(page).toHaveURL(/\/messages\?c=/, { timeout: 15_000 });
  await expect(page.locator('.pc-input')).toBeVisible({ timeout: 15_000 });
});

test('a room request thread, and the chat it opens once accepted, both show the room as a card linking to the room post', async ({ page }) => {
  const { accessToken: hostToken } = await apiLogin(uniqueMobile());
  const society = `Chip Room ${Date.now().toString(36)}`;
  const roomRes = await fetch(`${API}/flatmates/rooms`, {
    method: 'POST',
    headers: auth(hostToken),
    body: JSON.stringify({
      ...(await roomBasics(hostToken)),
      ...(await withSocietyId(hostToken, { society })),
      roomType: 'Private room', locality: 'Baner', rentShare: 15000, deposit: 30000, bhk: '2',
      attachedBath: 'attached', furnishing: 'semi', hostRole: 'owner',
    }),
  });
  const room = await roomRes.json();
  expect(roomRes.status, JSON.stringify(room)).toBe(201);
  track('rooms', room.id, hostToken);
  await approve(room.id);

  const seekerMobile = uniqueMobile();
  const { accessToken: seekerToken } = await apiLogin(seekerMobile);
  const interestRes = await fetch(`${API}/flatmates/rooms/${room.id}/interest`, {
    method: 'POST', headers: auth(seekerToken), body: JSON.stringify({ message: 'Is this room still free?' }),
  });
  expect(interestRes.status, await interestRes.clone().text()).toBeLessThan(300);

  await signedInAs(page, seekerMobile);
  await page.goto(`${BASE}/messages`);
  const row = page.locator('.pc-conv[data-request-kind="flatmate"]').filter({ hasText: society });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  const chip = page.getByTestId('request-thread').getByTestId('chat-propchip');
  await expect(chip).toContainText(society);
  await expect(chip).toContainText('₹15,000/mo');
  await expect(chip).toContainText('Baner');
  await expect(chip.locator('img')).toBeVisible();
  await expect(chip.getByRole('link', { name: 'View listing' })).toHaveAttribute('href', `/flatmates/room/${room.id}`);
  await expect(chip.getByRole('button', { name: 'Schedule visit' })).toHaveCount(0);

  const asks = await (await fetch(`${API}/me/flatmate-requests?size=100`, { headers: auth(hostToken) })).json();
  const ask = asks.content.find((r) => r.targetId === room.id);
  const accepted = await fetch(`${API}/me/flatmate-requests/${ask.id}`, {
    method: 'PATCH', headers: auth(hostToken), body: JSON.stringify({ decision: 'accepted' }),
  });
  expect(accepted.status, await accepted.clone().text()).toBe(200);

  await page.reload();
  await row.click();
  await page.getByTestId('request-thread').getByRole('button', { name: 'Open chat' }).click();
  await expect(page.locator('.pc-input')).toBeVisible({ timeout: 15_000 });
  const liveChip = page.locator('.pc-thread').getByTestId('chat-propchip');
  await expect(liveChip).toContainText(society);
  await expect(liveChip).toContainText('₹15,000/mo');
  await expect(liveChip.getByRole('link', { name: 'View listing' })).toHaveAttribute('href', `/flatmates/room/${room.id}`);
  await expect(liveChip.getByRole('button', { name: 'Schedule visit' })).toHaveCount(0);
});

async function askedRoom(society) {
  const hostMobile = uniqueMobile();
  const { accessToken: hostToken } = await apiLogin(hostMobile);
  const roomRes = await fetch(`${API}/flatmates/rooms`, {
    method: 'POST',
    headers: auth(hostToken),
    body: JSON.stringify({
      ...(await roomBasics(hostToken)),
      ...(await withSocietyId(hostToken, { society })),
      roomType: 'Private room', locality: 'Baner', rentShare: 15000, deposit: 30000, bhk: '2',
      attachedBath: 'attached', furnishing: 'semi', hostRole: 'owner',
    }),
  });
  const room = await roomRes.json();
  expect(roomRes.status, JSON.stringify(room)).toBe(201);
  track('rooms', room.id, hostToken);
  await approve(room.id);

  const { accessToken: seekerToken } = await apiLogin(uniqueMobile());
  const interestRes = await fetch(`${API}/flatmates/rooms/${room.id}/interest`, {
    method: 'POST', headers: auth(seekerToken), body: JSON.stringify({ message: 'Is this room still free?' }),
  });
  expect(interestRes.status, await interestRes.clone().text()).toBeLessThan(300);
  const asks = await (await fetch(`${API}/me/flatmate-requests?size=100`, { headers: auth(hostToken) })).json();
  return { room, hostMobile, hostToken, seekerToken, ask: asks.content.find((r) => r.targetId === room.id) };
}

const roomChat = async (token, roomId) => {
  const res = await fetch(`${API}/messages?size=100`, { headers: auth(token) });
  expect(res.status).toBe(200);
  return (await res.json()).content.find((c) => c.flatmateTargetId === roomId) ?? null;
};

test('accepting from the dashboard Action Center opens the chat in both inboxes, and the host can message first', async ({ page }) => {
  const society = `Center Room ${Date.now().toString(36)}`;
  const { room, hostMobile, hostToken, seekerToken, ask } = await askedRoom(society);

  await signedInAs(page, hostMobile);
  await page.goto(`${BASE}/dashboard`);
  const action = page.getByTestId('action-center').getByTestId('action-item').filter({ hasText: society });
  await expect(action).toHaveCount(1, { timeout: 15_000 });
  const decided = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/me/flatmate-requests/${ask.id}`
    && r.request().method() === 'PATCH' && r.status() === 200);
  await action.getByRole('button', { name: 'Accept' }).click();
  await decided;

  await expect.poll(() => roomChat(hostToken, room.id).then((c) => c?.id ?? null), { timeout: 15_000 }).not.toBeNull();
  const hostChat = await roomChat(hostToken, room.id);
  const seekerChat = await roomChat(seekerToken, room.id);
  expect(seekerChat?.id, 'the seeker sees the same thread the host does').toBe(hostChat.id);

  await page.goto(`${BASE}/messages?c=${hostChat.id}`);
  const input = page.locator('.pc-input');
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill('Hi, the room is yours to see');
  await input.press('Enter');
  await expect(page.locator('.pc-bubble.me').last()).toContainText('Hi, the room is yours to see');
});

test('a host who accepted without opening the chat still finds the seeker in Messages and can open it', async ({ page }) => {
  const society = `Late Chat ${Date.now().toString(36)}`;
  const { room, hostMobile, hostToken, seekerToken, ask } = await askedRoom(society);
  const accepted = await fetch(`${API}/me/flatmate-requests/${ask.id}`, {
    method: 'PATCH', headers: auth(hostToken), body: JSON.stringify({ decision: 'accepted' }),
  });
  expect(accepted.status, await accepted.clone().text()).toBe(200);
  expect(await roomChat(hostToken, room.id), 'no chat exists before anyone opens it').toBeNull();

  await signedInAs(page, hostMobile);
  await page.goto(`${BASE}/messages`);
  const row = page.locator('.pc-conv[data-request-kind="flatmate"][data-request-box="received"]').filter({ hasText: society });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.locator('.pc-req-pill')).toHaveText('Accepted');
  await row.click();
  const thread = page.getByTestId('request-thread');
  await expect(thread).toHaveAttribute('data-state', 'accepted');
  await expect(thread).not.toContainText('Accepting opens the chat.');
  await thread.getByRole('button', { name: 'Open chat' }).click();

  const input = page.locator('.pc-input');
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill('Happy to show you the room');
  await input.press('Enter');
  await expect(page.locator('.pc-bubble.me').last()).toContainText('Happy to show you the room');
  await expect(row).toHaveCount(0);
  expect((await roomChat(seekerToken, room.id))?.id).toBe(new URL(page.url()).searchParams.get('c'));
});

for (const [label, viewport] of [['web', { width: 1280, height: 800 }], ['phone', { width: 360, height: 800 }]]) {
  test.describe(label, () => {
    test.use({ viewport });
    test('a room with no seats left refuses a new ask, and the seeker is told why', async ({ page }) => {
      const { accessToken: hostToken } = await apiLogin(uniqueMobile());
      const roomRes = await fetch(`${API}/flatmates/rooms`, {
        method: 'POST',
        headers: auth(hostToken),
        body: JSON.stringify({
          ...(await roomBasics(hostToken)),
          ...(await withSocietyId(hostToken, { society: `Full Room ${Date.now().toString(36)}` })),
          roomType: 'Private room', locality: 'Baner', rentShare: 15000, deposit: 30000, bhk: '2',
          attachedBath: 'attached', furnishing: 'semi', hostRole: 'owner',
        }),
      });
      const room = await roomRes.json();
      expect(roomRes.status, JSON.stringify(room)).toBe(201);
      track('rooms', room.id, hostToken);
      await approve(room.id);
      const closed = await fetch(`${API}/flatmates/rooms/${room.id}/seats`, {
        method: 'PATCH', headers: auth(hostToken), body: JSON.stringify({ seatsOpen: 0 }),
      });
      expect(closed.status, await closed.clone().text()).toBeLessThan(300);

      await signedInAs(page, uniqueMobile());
      await page.goto(`${BASE}/flatmates/room/${room.id}`);
      await expect(page.getByText('Filled').first()).toBeVisible({ timeout: 15_000 });
      const asked = page.waitForResponse((r) => r.url().includes(`/flatmates/rooms/${room.id}/interest`), { timeout: 15_000 });
      await page.getByRole('button', { name: 'Send interest' }).filter({ visible: true }).first().click();
      expect((await asked).status()).toBe(409);
      await expect(page.getByText('This room is full right now.')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: 'Send interest' }).filter({ visible: true }).first()).toBeEnabled();
    });
  });
}
