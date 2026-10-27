import { test, expect } from '@playwright/test';
import { API, apiLogin, signedInAs, uniqueMobile } from '../../../helpers/liveAuth.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { flatmateTab, openFlatmates, postAsSolo } from '../../../helpers/app.js';
import { trackErrors } from '../../../helpers/console.js';

const track = flatmateCleanup(test);
const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
const KEYS = ['tidy', 'food', 'sleep', 'wfh', 'guests', 'visitors', 'smoking', 'drinks', 'pets', 'bills', 'family', 'quiet'];
const ALL_STRICT = Object.fromEntries(KEYS.map((k) => [k, 0]));

const putStyle = (token, answers) => fetch(`${API}/me/living-style`, { method: 'PUT', headers: auth(token), body: JSON.stringify({ answers }) });

async function seekerPost(token) {
  const res = await fetch(`${API}/flatmates/posts`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({ gender: 'female', age: 25, occupation: 'Analyst', budget: 17000, localities: ['Baner'], moveIn: '2026-12-01', flatPref: 'women', roomPref: 'private', note: 'Living style coverage' }),
  });
  expect(res.status, 'seeding a seeker post').toBe(201);
  const post = await res.json();
  track('posts', post.id, token);
  return post;
}

test.describe('LIVE: flatmates living style', () => {
  test('the answers are stored once on the profile, validated, and cleared by an empty save', async () => {
    const { accessToken } = await apiLogin(uniqueMobile());
    expect((await putStyle(accessToken, { tidy: 0, food: 2, sleep: 1 })).status).toBe(200);
    const read = await (await fetch(`${API}/me/living-style`, { headers: auth(accessToken) })).json();
    expect(read.answers).toEqual({ tidy: 0, food: 2, sleep: 1 });

    expect((await putStyle(accessToken, { tidy: 3 })).status, 'out of range').toBe(400);
    expect((await putStyle(accessToken, { colour: 1 })).status, 'unknown question').toBe(400);

    expect((await putStyle(accessToken, {})).status).toBe(200);
    const cleared = await (await fetch(`${API}/me/living-style`, { headers: auth(accessToken) })).json();
    expect(cleared.answers).toEqual({});
  });

  test('a viewer who answers on the board sees a match on the author’s post and a side-by-side on its page', async ({ page }) => {
    test.slow();
    const errors = trackErrors(page);
    const author = await apiLogin(uniqueMobile(), { name: 'Style Author' });
    expect((await putStyle(author.accessToken, ALL_STRICT)).status).toBe(200);
    const post = await seekerPost(author.accessToken);

    const viewer = uniqueMobile();
    await signedInAs(page, viewer);
    await openFlatmates(page, '?view=people');
    await expect(flatmateTab(page, 'people')).toHaveAttribute('aria-current', 'page');

    await page.getByTestId('ls-open').click();
    const sheet = page.getByTestId('ls-sheet');
    await expect(sheet).toBeVisible();
    for (const k of KEYS) await sheet.locator(`[data-q="${k}"] button[data-v="0"]`).click();
    await expect(sheet.getByTestId('ls-progress')).toHaveText('12 of 12 answered');
    const saved = page.waitForResponse((r) => r.url().endsWith('/me/living-style') && r.request().method() === 'PUT');
    await page.getByTestId('ls-save').click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByTestId('ls-entry')).toHaveAttribute('data-answered', '12');
    await expect(page.getByTestId('ls-entry-sub')).toHaveText(/^All set/);

    const { accessToken } = await apiLogin(viewer);
    const feed = await (await fetch(`${API}/flatmates/feed?tab=people&size=100`, { headers: auth(accessToken) })).json();
    expect(feed.matches?.[`post:${post.id}`], 'identical answers score 100').toBe(100);

    await page.goto(`/flatmates/post/${post.id}`);
    const section = page.getByTestId('ls-section');
    await expect(section).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('style-match').first()).toHaveText(/100% match/);
    await expect(section.locator('[data-cmp="same"]')).toHaveCount(12);
    expect(errors, `console errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  test('room cards carry the match below the photo, like flatmate and team cards', async ({ page }) => {
    await signedInAs(page, '9876500002');
    await openFlatmates(page);
    await expect(flatmateTab(page, 'move-in')).toHaveAttribute('aria-current', 'page');
    const chips = page.locator('[data-sf-id^="r:"] [data-testid="style-match"]');
    await expect(chips.first()).toBeVisible({ timeout: 20_000 });
    const belowPhoto = await chips.evaluateAll((els) => els.map((el) => {
      const photo = el.closest('[data-sf-id]').querySelector('img');
      return el.getBoundingClientRect().top >= photo.getBoundingClientRect().bottom;
    }));
    expect(belowPhoto.every(Boolean), 'no match chip sits on a room photo').toBe(true);
  });

  test('a guest sees three tabs, the optional entry, and a sign-in prompt instead of anyone’s answers', async ({ page }) => {
    const author = await apiLogin(uniqueMobile(), { name: 'Style Author' });
    await putStyle(author.accessToken, ALL_STRICT);
    const post = await seekerPost(author.accessToken);

    await openFlatmates(page, '?view=team-up');
    await expect(flatmateTab(page, 'people')).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveURL(/view=people/);
    for (const key of ['move-in', 'people', 'teams']) await expect(flatmateTab(page, key)).toBeVisible();
    await flatmateTab(page, 'teams').click();
    await expect(page.getByTestId('sf-tab-hint')).toHaveText(/rent a whole flat together/);
    await expect(page.getByTestId('ls-entry')).toHaveAttribute('data-answered', '0');
    await expect(page.getByTestId('ls-entry-sub')).toHaveText(/12 quick taps/);

    expect((await fetch(`${API}/flatmates/post/${post.id}/living-style`)).status, 'answers are signed-in only').toBe(401);
    await page.goto(`/flatmates/post/${post.id}`);
    await expect(page.getByTestId('ls-section-guest')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('ls-section')).toHaveCount(0);
  });

  test('the request form shows the questions open, and a tap saves to the profile', async ({ page }) => {
    const mobile = uniqueMobile();
    await signedInAs(page, mobile);
    await openFlatmates(page);
    await postAsSolo(page);
    const inline = page.getByTestId('ls-inline');
    await expect(inline).toBeVisible();
    await expect(inline.getByTestId('ls-questions')).toBeVisible();
    const saved = page.waitForResponse((r) => r.url().endsWith('/me/living-style') && r.request().method() === 'PUT');
    await inline.locator('[data-q="food"] button[data-v="0"]').click();
    expect((await saved).status()).toBe(200);

    const { accessToken } = await apiLogin(mobile);
    const read = await (await fetch(`${API}/me/living-style`, { headers: auth(accessToken) })).json();
    expect(read.answers).toEqual({ food: 0 });
  });

  test('a viewer sees only the answers they also gave, and fewer than three gets an invitation', async ({ page }) => {
    const author = await apiLogin(uniqueMobile(), { name: 'Style Author' });
    await putStyle(author.accessToken, ALL_STRICT);
    const post = await seekerPost(author.accessToken);
    const viewer = uniqueMobile();
    const v = await apiLogin(viewer);
    expect((await putStyle(v.accessToken, { tidy: 0, food: 1 })).status).toBe(200);
    const two = await (await fetch(`${API}/flatmates/post/${post.id}/living-style`, { headers: auth(v.accessToken) })).json();
    expect(two.answers, 'two answers unlock nothing').toEqual({});
    expect(two.match).toBeNull();

    await signedInAs(page, viewer);
    await page.goto(`/flatmates/post/${post.id}`);
    await expect(page.getByTestId('ls-section-add')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('ls-section')).toHaveCount(0);

    expect((await putStyle(v.accessToken, { tidy: 0, food: 1, sleep: 2 })).status).toBe(200);
    await page.reload();
    const section = page.getByTestId('ls-section');
    await expect(section.locator('[data-q]')).toHaveCount(3, { timeout: 20_000 });
    await expect(section.locator('[data-cmp="same"]')).toHaveCount(1);
    await expect(section.locator('[data-cmp="close"]')).toHaveCount(1);
    await expect(section.locator('[data-cmp="differs"]')).toHaveCount(1);
    await expect(page.getByTestId('style-match').first()).toHaveText(/50% match/);
  });

  test('on a phone the sheet floats over the page, tall and with Save in view, from the board and a detail page', async ({ page }) => {
    const author = await apiLogin(uniqueMobile(), { name: 'Style Author' });
    await putStyle(author.accessToken, ALL_STRICT);
    const post = await seekerPost(author.accessToken);
    await page.setViewportSize({ width: 390, height: 844 });
    await signedInAs(page, uniqueMobile());

    const expectFullSheet = async () => {
      const dialog = page.getByRole('dialog', { name: "What's your vibe?" });
      await expect(dialog).toBeVisible();
      await expect(page.getByTestId('ls-save')).toBeInViewport({ ratio: 1 });
      const box = await dialog.boundingBox();
      expect(box.height, 'sheet uses most of the screen').toBeGreaterThan(844 * 0.6);
      expect(box.y).toBeGreaterThanOrEqual(0);
      await page.getByRole('button', { name: 'Not now' }).click();
      await expect(dialog).toHaveCount(0);
    };

    await openFlatmates(page);
    await page.getByTestId('ls-open').click();
    await expectFullSheet();

    await page.goto(`/flatmates/post/${post.id}`);
    await page.getByTestId('ls-section-add').click();
    await expectFullSheet();
  });
});
