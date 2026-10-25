import { test, expect } from '@playwright/test';
import { API, E2E_OTP, apiLogin, signedInAs, uniqueMobile } from '../../../helpers/liveAuth.js';
import { ACTORS } from '../../../fixtures/live.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
/* `ownerConsent` is not client-settable (`FlatmateMapper.applyTo` drops it), so consent can only be
 * proven by creating a group afterwards and finding the flag the server itself wrote. */
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
const track = flatmateCleanup(test);

async function approve(id) {
  const { accessToken } = await apiLogin(ACTORS.admin);
  const res = await fetch(`${API}/admin/flatmates/${id}/moderation`, {
    method: 'PATCH',
    headers: auth(accessToken),
    body: JSON.stringify({ modStatus: 'live', note: 'e2e' }),
  });
  expect(res.status, `approve ${id}: ${await res.clone().text()}`).toBeLessThan(300);
}

// New flat-shares are room posts, so the owner-consent OTP form is only reached by editing a legacy group.
async function openLegacyGroup(page, token, title) {
  const res = await fetch(`${API}/flatmates/groups`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({ title, locality: 'Baner', rent: 35000, deposit: 50000, seats: 3, seatsOpen: 1, policy: 'any', role: 'tenant' }),
  });
  expect(res.status, await res.clone().text()).toBe(201);
  const group = await res.json();
  track('groups', group.id, token);
  await page.goto(`${BASE}/flatmates?editGroup=${group.id}`);
  await expect(page.getByRole('dialog', { name: 'Edit group' })).toBeVisible({ timeout: 20_000 });
  await page.getByText(/registered rent agreement/i).click();
  return group;
}

test('owner-consent OTP flow records consent on the server, and the card shows the chip', async ({ page }) => {
  const tenantMobile = uniqueMobile();
  const { accessToken: tenantToken } = await apiLogin(tenantMobile, { name: 'Consent Tenant' });
  // The owner mobile must be a DIFFERENT number (the server refuses self-consent).
  const ownerMobile = uniqueMobile();

  const title = `Consent live ${Date.now().toString(36)}`;
  const createRes = await fetch(`${API}/flatmates/groups`, {
    method: 'POST',
    headers: auth(tenantToken),
    body: JSON.stringify({
      title,
      locality: 'Baner',
      rent: 35000,
      deposit: 50000,
      seats: 3,
      seatsOpen: 1,
      policy: 'any',
      role: 'tenant',
      consentMobile: ownerMobile,
    }),
  });
  const createBody = await createRes.text();
  expect(createRes.status, createBody).toBe(201);
  const group = JSON.parse(createBody);
  track('groups', group.id, tenantToken);

  expect(group.ownerConsent).toBe(false);

  const sendRes = await fetch(`${API}/flatmates/owner-consent`, {
    method: 'POST',
    headers: auth(tenantToken),
    body: JSON.stringify({ ownerMobile, title, locality: 'Baner' }),
  });
  const sendBody = await sendRes.text();
  expect(sendRes.status, `send OTP: ${sendBody}`).toBe(200);
  expect(JSON.parse(sendBody).consentRecorded).toBe(false);
  // Step 2: the same route again, now carrying the fixed E2E OTP.
  const confirmRes = await fetch(`${API}/flatmates/owner-consent`, {
    method: 'POST',
    headers: auth(tenantToken),
    body: JSON.stringify({ ownerMobile, otp: E2E_OTP, title, locality: 'Baner' }),
  });
  const confirmBody = await confirmRes.text();
  expect(confirmRes.status, `confirm OTP: ${confirmBody}`).toBe(200);
  expect(JSON.parse(confirmBody).consentRecorded).toBe(true);

  const myGroupsRes = await fetch(`${API}/me/flatmate-groups?size=50`, {
    headers: auth(tenantToken),
  });
  expect(myGroupsRes.status).toBe(200);
  const myGroups = await myGroupsRes.json();
  const items = myGroups.content ?? myGroups.items ?? myGroups;
  const updatedGroup = items.find((g) => g.id === group.id);
  expect(updatedGroup, 'the group should appear in my list').toBeTruthy();
  const detail = await fetch(`${API}/flatmates/groups/${group.id}`, { headers: auth(tenantToken) }).then((r) => r.json());
  expect(detail.item.ownerConsent).toBe(true);

  await approve(group.id);

  await signedInAs(page, tenantMobile);
  await page.goto(`${BASE}/flatmates/group/${group.id}`);
  const chip = page.getByText(/Owner-consented/i).filter({ visible: true }).first();
  await expect(chip).toBeVisible({ timeout: 20_000 });
  // The chip is server-derived, so it must survive a reload.
  await page.reload();
  await expect(chip).toBeVisible({ timeout: 20_000 });
});

test('the consent button needs a full 10-digit owner mobile, the modal records consent on the server, and the saved group carries the flag', async ({ page }) => {
  const tenantMobile = uniqueMobile();
  const ownerMobile = uniqueMobile();
  const { accessToken: tenantToken } = await apiLogin(tenantMobile, { name: 'Consent Tenant' });
  await signedInAs(page, tenantMobile);

  const group = await openLegacyGroup(page, tenantToken, `Consent via UI ${Date.now().toString(36)}`);

  const consentBtn = page.getByRole('button', { name: /Verify owner consent/i });
  await expect(consentBtn).toBeVisible({ timeout: 5_000 });
  await expect(consentBtn).toBeDisabled();

  const mobileField = page.getByPlaceholder(/owner.*mobile|seeking a replacement/i);
  await mobileField.fill('97000');
  await expect(consentBtn).toBeDisabled();

  await mobileField.fill('9700000001');
  await expect(consentBtn).toBeEnabled();

  await mobileField.fill(ownerMobile);
  await consentBtn.click();
  // Step 1 — dispatch, a real server call rather than a client-side timer.
  await page.getByRole('button', { name: /Send OTP to owner/i }).click();
  for (let i = 0; i < 6; i++) await page.getByLabel(`OTP digit ${i + 1}`).fill(E2E_OTP[i]);
  // Step 2 — record. The success path is conditional on the server agreeing: a wrong code answers
  // 401 and the modal stays open with an error.
  await page.getByRole('button', { name: /Confirm consent/i }).click();
  await expect(page.getByRole('button', { name: /Confirm consent/i })).toBeHidden({ timeout: 15_000 });
  // The proof: `ownerConsent` is not client-settable, so it can only come back true from a
  // `flatmate_owner_consents` row keyed on (owner mobile, tenant, flat) and found again at save.
  const patched = page.waitForResponse((r) => r.url().endsWith(`/flatmates/groups/${group.id}`) && r.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Save changes' }).click();
  const res = await patched;
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()).ownerConsent).toBe(true);
});

test('a wrong owner code says how many tries are left, not a blanket "did not match"', async ({ page }) => {
  const tenantMobile = uniqueMobile();
  const { accessToken } = await apiLogin(tenantMobile, { name: 'Consent Tenant' });
  await signedInAs(page, tenantMobile);
  await openLegacyGroup(page, accessToken, `Consent wrong ${Date.now().toString(36)}`);
  await page.getByPlaceholder(/owner.*mobile|seeking a replacement/i).fill(uniqueMobile());
  await page.getByRole('button', { name: /Verify owner consent/i }).click();
  await page.getByRole('button', { name: /Send OTP to owner/i }).click();

  const wrong = E2E_OTP === '111111' ? '222222' : '111111';
  for (let i = 0; i < 6; i++) await page.getByLabel(`OTP digit ${i + 1}`).fill(wrong[i]);
  await page.getByRole('button', { name: /Confirm consent/i }).click();
  // One wrong guess of the 3 allowed: a 401 refresh-and-replay would spend two and show "1".
  await expect(page.getByText("That code isn't right. 2 attempts left.", { exact: true })).toBeVisible();
});
