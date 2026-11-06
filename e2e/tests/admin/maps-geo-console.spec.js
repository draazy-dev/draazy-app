/** Maps console writes read back via `GET /bootstrap` `geo` from Node, not the writing browser.
 * Blacklist terms under `MIN_BLACKLIST_TERM` (2 chars) are stored but never published. */

import { test, expect, ACTORS } from '../../fixtures/live.js';
import { API, authHeaders } from '../../helpers/liveAuth.js';

/** Obviously synthetic, and long enough to survive `MIN_BLACKLIST_TERM`. */
const TERM = 'Zztestville';

/** Published geo policy as an anonymous visitor gets it: a bare Node `fetch` (no cookies or session), so the answer
 * cannot come from anything the page under test holds. */
async function publishedGeo() {
  const res = await fetch(`${API}/bootstrap`);
  if (!res.ok) throw new Error(`reading geo failed (${res.status})`);
  return (await res.json()).geo;
}

const publishedTerms = async () => (await publishedGeo()).blacklist.map((entry) => entry.term);

/** `settings.geo` is one row for the whole run; restore from `GET /admin/settings` because the `/bootstrap`
 * projection omits each blacklist entry's `note`, so restoring from it would delete those reasons. */
let before;

test.beforeEach(async () => {
  const res = await fetch(`${API}/admin/settings`, { headers: await authHeaders(ACTORS.admin) });
  if (!res.ok) throw new Error(`reading admin settings failed (${res.status})`);
  before = (await res.json())?.geo ?? {};
});

test.afterEach(async () => {
  const res = await fetch(`${API}/admin/settings`, {
    method: 'PUT',
    headers: await authHeaders(ACTORS.admin),
    body: JSON.stringify({
      geo: {
        // Arrays replace whole under the server's deep merge, so writing back the original list restores it;
        // objects do not — see `geo-policy.spec.js`.
        blacklist: before.blacklist ?? [],
        // Absent means enforced; restoring `false` would unfence locality search for later specs.
        enforceCityLimit: before.enforceCityLimit ?? true,
        servedDistricts: before.servedDistricts ?? ['Pune'],
      },
    }),
  });
  if (!res.ok) throw new Error(`restoring geo failed (${res.status})`);
});

/** The panel's save, awaited by its own request rather than by the UI settling. */
const settingsSaved = (page) => page.waitForResponse(
  // The `/api/` prefix matters: `/settings` alone also matches the page's own document request,
  // so the wait would resolve on navigation and race the fetch.
  (res) => res.url().includes('/api/admin/settings') && res.request().method() === 'PUT',
);

test.describe('the maps console writes geo policy to the server', () => {
  /* A write that never reaches the server still toasts "saved" and shows in the operator's list;
     only a read of `GET /bootstrap` outside the writing tab catches it. */
  test("a term blacklisted in the console is hidden for every visitor, not just in the operator's tab", async ({ page, login }) => {
    await login.asAdmin();
    await page.goto('/admin/settings?tab=maps');
    await expect(page.getByRole('heading', { name: /Blacklisted places/i })).toBeVisible();

    expect(await publishedTerms()).not.toContain(TERM);

    await page.getByLabel('Hide a place').fill(TERM);

    const saved = settingsSaved(page);
    await page.getByRole('option', { name: new RegExp(`Hide every name containing .${TERM}.`) }).click();
    expect((await saved).status()).toBe(200);

    // The panel agrees with itself, which is all the mock twin ever checked.
    await expect(page.getByText(TERM, { exact: true })).toBeVisible();

    await expect.poll(publishedTerms).toContain(TERM);
  });

  /* Seeded over the API so this test does not depend on the Add test above. */
  test('removing a term in the console takes it off the published policy', async ({ page, login }) => {
    const seeded = await fetch(`${API}/admin/settings`, {
      method: 'PUT',
      headers: await authHeaders(ACTORS.admin),
      body: JSON.stringify({
        geo: { blacklist: [{ id: 'bl-console-remove', term: TERM, note: 'seeded by maps-geo-console' }] },
      }),
    });
    expect(seeded.ok).toBe(true);
    expect(await publishedTerms()).toContain(TERM);

    await login.asAdmin();
    await page.goto('/admin/settings?tab=maps');

    const remove = page.getByRole('button', { name: `Remove ${TERM}` });
    await expect(remove).toBeVisible();

    const saved = settingsSaved(page);
    await remove.click();
    expect((await saved).status()).toBe(200);

    await expect(remove).toHaveCount(0);

    // Read back from outside the browser again. A panel that has dropped the row from its own React
    // state proves nothing about what the next visitor's suggestion box will filter.
    await expect.poll(publishedTerms).not.toContain(TERM);
  });

  /** One boolean, so assert it on the server: "saved" and "saved locally" look identical. */
  test('the search-limit switch is readable back from the server', async ({ page, login }) => {
    await login.asAdmin();
    await page.goto('/admin/settings?tab=maps');

    const cityLimit = page.getByRole('switch', { name: /Keep search inside served districts/i });
    await expect(cityLimit).toBeVisible();
    // The shipped policy fences searches; absent in the document reads as `true` on the client.
    await expect(cityLimit).toHaveAttribute('aria-checked', 'true');

    const off = settingsSaved(page);
    await cityLimit.click();
    expect((await off).status()).toBe(200);

    await expect(cityLimit).toHaveAttribute('aria-checked', 'false');
    // `enforceCityLimit` is published as an explicit `false`, not omitted: the client treats only that
    // as off, and omission means the panel was never opened.
    await expect.poll(async () => (await publishedGeo()).enforceCityLimit).toBe(false);

    const on = settingsSaved(page);
    await cityLimit.click();
    expect((await on).status()).toBe(200);

    await expect(cityLimit).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await publishedGeo()).enforceCityLimit).toBe(true);
  });

  /* Added districts carry their Google place id and viewport so pickers can search them; the console's
     add box needs live Google autocomplete, so the add is seeded over the API and the remove is clicked. */
  test('a district added to the served list is published with its area, and removing it in the console takes it off', async ({ page, login }) => {
    const satara = { name: 'Satara', placeId: 'ChIJ-e2e-satara', bounds: { north: 18.2, south: 17.1, east: 74.9, west: 73.5 } };
    const seeded = await fetch(`${API}/admin/settings`, {
      method: 'PUT',
      headers: await authHeaders(ACTORS.admin),
      body: JSON.stringify({ geo: { servedDistricts: ['Pune', satara] } }),
    });
    expect(seeded.status).toBe(200);
    await expect.poll(async () => (await publishedGeo()).servedDistricts).toEqual(['Pune', 'Satara']);
    expect((await publishedGeo()).districtAreas).toContainEqual(satara);

    await login.asAdmin();
    await page.goto('/admin/settings?tab=maps');
    const card = page.getByTestId('served-area');
    await expect(card.getByRole('list', { name: 'Served districts' }).getByRole('listitem')).toHaveText(['Pune', 'Satara']);
    await expect(card.getByRole('combobox', { name: 'Add a district' })).toBeVisible();

    const saved = settingsSaved(page);
    await card.getByRole('button', { name: 'Stop serving Satara' }).click();
    expect((await saved).status()).toBe(200);

    await expect(card.getByRole('list', { name: 'Served districts' }).getByRole('listitem')).toHaveText(['Pune']);
    // The last district cannot be dropped: an empty list would let no new place in anywhere.
    await expect(card.getByRole('button', { name: 'Stop serving Pune' })).toBeDisabled();
    await expect.poll(async () => (await publishedGeo()).servedDistricts).toEqual(['Pune']);
    expect((await publishedGeo()).districtAreas.map((a) => a.name)).toEqual(['Pune']);
  });

  test('the server refuses an empty or duplicated district list', async () => {
    for (const servedDistricts of [[], ['Pune', 'pune']]) {
      const res = await fetch(`${API}/admin/settings`, {
        method: 'PUT',
        headers: await authHeaders(ACTORS.admin),
        body: JSON.stringify({ geo: { servedDistricts } }),
      });
      expect(res.status).toBe(422);
    }
  });

  test('a refused district save tells the operator why instead of a generic retry', async ({ page, login }) => {
    const seeded = await fetch(`${API}/admin/settings`, {
      method: 'PUT',
      headers: await authHeaders(ACTORS.admin),
      body: JSON.stringify({ geo: { servedDistricts: ['Pune', 'Satara'] } }),
    });
    expect(seeded.status).toBe(200);
    await login.asAdmin();
    await page.goto('/admin/settings?tab=maps');
    const reason = "'geo.servedDistricts' needs each district named in 2 to 80 characters. Nothing was saved.";
    await page.route('**/api/admin/settings', (route) => (route.request().method() === 'PUT'
      ? route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ code: 'VALIDATION_FAILED', message: reason }) })
      : route.fallback()));

    await page.getByTestId('served-area').getByRole('button', { name: 'Stop serving Satara' }).click();

    await expect(page.getByText(reason)).toBeVisible();
    await expect(page.getByTestId('served-area').getByRole('list', { name: 'Served districts' }).getByRole('listitem'))
      .toHaveText(['Pune', 'Satara']);
  });

  /** The e2e lanes run with a demo Map ID, so the district map mounts without boundary outlines. */
  test('the district map mounts fail-soft beside real server settings', async ({ page, login, consoleErrors }) => {
    await login.asAdmin();
    await page.goto('/admin/settings?tab=maps');

    await expect(page.getByRole('heading', { name: /^Served districts/ })).toBeVisible();
    await expect(page.getByTestId('district-map')).toBeVisible();
    await expect(page.getByRole('heading', { name: /City coverage/i })).toHaveCount(0);

    expect(consoleErrors).toEqual([]);
  });
});
