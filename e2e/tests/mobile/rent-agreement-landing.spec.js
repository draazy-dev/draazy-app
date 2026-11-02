// @ts-check
import { test, expect } from '@playwright/test';
import { trackErrors } from '../../helpers/console.js';
import { seedConsent, signedInAsNew } from '../../helpers/liveAuth.js';

test.describe('Rent agreement landing on a phone', () => {
  test('jump links reach documents, inclusions and FAQs, documents switch by tab, and the CTA returns to the form', async ({ page }) => {
    const errors = trackErrors(page);
    await seedConsent(page);
    await signedInAsNew(page);
    await page.goto('/services/rent-agreement');

    const jump = page.getByRole('navigation', { name: 'Jump to' });
    const landsBelowHeader = (id) => expect.poll(
      () => page.locator(`#${id}`).evaluate((el) => { const top = el.getBoundingClientRect().top; return top >= 60 && top < 140; }),
      { message: `${id} lands just below the header`, timeout: 5000 },
    ).toBe(true);

    await expect(jump.getByRole('button')).toHaveCount(3);
    for (const b of await jump.getByRole('button').all()) {
      expect((await b.boundingBox())?.height ?? 0, 'jump buttons are thumb-sized').toBeGreaterThanOrEqual(44);
    }

    await jump.getByRole('button', { name: 'Documents' }).click();
    await landsBelowHeader('ra-docs');
    const docs = page.locator('#ra-docs');
    const tabs = docs.getByRole('tab');
    await expect(tabs).toHaveCount(3);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await expect(docs.getByRole('tabpanel')).toHaveCount(1);
    await expect(docs.getByText('Index II of the flat (mandatory)')).toBeVisible();

    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(docs.getByText('Index II of the flat (mandatory)')).toBeHidden();
    await expect(docs.getByText('Proof of current address (if outstation)')).toBeVisible();
    await tabs.nth(1).press('ArrowRight');
    await expect(tabs.nth(2)).toBeFocused();
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await jump.getByRole('button', { name: 'FAQs' }).click();
    await landsBelowHeader('ra-faq');
    const q = page.locator('#ra-faq .faq-q');
    await q.nth(1).click();
    await expect(q.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await expect(q.nth(0)).toHaveAttribute('aria-expanded', 'false');

    await page.locator('#ra-assist').scrollIntoViewIfNeeded();
    const tiles = await page.locator('#ra-assist li').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(tiles).size, 'inclusions sit two to a row').toBe(2);

    await page.getByRole('button', { name: 'Go to the form' }).click();
    await landsBelowHeader('ra-form');

    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});
