import { test, expect } from '@playwright/test';

/* A hand-edited or stale link can carry a value no control offers. It must be dropped like an unknown `v=` or
   `ptype=` already is: kept, it painted a chip nobody can recreate and the server matched nothing for it. */

const chips = (page) => page.locator('button[aria-label^="Remove filter "]')
  .evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label').slice('Remove filter '.length)));
const total = async (page) => {
  const line = page.locator('main p:visible', { hasText: /Showing \d+/ }).first();
  return Number((await line.innerText()).match(/Showing (\d+)/)[1]);
};

const CASES = [
  ['rent', 'availfrom=yesterday', ''],
  ['rent', 'tenants=zzz', ''],
  ['rent', 'furn=xyz', ''],
  ['rent', 'amen=zzz', ''],
  ['rent', 'ptype=flatmates&room=zzz', 'ptype=flatmates'],
  ['buy', 'facing=zzz', ''],
  ['buy', 'ptype=plot&landuse=zzz', 'ptype=plot'],
  ['buy', 'ptype=plot&na=zzz', 'ptype=plot'],
  ['buy', 'ptype=commercial&shell=zzz', 'ptype=commercial'],
  ['buy', 'ptype=commercial&ctype=zzz', 'ptype=commercial'],
  ['buy', 'near=abc&nearlabel=Nowhere', ''],
];

test('a URL value no control offers is dropped, not chipped or sent', async ({ page }) => {
  for (const [deal, junk, clean] of CASES) {
    await page.goto(`/listings?deal=${deal}${clean ? '&' + clean : ''}`);
    const want = { n: await total(page), chips: await chips(page) };

    await page.goto(`/listings?deal=${deal}&${junk}`);
    await expect.poll(() => total(page), junk).toBe(want.n);
    expect(await chips(page), junk).toEqual(want.chips);
    await expect.poll(() => new URL(page.url()).search, junk).toBe(`?deal=${deal}${clean ? '&' + clean : ''}`);
  }
});

test('the Shared Room type and its room-type chips read differently', async ({ page }) => {
  await page.goto('/listings?deal=rent&ptype=flatmates&room=shared,single');
  await expect.poll(() => chips(page)).toEqual(['Shared Room', 'Shared (twin-sharing)', 'Private room']);
});
