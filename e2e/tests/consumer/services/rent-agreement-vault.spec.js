/* The vault is read back over HTTP as evidence the paper left the browser. Index II belongs to the flat,
   so it lives in that listing's vault, never in the owner's personal documents. */
import { expect, test } from '../../../fixtures/live.js';
import { API, authHeaders, signedInAsNew } from '../../../helpers/liveAuth.js';
import { newListing } from '../../../helpers/monetisation.js';
import { fillProperty } from '../../../helpers/rentAgreementWizard.js';
import { gotoSettled } from '../../../helpers/settle.js';

const PAGE = '/services/rent-agreement';
const VAULT_NOTE = "Your Index II is saved to this property's Documents";
// The browser decodes even under-cap originals before uploading them unchanged.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4AWJiYGD4D8IgBpBmYAAAAAD//7vS9wEAAAAGSURBVAMAGDACA6ybwrYAAAAASUVORK5CYII=',
  'base64',
);

async function vault(mobile, scope) {
  const res = await fetch(`${API}/me/documents/${scope}`, { headers: await authHeaders(mobile) });
  expect(res.status, `the owner can read their ${scope} vault`).toBe(200);
  const body = await res.json();
  return Array.isArray(body) ? body : (body?.content || []);
}

async function seedIndexII(mobile, propertyId, name) {
  const form = new FormData();
  form.append('category', 'Index II');
  form.append('file', new Blob([PNG], { type: 'image/png' }), name);
  const { 'content-type': _json, ...headers } = await authHeaders(mobile);
  const res = await fetch(`${API}/me/documents/${propertyId}`, { method: 'POST', headers, body: form });
  expect(res.status, 'seeding Index II into the flat vault').toBe(201);
}

async function toOwnerStepFor(page, propertyId) {
  await gotoSettled(page, `${PAGE}?listing=${propertyId}`);
  await fillProperty(page);
}

async function uploadOwnerDoc(page, name) {
  const p = page.locator('.step-panel.active');
  await p.locator('input[type="file"]').first().setInputFiles({ name, mimeType: 'image/png', buffer: PNG });
  await expect(p.getByText(name.replace(/\.[^.]+$/, '.jpg'))).toBeVisible();
}

test.describe('rent-agreement document vault, live', () => {
  test('Index II uploaded in the wizard lands in the listing vault on the server, not the personal one, and a re-pick is not filed twice', async ({ page }) => {
    const mobile = await signedInAsNew(page);
    const { id: propertyId } = await newListing(mobile, { title: 'Vault flat' });
    expect(await vault(mobile, propertyId), 'a new listing starts with an empty vault').toHaveLength(0);

    await toOwnerStepFor(page, propertyId);
    await expect(page.getByText(VAULT_NOTE)).toBeVisible();
    await uploadOwnerDoc(page, 'live-own.png');
    await expect(page.getByText('Saved to your Documents')).toBeVisible({ timeout: 15000 });
    /* `fileName` because this reads the wire (`DocumentDto.fileName`); `name` is the client's word. */
    await expect(async () => {
      const arrived = await vault(mobile, propertyId);
      expect(arrived, 'Index II reached the listing vault').toHaveLength(1);
      expect(arrived[0].category).toBe('Index II');
      expect(arrived[0].fileName).toBe('live-own.jpg');
    }).toPass({ timeout: 15000 });
    expect(await vault(mobile, 'personal'), 'nothing about the flat is kept as a personal document').toHaveLength(0);
    const localCopy = await page.evaluate((m) => localStorage.getItem('draazyDocs:' + m), mobile);
    expect(localCopy, 'the wizard keeps no browser-local copy of the vault').toBeNull();

    await uploadOwnerDoc(page, 'live-own.png');
    await page.waitForTimeout(2000);
    expect(await vault(mobile, propertyId), 'the re-pick did not file a second copy').toHaveLength(1);
  });

  test("the listing's Index II is offered again on the next agreement for that flat", async ({ page }) => {
    const mobile = await signedInAsNew(page);
    const { id: propertyId } = await newListing(mobile, { title: 'Vault reuse flat' });
    await seedIndexII(mobile, propertyId, 'kept-index.png');

    await toOwnerStepFor(page, propertyId);
    await expect(page.getByText('From your Documents')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.step-panel.active').getByText('kept-index.png')).toBeVisible();
  });

  test('a paper the vault refused carries no "Saved to your Documents" badge', async ({ page }) => {
    const mobile = await signedInAsNew(page);
    const { id: propertyId } = await newListing(mobile, { title: 'Vault refused flat' });
    const vaultPath = new RegExp(`/api/me/documents/${propertyId}$`);
    await page.route(vaultPath, (route) =>
      (route.request().method() === 'POST' ? route.fulfill({ status: 503, body: 'blocked' }) : route.fallback()));

    await toOwnerStepFor(page, propertyId);
    const refused = page.waitForResponse((res) => res.request().method() === 'POST' && vaultPath.test(res.url()));
    await uploadOwnerDoc(page, 'refused-own.png');
    await refused;
    await expect(page.getByText('Saved to your Documents')).toHaveCount(0);
  });

  test('a flat typed in by hand has no vault, so the paper is never stored outside the request', async ({ page }) => {
    await signedInAsNew(page);
    const vaultWrites = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/api\/me\/documents\//.test(new URL(r.url()).pathname)) vaultWrites.push(r.url());
    });

    await gotoSettled(page, PAGE);
    await fillProperty(page);

    await expect(page.getByText(VAULT_NOTE)).toHaveCount(0);
    await uploadOwnerDoc(page, 'typed-own.png');
    await page.waitForTimeout(1500);
    expect(vaultWrites, 'no vault write without a listing').toEqual([]);
    await expect(page.getByText('Saved to your Documents')).toHaveCount(0);
  });
});