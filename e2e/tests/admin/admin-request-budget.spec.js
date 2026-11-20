// Request-count guards for cold back-office loads: one public and one personal bootstrap, the help index not the
// article bodies, one users read, and one batched duplicates check for the whole Places queue.
import { test, expect } from '../../fixtures/live.js';
import { API, authHeaders, uniqueMobile } from '../../helpers/liveAuth.js';

function recordGets(page) {
  const seen = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' || !r.url().includes('/api/')) return;
    const url = new URL(r.url());
    seen.push(url.pathname + url.search);
  });
  return {
    withPath: (path) => seen.filter((k) => k.split('?')[0] === path),
    matching: (re) => seen.filter((k) => re.test(k.split('?')[0])),
  };
}

test('a cold dashboard boots once and reads the help index, not the article bodies', async ({ page, login, consoleErrors }) => {
  await login.asAdmin();
  const gets = recordGets(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.waitForTimeout(1200);

  expect(gets.withPath('/api/bootstrap')).toHaveLength(1);
  expect(gets.withPath('/api/me/bootstrap')).toHaveLength(1);
  expect(gets.withPath('/api/admin/help/staff/index')).toHaveLength(1);
  expect(gets.withPath('/api/admin/help/staff')).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('a cold users page reads the directory once', async ({ page, login }) => {
  await login.asAdmin();
  const gets = recordGets(page);
  await page.goto('/admin/users');
  await expect(page.getByTestId('queue-row').first()).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(800);

  const reads = gets.withPath('/api/users');
  expect(reads, JSON.stringify(reads)).toHaveLength(1);
});

test('the Places duplicates tab checks its whole queue in one request', async ({ page, login, consoleErrors }) => {
  const name = `Batchcheck Heights ${String(Date.now()).slice(-7)}`;
  const minted = await fetch(`${API}/societies`, {
    method: 'POST',
    headers: { ...(await authHeaders(uniqueMobile())), 'content-type': 'application/json' },
    body: JSON.stringify({ name, placeId: `e2e-${name}`.replace(/[^A-Za-z0-9_-]/g, '-'), localitySlug: 'wakad', lat: 18.5989, lng: 73.7629 }),
  });
  expect(minted.status).toBeLessThan(300);
  const { slug } = await minted.json();

  await login.asAdmin();
  const gets = recordGets(page);
  await page.goto('/admin/places?tab=duplicates');
  await expect(page.getByRole('heading', { name: 'Places', exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('queue-row').first()).toBeVisible();
  await expect(page.getByText('Checking…')).toHaveCount(0, { timeout: 20000 });
  await page.waitForTimeout(500);

  const batch = gets.withPath('/api/admin/society-candidates/duplicates');
  expect(batch, JSON.stringify(batch)).toHaveLength(1);
  expect(new URL(batch[0], API).searchParams.getAll('slugs')).toContain(slug);
  expect(gets.matching(/^\/api\/admin\/society-candidates\/[^/]+\/duplicates$/)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
