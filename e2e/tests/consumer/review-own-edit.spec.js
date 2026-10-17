import { test, expect } from '../../fixtures/live.js';
import { signedInAsNew } from '../../helpers/liveAuth.js';

const OWNER_ID = '3ad0171b-3206-53e2-b6dc-732bf4e1b44c';

const reveal = (page) => page.evaluate(() => {
  document.querySelectorAll('.reveal,.fade-up,.fade-in').forEach((el) => el.classList.add('visible'));
});

const reviewWrite = (page, method) => page.waitForResponse((r) =>
  r.request().method() === method && /\/api\/reviews\//.test(r.url()), { timeout: 15_000 });

/* Owner and property reviews need a deal or tenancy to post, so these two surfaces get a synthetic
   own review in the list and a mocked write; the server half is ReviewAuthorEditTest. */
const OWN = {
  id: '00000000-0000-4000-8000-00000000e2e1',
  author: 'Test Member',
  rating: 4,
  body: 'My earlier review',
  categories: {},
  recommend: true,
  createdAt: new Date().toISOString(),
  mine: true,
};

async function injectOwnReview(page, listGlob) {
  await page.route(listGlob, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const res = await route.fetch();
    const json = await res.json();
    return route.fulfill({ response: res, json: { ...json, content: [OWN, ...json.content] } });
  });
  const writes = [];
  await page.route(`**/api/reviews/${OWN.id}`, (route) => {
    const req = route.request();
    writes.push({ method: req.method(), body: req.postDataJSON() });
    return req.method() === 'DELETE'
      ? route.fulfill({ status: 204 })
      : route.fulfill({ json: { ...OWN, ...req.postDataJSON() } });
  });
  return writes;
}

/* Minting answers 422 in this env (Places quota), so pick a seeded society;
   the last unrated one keeps clear of society-rating.spec, which takes the first. */
async function seededSociety(request) {
  const body = await request.get('/api/societies?size=100').then((r) => r.json());
  const unrated = body.content.filter((s) => Number(s.reviewCount) === 0);
  return (unrated.at(-1) || body.content.at(-1)).slug;
}

test.beforeEach(async ({ page }) => {
  await signedInAsNew(page);
});

test('society: the author edits, then deletes, their own review and can rate again', async ({ page, request }) => {
  await page.goto(`/society/${await seededSociety(request)}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  await reveal(page);

  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const composer = page.getByTestId('society-review-composer');
  await composer.getByRole('button', { name: '4 star', exact: true }).click();
  await composer.locator('textarea').fill('Quiet and well kept');
  const posted = reviewWrite(page, 'POST');
  await composer.getByRole('button', { name: 'Post review' }).click();
  expect((await posted).status()).toBe(201);

  const edit = page.getByRole('button', { name: 'Edit your review' });
  await expect(edit).toBeVisible({ timeout: 15_000 });
  await edit.click();
  await expect(composer.locator('textarea')).toHaveValue('Quiet and well kept');
  await composer.getByRole('button', { name: '2 star', exact: true }).click();
  const updated = reviewWrite(page, 'PUT');
  await composer.getByRole('button', { name: 'Update review' }).click();
  const put = await updated;
  expect(put.status()).toBe(200);
  expect((await put.json()).rating).toBe(2);
  await expect(page.getByText('Your review is updated.')).toBeVisible();
  await expect(composer).toHaveCount(0);

  await edit.click();
  page.once('dialog', (d) => d.accept());
  const deleted = reviewWrite(page, 'DELETE');
  await composer.getByRole('button', { name: 'Delete' }).click();
  expect((await deleted).status()).toBe(204);
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Your review is deleted.')).toBeVisible();
});

test('locality: the own review carries Edit and Delete, and the composer returns after a delete', async ({ page }) => {
  await page.goto('/locality/kothrud');
  const input = page.locator('#locality-review-input');
  await expect(input).toBeVisible({ timeout: 15_000 });
  await reveal(page);
  await input.fill('Good schools nearby');
  const posted = reviewWrite(page, 'POST');
  await page.getByTestId('locality-review-composer').getByRole('button', { name: 'Post review' }).click();
  expect((await posted).status()).toBe(201);

  const bar = page.getByTestId('own-review-bar');
  await expect(bar).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('locality-review-composer')).toHaveCount(0);

  await bar.getByRole('button', { name: 'Edit' }).click();
  await expect(input).toHaveValue('Good schools nearby');
  await input.fill('Good schools, heavy traffic');
  const updated = reviewWrite(page, 'PUT');
  await page.getByRole('button', { name: 'Update review' }).click();
  expect((await updated).status()).toBe(200);
  await expect(page.getByText('Good schools, heavy traffic')).toBeVisible({ timeout: 15_000 });

  page.once('dialog', (d) => d.accept());
  const deleted = reviewWrite(page, 'DELETE');
  await bar.getByRole('button', { name: 'Delete' }).click();
  expect((await deleted).status()).toBe(204);
  await expect(page.getByTestId('locality-review-composer')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Good schools, heavy traffic')).toHaveCount(0);
});

test('owner: Edit pre-fills the composer and sends a PUT; Delete asks first and sends a DELETE', async ({ page }) => {
  const writes = await injectOwnReview(page, `**/api/reviews/owner/${OWNER_ID}*`);
  await page.goto(`/owner/${OWNER_ID}`);
  const bar = page.getByTestId('own-review-bar');
  await expect(bar).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('owner-review-composer')).toHaveCount(0);

  await bar.getByRole('button', { name: 'Edit' }).click();
  const composer = page.getByTestId('owner-review-composer');
  await expect(composer.locator('textarea')).toHaveValue(OWN.body);
  await composer.getByRole('button', { name: '3 star', exact: true }).click();
  await composer.locator('textarea').fill('Edited owner review');
  await composer.getByRole('button', { name: 'Update review' }).click();
  await expect(page.getByText('Your review is updated.')).toBeVisible();
  expect(writes[0]).toMatchObject({ method: 'PUT', body: { rating: 3, body: 'Edited owner review' } });

  page.once('dialog', (d) => d.dismiss());
  await bar.getByRole('button', { name: 'Delete' }).click();
  expect(writes).toHaveLength(1);
  page.once('dialog', (d) => d.accept());
  await bar.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Your review is deleted.')).toBeVisible();
  expect(writes[1]).toMatchObject({ method: 'DELETE' });
});

test('property: Edit opens the composer pre-filled, and Delete sends a DELETE', async ({ page }) => {
  const writes = await injectOwnReview(page, '**/api/properties/*/reviews');
  await page.goto('/property/p5013?tab=amenities', { waitUntil: 'networkidle' });
  await reveal(page);
  const bar = page.getByTestId('own-review-bar');
  await expect(bar).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Edit your review' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit your review' });
  await expect(dialog.locator('textarea')).toHaveValue(OWN.body);
  await dialog.getByRole('button', { name: '1 star', exact: true }).click();
  await dialog.getByRole('button', { name: 'Update review' }).click();
  await expect(page.getByText('Your review is updated.')).toBeVisible();
  expect(writes[0]).toMatchObject({ method: 'PUT', body: { rating: 1, body: OWN.body, recommend: true } });

  page.once('dialog', (d) => d.accept());
  await bar.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Your review is deleted.')).toBeVisible();
  expect(writes[1]).toMatchObject({ method: 'DELETE' });
});
