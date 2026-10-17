import { expect } from '@playwright/test';

/* Where a floating card's bottom edge should sit: resolves --dz-float-bottom (bottom nav, safe area, 12px gap)
   with a probe, because the custom property's computed value is an unresolved calc(). */
export const floatBottom = (page) => page.evaluate(() => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;bottom:var(--dz-float-bottom);height:0;width:0';
  document.body.appendChild(probe);
  const y = probe.getBoundingClientRect().top;
  probe.remove();
  return y;
});

const rect = (locator) => locator.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
});

/** Wait out the open animation, then assert the shared floating-card geometry. Returns the settled rect. */
export async function expectFloatingCard(page, card, { bottom } = {}) {
  let prev = null;
  await expect.poll(async () => {
    const box = await rect(card);
    const same = prev && prev.y === box.y && prev.height === box.height;
    prev = box;
    return Boolean(same);
  }, { message: 'the card never stopped moving' }).toBe(true);
  const vw = page.viewportSize().width;
  expect(prev.x, 'inset from the left edge').toBeGreaterThanOrEqual(11);
  expect(vw - prev.right, 'inset from the right edge').toBeGreaterThanOrEqual(11);
  expect(Math.abs(prev.bottom - (bottom ?? await floatBottom(page))), 'floats just above the nav').toBeLessThanOrEqual(1);
  await expect(card).toHaveCSS('border-bottom-left-radius', '24px');
  return prev;
}
