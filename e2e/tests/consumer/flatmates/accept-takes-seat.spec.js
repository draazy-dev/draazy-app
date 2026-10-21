import { test, expect } from '@playwright/test';
import { API, apiLogin, signedInAs, uniqueMobile } from '../../../helpers/liveAuth.js';
import { ACTORS } from '../../../fixtures/live.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';

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
  expect(res.status, await res.clone().text()).toBeLessThan(300);
}

async function askToJoin(groupId) {
  const { accessToken } = await apiLogin(uniqueMobile());
  const res = await fetch(`${API}/flatmates/groups/${groupId}/join`, {
    method: 'POST',
    headers: auth(accessToken),
    body: JSON.stringify({ share: 'solo', gender: 'female' }),
  });
  expect(res.status, await res.clone().text()).toBe(201);
  expect((await res.json()).status).toBe('pending');
}

test('accepting a group request adds the member and fills the seat; the next accept is refused', async ({ page }) => {
  const hostMobile = uniqueMobile();
  const { accessToken: hostToken } = await apiLogin(hostMobile);
  const title = `Accept seat ${Date.now().toString(36)}`;
  const created = await fetch(`${API}/flatmates/groups`, {
    method: 'POST',
    headers: auth(hostToken),
    body: JSON.stringify({
      title, name: 'Host', locality: 'Baner', rent: 30000,
      seats: 2, seatsOpen: 1, policy: 'women', role: 'tenant',
    }),
  });
  expect(created.status, await created.clone().text()).toBe(201);
  const group = await created.json();
  track('groups', group.id, hostToken);
  await approve(group.id);

  await askToJoin(group.id);
  await askToJoin(group.id);

  await signedInAs(page, hostMobile);
  await page.goto(`${BASE}/dashboard?tab=leads`);
  const cards = page.getByTestId('request-card').filter({ has: page.locator('[data-testid="request-kind"]', { hasText: 'Flatmate' }) });
  const accept = cards.getByRole('button', { name: 'Accept & chat', exact: true });
  await expect(accept).toHaveCount(2, { timeout: 15_000 });
  await accept.first().click();
  await expect(page.getByRole('alert')).toContainText('Request accepted', { timeout: 10_000 });
  const detail = async () => (await (await fetch(`${API}/flatmates/groups/${group.id}`, { headers: auth(hostToken) })).json()).item;
  await expect.poll(async () => {
    const g = await detail();
    return `${g.members.length}/${g.seatsOpen}`;
  }, { message: 'accept must add the member and take the seat', timeout: 10_000 }).toBe('2/0');

  // Accepting opens the chat, so the next request is decided from a fresh dashboard.
  await expect(page).toHaveURL(/\/messages\?c=/, { timeout: 20_000 });
  await page.goto(`${BASE}/dashboard?tab=leads`);
  await expect(accept).toHaveCount(1);
  await accept.first().click();
  await expect(page.getByText(/This group is full\./)).toBeVisible({ timeout: 10_000 });
  expect((await detail()).members).toHaveLength(2);

  await page.goto(`${BASE}/flatmates/group/${group.id}`);
  await expect(page.getByText('2 of 2 seats taken')).toBeVisible({ timeout: 20_000 });
});
