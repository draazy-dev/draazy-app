import { test, expect } from '@playwright/test';
import { API, E2E_OTP, apiLogin, grantIdentityBadge, signedInAs, uniqueMobile } from '../../../helpers/liveAuth.js';
import { ACTORS } from '../../../fixtures/live.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { PHOTO_PNG } from '../../../helpers/listingPhotos.helper.js';
import { fillRoomDetails, fillRoomLocation, fillRoomPrice, nextStep, uploadRoomPhotos } from '../../../helpers/roomWizard.js';
import { badgeChecks, uploadAgreementDocument } from '../../../helpers/flatmateAgreement.js';
import { pickDate } from '../../../helpers/datePicker.helper.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const isoDaysFromNow = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
const track = flatmateCleanup(test);
const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const AGREEMENT_DOC = {
  mime: 'image/png',
  name: 'agreement.png',
  size: 70,
  dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ'
    + 'AAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
};

async function agreementDoc(token, doc = {}) {
  const uploaded = await uploadAgreementDocument(token);
  return {
    ...AGREEMENT_DOC,
    id: uploaded.id,
    name: uploaded.fileName || AGREEMENT_DOC.name,
    size: uploaded.sizeBytes || AGREEMENT_DOC.size,
    mime: uploaded.mimeType || AGREEMENT_DOC.mime,
    ...doc,
  };
}

async function adminToken() {
  return (await apiLogin(ACTORS.admin)).accessToken;
}

async function createTenantGroup(token, body = {}) {
  const proof = await agreementDoc(token, body.agreementDoc);
  const response = await fetch(`${API}/flatmates/groups`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({
      title: `Consent badge ${stamp()} in Baner`,
      locality: 'Baner',
      rent: 35000,
      deposit: 50000,
      seats: 3,
      seatsOpen: 1,
      policy: 'any',
      role: 'tenant',
      agreement: true,
      agreementDoc: proof,
      ...body,
    }),
  });
  const group = await response.json();
  expect(response.status, JSON.stringify(group)).toBe(201);
  track('groups', group.id, token);
  return group;
}
/** The queue row behind a post, read as the desk reads it rather than round the route. */
async function queuedReview(target) {
  const queue = await (await fetch(`${API}/admin/flatmate-reviews?size=100`, {
    headers: auth(await adminToken()),
  })).json();
  const row = queue.content.find((r) => r.groupId === target || r.roomId === target);
  expect(row, `an agreement-backed post must be queued for Ops (${target})`).toBeTruthy();
  return row;
}
/** Decide a queued review and hand back the raw response, so a refusal can be asserted on. */
async function decide(reviewId, decision, note = 'e2e verdict') {
  const response = await fetch(`${API}/admin/flatmate-reviews/${reviewId}`, {
    method: 'PATCH',
    headers: auth(await adminToken()),
    body: JSON.stringify({ decision, note, ...(decision === 'approved' ? { checks: badgeChecks() } : {}) }),
  });
  return { status: response.status, body: await response.text() };
}
/** Walk the owner through both legs of the consent OTP, which is the only way the flag is set. */
async function recordConsent(group, token, ownerMobile) {
  const address = { title: group.title, locality: group.locality };
  for (const payload of [{ ownerMobile, ...address }, { ownerMobile, otp: E2E_OTP, ...address }]) {
    const response = await fetch(`${API}/flatmates/owner-consent`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify(payload),
    });
    expect(response.status, `owner-consent ${JSON.stringify(payload)}`).toBe(200);
  }
}

test('Ops cannot badge a sub-let the owner never consented to, and can once they have', async () => {
  const hostMobile = uniqueMobile();
  const ownerMobile = uniqueMobile(); // a different number — the server refuses self-consent
  const { accessToken } = await apiLogin(hostMobile, { name: 'Consent Tenant' });
  await grantIdentityBadge(hostMobile);

  const group = await createTenantGroup(accessToken, { consentMobile: ownerMobile });
  expect(group.ownerConsent, 'a fresh group starts unconsented').toBe(false);
  // The whole point of the field: a desk that cannot see it is deciding on a photograph.
  const review = await queuedReview(group.id);
  expect(review.ownerConsent).toBe(false);
  // The refusal. 422 rather than 403 because the moderator holds every permission this needs —
  // "you are not allowed" would send them hunting for a role that cannot exist.
  const refused = await decide(review.id, 'approved');
  expect(refused.status, refused.body).toBe(422);
  expect(refused.body, 'the message must name the OTP as the way out').toMatch(/consent OTP/i);

  const rejected = await decide(review.id, 'rejected', 'e2e — refusing without consent');
  expect(rejected.status, rejected.body).toBe(200);
  // Now the owner actually consents, and the same claim goes through.
  const consented = await createTenantGroup(accessToken, { consentMobile: ownerMobile });
  await recordConsent(consented, accessToken, ownerMobile);

  const secondReview = await queuedReview(consented.id);
  expect(secondReview.ownerConsent, 'the OTP must have written the flag the gate reads').toBe(true);

  const approved = await decide(secondReview.id, 'approved');
  expect(approved.status, approved.body).toBe(200);
  expect(JSON.parse(approved.body).status).toBe('approved');
});
test('a consent taken before the group exists vouches for that flat and no other', async () => {
  const hostMobile = uniqueMobile();
  const ownerMobile = uniqueMobile();
  const { accessToken } = await apiLogin(hostMobile, { name: 'Consent Tenant' });
  await grantIdentityBadge(hostMobile);
  const title = `Consented flat ${stamp()} in Baner`;

  const address = { title, locality: 'Baner' };
  for (const payload of [{ ownerMobile, ...address }, { ownerMobile, otp: E2E_OTP, ...address }]) {
    const response = await fetch(`${API}/flatmates/owner-consent`, {
      method: 'POST',
      headers: auth(accessToken),
      body: JSON.stringify(payload),
    });
    expect(response.status, `owner-consent ${JSON.stringify(payload)}`).toBe(200);
  }
  // A send that names no flat is refused before it costs the owner an SMS.
  const unscoped = await fetch(`${API}/flatmates/owner-consent`, {
    method: 'POST',
    headers: auth(accessToken),
    body: JSON.stringify({ ownerMobile }),
  });
  expect(unscoped.status, await unscoped.clone().text()).toBe(400);
  // The flat the owner was asked about picks the consent up at submit time.
  const consented = await createTenantGroup(accessToken, { title, consentMobile: ownerMobile });
  expect(consented.ownerConsent, 'the flat named in the OTP must carry the flag').toBe(true);

  const elsewhere = await createTenantGroup(accessToken, {
    title: `Another flat ${stamp()} in Baner`,
    consentMobile: ownerMobile,
  });
  expect(elsewhere.ownerConsent, 'an unrelated flat must not inherit the consent').toBe(false);

  const refused = await decide((await queuedReview(elsewhere.id)).id, 'approved');
  expect(refused.status, refused.body).toBe(422);
});

test('the agreement, added after posting, asks only for the document, names the obligations and offers a way out', async ({ page }) => {
  const hostMobile = uniqueMobile();
  const { accessToken } = await apiLogin(hostMobile);
  await grantIdentityBadge(hostMobile);
  await signedInAs(page, hostMobile);

  await page.goto(`${BASE}/list-property?flatmate=1`);
  await expect(page.locator('.lp-meter')).toBeVisible({ timeout: 20_000 });
  await fillRoomDetails(page, { bhk: '2 BHK', roomType: 'Single (1 person)' });
  await nextStep(page);
  await fillRoomLocation(page, { society: `Consent Heights ${stamp()}` });
  await nextStep(page);
  await fillRoomPrice(page, { rent: '13500', deposit: '27000', availableFrom: '2026-12-01', host: 'tenant', ownerMobile: '9876501234' });
  await expect(page.getByTestId('room-agreement-later')).toBeVisible();
  await nextStep(page);
  await uploadRoomPhotos(page);
  const createdResponse = page.waitForResponse(
    (r) => /\/flatmates\/rooms$/.test(r.url()) && r.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await page.getByRole('button', { name: /Post & Find Flatmates/i }).click();
  const created = await createdResponse;
  expect(created.status()).toBe(201);
  const room = await created.json();
  track('rooms', room.id, accessToken);

  await page.getByTestId('room-agreement-nudge').getByRole('link', { name: 'Get verified' }).click();
  await expect(page.getByTestId('room-badge-request-card')).toBeVisible();
  // L5 — §55, the police intimation and the owner's consent, stated before the sub-let happens.
  const disclosure = page.getByTestId('tenant-disclosure');
  await expect(disclosure).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#agreement-reg-no, #agreement-registered-on, #agreement-valid-till')).toHaveCount(0);
  await expect(disclosure).toContainText(/owner/i);
  await expect(disclosure).toContainText(/police/i);
  // L4 — a host without an agreement is told where to get one rather than left to guess.
  const serviceLink = page.getByTestId('agreement-service-link');
  await expect(serviceLink).toHaveAttribute('href', '/services/rent-agreement?from=flatmates');

  await page.getByLabel('Upload registered rent agreement for room').setInputFiles({ name: 'agreement.png', mimeType: 'image/png', buffer: PHOTO_PNG });
  await expect(page.getByText('agreement.png')).toBeVisible();
  await pickDate(page, '[data-testid="badge-period-from"] .dz-datefield', isoDaysFromNow(-90));
  await pickDate(page, '[data-testid="badge-period-till"] .dz-datefield', isoDaysFromNow(270));
  // The proof that the upload is wired to the payload rather than only to the screen: the server queues it.
  const savedResponse = page.waitForResponse(
    (r) => /\/flatmates\/rooms\/[^/]+\/badge-request$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await page.getByTestId('request-room-badge').click();
  expect((await savedResponse).status()).toBe(200);
  await queuedReview(room.id);
});
