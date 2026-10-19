import { test, expect } from '../../../fixtures/live.js';
import { API } from '../../../helpers/liveAuth.js';

const DETAIL = ['slug', 'name', 'builder', 'localitySlug', 'lat', 'lng', 'placeId', 'year', 'towers', 'units', 'occupancy',
  'maintenancePerSqft', 'parkingRatio', 'lifts', 'security', 'water', 'power', 'petPolicy', 'vegPolicy', 'rera', 'amenities',
  'listingCount', 'forSale', 'forRent', 'psf', 'rentAvg', 'homes'];
const HOME = ['id', 'slug', 'title', 'deal', 'bhk', 'price', 'area'];
const BRIEF = ['slug', 'name', 'builder', 'units', 'towers', 'year', 'occupancy', 'avgRating', 'reviewCount'];
const OWNER = ['name', 'mobile', 'verified', 'city', 'memberSince', 'listingCount'];
const OWNER_ID = '3ad0171b-3206-53e2-b6dc-732bf4e1b44c';

const isGet = (r, test) => r.request().method() === 'GET' && test(new URL(r.url()));
const extra = (body, allowed) => Object.keys(body).filter((k) => !allowed.includes(k));

async function aSocietyWithHomes() {
  const page = await (await fetch(`${API}/societies?hasListings=true&size=1`)).json();
  const slug = page.content[0].slug;
  return (await (await fetch(`${API}/societies/${slug}`)).json());
}

test('the society hub reads a slim detail and a five-review page', async ({ page, consoleErrors }) => {
  const { slug } = await aSocietyWithHomes();
  const detail = page.waitForResponse((r) => isGet(r, (u) => u.pathname === `/api/societies/${slug}`));
  const reviews = page.waitForRequest((r) => r.url().includes(`/api/reviews/society/${slug}`));
  await page.goto(`/society/${slug}`);
  const body = await (await detail).json();
  expect(extra(body, DETAIL)).toEqual([]);
  expect(body.homes.length).toBeGreaterThan(0);
  expect(body.homes.length).toBeLessThanOrEqual(6);
  expect([...new Set(body.homes.flatMap((h) => Object.keys(h)))].filter((k) => !HOME.includes(k))).toEqual([]);
  expect(new URL((await reviews).url()).searchParams.get('size')).toBe('5');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('a listing page shows its society from the brief, with no review read', async ({ page, consoleErrors }) => {
  const soc = await aSocietyWithHomes();
  const reviewReads = [];
  page.on('request', (r) => { if (r.url().includes('/api/reviews/society/')) reviewReads.push(r.url()); });
  const brief = page.waitForResponse((r) => isGet(r, (u) => u.pathname === `/api/societies/${soc.slug}/brief`));
  await page.goto(`/property/${soc.homes[0].slug || soc.homes[0].id}?tab=amenities`);
  const body = await (await brief).json();
  expect(extra(body, BRIEF)).toEqual([]);
  await expect(page.locator(`a[href="/society/${soc.slug}"]`).first()).toBeVisible();
  expect(reviewReads).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('the owner page reads a seller card without an id and one rail of listings', async ({ page, consoleErrors }) => {
  const card = page.waitForResponse((r) => isGet(r, (u) => u.pathname === `/api/owners/${OWNER_ID}`));
  const rail = page.waitForRequest((r) => {
    const u = new URL(r.url());
    return u.pathname === '/api/properties' && u.searchParams.get('owner') === OWNER_ID;
  });
  await page.goto(`/owner/${OWNER_ID}`);
  expect(extra(await (await card).json(), OWNER)).toEqual([]);
  expect(new URL((await rail).url()).searchParams.get('size')).toBe('12');
  expect(consoleErrors).toEqual([]);
});

test('the locality page splits its inventory line into a sale and a rent link that each land on matching results', async ({ page, consoleErrors }) => {
  const localities = await (await fetch(`${API}/localities`, { headers: { 'Cache-Control': 'no-cache' } })).json();
  const busy = localities.find((l) => l.forSale > 0 && l.forRent > 0);
  expect(busy, 'a locality with sale and rent stock').toBeTruthy();
  expect(busy.forSale + busy.forRent).toBe(busy.liveListings);
  await page.goto(`/locality/${busy.slug}`);
  const want = [['buy', busy.forSale, busy.fromSale, 'for sale'], ['rent', busy.forRent, busy.fromRent, 'for rent']];
  for (const [deal, n, from, word] of want) {
    const strip = page.locator(`a[href="/listings?deal=${deal}&loc=${busy.slug}"]`).filter({ hasText: word });
    await expect(strip).toContainText(String(n));
    if (from != null) await expect(strip).toContainText('₹');
    // Only the v-badge count may be called verified.
    await expect(strip).not.toContainText(/verified/i);
  }
  expect(consoleErrors).toEqual([]);
  for (const [deal, n] of want) {
    await page.goto(`/listings?deal=${deal}&loc=${busy.slug}`);
    await expect(page.locator('main p:visible', { hasText: /Showing \d+/ }).first()).toContainText(`Showing ${n} `);
  }
});

test('the locality strip keeps its from-price on one line on a phone', async ({ page }) => {
  const localities = await (await fetch(`${API}/localities`)).json();
  const busy = localities.find((l) => l.forSale > 0 && l.fromSale != null);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/locality/${busy.slug}`);
  const price = page.locator(`a[href="/listings?deal=buy&loc=${busy.slug}"] span.font-semibold`).first();
  await expect(price).toContainText('₹');
  // Sweeping phone widths is what lands the line break inside "₹38 L" for some name length.
  for (let width = 320; width <= 430; width += 5) {
    await page.setViewportSize({ width, height: 844 });
    expect(await price.evaluate((el) => el.getClientRects().length), `"${await price.innerText()}" at ${width}px`).toBe(1);
  }
});
