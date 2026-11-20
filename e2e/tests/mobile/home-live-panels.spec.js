import { test, expect } from '@playwright/test';

/* The home flatmate panel draws only what `/bootstrap` → `flatmatePulse` says, and a Featured card's dots follow
   its photo swipe. Both inputs are stubbed: shard data moves under other specs, and the seed has no housed group. */

test.use({ serviceWorkers: 'block' });

const PANEL = "Can't afford a whole flat?";

async function withPulse(page, pulse) {
  await page.route('**/api/bootstrap', async (route) => {
    const doc = await (await route.fetch()).json();
    const next = { ...doc, flatmatePulse: pulse };
    if (pulse === undefined) delete next.flatmatePulse;
    await route.fulfill({ json: next });
  });
  await page.goto('/');
  const section = page.locator('section').filter({ hasText: PANEL }).last();
  await page.getByRole('button', { name: 'Find a flatmate' }).scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();
  return section;
}

test.describe('Home flatmate panel — live numbers', () => {
  test('draws the split and the seeker count it is sent, and long amounts wrap instead of colliding', async ({ page }) => {
    const panel = await withPulse(page, {
      seeking: 1243,
      initials: ['TD', 'IK', 'AR'],
      split: { locality: 'Hinjewadi Phase 1', bhk: 3, rent: 125000, seats: 4, share: 31250 },
    });

    await expect(panel).toContainText('3 BHK in Hinjewadi Phase 1');
    await expect(panel).toContainText('₹1,25,000/mo');
    await expect(panel).toContainText('Split 4 ways');
    await expect(panel).toContainText('₹31,250/mo');
    await expect(panel).toContainText('1,243 people looking for a flatmate');
    for (const i of ['TD', 'IK', 'AR']) await expect(panel.getByText(i, { exact: true })).toBeVisible();
    await expect(panel).not.toContainText('₹34,000');

    const overlaps = await panel.locator('dl > div').evaluateAll((rows) => rows.map((row) => {
      const a = row.querySelector('dt').getBoundingClientRect();
      const b = row.querySelector('dd').getBoundingClientRect();
      return a.right > b.left + 0.5 && a.bottom > b.top + 0.5 && b.bottom > a.top + 0.5;
    }));
    expect(overlaps, 'a label and its amount share pixels').toEqual([false, false]);

    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(client);
  });

  test('a flat with no stated BHK and a lone seeker read naturally', async ({ page }) => {
    const panel = await withPulse(page, {
      seeking: 1,
      initials: ['RS'],
      split: { locality: 'Aundh', rent: 36000, seats: 3, share: 12000 },
    });

    await expect(panel).toContainText('Flat in Aundh');
    await expect(panel).toContainText('Split 3 ways');
    await expect(panel).toContainText('1 person looking for a flatmate');
  });

  test('with nothing live the card is hidden rather than showing an example', async ({ page }) => {
    const panel = await withPulse(page, { seeking: 0, initials: [] });

    await expect(panel.getByRole('button', { name: 'Find a flatmate' })).toBeVisible();
    await expect(panel).not.toContainText('Whole flat');
    await expect(panel).not.toContainText('looking for a flatmate');
  });

  test('a server without the section leaves the pitch standing on its own', async ({ page }) => {
    const panel = await withPulse(page, undefined);

    await expect(panel.getByRole('button', { name: 'Post your requirement' })).toBeVisible();
    await expect(panel).not.toContainText('Whole flat');
  });
});

test('a Featured card swipes through its photos and its dots follow', async ({ page }) => {
  await page.route('**/api/properties/featured**', async (route) => {
    const rows = await (await route.fetch()).json();
    await route.fulfill({
      json: rows.map((r) => {
        const cover = r.coverImage || `/img/${r.id}.jpg`;
        return { ...r, coverImage: cover, images: [cover, `${cover}?v=2`, `${cover}?v=3`] };
      }),
    });
  });
  await page.goto('/');

  const card = page.locator('.property-card').filter({ has: page.locator('[data-card-dots]') }).first();
  await card.scrollIntoViewIfNeeded();
  const dots = card.locator('[data-card-dots] > span');
  const track = card.locator('.snap-x').first();
  const litIndex = () => dots.evaluateAll((els) => els.findIndex((el) => el.classList.contains('w-4')));

  await expect(dots).toHaveCount(3);
  await expect.poll(litIndex).toBe(0);

  await track.evaluate((el) => el.scrollBy({ left: el.clientWidth * 2, behavior: 'auto' }));
  await expect.poll(() => track.evaluate((el) => Math.round(el.scrollLeft / el.clientWidth)),
    { message: 'one throw may only ever advance one photo' }).toBe(1);
  await expect.poll(litIndex, { message: 'the second photo lights the second dot' }).toBe(1);

  await track.evaluate((el) => el.scrollTo({ left: el.clientWidth * 2, behavior: 'auto' }));
  await expect.poll(litIndex, { message: 'the last photo lights the last dot' }).toBe(2);
});
