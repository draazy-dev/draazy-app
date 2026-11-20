import { test, expect } from '@playwright/test';
import { signedInAs, uniqueMobile } from '../../../helpers/liveAuth.js';
import { focusFlatmateMap } from '../../../helpers/locality.js';

const openMap = async (page, url) => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Map' }).click();
  await focusFlatmateMap(page, ['Baner']);
  // Room pins sit where hosts dropped them and can overlap; Enter on the marker is not hit-tested.
  const marker = page.locator('gmp-advanced-marker', { has: page.locator('[data-fm-pin]') }).first();
  await marker.waitFor({ timeout: 20000 });
  await marker.focus();
  await marker.press('Enter');
  await page.locator('.dz-sp-row').first().waitFor({ timeout: 10000 });
};

test('map bubbles preview posts with actions, open the list or a detail page, and group bubbles offer join', async ({ page }) => {
  test.slow();
  await signedInAs(page, uniqueMobile());

  await test.step('flatmate bubble previews posts with interest, save and view-details actions', async () => {
    await openMap(page, '/flatmates');

    expect(await page.locator('.dz-sp-row').count()).toBeGreaterThan(0);
    await expect(page.locator('.dz-sp-cta').first()).toBeVisible();
    await expect(page.locator('.dz-sp-save').first()).toBeVisible();
    await expect(page.locator('.dz-sp-all')).toBeVisible();

    const save = page.locator('.dz-sp-save').first();
    await save.click();
    await expect(save).toHaveClass(/is-saved/);
  });

  await test.step('"open in list" footer switches to the list filtered to that locality', async () => {
    await page.locator('.dz-sp-all').click();
    await expect(page.locator('.gm-style')).toHaveCount(0);
    await expect(page.locator('[data-sf-id]').first()).toBeVisible();
  });

  await test.step('group bubble previews groups with a join/request action', async () => {
    await openMap(page, '/flatmates?view=groups');
    await expect(page.locator('.dz-sp-row').first()).toBeVisible();
    const ctas = page.locator('.dz-sp-cta');
    await expect(ctas.filter({ hasText: /Join|Request|Full/ }).first()).toBeVisible();
  });

  await test.step('clicking a post row opens its detail page', async () => {
    await openMap(page, '/flatmates');
    await page.locator('.dz-sp-rowmain').first().click();

    await expect(page).toHaveURL(/\/flatmates\/(room|group|post)\/[^/?#]+$/);
    await expect(page.locator('h1')).toBeVisible({ timeout: 20_000 });
  });
});

test('a room whose request the host accepted offers "Message owner" in the map popup, not "Sent"', async ({ page }) => {
  test.slow();
  const seen = new Set();
  await page.route('**/api/flatmates/feed**', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    const walk = (v) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        if (typeof v.id === 'string') seen.add(v.id);
        Object.values(v).forEach(walk);
      }
    };
    walk(body);
    await route.fulfill({ response: res, json: body });
  });
  await page.route('**/api/me/flatmate-interests/keys', (route) =>
    route.fulfill({ json: [...seen].map((targetId) => ({ kind: 'room', targetId, status: 'accepted' })) }));
  await signedInAs(page, uniqueMobile());

  // The popup's rooms arrive in a later, area-scoped read; the second visit re-reads keys knowing them.
  await openMap(page, '/flatmates');
  await openMap(page, '/flatmates');

  await expect(page.locator('.dz-sp-cta').filter({ hasText: 'Message owner' }).first()).toBeVisible();
  await expect(page.locator('.dz-sp-cta').filter({ hasText: /^\s*Sent\s*$/ })).toHaveCount(0);
});
