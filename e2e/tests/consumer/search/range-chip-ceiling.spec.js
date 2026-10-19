import { test, expect } from '@playwright/test';

/* A range left at its ceiling is sent open-ended ("and above"), so its chip must say so: "₹92 L – ₹5 Cr"
   while a ₹6.8 Cr listing sits in the results reads as a filter that is not working. */

const chip = (page, label) => page.getByRole('button', { name: `Remove filter ${label}`, exact: true });

const CASES = [
  ['buy budget', 'deal=buy&budget=9200000-50000000', '₹92 L – ₹5 Cr+'],
  ['buy area', 'deal=buy&area=1000-6000', '1,000 sq.ft – 6,000 sq.ft+'],
  ['farm area', 'deal=buy&ptype=farmland&area=1-20&areaUnit=acre', '1 - 20+ acre'],
  ['buy age', 'deal=buy&age=5-25', '5–25+ yrs old'],
  ['buy floor', 'deal=buy&floor=2-40', 'Floor 2–40+'],
  ['rent', 'deal=rent&rent=20000-100000', '₹20,000 – ₹1,00,000+'],
  ['deposit', 'deal=rent&deposit=50000-1000000', 'Deposit ₹50,000 – ₹10,00,000+'],
];

test('a range chip at its ceiling reads "and above"; a capped one does not', async ({ page }) => {
  for (const [name, qs, label] of CASES) {
    await page.goto(`/listings?${qs}`);
    await expect(chip(page, label), name).toBeVisible();
  }
  await page.goto('/listings?deal=buy&budget=9200000-20000000');
  await expect(chip(page, '₹92 L – ₹2 Cr')).toBeVisible();
});

test('the filter panel summary agrees with the chip at the ceiling', async ({ page }) => {
  const panel = page.locator('aside:has(h3:has-text("Filters"))');
  for (const [qs, summary] of [
    ['deal=buy&budget=9200000-50000000', '₹92 L - ₹5 Cr+'],
    ['deal=rent&rent=20000-100000', '₹20,000 - ₹1,00,000+'],
    ['deal=rent&deposit=50000-1000000', '₹50,000 - ₹10,00,000+'],
  ]) {
    await page.goto(`/listings?${qs}`);
    await expect(panel, qs).toContainText(summary);
  }
});
