import { test, expect } from '@playwright/test';
import { API, apiLogin, signedInAsNew, uniqueMobile } from '../../../helpers/liveAuth.js';
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
  expect(res.status).toBeLessThan(300);
}

const savedGender = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('draazyUser') || '{}').gender);

async function womenOnlyGroup() {
  const { accessToken } = await apiLogin(uniqueMobile(), { name: 'Gate Host' });
  const res = await fetch(`${API}/flatmates/groups`, {
    method: 'POST',
    headers: auth(accessToken),
    body: JSON.stringify({
      title: `Gender gate ${Date.now().toString(36)} in Baner`, locality: 'Baner',
      rent: 30000, deposit: 50000, seats: 3, seatsOpen: 2, policy: 'women', role: 'tenant',
    }),
  });
  const body = await res.text();
  expect(res.status, body).toBe(201);
  const group = JSON.parse(body);
  track('groups', group.id, accessToken);
  await approve(group.id);
  return group;
}

test.describe('women-only and men-only supply checks who is asking (live)', () => {
  test('a man cannot request a women-only group, and the server refuses it too', async ({ page }) => {
    const group = await womenOnlyGroup();
    const mobile = await signedInAsNew(page);
    let posts = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && /\/flatmates\/groups\/[^/]+\/join$/.test(r.url())) posts += 1; });

    await page.goto(`${BASE}/flatmates/group/${group.id}`);
    const ask = page.getByRole('button', { name: /Request to join/i }).filter({ visible: true }).first();
    await expect(ask).toBeVisible({ timeout: 20_000 });
    await ask.click();

    const sheet = page.getByTestId('gender-sheet');
    await expect(sheet).toContainText('This group is open to women only');
    await sheet.getByRole('button', { name: 'Man', exact: true }).click();
    await expect(page.getByRole('alert').last()).toContainText('open to women only, so your request can’t be sent');
    expect(posts, 'a mismatch is explained before anything is sent').toBe(0);

    const { accessToken } = await apiLogin(mobile);
    const direct = await fetch(`${API}/flatmates/groups/${group.id}/join`, {
      method: 'POST', headers: auth(accessToken), body: JSON.stringify({ gender: 'male' }),
    });
    expect(direct.status).toBe(422);
    expect((await direct.json()).message).toContain('open to women only');

    const me = await fetch(`${API}/auth/me`, { headers: auth(accessToken) });
    expect((await me.json()).gender).toBe('male');
    const stated = await fetch(`${API}/flatmates/groups/${group.id}/join`, {
      method: 'POST', headers: auth(accessToken), body: JSON.stringify({ gender: 'female' }),
    });
    expect(stated.status, 'the profile wins over what a request states').toBe(422);

    const second = await womenOnlyGroup();
    await page.goto(`/flatmates/group/${second.id}`);
    await expect.poll(() => savedGender(page)).toBe('male');
    await page.getByRole('button', { name: /Request to join/i }).filter({ visible: true }).first().click();
    await expect(page.getByRole('alert').last()).toContainText('open to women only');
    await expect(page.getByTestId('gender-sheet')).toHaveCount(0);
    expect(posts).toBe(0);
  });

  test('a woman states it once in the sheet and her request goes through', async ({ page }) => {
    const group = await womenOnlyGroup();
    const mobile = await signedInAsNew(page);

    await page.goto(`${BASE}/flatmates/group/${group.id}`);
    const ask = page.getByRole('button', { name: /Request to join/i }).filter({ visible: true }).first();
    await expect(ask).toBeVisible({ timeout: 20_000 });
    const sent = page.waitForResponse(
      (r) => /\/flatmates\/groups\/[^/]+\/join$/.test(r.url()) && r.request().method() === 'POST',
    );
    await ask.click();
    await page.getByTestId('gender-sheet').getByRole('button', { name: 'Woman', exact: true }).click();

    const response = await sent;
    expect(response.status()).toBe(201);
    expect(response.request().postDataJSON()).toMatchObject({ gender: 'female' });

    const { accessToken } = await apiLogin(mobile);
    const me = await fetch(`${API}/auth/me`, { headers: auth(accessToken) });
    expect((await me.json()).gender, 'the answer is saved to the profile').toBe('female');

    const second = await womenOnlyGroup();
    await page.goto(`/flatmates/group/${second.id}`);
    await expect.poll(() => savedGender(page)).toBe('female');
    const again = page.waitForResponse(
      (r) => /\/flatmates\/groups\/[^/]+\/join$/.test(r.url()) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /Request to join/i }).filter({ visible: true }).first().click();
    expect((await again).status()).toBe(201);
    await expect(page.getByTestId('gender-sheet')).toHaveCount(0);
  });

  test('a gender saved on another device is picked up instead of looping on the sheet', async ({ page }) => {
    const group = await womenOnlyGroup();
    const mobile = await signedInAsNew(page);
    const { accessToken } = await apiLogin(mobile);
    const saved = await fetch(`${API}/auth/me`, {
      method: 'PATCH', headers: auth(accessToken), body: JSON.stringify({ gender: 'female' }),
    });
    expect(saved.status).toBe(200);

    let stale = true;
    await page.route('**/auth/me', async (route) => {
      if (route.request().method() === 'PATCH') stale = false;
      if (!stale || route.request().method() !== 'GET') return route.continue();
      const res = await route.fetch();
      return route.fulfill({ response: res, json: { ...(await res.json()), gender: null } });
    });

    await page.goto(`${BASE}/flatmates/group/${group.id}`);
    const ask = page.getByRole('button', { name: /Request to join/i }).filter({ visible: true }).first();
    await expect(ask).toBeVisible({ timeout: 20_000 });
    const sent = page.waitForResponse(
      (r) => /\/flatmates\/groups\/[^/]+\/join$/.test(r.url()) && r.request().method() === 'POST',
    );
    await ask.click();
    await page.getByTestId('gender-sheet').getByRole('button', { name: 'Man', exact: true }).click();

    const response = await sent;
    expect(response.status()).toBe(201);
    expect(response.request().postDataJSON()).toMatchObject({ gender: 'female' });
    await expect(page.getByTestId('gender-sheet')).toHaveCount(0);
  });
});
