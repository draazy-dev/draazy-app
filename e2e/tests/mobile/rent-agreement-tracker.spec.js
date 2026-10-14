// @ts-check
import { test, expect } from '@playwright/test';
import { trackErrors } from '../../helpers/console.js';
import { seedConsent, signedInAsNew, uniqueMobile } from '../../helpers/liveAuth.js';

const tracker = (page) =>
  page.locator('section').filter({ hasText: 'Track progress, review the draft we prepare' });

// Two unpaid co-fill requests, one of them cancelled. Paying needs a complete agreement, so the live one stays unpaid.
async function fileRequests(page) {
  return page.evaluate(async (mobiles) => {
    const svc = await import('/src/services/serviceRequestService.js');
    const file = (property, mobile) => svc.createCoFillServiceRequest({
      request: { type: 'rental', customer: { name: 'Tracker Owner' }, details: { property } },
      role: 'tenant',
      mobile,
    });
    const cancelled = await file('Flat 7, Aundh, Pune', mobiles[0]);
    await svc.cancelServiceRequest(cancelled.id);
    const live = await file('Flat 12, Baner, Pune', mobiles[1]);
    return { cancelled: cancelled.id, live: live.id };
  }, [uniqueMobile(), uniqueMobile()]);
}

test.describe('Rent agreement tracker on a phone', () => {
  test('each request leads with its status, cancelled ones fold away, and nothing scrolls sideways', async ({ page }) => {
    const errors = trackErrors(page);
    await seedConsent(page);
    await signedInAsNew(page);
    await page.goto('/services/rent-agreement');
    const ids = await fileRequests(page);
    await page.reload();

    const cards = tracker(page).locator('.border-l-4');
    const live = cards.filter({ hasText: ids.live.slice(0, 10) });
    const cancelled = cards.filter({ hasText: ids.cancelled.slice(0, 10) });
    await expect(live).toBeVisible({ timeout: 15000 });
    await expect(cancelled, 'cancelled requests start folded away').toHaveCount(0);

    await expect(live.getByText('Flat 12, Baner, Pune')).toBeVisible();
    await expect(live.getByText('Unpaid · not submitted')).toBeVisible();
    const progress = live.getByRole('progressbar', { name: 'Request progress' });
    await expect(progress, 'unpaid is not submitted, so no step is under way').toHaveAttribute('aria-valuetext', 'Not started yet');

    const toggle = tracker(page).getByRole('button', { name: 'Show 1 cancelled request' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(cancelled.getByText('Cancelled', { exact: true })).toBeVisible();
    await expect(cards.first(), 'the live request stays above the cancelled one').toContainText(ids.live.slice(0, 10));
    await expect(cancelled.getByRole('progressbar'), 'a cancelled request shows no journey').toHaveCount(0);

    for (const card of [live, cancelled]) {
      expect(await card.evaluate((el) => el.scrollWidth - el.clientWidth), 'nothing in the card scrolls sideways').toBeLessThanOrEqual(0);
    }

    await tracker(page).getByRole('button', { name: 'Hide cancelled requests' }).click();
    await expect(cancelled).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('the Ask Draaz launcher clears the sticky wizard actions instead of covering Next', async ({ page }) => {
    await seedConsent(page);
    await signedInAsNew(page);
    await page.goto('/services/rent-agreement');

    // Park the form's top under the header so its action row is pinned to the bottom of the screen.
    await page.getByRole('heading', { name: 'Property & Agreement' }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);

    const next = page.getByRole('button', { name: /^Next/ });
    const bar = await next.locator('xpath=..').boundingBox();
    const launcher = await page.locator('.dz-assistant-layer').boundingBox();
    expect(bar, 'the step actions are on screen').not.toBeNull();
    expect(bar.y + bar.height, 'the step actions are pinned on screen').toBeLessThanOrEqual(page.viewportSize().height);
    expect(launcher, 'the launcher is on screen').not.toBeNull();
    expect(launcher.y + launcher.height, 'the launcher sits above the bar').toBeLessThanOrEqual(bar.y);
  });
});
