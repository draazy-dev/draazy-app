import { test, expect } from '../../fixtures/live.js';

const sidebar = (page) => page.locator('aside nav');
const group = (page, name) => sidebar(page).getByRole('button', { name, exact: true });

test('the admin sidebar groups its tabs into dropdowns and opens the one holding the current page', async ({ page, login, consoleErrors }) => {
  await login.asAdmin();

  await page.goto('/admin/places');
  await expect(group(page, 'Content & Places')).toHaveAttribute('aria-expanded', 'true');
  await expect(sidebar(page).getByRole('link', { name: 'Places', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(group(page, 'Administration')).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebar(page).locator('a[href="/admin/settings"]')).toHaveCount(0);

  await page.goto('/admin');
  await expect(sidebar(page).getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
  const listings = group(page, 'Listings & Users');
  await expect(listings).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebar(page).locator('a[href="/admin/properties"]')).toHaveCount(0);

  await listings.click();
  await expect(listings).toHaveAttribute('aria-expanded', 'true');
  await sidebar(page).getByRole('link', { name: 'Properties', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/properties$/);
  await expect(listings).toHaveAttribute('aria-expanded', 'true');

  await listings.click();
  await expect(sidebar(page).locator('a[href="/admin/properties"]')).toHaveCount(0);
  expect(consoleErrors).toHaveLength(0);
});

test('a group with a single tab the staffer holds shows that tab directly, not a dropdown', async ({ page, login, consoleErrors }) => {
  await login.asStaff('rental');
  await page.goto('/staff');
  await expect(sidebar(page).getByRole('link', { name: 'Rent Agreement', exact: true })).toBeVisible();
  await expect(group(page, 'Service Desks')).toHaveCount(0);
  expect(consoleErrors).toHaveLength(0);
});
