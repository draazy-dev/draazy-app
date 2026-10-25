import { test, expect } from '@playwright/test';
import { API, apiLogin, signedInAs, uniqueMobile } from '../../../helpers/liveAuth.js';
import { ACTORS } from '../../../fixtures/live.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
const track = flatmateCleanup(test);
const tag = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

async function askedGroup() {
  const hostMobile = uniqueMobile();
  const { accessToken: hostToken } = await apiLogin(hostMobile, { name: 'Vetting Host' });
  const created = await fetch(`${API}/flatmates/groups`, {
    method: 'POST',
    headers: auth(hostToken),
    body: JSON.stringify({ title: `Vibe check ${tag()}`, locality: 'Baner', rent: 30000, deposit: 50000, seats: 3, seatsOpen: 2, policy: 'any', role: 'tenant' }),
  });
  expect(created.status, await created.clone().text()).toBe(201);
  const group = await created.json();
  track('groups', group.id, hostToken);
  const { accessToken: admin } = await apiLogin(ACTORS.admin);
  const mod = await fetch(`${API}/admin/flatmates/${group.id}/moderation`, {
    method: 'PATCH', headers: auth(admin), body: JSON.stringify({ modStatus: 'live', note: 'e2e' }),
  });
  expect(mod.status, await mod.clone().text()).toBeLessThan(300);

  const { accessToken: seekerToken } = await apiLogin(uniqueMobile(), { name: 'Vetting Seeker' });
  const joined = await fetch(`${API}/flatmates/groups/${group.id}/join`, {
    method: 'POST', headers: auth(seekerToken), body: JSON.stringify({ share: 'solo', message: 'Hi, I work from home and cook a lot.' }),
  });
  expect(joined.status, await joined.clone().text()).toBe(201);
  const ask = await joined.json();
  return { group, hostMobile, hostToken, seekerToken, ask };
}

const detail = async (token, id) => (await (await fetch(`${API}/flatmates/groups/${id}`, { headers: auth(token) })).json()).item;
const pairChat = async (token, groupId) => (await (await fetch(`${API}/messages?size=100`, { headers: auth(token) })).json())
  .content.find((c) => c.flatmateTargetId === groupId && !c.group) ?? null;

test('a mixed group join waits for the host, who chats with the requester first and then accepts them in', async ({ page }) => {
  const { group, hostMobile, hostToken, seekerToken, ask } = await askedGroup();
  expect(ask.status).toBe('pending');
  const before = await detail(hostToken, group.id);
  expect(before.seatsOpen, 'a pending ask holds no seat').toBe(2);

  const early = await fetch(`${API}/messages/flatmate-requests/${ask.id}`, { method: 'POST', headers: auth(seekerToken), body: '{}' });
  expect(early.status, 'only the host can open the vetting chat').toBe(404);

  await signedInAs(page, hostMobile);
  await page.goto(`${BASE}/dashboard?tab=leads`);
  const card = page.getByTestId('request-card').filter({ hasText: group.title });
  await expect(card).toHaveCount(1, { timeout: 15_000 });
  await expect(card.getByRole('button', { name: 'Accept', exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Chat first' }).click();

  await expect(page).toHaveURL(/\/messages\?c=/, { timeout: 15_000 });
  const input = page.locator('.pc-input');
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill('Hey! Early riser or night owl?');
  await input.press('Enter');
  await expect(page.locator('.pc-bubble.me').last()).toContainText('Early riser or night owl?');

  const seekerChat = await pairChat(seekerToken, group.id);
  expect(seekerChat, 'the requester sees the host\'s chat').not.toBeNull();
  const reply = await fetch(`${API}/messages/${seekerChat.id}/reply`, {
    method: 'POST', headers: auth(seekerToken), body: JSON.stringify({ body: 'Early riser, quiet evenings.' }),
  });
  expect(reply.status, await reply.clone().text()).toBe(201);
  await expect(page.locator('.pc-bubble.them').getByText('Early riser, quiet evenings.')).toBeVisible({ timeout: 15_000 });
  expect((await detail(hostToken, group.id)).members, 'chatting does not admit anyone').toHaveLength(before.members.length);

  await page.goto(`${BASE}/dashboard?tab=leads`);
  await expect(card).toHaveCount(1, { timeout: 15_000 });
  await card.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('in your group', { timeout: 10_000 });
  await expect.poll(async () => {
    const g = await detail(hostToken, group.id);
    return `${g.members.length}/${g.seatsOpen}`;
  }, { timeout: 10_000 }).toBe(`${before.members.length + 1}/1`);
});

test('on a 390px phone the Messages request thread offers Chat first beside Accept and Decline without sideways scroll', async ({ page }) => {
  const { group, hostMobile, hostToken } = await askedGroup();
  await page.setViewportSize({ width: 390, height: 844 });
  await signedInAs(page, hostMobile);
  await page.goto(`${BASE}/messages`);
  const row = page.locator('.pc-conv[data-request-kind="flatmate"][data-request-box="received"]').filter({ hasText: group.title });
  await row.click({ timeout: 15_000 });

  const thread = page.getByTestId('request-thread');
  await expect(thread).toHaveAttribute('data-state', 'pending');
  await expect(thread).toContainText('Chat first to check the vibe');
  for (const name of ['Chat first', 'Accept', 'Decline']) {
    const box = await thread.getByRole('button', { name, exact: true }).boundingBox();
    expect(box.x + box.width, `${name} fits the screen`).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await thread.getByRole('button', { name: 'Chat first', exact: true }).click();
  await expect(page.locator('.pc-input')).toBeVisible({ timeout: 15_000 });
  expect(await pairChat(hostToken, group.id)).not.toBeNull();
});
