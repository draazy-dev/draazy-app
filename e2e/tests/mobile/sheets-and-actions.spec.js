import { test, expect } from '@playwright/test';

const MIN_TAP = 44;

// Cookie bar overlaps bottom-anchored chrome; pre-seed consent like the other specs do.
async function withConsent(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('dz_cookie_consent_v1', JSON.stringify({ necessary: true, functional: true, analytics: true, marketing: true, version: 1, ts: Date.now() }));
    } catch {}
  });
}

test.describe('Mobile listings controls', () => {
  test('the filters pill, view toggles and drawer behave on a phone', async ({ page }) => {
    test.slow();
    await withConsent(page);
    await page.goto('/listings');
    const pill = page.locator('button.fixed.rounded-full', { hasText: /filter/i }).first();
    const panel = page.locator('.filter-panel');

    await test.step('a filters pill sits in the thumb arc and clears the bottom nav', async () => {
      await expect(pill).toBeVisible();

      const pillBox = await pill.boundingBox();
      expect(pillBox).not.toBeNull();
      expect(pillBox.height).toBeGreaterThanOrEqual(MIN_TAP);

      // It must live in the lower half of the screen — that is the whole point.
      const vh = page.viewportSize().height;
      expect(pillBox.y).toBeGreaterThan(vh / 2);

      // Asserted present, not guarded: under the mobile projects the nav is unconditional,
      // so `if (await nav.count())` could only hide a bug.
      const nav = page.locator('nav.dz-bottom-nav');
      await expect(nav).toBeVisible();
      const navBox = await nav.boundingBox();
      expect(pillBox.y + pillBox.height).toBeLessThanOrEqual(navBox.y + 1);
    });

    await test.step('view toggles keep a 44px target', async () => {
      // Both toggles are permanent chrome on /listings, so a missing one is a regression, not a variant.
      // They are drawn smaller (.dz-segmented); the 44px target is the transparent ::before.
      for (const name of [/grid view/i, /list view/i]) {
        const btn = page.getByRole('button', { name }).first();
        await expect(btn, `${name} must be present to measure`).toBeVisible();
        const t = await btn.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const ps = getComputedStyle(el, '::before');
          const on = ps.content !== 'none' && ps.position === 'absolute';
          return { w: Math.max(r.width, on ? parseFloat(ps.width) : 0), h: Math.max(r.height, on ? parseFloat(ps.height) : 0) };
        });
        expect(t.w).toBeGreaterThanOrEqual(MIN_TAP);
        expect(t.h).toBeGreaterThanOrEqual(MIN_TAP);
      }
    });

    await test.step('the filters pill opens the filter drawer, whose close button is 44px', async () => {
      await pill.click();
      const close = page.getByRole('button', { name: /close filters/i });
      await expect(close).toBeVisible();
      await expect(panel).toHaveClass(/open/);
      await expect(panel).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
      // A floating card like the Draaz panel: inset from the edges and docked above the bottom nav.
      const pb = await panel.boundingBox();
      const nb = await page.locator('nav.dz-bottom-nav').boundingBox();
      expect(pb.x).toBeGreaterThanOrEqual(12);
      expect(pb.y + pb.height).toBeLessThanOrEqual(nb.y);
      await expect(panel).toHaveCSS('border-bottom-left-radius', '24px');
      // Phones hide native scrollbars at rest, so the drawn rail must be visible and track the scroll.
      const thumb = panel.locator('.scroll-rail > span');
      await expect(thumb).toBeVisible();
      const y0 = (await thumb.boundingBox()).y;
      await panel.locator('.filter-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await expect.poll(async () => (await thumb.boundingBox()).y).toBeGreaterThan(y0);
      await panel.locator('.filter-scroll').evaluate((el) => { el.scrollTop = 0; });
      const cb = await close.boundingBox();
      expect(cb.width).toBeGreaterThanOrEqual(MIN_TAP);
      expect(cb.height).toBeGreaterThanOrEqual(MIN_TAP);
    });

    // Nested slider drags must not trigger the drawer's same-axis dismiss gesture.
    await test.step('dragging the budget thumb moves the thumb, not the drawer', async () => {
      const maxThumb = page.getByRole('slider', { name: /budget range maximum/i });
      await expect(maxThumb).toBeVisible();
      const before = await maxThumb.inputValue();

      // Press the thumb because the track itself has `pointer-events: none`.
      const box = await maxThumb.boundingBox();
      const y = box.y + box.height / 2;
      const x = box.x + box.width - 10;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 140, y, { steps: 14 });
      await page.mouse.up();

      await expect(panel).toHaveClass(/open/);
      await expect(page.getByRole('button', { name: /close filters/i })).toBeVisible();
      expect(Number(await maxThumb.inputValue())).toBeLessThan(Number(before));
    });

    await test.step('dragging the drawer body still dismisses it', async () => {
      const body = panel.locator('.filter-scroll');
      await body.evaluate((el) => { el.scrollTop = 0; });
      const box = await body.boundingBox();
      const y = box.y + 24;
      const x = box.x + box.width / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + 140, { steps: 14 });
      await page.mouse.up();

      await expect(panel).not.toHaveClass(/open/);
    });
  });
});

test.describe('Mobile property gallery', () => {
  test('the hero is full-bleed and the dot rail replaces thumbnails', async ({ page }) => {
    await withConsent(page);
    await page.goto('/listings');

    const card = page.locator('a[href^="/property/"]').filter({ has: page.locator('img') }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();

    const hero = page.locator('.main-image-wrapper img').first();
    await expect(hero).toBeVisible({ timeout: 20_000 });

    const heroBox = await hero.boundingBox();
    const vw = page.viewportSize().width;
    expect(heroBox.width).toBeGreaterThanOrEqual(vw - 1);

    // A 4:3 minimum prevents a letterboxed hero on narrow screens.
    expect(heroBox.height).toBeGreaterThan(vw * 0.6);

    // The desktop thumbnail strip must not be showing on a phone.
    await expect(page.locator('button.thumbnail').first()).toBeHidden();
  });
});