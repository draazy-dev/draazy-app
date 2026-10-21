import { test, expect } from '@playwright/test';
import { API, apiLogin, signedInAs, uniqueMobile, uploadedListingPhotos } from '../../../helpers/liveAuth.js';
import { ACTORS } from '../../../fixtures/live.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
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
      ...(await withSocietyId(hostToken, { society })),
      roomType: 'Private room',
      locality: 'Baner',
      rentShare: 15000,
      bhk: '2',
      attachedBath: 'attached',
      furnishing: 'semi',
      hostRole: 'owner',
      photos: await uploadedListingPhotos(hostToken),
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
    body: JSON.stringify({ message: 'I am interested in this room' }),
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

for (const [label, viewport] of [['web', { width: 1280, height: 800 }], ['phone', { width: 360, height: 800 }]]) {
  test.describe(label, () => {
    test.use({ viewport });
    test('a room with no seats left refuses a new ask, and the seeker is told why', async ({ page }) => {
      const { accessToken: hostToken } = await apiLogin(uniqueMobile());
      const roomRes = await fetch(`${API}/flatmates/rooms`, {
        method: 'POST',
        headers: auth(hostToken),
        body: JSON.stringify({
          ...(await withSocietyId(hostToken, { society: `Full Room ${Date.now().toString(36)}` })),
          roomType: 'Private room', locality: 'Baner', rentShare: 15000, bhk: '2',
          attachedBath: 'attached', furnishing: 'semi', hostRole: 'owner',
          photos: await uploadedListingPhotos(hostToken),
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
