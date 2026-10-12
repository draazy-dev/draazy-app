import { randomUUID } from 'node:crypto';
import { test, expect } from '../../fixtures/live.js';
import { API, authHeaders, uniqueMobile } from '../../helpers/liveAuth.js';

// Profile names are letters only, so the timestamp is spelt in letters.
const uniqueName = (prefix) => `${prefix} ${String(Date.now()).replace(/\d/g, (d) => 'abcdefghij'[d])}`;

async function createConsumer(request, name) {
  const mobile = uniqueMobile();
  const headers = await authHeaders(mobile);
  const response = await request.patch(`${API}/auth/me`, { headers, data: { name } });
  expect(response.status()).toBe(200);
  return { mobile, name, headers };
}

test('a manager grants and withdraws a Verified badge in one step', async ({ page, login, request, consoleErrors }) => {
  const target = await createConsumer(request, uniqueName('Badge Manager'));
  await login.asManager();
  await page.goto('/admin/users');
  await expect(page.getByTestId('queue-row').first()).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Badge approvals/ })).toHaveCount(0);

  await page.getByPlaceholder('Search name or mobile…').fill(target.name);
  const row = page.getByTestId('queue-row').filter({ hasText: target.name }).first();
  await row.getByRole('button', { name: 'Grant Verified badge' }).click();
  const reason = page.getByRole('textbox', { name: /Reason/ });
  const confirm = page.getByRole('button', { name: 'Confirm' });
  await reason.fill('too short');
  await expect(confirm).toBeDisabled();
  await reason.fill('Lease desk verified this profile manually.');
  await confirm.click();
  await expect(page.getByText('Verified badge granted')).toBeVisible();

  await row.getByRole('button', { name: 'Remove Verified badge' }).click();
  await page.getByRole('textbox', { name: /Reason/ }).fill('The documents turned out to be out of date.');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Verified badge removed')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Grant Verified badge' })).toBeVisible();
  expect(consoleErrors).toHaveLength(0);
});

test('a consumer calling the badge API directly is refused by the server', async ({ request }) => {
  const consumer = await createConsumer(request, uniqueName('Badge Consumer'));
  const response = await request.patch(`${API}/users/${randomUUID()}/badge`, {
    headers: consumer.headers,
    data: { granted: true, reason: 'Trying to grant a badge without staff rights.' },
  });
  expect(response.status()).toBe(403);
});
