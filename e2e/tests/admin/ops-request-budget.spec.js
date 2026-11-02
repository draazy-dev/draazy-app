// Ops console guards: a forbidden desk redirects within the staff portal, a cold desk renders as soon as its
// code lands, a deep link reads its case once, and opening a case reads its checklist alongside the case.
import { execFileSync } from 'node:child_process';
import { test, expect, STAFF } from '../../fixtures/live.js';
import { API, authHeaders, signIn, uniqueMobile } from '../../helpers/liveAuth.js';
import { settle } from '../../helpers/settle.js';

const PSQL = process.env.PSQL || 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const VALUATION_STAFFER = '9383334640';

async function create(body, mobile = uniqueMobile()) {
  const res = await fetch(`${API}/service-requests`, {
    method: 'POST',
    headers: { ...(await authHeaders(mobile)), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const dto = await res.json();
  if (res.status >= 300) throw new Error(`create failed (${res.status}): ${JSON.stringify(dto)}`);
  return dto;
}

function markPaid(requestId) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error(`not a request id: ${requestId}`);
  const out = execFileSync(
    PSQL,
    ['-U', process.env.E2E_DB_USER || 'postgres', '-d', process.env.E2E_DB_NAME || 'draazy_e2e', '-At',
      '-c', `update service_requests set status = 'new' where id = '${requestId}' and status = 'awaiting-payment' returning id`],
    { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'postgres' } },
  );
  if (!out.includes(requestId)) throw new Error(`request ${requestId} was not awaiting payment`);
}

function recordGets(page) {
  const seen = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' || !r.url().includes('/api/')) return;
    const url = new URL(r.url());
    seen.push(url.pathname + url.search);
  });
  return { withPath: (path) => seen.filter((k) => k.split('?')[0] === path) };
}

// Holds the case read open, then records whether the checklist was asked for before the case came back.
async function checklistBeforeCase(page, id) {
  let checklistAt = 0;
  page.on('request', (r) => {
    if (r.method() === 'GET' && new URL(r.url()).pathname === `/api/service-requests/${id}/checklist`) checklistAt ||= Date.now();
  });
  let caseDoneAt = 0;
  await page.route(`**/api/service-requests/${id}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await new Promise((r) => setTimeout(r, 1200));
    caseDoneAt = Date.now();
    return route.continue();
  });
  return () => ({ checklistAt, caseDoneAt });
}

test('a staffer sent to a desk they cannot use lands on their dashboard with one flags read', async ({ page, login }) => {
  await login.asStaff('rental');
  // The landing dashboard's own flags read must not be counted against the redirect.
  await settle(page);
  const gets = recordGets(page);
  await page.goto('/staff/legal');
  await expect(page).toHaveURL(/\/staff\/?$/);
  await expect(page.getByRole('heading').first()).toBeVisible();
  await page.waitForTimeout(800);

  const flags = gets.withPath('/api/admin/settings/flags');
  expect(flags, JSON.stringify(flags)).toHaveLength(1);
});

test('a cold desk shows its queue as soon as the page code lands', async ({ page, login }) => {
  test.skip(!process.env.E2E_DIST, 'the dev server transforms modules on demand, leaving idle gaps of its own; run against a build');
  await login.asAdmin();
  // A cached reload lands the page code fast, which is exactly when the fallback hold shows.
  await page.goto('/admin/interior');
  await expect(page.getByRole('tab').first()).toBeVisible({ timeout: 20000 });

  await page.goto('/admin/interior');
  // Resource entries are recorded only once the body completes, a beat after Playwright sees the response.
  await page.waitForFunction(() => performance.getEntriesByType('resource')
    .some((e) => e.name.includes('/api/service-requests/queue?')));
  const gap = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource');
    const queue = res.find((e) => e.name.includes('/api/service-requests/queue?'));
    const code = res.filter((e) => new URL(e.name).origin === location.origin && e.initiatorType === 'script'
      && !e.name.includes('/api/') && e.startTime < queue.startTime)
      .sort((a, b) => a.startTime - b.startTime);
    // React 19 holds a committed Suspense fallback for 300ms; that shows up as a dead stretch between module loads.
    let landed = code[0].responseEnd;
    let widest = 0;
    for (const e of [...code.slice(1), queue]) {
      widest = Math.max(widest, e.startTime - landed);
      landed = Math.max(landed, e.responseEnd);
    }
    return Math.round(widest);
  });
  expect(gap, 'widest idle ms between page module loads and up to the queue read').toBeLessThan(200);
});

test('opening a drafting-desk case reads its checklist alongside the case', async ({ page }) => {
  const property = `Parallel desk flat ${Math.random().toString(36).slice(2, 8)}`;
  const { id } = await create({ type: 'valuation', details: { ownerName: 'Parallel Owner', property, purpose: 'Budget spec' } });
  await signIn(page, VALUATION_STAFFER, { screen: 'staff' });
  await page.goto('/staff/valuation');
  const row = page.getByTestId('queue-row').filter({ hasText: property }).first();
  await expect(row).toBeVisible({ timeout: 20000 });

  const timing = await checklistBeforeCase(page, id);
  await row.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Take this request' })).toBeVisible({ timeout: 20000 });
  const { checklistAt, caseDoneAt } = timing();
  expect(checklistAt, 'checklist read fired').toBeGreaterThan(0);
  expect(checklistAt, 'checklist asked for while the case read was still open').toBeLessThan(caseDoneAt);
});

test('a deep link to a case reads the case once', async ({ page }) => {
  const property = `Linked desk flat ${Math.random().toString(36).slice(2, 8)}`;
  const { id } = await create({ type: 'valuation', details: { ownerName: 'Linked Owner', property, purpose: 'Budget spec' } });
  await signIn(page, VALUATION_STAFFER, { screen: 'staff' });
  await settle(page);
  const gets = recordGets(page);
  await page.goto(`/staff/valuation?request=${id}`);
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Take this request' })).toBeVisible({ timeout: 20000 });
  await expect(page).not.toHaveURL(/request=/);
  await page.waitForTimeout(800);

  const reads = gets.withPath(`/api/service-requests/${id}`);
  expect(reads, JSON.stringify(reads)).toHaveLength(1);
});

test('opening a rent-agreement case reads its checklist alongside the case', async ({ page }) => {
  const mobile = uniqueMobile();
  const request = await create({
    type: 'rent-agreement',
    details: {
      ownerName: 'Parallel Owner', rent: 22000, deposit: 66000, months: 11,
      _state: {
        tenantMode: 'fill',
        prop: { flatNo: 'B-202', society: 'Sai Residency', locality: 'Wakad', city: 'Pune', gramPanchayat: false },
        owner: { oName: 'Parallel Owner', oMobile: mobile },
        tenants: [{ name: 'Rohan Kale', mobile: uniqueMobile() }],
        terms: { rent: '22000', deposit: '66000', months: '11' },
        furnItems: [],
      },
    },
  }, mobile);
  markPaid(request.id);
  await signIn(page, STAFF.rental, { screen: 'staff' });
  await page.goto('/staff/rent-agreement');
  await page.getByPlaceholder('Name, mobile or request id').fill(request.id);
  await expect(page.getByTestId('ra-row')).toHaveCount(1, { timeout: 20000 });

  const timing = await checklistBeforeCase(page, request.id);
  await page.getByTestId('ra-row').first().getByRole('button', { name: /^Open case/ }).click();
  await expect(page.getByRole('dialog').getByRole('tab', { name: /^ID numbers/ })).toBeVisible({ timeout: 20000 });
  const { checklistAt, caseDoneAt } = timing();
  expect(checklistAt, 'checklist read fired').toBeGreaterThan(0);
  expect(checklistAt, 'checklist asked for while the case read was still open').toBeLessThan(caseDoneAt);
});
