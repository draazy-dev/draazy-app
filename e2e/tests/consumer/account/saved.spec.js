import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, authHeaders, uniqueMobile, signedInAs } from '../../../helpers/liveAuth.js';
import { signInSheet, verifyInSheet } from '../../../helpers/signInSheet.js';

const api = (path, headers, init = {}) => fetch(`${API}${path}`, { headers, ...init });

const rows = async (headers) => {
  const res = await api('/me/saved?size=100', headers);
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.content || body.items || [];
};

async function pickListings() {
  const res = await fetch(`${API}/properties?sort=newest&size=100`);
  expect(res.status).toBe(200);
  const body = await res.json();
  const all = body.content || body.items || body;
  const of = (deal) => all.filter((p) => p.deal === deal).slice(0, 2);
  const buy = of('buy');
  const rent = of('rent');
  expect(buy.length, 'the catalogue does not have two sale listings to shortlist').toBe(2);
  expect(rent.length, 'the catalogue does not have two rentals to shortlist').toBe(2);
  return { buy, rent };
}

/* `PUT /me/saved/{propId}` binds a UUID and the card rows carry a slug, so each id is resolved
   through the detail read the same way `propertyMapper` does for the browser. */
async function shortlist(headers, listings) {
  const uuids = [];
  for (const p of listings) {
    const detail = await fetch(`${API}/properties/${p.slug || p.id}`);
    expect(detail.status).toBe(200);
    const { id } = await detail.json();
    const put = await api(`/me/saved/${id}`, headers, { method: 'PUT' });
    expect(put.status, `could not shortlist ${p.slug}`).toBeLessThan(300);
    uuids.push(id);
  }
  return uuids;
}

async function actor() {
  const mobile = uniqueMobile();
  const headers = await authHeaders(mobile);
  expect(await rows(headers), 'a brand-new account already had a shortlist').toEqual([]);
  return { mobile, headers };
}

async function seedConsent(page) {
  await page.addInitScript(() => {
    localStorage.setItem('dz_cookie_consent_v1', JSON.stringify({
      necessary: true, functional: true, analytics: true, marketing: false, version: 1, ts: Date.now(),
    }));
  });
}

async function openSaved(page, mobile) {
  await seedConsent(page);
  await signedInAs(page, mobile);
  await page.goto('/saved');
}

test('a signed-out visitor gets the on-device shortlist and a sign-in prompt that opens the sheet in place', async ({ page }) => {
  await page.goto('/saved');
  await expect(page).not.toHaveURL(/\/signin/);
  await expect(page.getByRole('heading', { name: 'Saved properties', exact: true })).toBeVisible();
  await expect(page.getByText('Sign in to keep your shortlist on every device.')).toBeVisible();

  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(signInSheet(page)).toBeVisible();
  await expect(page.getByRole('dialog', { name: /sign in to see your saved homes/i })).toBeVisible();
  await expect(page).toHaveURL(/\/saved$/);

  await verifyInSheet(page, uniqueMobile());

  await expect(page).toHaveURL(/\/saved$/);
  await expect(page.getByText('Sign in to keep your shortlist on every device.')).toHaveCount(0);
});

test('the shortlist the page renders is the one the server holds, with no console errors', async ({ page, consoleErrors }) => {
  const { mobile, headers } = await actor();
  const { buy, rent } = await pickListings();
  await shortlist(headers, [...buy, ...rent]);

  await openSaved(page, mobile);

  await expect(page.getByText('Sign in to keep your shortlist on every device.')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Saved properties', exact: true })).toBeVisible();

  const tabs = page.locator('.saved-tabs .saved-tab');
  await expect(tabs).toHaveCount(4);
  await expect(page.locator('.saved-tabs')).toContainText('All');
  await expect(page.locator('.saved-tabs')).toContainText('Buy');
  await expect(page.locator('.saved-tabs')).toContainText('Rent');
  await expect(page.locator('.saved-tabs')).toContainText('Flatmates');

  await expect(page.locator('.property-card')).toHaveCount(4);
  await expect(page.getByText('4 homes')).toBeVisible();
  await page.getByRole('button', { name: /Buy/ }).click();
  await expect(page.locator('.property-card')).toHaveCount(2);
  for (const p of buy) await expect(page.getByRole('heading', { name: p.title })).toBeVisible();

  await page.getByRole('button', { name: /Rent/ }).click();
  await expect(page.locator('.property-card')).toHaveCount(2);
  for (const p of rent) await expect(page.getByRole('heading', { name: p.title })).toBeVisible();
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test('remove stages an undo without telling the server, then commits the unsave when it lapses', async ({ page }) => {
  const { mobile, headers } = await actor();
  const { buy } = await pickListings();
  const uuids = await shortlist(headers, buy);

  const deletes = [];
  page.on('request', (req) => {
    if (req.method() === 'DELETE' && /\/me\/saved\//.test(req.url())) deletes.push(req.url());
  });

  await openSaved(page, mobile);
  await expect(page.locator('.property-card')).toHaveCount(2);

  await page.getByRole('button', { name: 'Remove from saved' }).first().click();

  const undo = page.getByRole('button', { name: /Undo removing/i });
  await expect(undo).toBeFocused();
  expect(deletes, 'the removal reached the server while it was still meant to be undoable').toEqual([]);
  expect(await rows(headers), 'the shortlist shrank before the undo window closed').toHaveLength(2);

  await expect(page.locator('.property-card')).toHaveCount(1, { timeout: 15_000 });

  await expect
    .poll(async () => (await rows(headers)).length, { message: 'the card vanished but the server shortlist did not' })
    .toBe(1);
  expect(deletes, 'the commit sent something other than exactly one unsave').toHaveLength(1);

  const survivor = (await rows(headers))[0];
  const survivorId = survivor.propertyId || survivor.property?.id || survivor.id;
  const removed = uuids.find((u) => u !== survivorId);
  expect(removed, 'the row left on the server is not one of the two that were shortlisted').toBeTruthy();
  expect(deletes[0], 'the browser unsaved a different property than the one the server dropped').toContain(removed);
});

test('saved controls use scrolling underline tabs, themed sorting and direct delete on phone and desktop', async ({ page, consoleErrors }) => {
  const { mobile, headers } = await actor();
  const { buy, rent } = await pickListings();
  const listings = [...buy, ...rent];
  await shortlist(headers, listings);
  await openSaved(page, mobile);
  const cards = page.getByTestId('saved-card');
  await expect(cards).toHaveCount(4);
  await expect(page.getByText('Your favourites', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'More saved actions', exact: true })).toHaveCount(0);

  for (const width of [320, 440, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const strip = page.locator('.saved-tabs');
    await expect(strip).toHaveClass(/hscroll-row/);
    const tabs = strip.locator('.saved-tab');
    await expect(tabs).toHaveCount(4);
    const tops = await tabs.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
    await expect(tabs.first()).toHaveClass(/dz-detail-tab.*is-active/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const sort = page.getByRole('button', { name: 'Sort by', exact: true });
    await expect(sort).toHaveClass(/dz-dropdown__trigger/);
    const sortBox = await sort.boundingBox();
    const naturalWidth = await sort.evaluate((el) => {
      const clone = el.parentElement.cloneNode(true);
      clone.style.width = 'max-content';
      clone.style.position = 'absolute';
      clone.style.visibility = 'hidden';
      el.parentElement.parentElement.append(clone);
      const width = clone.getBoundingClientRect().width;
      clone.remove();
      return width;
    });
    expect(sortBox.width / naturalWidth).toBeCloseTo(1.5, 1);
    const rowBox = await sort.locator('..').locator('..').boundingBox();
    expect(sortBox.width).toBeLessThan(290);
    expect(Math.abs(sortBox.x + sortBox.width - rowBox.x - rowBox.width)).toBeLessThan(2);
    for (const [label, descending] of [['Price: Low to High', false], ['Price: High to Low', true]]) {
      await sort.click();
      const menu = page.getByRole('listbox', { name: 'Sort by', exact: true });
      await expect(menu).not.toHaveClass(/dz-dropdown__menu--sheet/);
      const menuBox = await menu.boundingBox();
      expect(menuBox.width).toBeLessThan(300);
      await page.getByRole('option', { name: label, exact: true }).click();
      await expect(sort).toContainText(label);
      const titles = await cards.locator('h3').allTextContents();
      expect(titles).toEqual(expect.arrayContaining(listings.map((p) => p.title)));
      const priceByTitle = new Map(listings.map((p) => [p.title, p.price]));
      const prices = titles.map((title) => priceByTitle.get(title));
      const expected = listings.map((p) => p.price).sort((a, b) => descending ? b - a : a - b);
      expect(prices).toEqual(expected);
    }

    const remove = cards.first().getByRole('button', { name: 'Remove from saved', exact: true });
    await expect(remove).toBeVisible();
    await remove.click();
    const undo = page.getByRole('button', { name: /Undo removing/i });
    await expect(undo).toBeFocused();
    await undo.click();
    await expect(cards).toHaveCount(4);
  }
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test('saved rooms, groups and flatmate posts open their own detail pages', async ({ page, login, consoleErrors }) => {
  const headers = await authHeaders(ACTORS.buyer);
  const response = await api('/me/flatmate-saves?size=100', headers);
  expect(response.status).toBe(200);
  const body = await response.json();
  const saved = body.content || body.items || [];
  const targets = saved.map((row) => ({
    id: row.id,
    kind: row.roomType || row.roomKind ? 'room' : row.members || row.seatsTotal != null ? 'group' : 'post',
  }));
  expect(new Set(targets.map((row) => row.kind))).toEqual(new Set(['room', 'group', 'post']));
  await seedConsent(page);
  await login.asBuyer();

  for (const width of [440, 1280]) {
    await page.setViewportSize({ width, height: 956 });
    for (const target of targets) {
      await page.goto('/saved');
      await page.getByRole('button', { name: /^Flatmates\b/ }).click();
      const path = `/flatmates/${target.kind}/${target.id}`;
      const link = page.locator(`.saved-row-link[href="${path}"]`);
      await expect(link).toBeVisible();
      const title = await link.locator('h3').innerText();
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    }
  }
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test('header saved count includes homes and flatmates and tracks confirmed removals', async ({ page, consoleErrors }) => {
  const { mobile, headers } = await actor();
  const { buy } = await pickListings();
  await shortlist(headers, buy);
  const sourceHeaders = await authHeaders(ACTORS.buyer);
  const response = await api('/me/flatmate-saves/keys', sourceHeaders);
  expect(response.status).toBe(200);
  const keys = await response.json();
  expect(keys.length).toBeGreaterThan(0);
  for (const { kind, id } of keys) {
    const saved = await api(`/me/flatmate-saves/${kind}/${id}`, headers, { method: 'PUT' });
    expect(saved.status).toBe(204);
  }
  const total = buy.length + keys.length;
  await openSaved(page, mobile);
  const cards = page.getByTestId('saved-card');
  await expect(cards).toHaveCount(total);
  const badge = page.locator('nav').getByRole('link', { name: 'Saved properties', exact: true }).locator('span');
  await expect(badge).toHaveText(String(total));
  await page.getByRole('button', { name: /^Flatmates\b/ }).click();
  await expect(cards).toHaveCount(keys.length);
  await cards.first().getByRole('button', { name: 'Remove from saved' }).click();
  const undo = page.getByRole('button', { name: /Undo removing/ });
  await expect(undo).toBeVisible();
  await expect(badge).toHaveText(String(total));
  await undo.click();
  await expect(cards).toHaveCount(keys.length);
  const link = cards.first().locator('.saved-row-link');
  const detailUrl = await link.getAttribute('href');
  await cards.first().getByRole('button', { name: 'Remove from saved' }).click();
  await expect(badge).toHaveText(String(total - 1), { timeout: 15000 });
  const [, kind, id] = detailUrl.match(/\/flatmates\/(room|post|group)\/([^/?#]+)/);
  const board = { room: ['rooms', 'r'], post: ['people', 's'], group: ['teams', 'g'] }[kind];
  await page.goto(`/flatmates?view=${board[0]}`);
  await page.locator(`[data-sf-id="${board[1]}:${id}"] .save-btn`).click();
  await expect(badge).toHaveText(String(total));
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test('visible tabs re-read saved homes created elsewhere', async ({ page, playwright }) => {
  const { mobile, headers } = await actor();
  const { buy } = await pickListings();
  await shortlist(headers, [buy[0]]);

  await openSaved(page, mobile);
  await expect(page.getByRole('heading', { name: buy[0].title })).toBeVisible();
  await expect(page.getByRole('heading', { name: buy[1].title })).toHaveCount(0);

  const apiContext = await playwright.request.newContext({ extraHTTPHeaders: headers });
  try {
    const detail = await apiContext.get(`${API}/properties/${buy[1].slug || buy[1].id}`);
    expect(detail.status()).toBe(200);
    const { id } = await detail.json();
    const put = await apiContext.put(`${API}/me/saved/${id}`);
    expect(put.status()).toBeLessThan(300);
  } finally {
    await apiContext.dispose();
  }

  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('heading', { name: buy[1].title })).toBeVisible();
});

test('the bell-plus action turns a saved home into a saved search on the server', async ({ page }) => {
  const { mobile, headers } = await actor();
  const { buy } = await pickListings();
  await shortlist(headers, buy);

  const posts = [];
  page.on('response', async (res) => {
    if (res.request().method() === 'POST' && /\/me\/saved-searches/.test(res.url())) {
      posts.push(`${res.status()} ${await res.text().catch(() => '<unreadable>')}`);
    }
  });

  await openSaved(page, mobile);
  await expect(page.locator('.property-card').first()).toBeVisible();
  await page.getByRole('button', { name: 'Create alert for similar properties' }).first().click();

  await expect(page.getByText(/Alert created/)).toBeVisible();

  await expect
    .poll(async () => {
      const res = await api('/me/saved-searches?size=50', headers);
      const body = await res.json();
      return (Array.isArray(body) ? body : body.content || body.items || []).length;
    }, {
      message: () => 'the toast said the alert was created but the server has no saved search; '
        + `POST responses seen: ${posts.length ? posts.join(' | ') : '<none — the page never called>'}`,
    })
    .toBeGreaterThan(0);
});

test('shows the empty state when the account has nothing saved', async ({ page }) => {
  const { mobile } = await actor();
  await openSaved(page, mobile);

  await expect(page.getByRole('heading', { name: 'No saved properties yet' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Browse Properties/ })).toBeVisible();
  await expect(page.locator('.saved-tabs .saved-tab')).toHaveCount(0);
});

const SAVED_CARD_KEYS = ['id', 'slug', 'title', 'deal', 'propertyType', 'bhk', 'price', 'area', 'locality', 'coverImage', 'available'];

test('the shortlist reads slim cards once, and alert rows carry no mobile', async ({ page }) => {
  const { mobile, headers } = await actor();
  const { buy } = await pickListings();
  await shortlist(headers, buy);
  const created = await api('/me/saved-searches', headers, {
    method: 'POST', body: JSON.stringify({ kind: 'listings', query: 'baner', filters: { deal: 'buy' } }),
  });
  expect(created.status).toBe(201);

  const cardReads = [];
  page.on('request', (req) => { if (/\/api\/me\/saved\?/.test(req.url())) cardReads.push(req.url()); });

  await openSaved(page, mobile);
  await expect(page.locator('.property-card')).toHaveCount(2);

  for (const row of await rows(headers)) {
    expect(Object.keys(row).filter((k) => !SAVED_CARD_KEYS.includes(k)), 'saved card carries extra keys').toEqual([]);
    expect(row.available).toBe(true);
  }
  const alerts = await (await api('/me/saved-searches', headers)).json();
  expect(alerts.length).toBeGreaterThan(0);
  for (const a of alerts) expect('mobile' in a, 'alert row carries mobile').toBe(false);

  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(1000);
  expect(cardReads, 'cards re-read with no new key').toHaveLength(1);
});

test('the listings grid reads no alert list or saved cards', async ({ page }) => {
  const { mobile } = await actor();
  const lazy = [];
  page.on('request', (req) => { if (/\/api\/me\/(saved-searches|saved\?)/.test(req.url())) lazy.push(req.url()); });
  await seedConsent(page);
  await signedInAs(page, mobile);
  await page.goto('/listings');
  await expect(page.locator('a[href^="/property/"]').first()).toBeVisible();
  await page.waitForTimeout(1000);
  expect(lazy).toEqual([]);
});
