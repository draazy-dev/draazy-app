import { expect } from '@playwright/test';

// A collapsed sidebar group renders no links, so a tab's absence only means something once every group is open.
export async function expandAdminNav(page) {
  const nav = page.locator('aside nav');
  await expect(nav.getByRole('link').first()).toBeVisible();
  const collapsed = nav.locator('button[aria-expanded="false"]');
  while (await collapsed.count()) await collapsed.first().click();
}
