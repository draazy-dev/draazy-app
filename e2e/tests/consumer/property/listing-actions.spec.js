import { test, expect } from '@playwright/test';
import { seedConsent, signedInAsNew } from '../../../helpers/liveAuth.js';
import { signInSheet } from '../../../helpers/signInSheet.js';

const LISTING = 'p5013';
const OTHERS = ['p5121', 'p5122', 'p5123', 'p5124'];
const EDGE = 40;

async function openListing(page, id = LISTING) {
  await seedConsent(page);
  await page.goto(`/property/${id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20000 });
}

const hero = (page) => page.locator('.main-image-wrapper').first();
const share = (page) => page.getByRole('button', { name: 'Share', exact: true });
const save = (page) => page.getByRole('button', { name: 'Save Property', exact: true });
const compare = (page) => page.getByRole('button', { name: /^(Add to|Remove from) Compare$/ });
const counter = (page) => page.getByRole('button', { name: /^Fullscreen \d+\/\d+$/ });

for (const [label, viewport] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 375, height: 800 }]]) {
  test.describe(`Property page actions — ${label}`, () => {
    test.use({ viewport });

    test('Save sits top-left, Compare and Share top-right, all bare icons, and the old rows are gone', async ({ page }) => {
      await openListing(page);

      const box = await hero(page).boundingBox();
      const saveBox = await save(page).boundingBox();
      const compareBox = await compare(page).boundingBox();
      const shareBox = await share(page).boundingBox();
      expect(saveBox.x - box.x, 'Save hugs the hero left edge').toBeLessThan(EDGE);
      expect(saveBox.y - box.y).toBeLessThan(EDGE);
      expect(box.x + box.width - (shareBox.x + shareBox.width), 'Share hugs the hero right edge').toBeLessThan(EDGE);
      expect(compareBox.x, 'Compare sits left of Share').toBeLessThan(shareBox.x);
      expect(compareBox.x).toBeGreaterThan(box.x + box.width / 2);
      for (const b of [saveBox, compareBox, shareBox]) {
        expect(b.width).toBeGreaterThanOrEqual(43.5);
        expect(b.height).toBeGreaterThanOrEqual(43.5);
        expect(b.width, 'a bare icon, not a labelled pill').toBeLessThan(56);
      }

      await expect(page.getByRole('button', { name: /^Fullscreen$/ })).toHaveCount(0);
      await expect(share(page)).toHaveCount(1);
      await expect(save(page)).toHaveCount(1);
      await expect(hero(page).getByText(/^(Share|Save|Compare|Added)$/)).toHaveCount(0);
      await expect(page.getByRole('link', { name: /View Compare|^View \d+$/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^(Compare|Added)$/ })).toHaveCount(0);
    });

    test('the photo counter is the Fullscreen button and opens the lightbox', async ({ page }) => {
      await openListing(page);
      await expect(counter(page)).toBeVisible();
      await expect(counter(page)).toHaveAttribute('aria-label', /^Fullscreen 1\/\d+$/);
      await counter(page).click();
      await expect(page.locator('.dz-lightbox')).toBeVisible();
    });

    test('Save asks a signed-out visitor to sign in, in place', async ({ page }) => {
      await openListing(page);
      await expect(save(page)).toHaveAttribute('aria-pressed', 'false');
      await save(page).click();
      await expect(signInSheet(page)).toBeVisible();
    });

    test('a signed-in Save toggles aria-pressed on and off', async ({ page }) => {
      await signedInAsNew(page);
      await openListing(page);
      // The saved list drops a tap while its write is in flight, so each tap waits for its response.
      const written = () => page.waitForResponse((r) => /\/me\/saved\//.test(r.url()) && ['PUT', 'DELETE'].includes(r.request().method()));
      await expect(save(page)).toHaveAttribute('aria-pressed', 'false');
      let done = written();
      await save(page).click();
      await done;
      await expect(save(page)).toHaveAttribute('aria-pressed', 'true');
      done = written();
      await save(page).click();
      await done;
      await expect(save(page)).toHaveAttribute('aria-pressed', 'false');
    });

    test('Compare toggles Add to Compare and Remove from Compare, and the listing lands on /compare', async ({ page }) => {
      await openListing(page);

      const btn = compare(page);
      await expect(btn).toHaveAttribute('aria-pressed', 'false');
      await expect(btn).toHaveAttribute('title', 'Add to Compare');
      await expect(btn).toHaveAccessibleName('Add to Compare');

      await btn.click();
      await expect(btn).toHaveAttribute('aria-pressed', 'true');
      await expect(btn).toHaveAttribute('title', 'Remove from Compare');
      await expect(btn).toHaveAccessibleName('Remove from Compare');

      await page.goto('/compare');
      await expect(page.locator(`a[href="/property/${LISTING}"]`)).toBeVisible({ timeout: 15000 });
    });

    test('the fifth Compare add is refused with a toast, not a browser alert', async ({ page }) => {
      await page.addInitScript((ids) => localStorage.setItem('draazyCompare', JSON.stringify(ids)), OTHERS);
      const dialogs = [];
      page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
      await openListing(page);

      await compare(page).click();
      await expect(page.getByRole('alert').filter({ hasText: 'You can compare up to 4 properties' })).toBeVisible();
      await expect(compare(page)).toHaveAttribute('aria-pressed', 'false');
      expect(dialogs).toEqual([]);
    });
  });
}
