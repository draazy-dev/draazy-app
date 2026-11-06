// @ts-check
import { test, expect } from '@playwright/test';
import { ACTORS } from '../../../fixtures/live.js';
import { API, apiLogin, signedInAs, uniqueMobile, uploadedListingPhotos } from '../../../helpers/liveAuth.js';
import { sql } from '../../../helpers/monetisation.js';
import { trackErrors } from '../../../helpers/console.js';
import { gotoSettled, reloadSettled } from '../../../helpers/settle.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const CHECKS = ['identity', 'title', 'poa', 'address', 'terms'];

const bearer = (token) => ({ authorization: `Bearer ${token}` });

async function ok(method, path, token, body) {
  const form = body instanceof FormData;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: form ? bearer(token) : { ...bearer(token), 'content-type': 'application/json' },
    body: form ? body : body && JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status >= 300) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const upload = (name, fields = {}) => {
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), name);
  Object.entries(fields).forEach(([key, value]) => [value].flat().forEach((item) => form.append(key, item)));
  return form;
};

// e2e has no payment webhook, so the paid transition is written directly.
function settle(requestId) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error(`not a request id: ${requestId}`);
  const out = sql(`update service_requests set status = 'new' where id = '${requestId}' and status = 'awaiting-payment' returning id`);
  if (!out.includes(requestId)) throw new Error(`could not settle ${requestId}`);
}

/* The owner and the one tenant who joined are the only executing parties, so the draft needs exactly
   their two in-app approvals and no inline OTP. */
async function sharedDraft() {
  const ownerMobile = uniqueMobile();
  const tenantMobile = uniqueMobile();
  const owner = (await apiLogin(ownerMobile, { api: API })).accessToken;
  const tenant = (await apiLogin(tenantMobile, { api: API })).accessToken;
  const listing = await ok('POST', '/me/listings', owner, {
    title: '2BHK in Baner', deal: 'rent', propertyType: 'apartment', price: 30000, bhk: 2,
    locality: 'Baner', city: 'Pune', floor: 4, images: await uploadedListingPhotos(owner),
  });
  const request = await ok('POST', '/service-requests/co-fill', owner, {
    request: {
      type: 'rent-agreement',
      propertyId: listing.id,
      details: {
        ownerName: 'Draft Approval Owner', rent: 30000, deposit: 150000, months: 11,
        _state: { tenantMode: 'fill', prop: { gramPanchayat: false }, tenants: [{ name: 'Draft Approval Tenant', mobile: tenantMobile }] },
      },
    },
    role: 'tenant',
    mobile: tenantMobile,
  });
  const [invite] = await ok('GET', '/me/service-request-invites', tenant);
  await ok('POST', `/me/service-request-invites/${invite.id}`, tenant, { decision: 'accept' });
  settle(request.id);

  const desk = (await apiLogin(ACTORS.admin, { api: API })).accessToken;
  await ok('PATCH', `/service-requests/${request.id}/status`, desk, { status: 'assigned' });
  const { items } = await ok('GET', `/service-requests/${request.id}/checklist`, owner);
  for (const item of items) {
    const filer = item.id.startsWith('tenant-0-') ? tenant : owner;
    await ok('POST', `/service-requests/${request.id}/docs`, filer, upload(`${item.id}.png`, { category: item.id }));
  }
  const filed = await ok('GET', `/service-requests/${request.id}/checklist`, desk);
  for (const item of filed.items) {
    await ok('PUT', `/service-requests/${request.id}/checklist/${item.id}`, desk, { documentId: item.documentId, verdict: 'verified' });
  }
  await ok('POST', `/service-requests/${request.id}/draft`, desk, upload('draft.png', { checks: CHECKS }));
  return { id: request.id, owner, tenant, ownerMobile, tenantMobile };
}

const card = (page, id) => page.locator('div.border-l-4').filter({ hasText: id.slice(0, 10) });

async function approveFromTracker(page, mobile, id) {
  await signedInAs(page, mobile);
  await gotoSettled(page, `${BASE}/services/rent-agreement`);
  const mine = card(page, id);
  const approve = mine.getByRole('button', { name: /^Approve$/ });
  await expect(approve, 'the other party opening the draft does not unlock this one').toBeDisabled({ timeout: 15000 });
  await expect(mine.getByRole('button', { name: /Request changes/ }), 'a party yet to approve can still ask for changes').toBeVisible();
  await mine.getByRole('button', { name: /View draft/ }).click();
  await expect(approve).toBeEnabled({ timeout: 15000 });
  await approve.click();
  return mine;
}

test.describe('Rent Agreement — each party approves the draft on their own', () => {
  test('sharing the draft tells both the owner and the joined tenant', async () => {
    const r = await sharedDraft();
    for (const side of ['owner', 'tenant']) {
      const { content } = await ok('GET', '/notifications?size=100', r[side]);
      const shared = content.filter((n) => n.type === 'service.draft-shared');
      expect(shared, `the ${side} is told the draft is ready`).toHaveLength(1);
      expect(shared[0].link).toBe('/services/rent-agreement');
    }
  });

  for (const first of ['owner', 'tenant']) {
    test(`the ${first} approves first, sees a locked "Approved" button, and the other party still has to open and approve`, async ({ browser }) => {
      const r = await sharedDraft();
      const second = first === 'owner' ? 'tenant' : 'owner';

      const a = await browser.newContext();
      const page = await a.newPage();
      const errors = trackErrors(page);
      const mine = await approveFromTracker(page, r[`${first}Mobile`], r.id);
      const approved = mine.getByTestId('tracker-approved');
      await expect(approved).toBeVisible({ timeout: 15000 });
      await expect(approved).toBeDisabled();
      await expect(mine.getByRole('button', { name: /^Approve$/ })).toHaveCount(0);
      await expect(mine.getByRole('button', { name: /Request changes/ }), 'an approved party cannot ask for changes').toHaveCount(0);
      const late = await fetch(`${API}/service-requests/${r.id}/draft/decision`, {
        method: 'POST',
        headers: { ...bearer(r[first]), 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'reject', note: 'Second thoughts' }),
      });
      expect(late.status, 'the server refuses changes from a party who approved').toBe(409);
      const held = await ok('GET', `/service-requests/${r.id}`, r[first]);
      expect(held.status, 'one approval of two does not approve the draft').toBe('draft-shared');
      expect(held.draftApproval.approved).toBe(1);
      await reloadSettled(page);
      await expect(card(page, r.id).getByTestId('tracker-approved'), 'the approval survives a reload').toBeDisabled({ timeout: 15000 });
      expect(errors, 'no console errors').toEqual([]);
      await a.close();

      const b = await browser.newContext();
      await approveFromTracker(await b.newPage(), r[`${second}Mobile`], r.id);
      await expect.poll(async () => (await ok('GET', `/service-requests/${r.id}`, r[second])).status, { timeout: 15000 })
        .toBe('approved');
      await b.close();
    });
  }
});
