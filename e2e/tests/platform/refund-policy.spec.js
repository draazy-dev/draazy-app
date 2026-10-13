import { test, expect } from '../../fixtures/live.js';
import { API, seedConsent } from '../../helpers/liveAuth.js';

const prose = (page) => page.locator('.legal-prose');

test.describe('LIVE: the Refund Policy page', () => {
  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('is rewritten around returned contacts, the pack window and the pass guarantee, with no tiers and no suspension clause', async ({ page, consoleErrors }) => {
    const { pricing } = await (await fetch(`${API}/bootstrap`)).json();
    const { packRefundDays, passGuaranteeDays, passGuaranteeEveryMonths, contactReplyDays } = pricing.refunds;

    await page.goto('/refund-policy');
    await expect(page.getByRole('heading', { level: 1, name: 'Refund Policy' })).toBeVisible();
    await expect(page.getByText('12 October 2026').first()).toBeVisible();

    const headings = await prose(page).getByRole('heading', { level: 2 }).allTextContents();
    expect(headings.map((h) => h.replace(/^\d+\.\s*/, ''))).toEqual([
      'Scope', 'Contacts come back', 'Contact Packs', 'Listing Passes', 'Rent agreements', 'How to request a refund',
      'Refund processing', 'Non-refundable items', 'Disputes and chargebacks', 'Grievance Officer', 'Changes to this policy',
    ]);

    await expect(prose(page)).toContainText(`within ${contactReplyDays} days`);
    await expect(prose(page)).toContainText(`within ${packRefundDays} days of buying it`);
    await expect(prose(page)).toContainText(`first ${passGuaranteeDays} live days`);
    await expect(prose(page)).toContainText(`once every ${passGuaranteeEveryMonths} months`);
    await expect(prose(page)).toContainText('you will see a Refund button');
    await expect(prose(page)).toContainText('a credit note for every refund');
    await expect(prose(page)).toContainText('nothing renews automatically');

    const text = await prose(page).innerText();
    expect(text, 'the 25% and 50% tiers are gone').not.toMatch(/\b(25|50)\s?%/);
    expect(text, 'a chargeback no longer suspends the account').not.toMatch(/suspen/i);
    expect(text).toContain('Your account, your other listings and your contacts keep working');

    expect(consoleErrors).toEqual([]);
  });

  test('names the Grievance Officer from settings, with a 48-hour acknowledgement and a one-month resolution', async ({ page }) => {
    const { legal } = await (await fetch(`${API}/bootstrap`)).json();
    const { name, email } = legal.grievanceOfficer;

    await page.goto('/refund-policy');
    const section = prose(page).locator('h2', { hasText: /Grievance Officer/ });
    await expect(section).toBeVisible();

    const paragraph = section.locator('xpath=following-sibling::p[1]');
    await expect(paragraph).toContainText(name);
    await expect(paragraph.getByRole('link', { name: email })).toHaveAttribute('href', `mailto:${email}`);
    await expect(paragraph).toContainText('acknowledge complaints within 48 hours');
    await expect(paragraph).toContainText('resolve them within one month');
  });

  test('the table of contents reaches the officer section, and Terms point here with the pass wording matched', async ({ page }) => {
    await page.goto('/refund-policy');
    await page.locator('.legal-toc button', { hasText: 'Grievance Officer' }).click();
    await expect(prose(page).locator('h2', { hasText: 'Grievance Officer' })).toBeInViewport();

    await page.goto('/terms');
    const terms = prose(page);
    await expect(terms).toContainText('A Listing Pass ends early when its listing is rented, sold or archived, with no refund for unused days.');
    await expect(terms).toContainText('Refunds, returned contacts and disputes are governed by our Refund Policy');
    await expect(terms.getByRole('link', { name: 'Refund Policy' })).toHaveAttribute('href', '/refund-policy');
    expect(await terms.innerText()).not.toMatch(/\b(25|50)\s?%/);
  });
});
