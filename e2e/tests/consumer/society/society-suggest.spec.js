import { expect, test } from '../../../fixtures/live.js';
import { signedInAsNew } from '../../../helpers/liveAuth.js';
import { mintSociety } from '../../../helpers/liveSociety.js';

/* A minted society carries only a name and a place; visitors cannot offer details for it. */

const BASE = process.env.BASE_URL || 'http://localhost:5173';

/** A seeded row that carries registration, conveyance and a full specification block. */
const CONFIRMED = 'horizon-woods-aditya-tathawade';

const statLabel = (page, label) => page.locator('.rd-lbl', { hasText: label });

async function openHub(page, slug) {
  await page.goto(`${BASE}/society/${slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
}

test('a seeded society prints its specification, and one nobody has confirmed prints none and offers no way to add details', async ({ page, request }) => {
  /* The seeded row first: on its own, the absence below would also pass against a page that
     stopped drawing the specification at all. */
  await openHub(page, CONFIRMED);
  await expect(statLabel(page, 'Total units')).toBeVisible();
  await expect(page.getByText('Limited details', { exact: true })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/RERA-registered|Society Verified/);

  const author = await signedInAsNew(page);
  const minted = await mintSociety(request, author, 'badge');
  await openHub(page, minted);
  await expect(page.getByText('Limited details', { exact: true })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/Society Verified|not confirmed|confirms the specifics|RERA-registered/i);
  await expect(statLabel(page, 'Total units')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Add details/i })).toHaveCount(0);
});
