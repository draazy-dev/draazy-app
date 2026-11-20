import { test, expect, ACTORS, STAFF } from '../../fixtures/live.js';
import { API, apiLogin, authHeaders, seedConsent, staffSignInUi } from '../../helpers/liveAuth.js';

/* Payload cost of the staff-side reads (support desk, referral desk, /admin/my-work, staff sign-in);
   behaviour is covered by support-chats.spec.js and referrals.spec.js. */

const STAFF_USER_KEYS = ['id', 'name', 'mobile', 'email', 'role', 'permissions', 'desks'];
const REFERRAL_KEYS = ['id', 'referrer', 'referrerMobile', 'referred', 'referredMobile', 'channel', 'reward',
  'rewardAmount', 'status', 'risk', 'identityVerified', 'identityUnique', 'sameDevice', 'sameIp', 'velocityHigh',
  'activated', 'at', 'track', 'holdUntil', 'autoReason'];

const searchOf = (url) => new URL(url).searchParams;

test('a staff sign-in carries the slim identity and is not followed by an /auth/me read', async ({ page, consoleErrors }) => {
  const calls = [];
  page.on('request', (req) => calls.push(`${req.method()} ${new URL(req.url()).pathname}`));
  let signedIn = null;
  page.on('response', async (res) => {
    if (new URL(res.url()).pathname.endsWith('/auth/staff-login/verify') && res.status() === 200) {
      signedIn = await res.json();
    }
  });

  await page.goto('/staff-login');
  await staffSignInUi(page, STAFF.rental);
  await expect(page).not.toHaveURL(/\/staff-login/);
  await expect.poll(() => signedIn).not.toBeNull();

  expect(signedIn.user.role).toBe('staff');
  expect(Object.keys(signedIn.user).filter((k) => !STAFF_USER_KEYS.includes(k))).toEqual([]);
  expect(Array.isArray(signedIn.user.permissions)).toBe(true);
  const afterSignIn = calls.slice(calls.indexOf('POST /api/auth/staff-login/verify') + 1);
  expect(afterSignIn.filter((c) => c === 'GET /api/auth/me')).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('/admin/my-work is the caller and their own queues, nothing else', async () => {
  const headers = await authHeaders(STAFF.rental);
  const body = await fetch(`${API}/admin/my-work`, { headers }).then((r) => r.json());

  expect(Object.keys(body).sort()).toEqual(['queues', 'staff', 'windowDays']);
  expect(body.staff).toHaveLength(1);
  expect(Object.keys(body.staff[0]).sort()).toEqual(['byFunction', 'functions', 'handled', 'name']);
  for (const queue of body.queues) {
    expect(Object.keys(queue).filter((k) => !['function', 'open', 'oldestWaitingSince'].includes(k))).toEqual([]);
    expect(body.staff[0].functions).toContain(queue.function);
  }
});

test('the support inbox reads the list and counts once, and opening a chat is a single slim read', async ({ page, login, consoleErrors }) => {
  const text = `Payload check ${Date.now().toString(36)}, please ignore.`;
  const { accessToken, user } = await apiLogin(ACTORS.buyer);
  const sent = await fetch(`${API}/support/chat/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ text, about: null }),
  });
  expect(sent.status).toBe(201);
  await seedConsent(page);
  await login.asStaff('rental');

  const lists = [];
  const counts = [];
  const opened = [];
  page.on('request', (req) => {
    const { pathname } = new URL(req.url());
    if (req.method() !== 'GET') return;
    if (pathname === '/api/admin/support/chats') lists.push(searchOf(req.url()));
    if (pathname === '/api/admin/support/chats/counts') counts.push(pathname);
    if (pathname === `/api/admin/support/chats/${user.id}`) opened.push(pathname);
  });
  let chat = null;
  page.on('response', async (res) => {
    if (new URL(res.url()).pathname === `/api/admin/support/chats/${user.id}` && res.status() === 200) chat = await res.json();
  });

  await page.goto('/ops/support?view=all');
  const row = page.getByTestId('support-chat-row').filter({ hasText: text });
  await expect(row).toBeVisible();
  expect(lists).toHaveLength(1);
  expect(lists[0].get('view')).toBe('all');
  expect(counts).toHaveLength(1);

  await row.click();
  await expect(page.getByTestId('staff-chat').getByText(text)).toBeVisible();
  expect(opened).toHaveLength(1);
  expect(lists).toHaveLength(1);
  expect(Object.keys(chat.user).sort()).toEqual(['id', 'idVerified', 'mobile', 'name', 'roles']);
  expect(chat.user.mobile).not.toBe(ACTORS.buyer);
  for (const message of chat.messages) {
    expect(message).not.toHaveProperty('authorId');
    expect(message).not.toHaveProperty('attachments');
  }
  expect(consoleErrors).toEqual([]);
});

test('the referral desk pages and filters on the server, with counts only when asked', async ({ page, login, consoleErrors }) => {
  await login.asStaff('rental');

  const reads = [];
  const rows = [];
  page.on('request', (req) => {
    if (new URL(req.url()).pathname === '/api/referrals' && req.method() === 'GET') reads.push(searchOf(req.url()));
  });
  page.on('response', async (res) => {
    if (new URL(res.url()).pathname === '/api/referrals' && res.status() === 200) {
      const content = (await res.json().catch(() => null))?.content ?? [];
      rows.push(...content);
    }
  });

  await page.goto('/ops/referrals');
  await expect(page.getByRole('heading', { name: 'Referral audit' })).toBeVisible();
  await expect.poll(() => reads.length).toBe(1);
  expect(reads[0].get('size')).toBe('20');
  // The desk opens on Held, the one queue that needs a person's eye.
  expect(reads[0].get('status')).toBe('held');
  expect(reads[0].get('counts')).toBe('true');
  await expect(page.getByTestId('tab-count-held')).toHaveText(/^[\d,]+$/);

  await page.getByRole('tab', { name: /^Rewarded/ }).click();
  await expect.poll(() => reads.length).toBe(2);
  expect(reads[1].get('status')).toBe('qualified,rewarded');
  expect(reads[1].get('counts')).toBeNull();

  await page.getByPlaceholder('Referrer, referred or ID').fill('zz-no-such-person');
  await expect.poll(() => reads.length).toBe(3);
  expect(reads[2].get('q')).toBe('zz-no-such-person');
  await expect(page.getByText('No referrals match this search.')).toBeVisible();

  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect.poll(() => reads.length).toBe(4);
  expect(reads[3].get('counts')).toBe('true');

  for (const read of reads) expect(read.get('size')).not.toBe('100');
  for (const row of rows) expect(Object.keys(row).filter((k) => !REFERRAL_KEYS.includes(k))).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
