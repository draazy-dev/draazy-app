/* Staff and admin sign in with password + authenticator. Probe 9000000101
   (db/seed-staff/R__zz_DML_dev_staff_credentials.sql) is the only account reset, so other sessions stay valid. */
import { test, expect, ACTORS } from '../../fixtures/live.js';
import {
  API, E2E_STAFF_CODE, STAFF_PASSWORD, authHeaders, staffEmail, uniqueMobile,
} from '../../helpers/liveAuth.js';

const PROBE = { mobile: '9000000101', name: 'Two-factor Probe' };

const post = (path, body, headers = { 'content-type': 'application/json' }) =>
  fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });

async function memberRow(page, name) {
  await expect(page.getByTestId('queue-row').first()).toBeVisible();
  const row = page.getByTestId('queue-row').filter({ hasText: new RegExp(name) });
  if ((await row.count()) === 0) await page.getByRole('button', { name: 'Next page' }).click();
  await expect(row.first()).toBeVisible();
  return row.first();
}

async function signOut(page) {
  await page.context().clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
}

test('the password step opens no session', async () => {
  const res = await post('/auth/staff-login', { email: staffEmail(ACTORS.admin), password: STAFF_PASSWORD });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ mfa: 'totp' });
  expect(body.challenge).toBeTruthy();
  expect(body.accessToken).toBeUndefined();
  expect(res.headers.get('set-cookie')).toBeNull();
});

test('admin signs in with password + code and lands on the console', async ({ page, login, consoleErrors }) => {
  await login.asAdmin();
  await expect(page).toHaveURL(/\/admin/);
  expect(consoleErrors).toHaveLength(0);
});

test.describe.serial('the probe account', () => {
  test('a wrong password is refused without saying which half was wrong', async ({ page }) => {
    await page.goto('/staff-login');
    await page.locator('#staff-email').fill(staffEmail(PROBE.mobile));
    await page.locator('#staff-password').fill('not-the-password');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('#staff-login-error')).toHaveText('Wrong email or password. Check both and try again.');
    await expect(page.locator('#staff-code')).toHaveCount(0);
  });

  test('admin resets 2FA from Team, and the probe re-enrols with a QR and recovery codes', async ({ page, login, consoleErrors }) => {
    await login.asAdmin();
    await page.goto('/admin/team');
    const row = await memberRow(page, PROBE.name);
    page.once('dialog', (d) => d.accept());
    await row.getByRole('button', { name: `Reset 2FA for ${PROBE.name}` }).click();
    await expect(page.getByText(`${PROBE.name} must set up a new authenticator`)).toBeVisible();

    await signOut(page);
    await page.goto('/staff-login');
    await page.locator('#staff-email').fill(staffEmail(PROBE.mobile));
    await page.locator('#staff-password').fill(STAFF_PASSWORD);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Set up your authenticator' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Authenticator QR code' })).toBeVisible();
    await expect(page.locator('#staff-totp-secret')).toHaveText(/^[A-Z2-7]{16,}$/);
    await page.locator('#staff-code').fill(E2E_STAFF_CODE);
    await page.getByRole('button', { name: 'Confirm & sign in' }).click();

    await expect(page.locator('#staff-recovery-codes li')).toHaveCount(10);
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page).toHaveURL(/\/staff$/);
    expect(consoleErrors).toHaveLength(0);
  });
});

test('reissuing an invite refuses yourself and consumers, and works on a colleague', async () => {
  const admin = await authHeaders(ACTORS.admin);
  const me = await (await fetch(`${API}/auth/me`, { headers: admin })).json();
  expect((await post(`/users/${me.id}/reissue-invite`, null, admin)).status).toBe(403);
  expect((await post(`/users/${me.id}/reset-2fa`, null, admin)).status).toBe(403);

  const buyer = await authHeaders(ACTORS.buyer);
  const buyerMe = await (await fetch(`${API}/auth/me`, { headers: buyer })).json();
  expect((await post(`/users/${buyerMe.id}/reissue-invite`, null, admin)).status).toBe(409);

  const mobile = uniqueMobile();
  const created = await post('/users/staff', {
    name: `Invite Probe ${mobile}`, mobile, email: `invite.${mobile}@draazy.test`, role: 'staff', team: 'rental',
  }, admin);
  expect(created.status).toBe(201);
  const { user, inviteUrl } = await created.json();
  expect(inviteUrl).toMatch(/\/staff-invite#/);
  const reissued = await post(`/users/${user.id}/reissue-invite`, null, admin);
  expect(reissued.status).toBe(200);
  expect((await reissued.json()).inviteUrl).toMatch(/\/staff-invite#/);

  await fetch(`${API}/users/${user.id}/archive`, {
    method: 'PATCH', headers: admin, body: JSON.stringify({ reason: 'Invite probe finished' }),
  });
});

test('the invite page refuses a bad code in plain words', async ({ page, consoleErrors }) => {
  await page.goto('/staff-invite#not-a-real-token');
  await expect(page.locator('#invite-token')).toHaveValue('not-a-real-token');
  await page.locator('#invite-password').fill('a-long-enough-password');
  await page.locator('#invite-repeat').fill('a-long-enough-password');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.locator('#staff-invite-error')).toHaveText('This invite code is invalid or has expired. Ask an admin to send you a new one.');
  // The refused redeem is the one expected network error on this page.
  expect(consoleErrors.filter((e) => !/40[0-9]/.test(String(e)))).toHaveLength(0);
});

/* Mocked: a lockout and a proxy 502 are announced in plain words with the wait, never as the
   server's or the transport's own text. */
test('staff sign-in refusals say what to do next', async ({ page }) => {
  const replies = [
    { status: 429, body: { error: 'staff_sign_in_locked', message: 'Sign-in for this account is paused for 14 minute(s).', status: 429, retryAfterSeconds: 840 } },
    { status: 502, body: null },
  ];
  await page.route('**/api/auth/staff-login', (route) => {
    const { status, body } = replies.shift();
    return route.fulfill({ status, contentType: 'application/json', body: body ? JSON.stringify(body) : '' });
  });
  await page.goto('/staff-login');
  await page.locator('#staff-email').fill('someone@draazy.test');
  await page.locator('#staff-password').fill('any-password');
  const error = page.locator('#staff-login-error');

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(error).toHaveText('Too many tries. Wait 14 minutes and try again.');

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(error).toHaveText('Something went wrong on our side. Try again in a minute.');
});

test('the code step uses the six OTP boxes, with a recovery code one tap away', async ({ page, consoleErrors }) => {
  const sent = [];
  await page.route('**/api/auth/staff-login', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mfa: 'totp', challenge: 'c' }) }));
  await page.route('**/api/auth/staff-login/verify', (route) => {
    sent.push(route.request().postDataJSON().code);
    return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'staff_code_invalid', status: 401 }) });
  });
  await page.goto('/staff-login');
  await page.locator('#staff-email').fill('someone@draazy.test');
  await page.locator('#staff-password').fill('any-password');
  await page.getByRole('button', { name: 'Continue' }).click();

  const boxes = page.locator('.otp-box');
  await expect(boxes).toHaveCount(6);
  await expect(boxes.first()).toBeFocused();
  await page.keyboard.type('12');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#staff-login-error')).toHaveText('Enter the 6-digit code from your authenticator app.');
  await boxes.first().fill('123456');
  await expect(page.locator('.otp-box.filled')).toHaveCount(6);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#staff-login-error')).toContainText("That code didn't work");

  await page.getByRole('button', { name: 'Use a recovery code instead' }).click();
  await expect(boxes).toHaveCount(0);
  await page.getByLabel('Recovery code').fill('abcd-efgh');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect.poll(() => sent).toEqual(['123456', 'abcd-efgh']);
  await page.getByRole('button', { name: 'Use the 6-digit code instead' }).click();
  await expect(boxes).toHaveCount(6);
  expect(consoleErrors.filter((e) => !/401/.test(String(e)))).toHaveLength(0);
});

/* The hero panel is a dark island: in light theme its headline must stay white and its gradient text
   solid, not outlined by the light theme's hairline text stroke. */
for (const path of ['/signin', '/staff-login']) {
  test(`the ${path} hero stays readable in light theme`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => localStorage.setItem('dzAppPrefs', JSON.stringify({ theme: 'light' })));
    await page.goto(path);
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    const hero = page.locator('.auth-left');
    await expect(hero.locator('h1')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(hero.locator('.gradient-text').first()).toHaveCSS('-webkit-text-stroke-width', '0px');
  });
}

test('the signin stat labels stay readable in light theme', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => localStorage.setItem('dzAppPrefs', JSON.stringify({ theme: 'light' })));
  await page.goto('/signin');
  await expect(page.locator('.auth-left .stat-card p').nth(1)).toHaveCSS('color', 'rgb(209, 213, 219)');
});

/* Staff sign-in is reached by direct URL only: no public page links to it, and its hero does not
   describe how the back office authenticates. */
test('public pages never point at the staff sign-in', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer.getByRole('link', { name: 'Privacy policy' })).toBeVisible();
  await expect(page.locator('a[href^="/staff"]')).toHaveCount(0);
  await expect(footer).not.toContainText(/staff/i);

  await page.goto('/help/a/create-account');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/staff sign-in/i);

  await page.goto('/staff-login');
  const hero = page.locator('.auth-left');
  await expect(hero.locator('h1')).toBeVisible();
  await expect(hero).not.toContainText(/Two-step|Authenticator|Audit-logged|Role-scoped/);
});
