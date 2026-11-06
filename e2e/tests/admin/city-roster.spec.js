/** Launch state is a `cities` column read via `GET /bootstrap`, written only by `PATCH /admin/cities/{slug}`.
 * Needs backend :8081 (`local,e2e`); a missing roster must not drop the blacklist (fails open). */

import { test, expect } from '../../fixtures/live.js';
import { ACTORS } from '../../fixtures/live.js';
import { API, authHeaders } from '../../helpers/liveAuth.js';

/** The roster as the server tells it — never as the browser remembers it. */
async function roster() {
  const res = await fetch(`${API}/bootstrap`);
  if (!res.ok) throw new Error(`reading cities failed (${res.status})`);
  return (await res.json()).cities;
}

const liveness = async (slug) => (await roster()).find((c) => c.slug === slug)?.live;

/** Restores launched cities: the seed sets `live` on INSERT only, so the roster is shared across a live run. */
test.afterEach(async () => {
  for (const city of await roster()) {
    if (city.live !== (city.slug === 'pune')) {
      await fetch(`${API}/admin/cities/${city.slug}`, {
        method: 'PATCH',
        headers: await authHeaders(ACTORS.admin),
        body: JSON.stringify({ live: city.slug === 'pune' }),
      });
    }
  }
});

test.describe('the admin city roster is server-owned', () => {
  test('a missing roster does not un-hide blacklisted places', async ({ page, login }) => {
    await login.asAdmin();
    await test.step('a missing roster does not silently un-hide blacklisted places', async () => {
      // Serve `/bootstrap` with its `cities` section dropped and its `geo` section intact.
      await page.route('**/api/bootstrap', async (route) => {
        const res = await route.fetch();
        const { cities: _dropped, ...rest } = await res.json();
        await route.fulfill({ response: res, json: rest });
      });
      // Hide a place through the real settings document first.
      const res = await fetch(`${API}/admin/settings`, {
        method: 'PUT',
        headers: await authHeaders(ACTORS.admin),
        body: JSON.stringify({
          geo: { blacklist: [{ id: 'bl-roster-probe', term: 'Kharadi' }] },
        }),
      });
      expect(res.ok).toBe(true);

      try {
        await page.goto('/admin/settings?tab=maps');

        // The blacklist survived a missing roster: the geo section is applied on its own.
        await expect(page.getByText('Kharadi')).toBeVisible();

        // `loadGeoPolicy()`, not `geoPolicySettled()`: an `import()` in `evaluate` has a cold cache that settles
        // instantly from the built-ins, so the test would pass for the wrong reason.
        const blacklisted = await page.evaluate(async () => {
          const geoConfig = await import('/src/lib/geoConfig.js');
          await geoConfig.loadGeoPolicy();
          return geoConfig.isBlacklisted({ mainText: 'Kharadi', secondaryText: 'Pune' });
        });
        expect(blacklisted).toBe(true);
      } finally {
        await fetch(`${API}/admin/settings`, {
          method: 'PUT',
          headers: await authHeaders(ACTORS.admin),
          body: JSON.stringify({ geo: { blacklist: [] } }),
        });
      }
    });
  });

  test('the retired settings key is refused, so a stale console cannot write a dead launch flag', async () => {
    const res = await fetch(`${API}/admin/settings`, {
      method: 'PUT',
      headers: await authHeaders(ACTORS.admin),
      body: JSON.stringify({ geo: { cities: { Mumbai: { live: true } } } }),
    });

    expect(res.status).toBe(422);
    // The message has to name the replacement, or the operator is told "no" and nothing else.
    expect(JSON.stringify(await res.json())).toContain('/admin/cities/{slug}');

    // And the refusal was total: Mumbai is still where the roster left it.
    expect(await liveness('mumbai')).toBe(false);
  });
});

