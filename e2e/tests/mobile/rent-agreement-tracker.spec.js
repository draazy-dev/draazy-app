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

  test('the owner cancels an unpaid request with a second tap, and the wizard unlocks', async ({ page }) => {
    const errors = trackErrors(page);
    await seedConsent(page);
    await signedInAsNew(page);
    await page.goto('/services/rent-agreement');
    const id = await page.evaluate(async (mobile) => {
      const svc = await import('/src/services/serviceRequestService.js');
      const filed = await svc.createCoFillServiceRequest({
        request: { type: 'rental', customer: { name: 'Tracker Owner' }, details: { property: 'Flat 3, Wakad, Pune' } },
        role: 'tenant',
        mobile,
      });
      return filed.id;
    }, uniqueMobile());
    await page.reload();

    const card = tracker(page).locator('.border-l-4').filter({ hasText: id.slice(0, 10) });
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Your request is already submitted')).toBeVisible();

    const cancel = card.getByTestId('tracker-cancel-unpaid');
    await expect(cancel).toHaveText('Cancel request');
    await cancel.click();
    await expect(cancel, 'one stray tap must not cancel').toHaveText('Tap again to cancel');
    await cancel.click();

    await expect(card, 'the cancelled request folds away').toHaveCount(0);
    await expect(tracker(page).getByRole('button', { name: 'Show 1 cancelled request' })).toBeVisible();
    await expect(page.getByText('Your request is already submitted'), 'the wizard is free to file again').toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a cancelled request is deleted with a second tap and stays gone', async ({ page }) => {
    const errors = trackErrors(page);
    await seedConsent(page);
    await signedInAsNew(page);
    await page.goto('/services/rent-agreement');
    const ids = await fileRequests(page);
    await page.reload();

    await tracker(page).getByRole('button', { name: 'Show 1 cancelled request' }).click();
    const card = tracker(page).locator('.border-l-4').filter({ hasText: ids.cancelled.slice(0, 10) });
    const remove = card.getByTestId('tracker-delete');
    await expect(remove).toHaveText('Delete');
    await expect(card.getByTestId('tracker-support')).toBeVisible();
    await remove.click();
    await expect(remove, 'one stray tap must not delete').toHaveText('Tap again to delete');
    await remove.click();

    await expect(card).toHaveCount(0);
    await expect(tracker(page).getByRole('button', { name: /cancelled request/ })).toHaveCount(0);
    await page.reload();
    await expect(tracker(page).locator('.border-l-4').filter({ hasText: ids.live.slice(0, 10) })).toBeVisible({ timeout: 15000 });
    await expect(tracker(page).getByRole('button', { name: /cancelled request/ }), 'deleted, not just hidden for this visit').toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('every request state lays its actions out in full rows with no clipped label', async ({ page }) => {
    const errors = trackErrors(page);
    await seedConsent(page);
    await signedInAsNew(page);
    const at = new Date().toISOString();
    const row = (id, status, extra = {}) => ({
      id, type: 'rent-agreement', status, details: { property: `Flat ${id}, Baner, Pune`, _state: {} }, mySideSubmitted: true,
      createdAt: at, documents: [], messages: [], timeline: [], parties: [], ...extra,
    });
    const rows = [
      row('layout0001', 'completed', { documents: [{ id: 'f1', category: 'final-document', fileName: 'registered.pdf', uploadedAt: at }] }),
      row('layout0002', 'draft-shared', {
        documents: [{ id: 'd1', category: 'draft', fileName: 'draft.pdf', uploadedAt: at }],
        draftApproval: { version: 1, approved: 0, total: 1, parties: [{ key: 'owner', label: 'Owner', method: 'session', mine: true }] },
      }),
      row('layout0003', 'awaiting-payment', { cancellable: true }),
      row('layout0004', 'cancelled'),
    ];
    await page.route(/\/api\/service-requests\?type=rent-agreement/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }));
    await page.route(/\/api\/service-requests\/layout\d+\/checklist/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' }));
    await page.goto('/services/rent-agreement');

    await tracker(page).getByRole('button', { name: 'Show 1 cancelled request' }).click();
    const groups = tracker(page).getByTestId('tracker-actions');
    await expect(groups).toHaveCount(rows.length, { timeout: 15000 });
    await expect(tracker(page).getByRole('button', { name: 'Download registered copy' })).toBeVisible();
    await expect(tracker(page).getByTestId('tracker-view-details')).toHaveCount(3);

    for (const group of await groups.all()) {
      const layout = await group.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const items = [...el.children].map((c) => {
          const r = c.getBoundingClientRect();
          return { label: c.textContent.trim(), left: r.left, right: r.right, top: Math.round(r.top), height: r.height, clipped: c.scrollWidth > c.clientWidth };
        });
        const lines = Object.values(items.reduce((acc, i) => ({ ...acc, [i.top]: [...(acc[i.top] || []), i] }), {}));
        return { left: box.left, right: box.right, items, lines };
      });
      for (const item of layout.items) {
        expect(item.clipped, `"${item.label}" fits its button`).toBe(false);
        expect(Math.round(item.height), `"${item.label}" is a 44px tap target`).toBe(44);
      }
      for (const line of layout.lines) {
        const labels = line.map((i) => i.label).join(' + ');
        expect(Math.abs(line[0].left - layout.left), `${labels} starts at the card edge`).toBeLessThanOrEqual(1);
        expect(Math.abs(line[line.length - 1].right - layout.right), `${labels} fills the row`).toBeLessThanOrEqual(1);
      }
      const download = layout.lines.find((line) => line.some((i) => i.label === 'Download registered copy'));
      if (download) expect(download, 'the registered copy is the lead action on its own row').toHaveLength(1);
    }
    expect(errors).toEqual([]);
  });

  test('the hero starts with the breadcrumb, not a blank band', async ({ page }) => {
    await seedConsent(page);
    await page.goto('/services/rent-agreement');
    const hero = page.locator('section.hero');
    const crumbs = hero.getByRole('navigation').first();
    await expect(crumbs).toBeVisible();
    const gap = await crumbs.evaluate((el) => el.getBoundingClientRect().top - el.closest('section').getBoundingClientRect().top);
    expect(gap).toBeLessThanOrEqual(24);
  });

  test('the wizard actions sit in flow at the end of the form, and Ask Draaz does not cover Next', async ({ page }) => {
    await seedConsent(page);
    await signedInAsNew(page);
    await page.goto('/services/rent-agreement');

    const next = page.getByRole('button', { name: /^Next/ });
    const bar = next.locator('xpath=..');
    await expect(bar, 'a sticky row drifts mid-screen when the iOS keyboard opens').toHaveCSS('position', 'static');

    await next.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await expect.poll(() => next.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    }), { message: 'nothing sits on top of Next' }).toBe(true);
  });

  test('the form sits on the page, not a card in a card, and its fields share one size', async ({ page }) => {
    const errors = trackErrors(page);
    await seedConsent(page);
    await page.goto('/services/rent-agreement');

    const form = page.locator('.ra-form-card');
    await expect(form).toHaveCSS('padding-left', '0px');
    await expect(form).toHaveCSS('box-shadow', 'none');
    await expect(form).toHaveCSS('border-top-width', '0px');

    const strip = form.locator('.hscroll-row').first();
    await expect.poll(() => strip.evaluate((el) => el.scrollWidth - el.clientWidth), { message: 'all six steps fit without a sideways scroll' }).toBeLessThanOrEqual(0);
    await expect(form.locator('.hscroll-fade--right').first(), 'no fade band over the steps').toHaveCSS('opacity', '0');

    const sizes = await form.evaluate((el) => ({
      inputs: [...el.querySelectorAll('input.field')].filter((i) => i.offsetParent).map((i) => Math.round(i.getBoundingClientRect().height)),
      labels: [...new Set([...el.querySelectorAll('.lbl')].filter((l) => l.offsetParent).map((l) => getComputedStyle(l).fontSize))],
    }));
    expect(sizes.inputs.length).toBeGreaterThan(0);
    expect(new Set(sizes.inputs)).toEqual(new Set([44]));
    expect(sizes.labels).toEqual(['14px']);
    expect(errors).toEqual([]);
  });
});
