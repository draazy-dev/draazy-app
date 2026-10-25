// The back-office bell and inbox for the staff-sla sweep's queue / reminder / escalation notifications.
import { test, expect, ACTORS } from '../../fixtures/live.js';
import { letterTag } from '../../helpers/liveAuth.js';
import { sql } from '../../helpers/monetisation.js';

const bell = (page) => page.getByTestId('admin-notifications');

test('an escalation leads the manager bell and files under Escalations, queue work under My work', async ({ page, login, consoleErrors }) => {
  const tag = `Zzsla ${letterTag(`${Date.now()}`)}`;
  const managerId = sql(`SELECT id FROM users WHERE mobile = '${ACTORS.manager}'`);
  sql(`INSERT INTO notifications (user_id, type, title, body, read, link) VALUES
    ('${managerId}', 'escalation.listing-review', '${tag} escalated', 'Oldest listing', false, '/admin/properties'),
    ('${managerId}', 'queue.report', '${tag} new report', 'Property report', false, '/admin/reports')`);

  await login.asManager();
  await page.goto('/admin');
  await expect(page.getByTestId('notif-unread-dot'), 'the badge counts unread').toHaveText(/^(\d+|99\+)$/);

  await page.getByRole('button', { name: 'Notifications' }).click();
  await expect(bell(page).locator('button[data-type]').first(), 'escalations sit above every other unread row')
    .toHaveAttribute('data-type', 'escalation');
  await expect(bell(page).getByRole('button', { name: new RegExp(`${tag} escalated`) })).toBeVisible();

  await bell(page).getByRole('button', { name: 'View all notifications' }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();

  const tabs = page.getByRole('tablist', { name: 'Notifications' });
  await expect(tabs.getByRole('tab')).toHaveText(['All', 'Escalations', 'My work', 'Updates']);

  await tabs.getByRole('tab', { name: 'Escalations' }).click();
  await expect(page.locator('.notif', { hasText: `${tag} escalated` })).toBeVisible();
  await expect(page.locator('.notif', { hasText: `${tag} new report` })).toHaveCount(0);

  await tabs.getByRole('tab', { name: 'My work' }).click();
  await expect(page.locator('.notif', { hasText: `${tag} new report` })).toBeVisible();
  await expect(page.locator('.notif', { hasText: `${tag} escalated` })).toHaveCount(0);

  expect(consoleErrors).toHaveLength(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the bell panel stays inside the screen', async ({ page, login, consoleErrors }) => {
    await login.asAdmin();
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Notifications' }).click();

    const box = await bell(page).boundingBox();
    expect(box.x, 'no overflow past the left edge').toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, 'no overflow past the right edge').toBeLessThanOrEqual(390);
    await expect(bell(page).getByRole('button', { name: 'View all notifications' })).toBeInViewport();

    expect(consoleErrors).toHaveLength(0);
  });
});
