/* Every back-office route sits under one RoleRoute (`/admin/*`, `/ops/*` redirects into it), so the router's two
 * refusals are asserted once per route here; each desk's API-side refusals stay in its own spec. */
import { test, expect } from '../../fixtures/live.js';

const ROUTES = [
  { path: '/admin/content', heading: { name: 'Content' } },
  { path: '/admin/enquiries', heading: { name: 'Enquiries & Deals' } },
  { path: '/admin/places?tab=societies', heading: { name: 'Places', exact: true } },
  { path: '/admin/settings', heading: { name: 'Settings' } },
  { path: '/admin/places?tab=areas', heading: null },
  { path: '/admin/properties', heading: null },
  { path: '/ops', heading: { name: 'My Dashboard' } },
  { path: '/ops/rent-agreement', heading: { name: 'Rent Agreement' } },
  { path: '/ops/referrals', heading: { name: 'Referral audit' } },
  { path: '/ops/support', heading: { name: 'Support queue' } },
  { path: '/ops/drafting-desk', heading: { name: 'Property Valuation' } },
];

async function expectTurnedAway(page, { path, heading }) {
  await page.goto(path);
  await page.waitForURL('**/staff-login**');
  expect(new URL(page.url()).pathname, path).toBe('/staff-login');
  if (heading) await expect(page.getByRole('heading', heading), path).toHaveCount(0);
}

test('a signed-out visitor is sent to staff-login from every back-office route', async ({ page }) => {
  test.slow();
  for (const route of ROUTES) {
    await test.step(route.path, () => expectTurnedAway(page, route));
  }
});

test('a signed-in buyer is sent to staff-login from every back-office route', async ({ page, login }) => {
  test.slow();
  await login.asBuyer();
  for (const route of ROUTES) {
    await test.step(route.path, () => expectTurnedAway(page, route));
  }
});
