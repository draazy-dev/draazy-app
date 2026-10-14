import { test, expect, ACTORS } from '../../fixtures/live.js';
import { API, authHeaders } from '../../helpers/liveAuth.js';

const report = (message) => fetch(`${API}/client-errors`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    reference: crypto.randomUUID(),
    kind: 'error',
    scope: 'window',
    path: '/e2e-error-log',
    name: 'E2eError',
    message,
    stack: `E2eError: ${message}\n    at probe (https://example.test/assets/probe.js:1:1)`,
    componentStack: '',
    build: null,
    lastTraceId: null,
    context: { viewport: '390x844', online: true, deployEnv: 'local', userAgent: 'Chrome 141 / Android' },
  }),
});

const rows = (page) => page.getByTestId('error-log-row');

test('admin finds a browser crash, filters by source, reads its detail and resolves it', async ({ page, login, consoleErrors }) => {
  const message = `e2e-error-log-${Date.now().toString(36)}`;
  expect((await report(message)).status).toBeLessThan(300);

  await login.asAdmin();
  await page.goto('/admin/error-log');
  await expect(page.getByRole('heading', { name: 'Error log' })).toBeVisible();

  await page.getByRole('button', { name: 'Web', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search errors' }).fill(message);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('/e2e-error-log');
  await expect(rows(page).first()).toContainText('\u00d71');

  await page.getByRole('button', { name: 'API', exact: true }).click();
  await expect(page.getByText('No matching errors.')).toBeVisible();
  await page.getByRole('button', { name: 'Web', exact: true }).click();

  await rows(page).first().click();
  const dialog = page.getByRole('dialog', { name: 'Error' });
  await expect(dialog).toContainText(message);
  await expect(dialog.locator('pre')).toContainText('probe.js');
  await expect(dialog).toContainText('Chrome 141 / Android');

  await dialog.getByRole('button', { name: 'Resolve' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('No matching errors.')).toBeVisible();

  await page.getByRole('button', { name: 'Resolved', exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  expect(consoleErrors).toEqual([]);
});

test('the same crash reported twice is one row with a count', async ({ page, login }) => {
  const message = `e2e-error-log-dup-${Date.now().toString(36)}`;
  expect((await report(message)).status).toBeLessThan(300);
  expect((await report(message)).status).toBeLessThan(300);

  await login.asAdmin();
  await page.goto('/admin/error-log');
  await page.getByRole('textbox', { name: 'Search errors' }).fill(message);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('\u00d72');
});

test('a search that matches nothing shows the empty state', async ({ page, login }) => {
  await login.asAdmin();
  await page.goto('/admin/error-log');
  await page.getByRole('textbox', { name: 'Search errors' }).fill(`nothing-${Date.now().toString(36)}`);
  await expect(page.getByText('No matching errors.')).toBeVisible();
});

test('a manager neither sees the error log nor reads its API', async ({ page, login }) => {
  const res = await fetch(`${API}/admin/error-log`, { headers: await authHeaders(ACTORS.manager) });
  expect(res.status).toBe(403);

  await login.asManager();
  await page.goto('/admin/error-log');
  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.getByRole('link', { name: 'Error log' })).toHaveCount(0);
});
