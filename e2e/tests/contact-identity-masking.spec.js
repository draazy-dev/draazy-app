import { test, expect } from '@playwright/test';

// A masked mobile is not unique, so it must never pass as an owner identity.
const MOD = '/src/lib/contact.js';

// Load lib/contact.js inside the page and run `fn` against its exports.
async function withContact(page, fn) {
  await page.goto('/');
  return page.evaluate(`(async () => {
    const m = await import(${JSON.stringify(MOD)});
    return (${fn.toString()})(m);
  })()`);
}

test('a masked owner number is not accepted as an identity', async ({ page }) => {
  const res = await withContact(page, (m) => ({
    masked: m.isFullMobile('98XXXXX210'),
    maskedRendered: m.isFullMobile('+91 98••• •••10'),
    empty: m.isFullMobile(''),
    nullish: m.isFullMobile(null),
    short: m.isFullMobile('98210'),
    real: m.isFullMobile('9530047855'),
    // The exact collapse that caused the leak.
    collapsesTo: String('98XXXXX210').replace(/\D/g, ''),
  }));

  expect(res.masked).toBe(false);
  expect(res.maskedRendered).toBe(false);
  expect(res.empty).toBe(false);
  expect(res.nullish).toBe(false);
  expect(res.short).toBe(false);
  expect(res.real).toBe(true);
  // Documents *why* the mask is dangerous: it still yields digits.
  expect(res.collapsesTo).toBe('98210');
});

test('the owner of a listing is still recognised by their full number', async ({ page }) => {
  const res = await withContact(page, (m) => {
    localStorage.setItem('draazyUser', JSON.stringify({ name: 'Owner', mobile: '9530047855' }));
    return {
      isOwner: m.isOwnerViewer('9530047855'),
      // Spacing/punctuation is irrelevant — only the digit count matters.
      isOwnerSpaced: m.isOwnerViewer('95300 47855'),
      // A country-coded value is 12 digits, so it is NOT an identity. Nothing in the app stores a
      // +91-prefixed mobile, and failing here only under-reveals, which is the safe direction.
      isOwnerCountryCoded: m.isOwnerViewer('+91 95300 47855'),
      stranger: m.isOwnerViewer('9812345670'),
      masked: m.isOwnerViewer('95XXXXX855'),
    };
  });

  expect(res.isOwner).toBe(true);
  expect(res.isOwnerSpaced).toBe(true);
  expect(res.isOwnerCountryCoded).toBe(false);
  expect(res.stranger).toBe(false);
  expect(res.masked).toBe(false);
});
