/* Every staff list page carries the Date chips, and picking Today re-queries its list with days=1.
 * Which rows a window keeps is asserted per endpoint in the backend tests and in enquiries.spec.js. */
import { test, expect, ACTORS } from '../../fixtures/live.js';
import { authHeaders } from '../../helpers/liveAuth.js';

const PAGES = [
  { url: '/admin/properties', api: /\/api\/admin\/properties\?/ },
  { url: '/admin/users', api: /\/api\/users\?/, label: 'Joined' },
  { url: '/admin/reports?tab=reviews', api: /\/api\/admin\/reviews\?/ },
  { url: '/admin/erasure-requests', api: /\/api\/admin\/erasure-requests\?/, label: 'Filed' },
  { url: '/admin/error-log', api: /\/api\/admin\/error-log\?/ },
  { url: '/admin/integrations', api: /\/api\/admin\/integrations\/calls\?/ },
  { url: '/admin/finance?tab=transactions', api: /\/api\/admin\/finance\/transactions\?/ },
  { url: '/admin/help-feedback', api: /\/api\/admin\/help-feedback\?/ },
  { url: '/admin/home-loans', api: /\/api\/tickets\?/ },
  // A desk renders the ticket board instead of the request queue when its ticket tracking is switched on.
  { url: '/admin/legal', api: /\/api\/(service-requests\/queue|tickets)\?/ },
  { url: '/admin/rent-agreement', api: /\/api\/(service-requests\/queue|tickets)\?/ },
  { url: '/admin/support', api: /\/api\/admin\/support-tickets\?/ },
  { url: '/admin/kyc-review', api: /\/api\/moderation\/identity-reviews\?/ },
  { url: '/admin/referrals', api: /\/api\/referrals\?/ },
  { url: '/admin/refunds', api: /\/api\/admin\/refunds\?/ },
];

for (const { url, api, label = 'Date' } of PAGES) {
  test(`${url}: the Today chip re-queries the list for the IST day`, async ({ page, login, consoleErrors }) => {
    await login.asAdmin();
    const allRes = page.waitForResponse((r) => api.test(r.url()) && !new URL(r.url()).searchParams.has('days'));
    await page.goto(url);
    const all = await (await allRes).json();
    const date = page.getByRole('group', { name: label });
    await expect(date.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

    const [res] = await Promise.all([
      page.waitForResponse((r) => api.test(r.url()) && new URL(r.url()).searchParams.get('days') === '1'),
      date.getByRole('button', { name: 'Today' }).click(),
    ]);
    expect(res.status()).toBe(200);
    await expect(date.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
    const today = await res.json();
    if (typeof all.totalElements === 'number') expect(today.totalElements).toBeLessThanOrEqual(all.totalElements);

    // A server that ignores `days` answers 200 here, so this catches an endpoint not wired to it.
    const beyondCap = new URL(res.url());
    beyondCap.searchParams.set('days', '4000');
    const rejected = await fetch(beyondCap, { headers: await authHeaders(ACTORS.admin) });
    expect(rejected.status, `${beyondCap.pathname} must read days`).toBe(400);
    expect(consoleErrors).toHaveLength(0);
  });
}
