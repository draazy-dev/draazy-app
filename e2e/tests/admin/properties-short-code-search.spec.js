import { ACTORS, expect, test } from '../../fixtures/live.js';
import { API, authHeaders } from '../../helpers/liveAuth.js';

const SEED_CODE = 'p5021';

async function search(request, q) {
  const res = await request.get(`${API}/admin/properties?q=${encodeURIComponent(q)}&size=10`, {
    headers: await authHeaders(ACTORS.admin),
  });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).content;
}

test('the admin queue search finds a listing by its short code, in any case', async ({ request }) => {
  for (const typed of [SEED_CODE, SEED_CODE.toUpperCase()]) {
    const rows = await search(request, typed);
    expect(rows.map((r) => r.slug), `"${typed}" must find the listing`).toContain(SEED_CODE);
  }
});

test('a short code that belongs to no listing finds nothing', async ({ request }) => {
  expect(await search(request, 'p0000000')).toEqual([]);
});
