import { test, expect } from '@playwright/test';
import { API, apiLogin, signedInAs, uniqueMobile } from '../../../helpers/liveAuth.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { openFlatmateFilters, openFlatmates, postAsSolo } from '../../../helpers/app.js';

const track = flatmateCleanup(test);
const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
const putStyle = (token, answers) => fetch(`${API}/me/living-style`, { method: 'PUT', headers: auth(token), body: JSON.stringify({ answers }) });
const grid = (page) => page.locator('#sf-desktop-filters');
const chip = (page, key, v) => grid(page).locator(`[data-q="${key}"] button[data-v="${v}"]`);

async function seekerPost(token) {
  const res = await fetch(`${API}/flatmates/posts`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({ gender: 'female', age: 25, occupation: 'Analyst', budget: 17000, localities: ['Baner'], moveIn: '2026-12-01', flatPref: 'women', roomPref: 'private', note: 'Vibe filter coverage' }),
  });
  expect(res.status, 'seeding a seeker post').toBe(201);
  const post = await res.json();
  track('posts', post.id, token);
  return post;
}

const vibeParams = (r) => new URL(r.url()).searchParams.getAll('vibe');

test.describe('LIVE: flatmates vibe filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('a guest is told to sign in and gets no vibe chips', async ({ page }) => {
    await openFlatmates(page, '?view=people');
    await openFlatmateFilters(page);
    await expect(grid(page).getByTestId('vibe-filter-guest')).toContainText('Sign in to filter by vibe');
    await expect(grid(page).getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(grid(page).getByTestId('vibe-filter')).toHaveCount(0);
    await expect(grid(page).locator('[data-q] button')).toHaveCount(0);
  });

  test('a viewer with fewer than three answers is asked for more before any vibe chip unlocks', async ({ page }) => {
    const mobile = uniqueMobile();
    expect((await putStyle((await apiLogin(mobile)).accessToken, { food: 1, smoking: 0 })).status).toBe(200);
    await signedInAs(page, mobile);
    await openFlatmates(page, '?view=people');
    await openFlatmateFilters(page);

    await expect(grid(page).getByTestId('vibe-filter-hint')).toHaveText(/Answer 3 questions to filter by vibe/, { timeout: 15_000 });
    await expect(chip(page, 'food', 0)).toBeDisabled();
  });

  test('a signed-in viewer can only filter on the questions they answered, and is pointed to the rest', async ({ page }) => {
    const mobile = uniqueMobile();
    expect((await putStyle((await apiLogin(mobile)).accessToken, { food: 1, smoking: 0, drinks: 1 })).status).toBe(200);
    await signedInAs(page, mobile);
    await openFlatmates(page, '?view=people');
    await openFlatmateFilters(page);

    await expect(chip(page, 'food', 0)).toBeEnabled({ timeout: 15_000 });
    await expect(chip(page, 'smoking', 2)).toBeEnabled();
    await expect(chip(page, 'pets', 1)).toBeDisabled();
    await expect(chip(page, 'sleep', 0)).toBeDisabled();
    await expect(grid(page).getByTestId('vibe-filter-hint')).toBeVisible();

    await grid(page).getByTestId('vibe-filter-hint').getByRole('button').click();
    await expect(page.getByRole('dialog', { name: "What's your vibe?" })).toBeVisible();
  });

  test('Veg only shows the vegetarian author and drops the non-veg one, and the chip clears with the filters', async ({ page }) => {
    test.slow();
    const veg = await apiLogin(uniqueMobile(), { name: 'Veg Seeker' });
    const nonVeg = await apiLogin(uniqueMobile(), { name: 'Meat Seeker' });
    expect((await putStyle(veg.accessToken, { food: 0 })).status).toBe(200);
    expect((await putStyle(nonVeg.accessToken, { food: 2 })).status).toBe(200);
    const vegPost = await seekerPost(veg.accessToken);
    const nonVegPost = await seekerPost(nonVeg.accessToken);

    const viewer = uniqueMobile();
    const v = await apiLogin(viewer);
    expect((await putStyle(v.accessToken, { food: 1, smoking: 1, pets: 1 })).status).toBe(200);

    const api = async (qs) => (await (await fetch(`${API}/flatmates/feed?tab=people&size=100${qs}`, { headers: auth(v.accessToken) })).json()).content.map((x) => x.id);
    const filtered = await api('&vibe=food:0');
    expect(filtered, 'vegetarian author kept').toContain(vegPost.id);
    expect(filtered, 'non-veg author dropped').not.toContain(nonVegPost.id);
    expect(await api('&vibe=food:0&vibe=food:2'), 'OR within a question').toEqual(expect.arrayContaining([vegPost.id, nonVegPost.id]));

    await signedInAs(page, viewer);
    await openFlatmates(page, '?view=people');
    await openFlatmateFilters(page);
    const sent = page.waitForRequest((r) => r.url().includes('/flatmates/feed') && vibeParams(r).includes('food:0'));
    await chip(page, 'food', 0).click();
    await sent;
    await expect(chip(page, 'food', 0)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => new URL(page.url()).searchParams.get('vibe')).toBe('food:0');
    await expect(page.locator(`[data-sf-id="s:${vegPost.id}"]`)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(`[data-sf-id="s:${nonVegPost.id}"]`)).toHaveCount(0);

    await expect(page.getByRole('button', { name: /^Filters 1$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(chip(page, 'food', 0)).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => new URL(page.url()).searchParams.get('vibe')).toBeNull();
  });

  test('an old ?habits=vegetarian link lands on the Veg only vibe chip and rewrites the URL', async ({ page }) => {
    const mobile = uniqueMobile();
    expect((await putStyle((await apiLogin(mobile)).accessToken, { food: 1, smoking: 0, pets: 1 })).status).toBe(200);
    await signedInAs(page, mobile);
    await openFlatmates(page, '?view=people&habits=vegetarian');
    await openFlatmateFilters(page);
    await expect(chip(page, 'food', 0)).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    await expect.poll(() => new URL(page.url()).searchParams.get('vibe')).toBe('food:0');
    expect(new URL(page.url()).searchParams.get('habits')).toBeNull();
  });

  test('old Non-smoker and Pet-friendly links map to the smoking and pets chips', async ({ page }) => {
    const mobile = uniqueMobile();
    expect((await putStyle((await apiLogin(mobile)).accessToken, { food: 1, smoking: 0, pets: 1 })).status).toBe(200);
    await signedInAs(page, mobile);
    await openFlatmates(page, '?view=people&habits=Non-smoker,Pet-friendly');
    await openFlatmateFilters(page);
    await expect(chip(page, 'smoking', 0)).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    await expect(chip(page, 'pets', 1)).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 'pets', 2)).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 'pets', 0)).toHaveAttribute('aria-pressed', 'false');
  });

  test('the seeker form has no Lifestyle picker and shows the vibe questions open', async ({ page }) => {
    await signedInAs(page, uniqueMobile());
    await openFlatmates(page);
    await postAsSolo(page);
    const inline = page.getByTestId('ls-inline');
    await expect(inline).toBeVisible();
    await expect(inline.getByTestId('ls-questions')).toBeVisible();
    await expect(inline.getByTestId('ls-inline-progress')).toHaveText('0 of 12 answered');
    await expect(page.getByText('Lifestyle preferences')).toHaveCount(0);
  });
});
