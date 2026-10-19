import { test, expect } from '@playwright/test';

// Seeded listings whose `area` differs from their carpet area are the ones that disagreed: the card showed `area`,
// the detail headline showed carpet beside a ₹/sq.ft computed on `area`.
const AREA = /[\d,]+ sq\.ft\./;
const PSF = /₹[\d,]+\/sq\.ft/;

test('a card and its detail page quote the same area and ₹/sq.ft', async ({ page }) => {
  await page.goto('/listings?deal=buy&sort=newest');
  const cards = page.locator('main a[href^="/property/"]');
  await expect(cards.first()).toBeVisible();
  const hrefs = [...new Set(await cards.evaluateAll((as) => as.map((a) => a.getAttribute('href'))))].slice(0, 6);
  const quoted = [];
  for (const href of hrefs) {
    const text = (await page.locator(`main a[href="${href}"]`).first().innerText()).replace(/\s+/g, ' ');
    if (AREA.test(text) && PSF.test(text)) quoted.push({ href, area: text.match(AREA)[0], psf: text.match(PSF)[0] });
  }
  expect(quoted.length).toBeGreaterThan(1);
  for (const { href, area, psf } of quoted) {
    await page.goto(href);
    const header = page.locator('main h1').first().locator('xpath=ancestor::*[.//*[contains(text(),"/sq.ft")]][1]');
    await expect(header, href).toContainText(psf);
    await expect(header, href).toContainText(area);
  }
});
