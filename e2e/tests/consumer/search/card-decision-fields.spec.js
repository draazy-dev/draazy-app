import { test, expect } from '@playwright/test';
import { API, seedConsent } from '../../../helpers/liveAuth.js';

const get = async (path) => {
  const res = await fetch(`${API}${path}`);
  expect(res.ok, `GET ${path} answered ${res.status}`).toBe(true);
  return res.json();
};

const inr = (n) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2).replace(/\.00$/, '')} Cr`
  : n >= 1e5 ? `₹${(n / 1e5).toFixed(2).replace(/\.00$/, '')} L`
    : `₹${n.toLocaleString('en-IN')}`);

const cardFor = (page, row) => page.locator(`main a[href="/property/${row.slug}"]`).first();

test.beforeEach(async ({ page }) => {
  await seedConsent(page);
});

test('a home-rent card quotes the deposit and the society, and leaves area to the detail page', async ({ page }) => {
  const rows = (await get('/properties?deal=rent&size=100')).content;
  const home = (p) => p.deposit > 0 && p.bhk > 0 && p.area > 0 && !p.room && p.slug && p.localitySlug;
  const row = rows.find((p) => home(p) && p.societyName) ?? rows.find(home);
  expect(row, 'seeded rent stock must hold a BHK home with a deposit').toBeTruthy();

  await page.goto(`/listings?deal=rent&loc=${row.localitySlug}`, { waitUntil: 'domcontentloaded' });
  const card = cardFor(page, row);
  await expect(card).toBeVisible({ timeout: 20000 });
  await expect(card).toContainText(`Deposit ${inr(row.deposit)}`);
  await expect(card).not.toContainText(/sq\.ft/);
  await expect(card).not.toContainText(/\bBath/);
  if (row.societyName) await expect(card).toContainText(row.societyName);
});

test('a buy card carries the owner-shared RERA chip from the search payload, with no redundant deal badge', async ({ page }) => {
  const rows = (await get('/properties?deal=buy&size=100')).content;
  const row = rows.find((p) => p.reraId && p.slug && p.localitySlug);
  expect(row, 'seeded sale stock must hold a RERA-registered listing').toBeTruthy();

  await page.goto(`/listings?deal=buy&loc=${row.localitySlug}`, { waitUntil: 'domcontentloaded' });
  const card = cardFor(page, row);
  await expect(card).toBeVisible({ timeout: 20000 });
  await expect(card).toContainText('RERA shared');
  await expect(card.getByText(/^Sale$/i)).toHaveCount(0);
});
