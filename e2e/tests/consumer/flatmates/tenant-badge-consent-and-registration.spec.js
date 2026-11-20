import { test, expect } from '@playwright/test';
import { API, apiLogin, grantIdentityBadge, signedInAs, uniqueMobile } from '../../../helpers/liveAuth.js';
import { ACTORS } from '../../../fixtures/live.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { PHOTO_PNG } from '../../../helpers/listingPhotos.helper.js';
import { fillRoomDetails, fillRoomLocation, fillRoomPrice, nextStep, uploadRoomPhotos } from '../../../helpers/roomWizard.js';
import { pickDate } from '../../../helpers/datePicker.helper.js';
import { istInDays } from '../../../helpers/availability.js';

const MOVE_IN = istInDays(28);

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const isoDaysFromNow = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
const track = flatmateCleanup(test);
const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function adminToken() {
  return (await apiLogin(ACTORS.admin)).accessToken;
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
  await fillRoomPrice(page, { rent: '13500', deposit: '27000', availableFrom: MOVE_IN, host: 'tenant', ownerMobile: '9876501234' });
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
