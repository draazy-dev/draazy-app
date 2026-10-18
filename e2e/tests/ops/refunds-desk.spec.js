import { test, expect } from '../../fixtures/live.js';
import { uniqueMobile } from '../../helpers/liveAuth.js';
import { call, entitlementsOf } from '../../helpers/monetisation.js';
import { member } from '../../helpers/referral.js';
import { decide, paidPack, paymentOf, refundIdOf, requestRefund, staffCall } from '../../helpers/refunds.js';

const rowFor = (page, name) => page.getByTestId('queue-row').filter({ hasText: name });
const openTab = (page, label) => page.getByRole('tab', { name: new RegExp(`^${label}`) }).click();

async function pendingRefund(name) {
  const mobile = await member(name);
  const orderId = await paidPack(mobile);
  const asked = await requestRefund(mobile, orderId, { reason: `${name} changed their mind` });
  expect(asked.status, JSON.stringify(asked.json)).toBe(200);
  return { mobile, orderId, refundId: refundIdOf(orderId) };
}

const countsFromApi = async () => (await staffCall('GET', '/admin/refunds?status=pending_review&size=1&counts=true')).json.counts;

async function openDesk(page, login, { path = '/staff/refunds' } = {}) {
  await login.scopeStaff('rental', ['refunds']);
  await login.asStaff('rental');
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Refunds', exact: true })).toBeVisible({ timeout: 20000 });
}

test.describe('LIVE: the staff Refunds desk', () => {
  test('a staffer with the refunds function sees the queue by status, counts that match the server, and risk signals only on pending rows', async ({ page, login, consoleErrors }) => {
    test.slow();
    const anita = await pendingRefund('Desk Anita');
    await pendingRefund('Desk Bhavna');
    await openDesk(page, login);

    await test.step('every tab carries the count the server reports', async () => {
      const counts = await countsFromApi();
      expect(counts.pending_review).toBeGreaterThanOrEqual(2);
      for (const [key, status] of [['pending', 'pending_review'], ['approved', 'approved'], ['rejected', 'rejected'], ['auto', 'auto'], ['disputes', 'disputed']]) {
        await expect(page.getByTestId(`tab-count-${key}`)).toHaveText(String(counts[status]));
      }
      await expect(page.getByRole('tab', { name: /^Pending/ })).toHaveAttribute('aria-selected', 'true');
    });

    await test.step('a pending row names the customer with their full mobile, the plan and the order, and carries the risk chips and both buttons', async () => {
      const row = rowFor(page, 'Desk Anita');
      await expect(row).toHaveCount(1);
      await expect(row.getByTestId('customer-mobile')).toHaveText(anita.mobile);
      await expect(row).toContainText('₹199');
      await expect(row).toContainText('Contact Pack');
      await expect(row).toContainText('Pending');
      await expect(row).toContainText('Desk Anita changed their mind');
      await expect(row).toContainText(/\d+ refunds? in 12 mo/);
      await expect(row).toContainText('0 linked accounts');
      await expect(row).toContainText('0 contacts used');
      await expect(row).toContainText('0 enquiries');
      await expect(row.getByTestId('refund-approve')).toBeVisible();
      await expect(row.getByTestId('refund-reject')).toBeVisible();
    });

    await test.step('once decided, the row is on its own tab with no chips and no buttons', async () => {
      expect((await decide(anita.refundId, 'approve')).status).toBe(200);
      await page.getByRole('button', { name: 'Refresh' }).click();
      await expect(rowFor(page, 'Desk Anita')).toHaveCount(0);
      await openTab(page, 'Approved');
      const row = rowFor(page, 'Desk Anita');
      await expect(row).toHaveCount(1, { timeout: 20000 });
      await expect(row).toContainText('Approved');
      await expect(row).not.toContainText(/refunds? in 12 mo/);
      await expect(row.getByTestId('refund-approve')).toHaveCount(0);
      await expect(row.getByTestId('refund-reject')).toHaveCount(0);
    });

    expect(consoleErrors).toEqual([]);
  });

  test('Approve asks first: cancelling leaves it pending, confirming pays it back, moves it to Approved and tells the customer', async ({ page, login }) => {
    test.slow();
    const buyer = await pendingRefund('Desk Chitra');
    await openDesk(page, login);
    const row = rowFor(page, 'Desk Chitra');

    await row.getByTestId('refund-approve').click();
    const modal = page.getByRole('dialog', { name: 'Approve refund' });
    await expect(modal).toContainText(`Desk Chitra · ${buyer.mobile} · Contact Pack · ₹199`);
    await expect(modal).toContainText('This pays ₹199 back to the original payment method.');
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(row.getByTestId('refund-approve')).toBeVisible();
    expect((await paymentOf(buyer.mobile, buyer.orderId)).status, 'cancelling decides nothing').toBe('refund_pending');

    await row.getByTestId('refund-approve').click();
    const decided = page.waitForResponse((r) => /\/api\/admin\/refunds\/[^/]+\/approve$/.test(r.url()) && r.request().method() === 'POST');
    await page.getByTestId('refund-approve-confirm').click();
    expect((await decided).status()).toBe(200);
    await expect(page.getByText('Refund approved')).toBeVisible();
    await expect(rowFor(page, 'Desk Chitra')).toHaveCount(0);

    await openTab(page, 'Approved');
    await expect(rowFor(page, 'Desk Chitra')).toContainText('Approved', { timeout: 20000 });
    expect((await paymentOf(buyer.mobile, buyer.orderId)).status).toBe('refunded');
    const inbox = await call('GET', '/notifications?size=100', buyer.mobile);
    expect((Array.isArray(inbox.json) ? inbox.json : inbox.json.content).map((n) => n.type)).toContain('refund.decided');

    const twice = await decide(buyer.refundId, 'approve');
    expect(twice.status, 'a decided request cannot be decided again').toBe(409);
  });

  test('Reject needs a reason the customer will see; it restores the pack and lands on the Rejected tab', async ({ page, login }) => {
    test.slow();
    const buyer = await pendingRefund('Desk Divya');
    expect((await entitlementsOf(buyer.mobile)).contacts.remaining, 'frozen while it waits').toBe(15);
    await openDesk(page, login);

    await rowFor(page, 'Desk Divya').getByTestId('refund-reject').click();
    const modal = page.getByRole('dialog', { name: 'Reject refund' });
    const confirm = page.getByTestId('refund-reject-confirm');
    await expect(confirm).toBeDisabled();
    await page.getByTestId('refund-reject-reason').fill('   ');
    await expect(confirm, 'blanks are not a reason').toBeDisabled();
    await page.getByTestId('refund-reject-reason').fill('Pack contacts were used on another account');
    await expect(confirm).toBeEnabled();

    const decided = page.waitForResponse((r) => /\/api\/admin\/refunds\/[^/]+\/reject$/.test(r.url()) && r.request().method() === 'POST');
    await confirm.click();
    expect((await decided).status()).toBe(200);
    await expect(page.getByText('Refund rejected')).toBeVisible();
    await expect(modal).toHaveCount(0);

    await openTab(page, 'Rejected');
    const row = rowFor(page, 'Desk Divya');
    await expect(row).toContainText('Rejected', { timeout: 20000 });
    await expect(row).toContainText('Pack contacts were used on another account');

    expect((await entitlementsOf(buyer.mobile)).contacts.remaining, 'the pack is whole again').toBe(30);
    expect((await paymentOf(buyer.mobile, buyer.orderId)).status).toBe('refund_rejected');
  });

  test('a reject without a reason is refused by the server', async () => {
    const buyer = await pendingRefund('Desk Esha');
    const blank = await decide(buyer.refundId, 'reject', '   ');
    expect(blank.status).toBe(422);
    expect((await paymentOf(buyer.mobile, buyer.orderId)).status).toBe('refund_pending');
  });

  test('a reader without the write permission sees the rows and no buttons', async ({ page, login }) => {
    test.slow();
    await pendingRefund('Desk Farida');
    await login.scopeStaff('rental', ['refunds']);

    /* The refunds function carries read and write together, so a read-only account cannot be minted: the session's
       permission list is served without the write atom, which is exactly what the buttons key off. */
    const withoutWrite = (body) => JSON.parse(JSON.stringify(body, (key, value) => (
      key === 'permissions' && Array.isArray(value) ? value.filter((p) => p !== 'refunds:write') : value)));
    await page.route(/\/api\/(auth\/me|me\/bootstrap)(\?.*)?$/, async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, json: withoutWrite(await res.json()) });
    });

    await login.asStaff('rental');
    await page.goto('/staff/refunds');
    await expect(page.getByRole('heading', { name: 'Refunds', exact: true })).toBeVisible({ timeout: 20000 });

    const row = rowFor(page, 'Desk Farida');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(/refunds? in 12 mo/);
    await expect(page.getByTestId('refund-approve')).toHaveCount(0);
    await expect(page.getByTestId('refund-reject')).toHaveCount(0);
  });

  test('the server holds the line: only staff with the refunds function may read or decide', async ({ login }) => {
    const buyer = await pendingRefund('Desk Gita');
    await login.scopeStaff('rental', ['kyc']);

    const staff = '9733798115';
    expect((await call('GET', '/admin/refunds?status=pending_review', staff)).status).toBe(403);
    expect((await call('POST', `/admin/refunds/${buyer.refundId}/approve`, staff)).status).toBe(403);
    expect((await call('POST', `/admin/refunds/${buyer.refundId}/reject`, staff, { reason: 'No' })).status).toBe(403);

    const stranger = uniqueMobile();
    expect((await call('GET', '/admin/refunds?status=pending_review', stranger)).status, 'a customer is refused').toBe(403);
    expect((await paymentOf(buyer.mobile, buyer.orderId)).status, 'nothing moved').toBe('refund_pending');

    await login.scopeStaff('rental', ['refunds']);
    expect((await call('GET', '/admin/refunds?status=pending_review', staff)).status).toBe(200);
  });

  test('a staffer without the function is kept off the desk, and the administrator reaches it at /admin/refunds', async ({ page, login }) => {
    test.slow();
    await pendingRefund('Desk Hema');

    await login.scopeStaff('rental', ['kyc']);
    await login.asStaff('rental');
    await page.goto('/staff/refunds');
    await expect(page.getByRole('heading', { name: 'Refunds', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('refund-approve')).toHaveCount(0);

    await login.asAdmin();
    await page.goto('/admin/refunds');
    await expect(page.getByRole('heading', { name: 'Refunds', exact: true })).toBeVisible({ timeout: 20000 });
    await expect(rowFor(page, 'Desk Hema').getByTestId('refund-approve')).toBeVisible();
  });
});
