import { test, expect } from '@playwright/test';
import { API, apiLogin, signedInAs, uniqueMobile } from '../../../helpers/liveAuth.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { openFlatmates } from '../../../helpers/app.js';
import { istInDays } from '../../../helpers/availability.js';

const track = flatmateCleanup(test);
const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
const putStyle = (token, answers) => fetch(`${API}/me/living-style`, { method: 'PUT', headers: auth(token), body: JSON.stringify({ answers }) });

async function seekerPost(token) {
  const res = await fetch(`${API}/flatmates/posts`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({ gender: 'female', age: 25, occupation: 'Analyst', budget: 17000, localities: ['Baner'], moveIn: istInDays(28), flatPref: 'women', roomPref: 'private', note: 'Shared vibes coverage' }),
  });
  expect(res.status, 'seeding a seeker post').toBe(201);
  const post = await res.json();
  track('posts', post.id, token);
  return post;
}

const feed = async (token, qs = '') => (await fetch(`${API}/flatmates/feed?tab=people&size=100${qs}`, token ? { headers: auth(token) } : undefined)).json();

test.describe('LIVE: flatmate shared vibes and Home tiles', () => {
  test('a card shows the top two answers the viewer shares with its poster, and nothing the viewer does not share', async ({ page }) => {
    test.slow();
    const author = await apiLogin(uniqueMobile(), { name: 'Shared Seeker' });
    expect((await putStyle(author.accessToken, { sleep: 2, food: 0, smoking: 2, pets: 1 })).status).toBe(200);
    const post = await seekerPost(author.accessToken);

    const viewer = uniqueMobile();
    const v = await apiLogin(viewer);
    expect((await putStyle(v.accessToken, { sleep: 2, food: 0, smoking: 0, pets: 1 })).status).toBe(200);

    const signedIn = await feed(v.accessToken);
    expect(signedIn.sharedVibes[`post:${post.id}`], 'top two shared, in priority order, and nothing the viewer does not share').toEqual([{ key: 'sleep', answer: 2 }, { key: 'food', answer: 0 }]);

    const guest = await feed(null);
    expect(guest.sharedVibes ?? {}, 'a guest gets no shared vibes').toEqual({});

    await signedInAs(page, viewer);
    await openFlatmates(page, '?view=people&vibe=sleep:2');
    const card = page.locator(`[data-sf-id="s:${post.id}"]`);
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByTestId('shared-vibes')).toHaveText('Both night owls · Both veg');
  });

  test('a viewer with fewer than three answers and a guest see no shared-vibes line', async ({ page }) => {
    const author = await apiLogin(uniqueMobile(), { name: 'Quiet Seeker' });
    expect((await putStyle(author.accessToken, { sleep: 2, food: 0, smoking: 2 })).status).toBe(200);
    const post = await seekerPost(author.accessToken);

    const viewer = uniqueMobile();
    expect((await putStyle((await apiLogin(viewer)).accessToken, { sleep: 2, food: 0 })).status).toBe(200);
    await signedInAs(page, viewer);
    await openFlatmates(page, '?view=people');
    await expect(page.locator('[data-sf-id^="s:"]').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('shared-vibes')).toHaveCount(0);
    expect((await feed((await apiLogin(viewer)).accessToken)).sharedVibes?.[`post:${post.id}`]).toBeUndefined();
  });

  test('Home shows one tile per board case with the live counts from the bootstrap pulse, and each tile opens its tab', async ({ page }) => {
    const seen = [];
    page.on('request', (r) => { if (/\/api\/(bootstrap|flatmates\/(feed|pulse))/.test(r.url())) seen.push(new URL(r.url()).pathname); });
    await page.goto('/');
    const tiles = page.getByTestId('flatmates-tiles');
    await tiles.scrollIntoViewIfNeeded();
    await expect(tiles.locator('[data-tile]')).toHaveCount(3);

    const pulse = (await (await fetch(`${API}/bootstrap`)).json()).flatmatePulse;
    for (const tab of ['move-in', 'people', 'teams']) {
      const count = Number(await tiles.locator(`[data-tile="${tab}"] [data-testid="tile-count"]`).innerText().then((s) => s.replace(/,/g, '')));
      expect(Number.isInteger(count), `${tab} count is a number`).toBe(true);
      expect(count, `${tab} count matches the pulse`).toBe(pulse.tabs[tab]);
    }
    expect(seen.filter((p) => p.endsWith('/flatmates/feed')), 'tiles add no feed request').toHaveLength(0);

    await tiles.locator('[data-tile="teams"]').click();
    await expect(page).toHaveURL(/\/flatmates\?view=teams/);
  });
});
