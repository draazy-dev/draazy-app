// The desk corrects a rent agreement itself (form, list rows, PAN / Aadhaar), or sends it back to one side for
// papers or an answer and gets it back on their "done".
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { STAFF } from '../../fixtures/live.js';
import { API, apiLogin, signIn, signedInAs, uniqueMobile } from '../../helpers/liveAuth.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const PSQL = process.env.PSQL || 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const REASON = 'Is the flat A-101 or A-110? Your index II says A-110';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const json = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });

async function ok(method, path, token, body) {
  const res = await fetch(`${API}${path}`, { method, headers: json(token), body: body && JSON.stringify(body) });
  const text = await res.text();
  if (res.status >= 300) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

function settle(requestId) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error(`not a request id: ${requestId}`);
  execFileSync(
    PSQL,
    ['-U', process.env.E2E_DB_USER || 'postgres', '-d', process.env.E2E_DB_NAME || 'draazy_e2e', '-At',
      '-c', `update service_requests set status = 'new' where id = '${requestId}' and status = 'awaiting-payment'`],
    { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'postgres' } },
  );
}

async function assignedCase(beforeAssign) {
  const mobile = uniqueMobile();
  const customer = (await apiLogin(mobile)).accessToken;
  const request = await ok('POST', '/service-requests', customer, {
    type: 'rent-agreement',
    details: {
      ownerName: 'Meera Joshi', rent: 22000, deposit: 66000, months: 11,
      _state: {
        tenantMode: 'fill',
        prop: { flatNo: 'A-101', society: 'Sai Residency', locality: 'Wakad', city: 'Pune', gramPanchayat: false },
        owner: { oName: 'Meera Joshi', oMobile: mobile },
        tenants: [{ name: 'Rohan Kale', mobile: uniqueMobile() }],
        terms: { rent: '22000', deposit: '66000', months: '11' },
        furnItems: [{ name: 'Sofa', qty: 1, custom: false }],
      },
    },
  });
  settle(request.id);
  await beforeAssign?.(request.id, customer);
  const staff = (await apiLogin(STAFF.rental)).accessToken;
  await ok('PATCH', `/service-requests/${request.id}/status`, staff, { status: 'assigned' });
  return { id: request.id, mobile, customer };
}

async function openCase(page, requestId) {
  await page.goto('/admin/rent-agreement?tab=progress');
  await expect(page.getByRole('heading', { name: 'Rent Agreement' })).toBeVisible();
  await page.getByPlaceholder('Name, mobile or request id').fill(requestId);
  await expect(page.getByTestId('ra-row')).toHaveCount(1);
  await page.getByTestId('ra-row').first().getByRole('button', { name: /^Open case/ }).click();
  return page.getByRole('dialog');
}

test.describe('Ops → Rent agreement → corrections (live)', () => {
  test('the desk asks the owner for a fresh paper and an answer; done stays shut until the paper is uploaded', async ({ page, browser }) => {
    const c = await assignedCase();
    await signIn(page, STAFF.rental, { screen: 'staff' });
    const dialog = await openCase(page, c.id);

    await dialog.getByRole('button', { name: 'Send back for correction' }).click();
    const form = dialog.getByRole('form', { name: 'Send back for correction' });
    await expect(form.getByRole('button', { name: 'Send back' })).toBeDisabled();
    await form.getByRole('checkbox', { name: /^Index II/ }).check();
    await form.getByLabel('Anything to ask them (optional)').fill(REASON);
    await form.getByRole('button', { name: 'Send back' }).click();
    const waiting = dialog.getByTestId('attention-waiting');
    await expect(waiting).toContainText('Sent back to the owner');
    await expect(waiting).toContainText(REASON);
    await expect(waiting).toContainText('Index II');
    await expect(dialog.getByTestId('ra-next-step')).toContainText('Sent back to the owner for a correction');

    const { content: rows } = await ok('GET', '/notifications', c.customer);
    const told = rows.find((n) => n.type === 'service.action-required');
    expect(told?.link).toBe('/services/rent-agreement');

    const context = await browser.newContext();
    const owner = await context.newPage();
    await signedInAs(owner, c.mobile);
    await owner.goto(`${BASE}/dashboard`);
    const item = owner.locator('[data-testid="action-item"][data-group="agreements"]');
    await expect(item).toContainText('Correction needed', { timeout: 15000 });
    await item.click();
    await expect(owner).toHaveURL(/\/services\/rent-agreement$/);
    const banner = owner.getByRole('region', { name: 'Needs your attention' });
    await expect(banner).toBeVisible({ timeout: 15000 });
    await expect(banner).toContainText(REASON);
    const done = banner.getByRole('button', { name: 'Done — send back to our team' });
    await expect(done).toBeDisabled();
    await banner.getByLabel(/^Upload a new copy of Index II/).setInputFiles({ name: 'index-ii.png', mimeType: 'image/png', buffer: PNG });
    await expect(banner.getByText('Uploaded')).toBeVisible();
    await banner.getByLabel('Your reply').fill('It is A-110, not A-101');
    await done.click();
    await expect(banner).toBeHidden({ timeout: 15000 });
    await context.close();

    const back = await ok('GET', `/service-requests/${c.id}`, c.customer);
    expect(back.status).toBe('in-progress');
    expect(back.attention ?? null).toBeNull();
    expect(back.messages.map((m) => m.body)).toEqual(expect.arrayContaining([expect.stringContaining('It is A-110')]));
  });

  test('the holder corrects a licensee card in place, and the summary and the customer follow', async ({ page }) => {
    const c = await assignedCase();
    await signIn(page, STAFF.rental, { screen: 'staff' });
    const dialog = await openCase(page, c.id);

    await dialog.getByRole('tab', { name: /^Licensee/ }).click();
    await dialog.getByRole('button', { name: 'Edit Licensee 1' }).click();
    const form = dialog.getByRole('form', { name: 'Edit Licensee 1' });
    await form.getByLabel('Name', { exact: true }).fill('Rohan S. Kale');
    await form.getByLabel('Note to the customer (optional)').fill('Spelling as on the PAN');
    await form.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Saved. The customer was told what changed.' })).toBeVisible();
    await expect(dialog.getByRole('tabpanel')).toContainText('Rohan S. Kale');

    const saved = await ok('GET', `/service-requests/${c.id}`, c.customer);
    expect(saved.details._state.tenants[0].name).toBe('Rohan S. Kale');
    expect(saved.details.tenants).toBe('Rohan S. Kale');
    expect(saved.details.rent).toBe(22000);
  });

  test('the holder adds a furniture row the customer missed', async ({ page }) => {
    const c = await assignedCase();
    await signIn(page, STAFF.rental, { screen: 'staff' });
    const dialog = await openCase(page, c.id);

    await dialog.getByRole('tab', { name: /^Terms/ }).click();
    await dialog.getByRole('button', { name: 'Edit Terms' }).click();
    const form = dialog.getByRole('form', { name: 'Edit Terms' });
    await form.getByRole('button', { name: 'Add furniture' }).click();
    await form.getByLabel('2 · Name', { exact: true }).fill('Fridge');
    await form.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Saved. The customer was told what changed.' })).toBeVisible();

    const saved = await ok('GET', `/service-requests/${c.id}`, c.customer);
    expect(saved.details._state.furnItems.map((f) => f.name)).toEqual(['Sofa', 'Fridge']);
  });

  test('the holder corrects a mistyped tenant PAN and Aadhaar, which nobody else could fix', async ({ page }) => {
    // The customer's own numbers lock once the team starts, so they are typed before the hand-off.
    const c = await assignedCase((id, customer) => ok('PUT', `/service-requests/${id}/identities`, customer, {
      parties: [{ partyRole: 'tenant', partyIndex: 0, partyName: 'Rohan Kale', pan: 'ABCDE1234X', aadhaar: '' }],
    }));
    await signIn(page, STAFF.rental, { screen: 'staff' });
    const dialog = await openCase(page, c.id);

    await dialog.getByRole('tab', { name: /^ID numbers/ }).click();
    await dialog.getByRole('button', { name: 'Reveal' }).click();
    const tenant = dialog.getByRole('listitem').filter({ hasText: 'Rohan Kale' });
    await expect(tenant).toContainText('ABCDE1234X');
    await tenant.getByRole('button', { name: 'Correct' }).click();
    await tenant.getByLabel('PAN', { exact: true }).fill('ABCDE1234F');
    await tenant.getByLabel('Aadhaar', { exact: true }).fill('211122223335');
    await tenant.getByRole('button', { name: 'Save numbers' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Saved. The customer has been told' })).toBeVisible();
    await expect(tenant).toContainText('ABCDE1234F');

    const staff = (await apiLogin(STAFF.rental)).accessToken;
    const rows = await ok('GET', `/service-requests/${c.id}/identities`, staff);
    expect(rows.find((r) => r.partyRole === 'tenant')).toMatchObject({ pan: 'ABCDE1234F', aadhaar: '211122223335' });
  });
});
