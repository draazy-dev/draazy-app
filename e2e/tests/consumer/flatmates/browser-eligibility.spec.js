import { test, expect } from '@playwright/test';
import { API, apiLogin, signedInAsNew, uniqueMobile } from '../../../helpers/liveAuth.js';
import { ACTORS } from '../../../fixtures/live.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { tenantRoomAgreement } from '../../../helpers/flatmateAgreement.js';
import { liveListing, verifyOwnership } from '../../../helpers/referral.js';
import { roomBasics } from '../../../helpers/roomWizard.js';
import { withSocietyId } from '../../../helpers/liveSociety.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
const track = flatmateCleanup(test);

const uniqueTitle = (kind) => `Live ${kind} tier ${Date.now().toString(36)} in Baner`;

async function publish(id) {
  const { accessToken } = await apiLogin(ACTORS.admin);
  const response = await fetch(`${API}/admin/flatmates/${id}/moderation`, {
    method: 'PATCH',
    headers: auth(accessToken),
    body: JSON.stringify({ modStatus: 'live', note: 'e2e tier browser fixture' }),
  });
  expect(response.status).toBeLessThan(300);
}

// An owner room with a verified listing is live on arrival; a tenant room waits for review.
async function createRoom(token, society, propertyId) {
  const host = propertyId ? { hostRole: 'owner', propertyId } : { hostRole: 'tenant', ...(await tenantRoomAgreement(token)) };
  const response = await fetch(`${API}/flatmates/rooms`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({
      ...(await roomBasics(token)),
      bhk: '2',
      roomType: 'Private room',
      attachedBath: 'attached',
      furnishing: 'semi',
      locality: 'Baner',
      ...(await withSocietyId(token, { society })),
      rentShare: 15000,
      deposit: 30000,
      availableFrom: '2026-12-01',
      lookingFor: 'any',
      foodPref: 'any',
      ...host,
    }),
  });
  const room = await response.json();
  expect(response.status, JSON.stringify(room)).toBe(201);
  track('rooms', room.id, token);
  if (!propertyId) await publish(room.id);
  return room;
}

async function openMoveIn(page) {
  await page.goto(`${BASE}/flatmates`);
  await expect(page.locator('button[data-tab="move-in"]')).toBeVisible({ timeout: 20_000 });
}

async function openFilters(page) {
  const toggle = page.getByRole('button', { name: /^Filters/ });
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

test('an owner-tier room renders Verified property and Verified only removes a real unapproved tenant room', async ({ page }) => {
  const ownerMobile = uniqueMobile();
  const { accessToken: ownerToken } = await apiLogin(ownerMobile, { name: 'Verified Owner' });
  const listing = await liveListing(ownerMobile);
  await verifyOwnership(ownerMobile, listing);

  const ownerRoom = await createRoom(ownerToken, uniqueTitle('owner'), listing.id);
  expect(ownerRoom.verificationTier).toBe('owner');

  const { accessToken: identityToken } = await apiLogin(uniqueMobile());
  const identityRoom = await createRoom(identityToken, `Live tenant review room ${Date.now().toString(36)}`);
  expect(identityRoom.verificationTier).toBe('tenant');

  await signedInAsNew(page);
  await openMoveIn(page);
  const ownerCard = page.locator(`[data-sf-id="r:${ownerRoom.id}"]`);
  const identityCard = page.locator(`[data-sf-id="r:${identityRoom.id}"]`);
  await expect(ownerCard).toBeVisible({ timeout: 15_000 });
  await expect(identityCard).toBeVisible({ timeout: 15_000 });
  await expect(ownerCard.getByRole('img', { name: 'Verified property', exact: true })).toBeVisible();

  await openFilters(page);
  await page.getByRole('button', { name: 'Verified only', exact: true }).click();
  await expect(ownerCard).toBeVisible();
  await expect(identityCard).toHaveCount(0);
});