import { test, expect } from '@playwright/test';
import { API, E2E_OTP, apiLogin, fileIdentityCase, grantIdentityBadge, signedInAsNew } from '../../../helpers/liveAuth.js';
import { pickDate } from '../../../helpers/datePicker.helper.js';
import { ACTORS } from '../../../fixtures/live.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { PHOTO_PNG } from '../../../helpers/listingPhotos.helper.js';
import { fillRoomDetails, fillRoomLocation, fillRoomPrice, nextStep, uploadRoomPhotos } from '../../../helpers/roomWizard.js';
import { createRequire } from 'node:module';

const { PDFDocument } = createRequire(new URL('../../../../frontend/package.json', import.meta.url))('pdf-lib');
// Browser uploads must reach the real review queue; browser-only review labels remain out of scope.
const AGREEMENT_FILE = { name: 'agreement.png', mimeType: 'image/png', buffer: PHOTO_PNG };
async function agreementPdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('Leave and licence agreement');
  return { name: 'agreement.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) };
}
const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
const track = flatmateCleanup(test);
const AGREEMENT_CHECKS = () => ({
  nameMatches: true, addressMatches: true, validTill: new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10),
});

async function fillRoomUpToConsent(page, society) {
  await page.goto('/list-property?flatmate=1');
  await expect(page.locator('.lp-meter')).toBeVisible({ timeout: 20_000 });
  await fillRoomDetails(page, { bhk: '2 BHK', roomType: 'Single (1 person)' });
  await nextStep(page);
  await fillRoomLocation(page, { society });
  await nextStep(page);
  await expect(page.getByText('I have a registered rent agreement', { exact: true }), 'the agreement waits until after posting').toHaveCount(0);
  await fillRoomPrice(page, { rent: '13500', deposit: '27000', availableFrom: '2026-12-01' });
}

async function uploadAgreement(page, file) {
  const uploaded = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/me/documents/personal' && response.request().method() === 'POST';
  });
  await page.getByLabel('Upload registered rent agreement for room').setInputFiles(file);
  expect([200, 201]).toContain((await uploaded).status());
  await expect(page.getByText(/agreement\.(png|pdf)/)).toBeVisible();
}

async function postRoom(page, society) {
  await fillRoomUpToConsent(page, society);
  await nextStep(page);
  await uploadRoomPhotos(page);
  const created = page.waitForResponse((r) => /\/api\/flatmates\/rooms$/.test(r.url()) && r.request().method() === 'POST');
  await page.getByRole('button', { name: /Post & Find Flatmates/i }).click();
  const response = await created;
  const room = await response.json();
  expect(response.status(), JSON.stringify(room)).toBe(201);
  expect(room.verificationTier, 'a room posted without an agreement carries no tenant badge').toBe('identity');
  return room;
}

async function openRoomDocuments(page) {
  await page.getByTestId('room-agreement-nudge').getByRole('link', { name: 'Get verified' }).click();
  await expect(page.getByTestId('room-badge-request-card')).toBeVisible();
}

const isoDay = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const PERIOD = { from: isoDay(-120), till: isoDay(240) };

async function fillAgreementPeriod(page) {
  await pickDate(page, '[data-testid="badge-period-from"] .dz-datefield', PERIOD.from);
  await pickDate(page, '[data-testid="badge-period-till"] .dz-datefield', PERIOD.till);
}

async function requestBadge(page, token) {
  if (await page.getByTestId('badge-period-from').count()) await fillAgreementPeriod(page);
  const saved = page.waitForResponse((r) => /\/api\/flatmates\/rooms\/[^/]+\/badge-request$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
  await page.getByTestId('request-room-badge').click();
  const response = await saved;
  expect(response.status(), await response.text()).toBe(200);
  await expect(page.getByTestId('room-badge-request-card')).toHaveAttribute('data-state', 'pending');
  const id = new URL(page.url()).searchParams.get('room');
  const detail = await fetch(`${API}/flatmates/rooms/${id}`, { headers: auth(token) });
  expect(detail.status).toBe(200);
  return (await detail.json()).item;
}

async function pendingReviews() {
  const { accessToken } = await apiLogin(ACTORS.admin);
  const response = await fetch(`${API}/admin/flatmate-reviews?status=pending&size=100`, { headers: auth(accessToken) });
  expect(response.status).toBe(200);
  return (await response.json()).content;
}

test('an agreement added after posting, as a PNG or a PDF, backs a tenant-tier room and reaches the real verification queue', async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await signedInAsNew(page);
  const { accessToken } = await apiLogin(mobile);
  await grantIdentityBadge(mobile);

  await test.step('a browser upload reaches the real verification queue with agreement evidence', async () => {
    const posted = await postRoom(page, `Agreement Png ${Date.now().toString(36)}`);
    track('rooms', posted.id, accessToken);
    await page.goto('/dashboard#properties');
    const verifyLink = page.getByTestId(`room-verification-${posted.id}`);
    await expect(verifyLink).toHaveText('Get Verified property badge');
    const statusPanel = page.getByTestId(`flatmate-status-${posted.id}`);
    await expect(statusPanel).toContainText('Under review');
    await expect(statusPanel.getByTestId(`room-verification-${posted.id}`)).toBeVisible();
    await verifyLink.click();
    await expect(page.getByTestId('room-badge-request-card')).toBeVisible();
    await uploadAgreement(page, AGREEMENT_FILE);
    const beforeRequest = await fetch(`${API}/flatmates/rooms/${posted.id}`, { headers: auth(accessToken) });
    expect((await beforeRequest.json()).item.reviewStatus).toBeNull();
    const room = await requestBadge(page, accessToken);
    expect(room.verificationTier).toBe('tenant');
    expect(room.reviewStatus).toBe('pending');
    expect(room.modStatus).toBe(posted.modStatus);
    await page.reload();
    await expect(page.getByTestId('room-badge-request-card')).toHaveAttribute('data-state', 'pending');

    const review = (await pendingReviews()).find((row) => row.roomId === room.id);
    expect(review, 'an agreement-backed room must be queued for Ops').toBeTruthy();
    expect(review).not.toHaveProperty('agreementDoc');
    const detail = await fetch(`${API}/admin/flatmates/${room.id}`, { headers: auth((await apiLogin(ACTORS.admin)).accessToken) });
    expect(detail.status).toBe(200);
    expect((await detail.json()).review.agreementDoc).toMatchObject({ validFrom: PERIOD.from, validTill: PERIOD.till });

    const rejected = await fetch(`${API}/admin/flatmate-reviews/${review.id}`, {
      method: 'PATCH', headers: auth((await apiLogin(ACTORS.admin)).accessToken),
      body: JSON.stringify({ decision: 'rejected', note: 'Please upload the complete agreement' }),
    });
    expect(rejected.status, await rejected.text()).toBe(200);
    await page.reload();
    await expect(page.getByTestId('room-badge-request-card')).toHaveAttribute('data-state', 'rejected');
    await expect(page.getByTestId('room-badge-request-card')).toContainText('Please upload the complete agreement');
    expect((await requestBadge(page, accessToken)).reviewStatus).toBe('pending');

    await page.goto(`/list-property?flatmate=1&editRoom=${posted.id}&step=3`);
    await expect(page.getByRole('heading', { name: 'Rent & terms', exact: true })).toBeVisible();
    await expect(page.getByLabel('Upload registered rent agreement for room')).toHaveCount(0);
    await nextStep(page);
    const edited = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/flatmates/rooms/${posted.id}` && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Save changes' }).click();
    const editedResponse = await edited;
    expect(editedResponse.status()).toBe(200);
    expect(editedResponse.request().postDataJSON()).toMatchObject({
      agreementDeclared: true, agreementDoc: { id: room.host.agreementDoc.id },
    });
    for (const otp of [undefined, E2E_OTP]) {
      const consent = await fetch(`${API}/flatmates/owner-consent`, {
        method: 'POST', headers: auth(accessToken),
        body: JSON.stringify({
          ownerMobile: room.host.ownerConsentMobile, title: room.title, society: room.society, locality: room.locality, otp,
        }),
      });
      expect(consent.status, await consent.text()).toBe(200);
    }
    const currentReview = (await pendingReviews()).find((row) => row.roomId === room.id);
    const approved = await fetch(`${API}/admin/flatmate-reviews/${currentReview.id}`, {
      method: 'PATCH', headers: auth((await apiLogin(ACTORS.admin)).accessToken),
      body: JSON.stringify({ decision: 'approved', note: 'Agreement and owner consent checked', checks: AGREEMENT_CHECKS() }),
    });
    expect(approved.status, await approved.text()).toBe(200);
    await page.goto(`/dashboard?tab=documents&room=${room.id}`);
    await expect(page.getByTestId('room-badge-request-card')).toHaveAttribute('data-state', 'approved');
    await page.goto('/dashboard#properties');
    await expect(page.getByTestId(`room-verification-${room.id}`)).toHaveText('Verified property');
  });

  await test.step('a PDF agreement uploads and backs a tenant-tier room', async () => {
    const posted = await postRoom(page, `Agreement Pdf ${Date.now().toString(36)}`);
    track('rooms', posted.id, accessToken);
    await openRoomDocuments(page);
    await uploadAgreement(page, await agreementPdf());
    expect((await requestBadge(page, accessToken)).verificationTier).toBe('tenant');
  });
});

test('a posted room requests its badge only from Documents and cannot submit without evidence', async ({ page }) => {
  const mobile = await signedInAsNew(page);
  const { accessToken } = await apiLogin(mobile);
  const posted = await postRoom(page, `Agreement Missing ${Date.now().toString(36)}`);
  track('rooms', posted.id, accessToken);
  let saved = 0;
  page.on('request', (r) => { if (r.method() === 'POST' && /\/badge-request$/.test(r.url())) saved += 1; });

  await openRoomDocuments(page);
  await expect(page.getByTestId('badge-id-step'), 'an unverified host is sent to the standard ID check first').toContainText('verify your ID');
  await expect(page.getByTestId('request-room-badge')).toBeDisabled();
  expect(saved).toBe(0);
  await page.goto(`/list-property?flatmate=1&editRoom=${posted.id}&step=3`);
  await expect(page.getByRole('heading', { name: 'Rent & terms', exact: true })).toBeVisible();
  await expect(page.getByLabel('Upload registered rent agreement for room')).toHaveCount(0);
  await expect(page.getByText('I have a registered rent agreement', { exact: true })).toHaveCount(0);
});

test('a host whose ID is still in review can send the badge request, and the agreement needs a valid period', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await signedInAsNew(page);
  const { accessToken } = await apiLogin(mobile);
  const posted = await postRoom(page, `Kyc Pending ${Date.now().toString(36)}`);
  track('rooms', posted.id, accessToken);
  await fileIdentityCase(mobile);

  await page.goto(`/dashboard?tab=documents&room=${posted.id}`);
  await expect(page.getByTestId('badge-id-step')).toHaveAttribute('data-state', 'in-review');
  await expect(page.getByTestId('badge-verify-id'), 'nothing more to do while the ID is in review').toHaveCount(0);
  await uploadAgreement(page, AGREEMENT_FILE);
  await expect(page.getByTestId('request-room-badge'), 'the agreement needs its period').toBeDisabled();
  await pickDate(page, '[data-testid="badge-period-from"] .dz-datefield', PERIOD.till);
  await pickDate(page, '[data-testid="badge-period-till"] .dz-datefield', PERIOD.from);
  await expect(page.getByText('The end date must be after the start date and still ahead.')).toBeVisible();
  await expect(page.getByTestId('request-room-badge')).toBeDisabled();

  const room = await requestBadge(page, accessToken);
  expect(room.reviewStatus).toBe('pending');
  const { accessToken: staff } = await apiLogin(ACTORS.admin);
  const detail = await fetch(`${API}/admin/flatmates/${room.id}`, { headers: auth(staff) }).then((r) => r.json());
  expect(detail.review.hostVerified, 'staff still wait for the ID before approving').toBe(false);
});

test('a light bill in the owner name backs the badge request and reaches Ops as bill evidence', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await signedInAsNew(page);
  const { accessToken } = await apiLogin(mobile);
  await grantIdentityBadge(mobile);
  const posted = await postRoom(page, `Light Bill ${Date.now().toString(36)}`);
  track('rooms', posted.id, accessToken);

  await openRoomDocuments(page);
  await expect(page.getByTestId('badge-id-step')).toHaveCount(0);
  await page.getByTestId('badge-evidence-bill').click();
  await expect(page.getByTestId('badge-evidence-bill')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('room-badge-request-card')).toContainText("in the owner's name");
  await expect(page.getByTestId('agreement-service-link'), 'the agreement service is offered only for agreements').toHaveCount(0);

  const uploaded = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/me/documents/personal' && r.request().method() === 'POST');
  await page.getByLabel('Upload light bill (PDF or image)').setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: PHOTO_PNG });
  const upload = await uploaded;
  expect([200, 201]).toContain(upload.status());
  expect((await upload.json()).category, 'the bill is filed under its own vault category').toBe('Electricity Bill');

  const room = await requestBadge(page, accessToken);
  expect(room.verificationTier).toBe('tenant');
  const { accessToken: staff } = await apiLogin(ACTORS.admin);
  const detail = await fetch(`${API}/admin/flatmates/${room.id}`, { headers: auth(staff) }).then((r) => r.json());
  expect(detail.review.evidenceType).toBe('electricity_bill');
  expect(detail.review.hostVerified).toBe(true);
});

test('a tenant group that holds a flat gets the same Get verified button and requests its badge from Documents', async ({ page }) => {
  const mobile = await signedInAsNew(page);
  const { accessToken } = await apiLogin(mobile);
  await grantIdentityBadge(mobile);
  const created = await fetch(`${API}/flatmates/groups`, {
    method: 'POST', headers: auth(accessToken),
    body: JSON.stringify({
      title: `Badge Group ${Date.now().toString(36)}`, locality: 'Kothrud', policy: 'any', rent: 45000, deposit: 50000,
      seats: 3, seatsOpen: 1, role: 'tenant',
    }),
  });
  const group = await created.json();
  expect(created.status, JSON.stringify(group)).toBe(201);
  track('groups', group.id, accessToken);

  await page.goto('/dashboard#properties');
  const verifyLink = page.getByTestId(`room-verification-${group.id}`);
  await expect(verifyLink).toHaveText('Get Verified property badge');
  await expect(verifyLink).toHaveAttribute('href', `/dashboard?tab=documents&group=${group.id}`);
  await verifyLink.click();
  await expect(page.getByTestId('room-badge-request-card')).toHaveAttribute('data-state', 'none');
  await expect(page.getByText(/· Flatmate post$/).first(), 'the group is picked in the Property docs dropdown').toBeVisible();
  await expect(page.getByRole('button', { name: 'My room' })).toHaveCount(0);
  await uploadAgreement(page, AGREEMENT_FILE);
  await fillAgreementPeriod(page);

  const saved = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/flatmates/groups/${group.id}/badge-request` && r.request().method() === 'POST');
  await page.getByTestId('request-room-badge').click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByTestId('room-badge-request-card')).toHaveAttribute('data-state', 'pending');
  await page.goto('/dashboard#properties');
  await expect(page.getByTestId(`room-verification-${group.id}`)).toHaveText('Badge under review');
});
