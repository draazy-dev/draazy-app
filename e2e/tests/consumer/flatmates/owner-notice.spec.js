import { createHash, randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { API, apiLogin, signedInAs, signedInAsNew, uniqueMobile, uploadedListingPhotos } from '../../../helpers/liveAuth.js';
import { pickDate } from '../../../helpers/datePicker.helper.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { fillRoomDetails, fillRoomLocation, nextStep, roomBasics } from '../../../helpers/roomWizard.js';
import { withSocietyId } from '../../../helpers/liveSociety.js';
import { sql } from '../../../helpers/monetisation.js';

const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
const track = flatmateCleanup(test);

// Re-keys the notice row to a token the test knows: the real one only lives in the WhatsApp message.
async function tenantRoomWithNotice() {
  const { accessToken } = await apiLogin(uniqueMobile());
  const named = await fetch(`${API}/auth/me`, { method: 'PATCH', headers: auth(accessToken), body: JSON.stringify({ name: 'Riya Kulkarni' }) });
  expect(named.status).toBe(200);
  const society = `Owner Notice ${Date.now().toString(36)}`;
  const ownerMobile = uniqueMobile();
  const res = await fetch(`${API}/flatmates/rooms`, {
    method: 'POST',
    headers: auth(accessToken),
    body: JSON.stringify({
      ...(await roomBasics(accessToken)),
      bhk: '2', roomType: 'Private room', attachedBath: 'attached', furnishing: 'semi',
      locality: 'Baner', ...(await withSocietyId(accessToken, { society })),
      rentShare: 16000, deposit: 0, availableFrom: '2026-12-01', lookingFor: 'any', foodPref: 'any',
      hostRole: 'tenant', ownerConsent: true, ownerConsentMobile: ownerMobile,
    }),
  });
  const room = await res.json();
  expect(res.status, JSON.stringify(room)).toBe(201);
  track('rooms', room.id, accessToken);
  await expect.poll(() => sql(`select count(*) from flatmate_owner_notices where room_id = '${room.id}'`)).toBe('1');
  const token = randomBytes(24).toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');
  sql(`update flatmate_owner_notices set token_hash = '${hash}' where room_id = '${room.id}'`);
  return { room, token, society, accessToken, ownerMobile };
}

const consentOf = (id) => sql(`select owner_consent from flatmate_rooms where id = '${id}'`);
const usersWith = (mobile) => sql(`select count(*) from users where mobile = '${mobile}'`);

test('a room asks for the deposit, takes 0, and requires the tenant to give the owner mobile without the WhatsApp helper note', async ({ page }) => {
  await signedInAsNew(page);
  await page.goto('/list-property?flatmate=1');
  await expect(page.locator('.lp-meter')).toBeVisible({ timeout: 20_000 });
  await fillRoomDetails(page, { bhk: '2 BHK', roomType: 'Single (1 person)' });
  await nextStep(page);
  await fillRoomLocation(page, { society: `Notice Heights ${Date.now().toString(36)}` });
  await nextStep(page);

  await page.locator('input[data-err="rentShare"]').fill('13500');
  await pickDate(page, '[data-err="availableFrom"]', '2026-12-01');
  await page.getByRole('spinbutton', { name: 'Notice period (days)' }).fill('30');
  await page.getByRole('spinbutton', { name: 'Minimum stay (months)' }).fill('0');
  await nextStep(page);
  await expect(page.getByText('Enter the deposit. Type 0 if there is none.')).toBeVisible();

  await page.locator('input[data-err="deposit"]').fill('0');
  await expect(page.locator('input[data-err="deposit"]')).toHaveValue('0');
  await page.getByLabel('The owner knows and agrees to sharing').check();
  await expect(page.getByText("We'll WhatsApp the owner a short note about Draazy and your post, so they can confirm it.")).toHaveCount(0);
  await nextStep(page);
  await expect(page.getByText("Enter the owner's 10-digit mobile number.")).toBeVisible();

  await page.getByLabel("Owner's mobile").fill('9876501234');
  await nextStep(page);
  await expect(page.locator('[data-err="photos"]')).toBeVisible();
});

test('the owner opens the WhatsApp link, sees what the tenant posted and agrees, which marks the room owner-confirmed', async ({ page }) => {
  const { room, token, society } = await tenantRoomWithNotice();
  expect(consentOf(room.id), 'ticking the box is not the owner agreeing').toBe('f');

  await page.goto(`/owner-confirm#${token}`);
  const card = page.getByTestId('owner-confirm');
  await expect(card.getByRole('heading', { name: 'Riya posted a room in your flat on Draazy' })).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText(`${society}, Baner`);
  await expect(card).toContainText('Single room · ₹16,000/mo');
  await expect(card).not.toContainText('Kulkarni');
  expect(new URL(page.url()).hash, 'the token must not stay in the address bar').toBe('');

  await card.getByRole('button', { name: 'Yes, I agree' }).click();
  await expect(page.getByTestId('owner-confirm-done')).toHaveText(/the owner, agreed/);
  await expect.poll(() => consentOf(room.id)).toBe('t');

  const again = await fetch(`${API}/flatmates/owner-notice/answer`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'X-Owner-Notice-Token': token },
    body: JSON.stringify({ answer: 'decline' }),
  });
  expect(again.status, 'an answer, once given, is not flipped by a second tap').toBe(409);
});

test('an owner who says no sends the room back to review', async ({ page }) => {
  const { room, token, ownerMobile } = await tenantRoomWithNotice();
  await page.goto(`/owner-confirm#${token}`);
  await page.getByRole('button', { name: "I don't agree" }).click();
  await expect(page.getByTestId('owner-confirm-done')).toHaveText(/taken the post down/);
  expect(consentOf(room.id)).toBe('f');
  expect(sql(`select mod_status || '/' || flag_for_review from flatmate_rooms where id = '${room.id}'`)).toBe('pending/true');
  expect(usersWith(ownerMobile), 'a no makes no account').toBe('0');
  await expect(page.getByTestId('owner-confirm-see-home')).toHaveCount(0);
});

test('an owner who agrees gets a free account holding the home, sees the tenant post in it and can list it once', async ({ page }) => {
  const { room, token, society, accessToken, ownerMobile } = await tenantRoomWithNotice();
  await page.goto(`/owner-confirm#${token}`);
  await expect(page.getByText('Saying yes saves this home to a free Draazy account on your number.')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Yes, I agree' }).click();
  await expect(page.getByTestId('owner-confirm-see-home')).toBeVisible();
  expect(usersWith(ownerMobile)).toBe('1');

  const notes = () => fetch(`${API}/notifications`, { headers: auth(accessToken) }).then((r) => r.text());
  await expect.poll(notes, { message: 'the tenant hears that the owner agreed' }).toContain(`/flatmates/room/${room.id}`);

  await signedInAs(page, ownerMobile);
  await page.goto('/dashboard?tab=properties');
  const home = page.getByTestId('owner-home-card');
  await expect(home).toBeVisible({ timeout: 20_000 });
  await expect(home).toContainText('Unverified');
  await expect(home).toContainText(society);
  await expect(home.getByTestId('home-rooms')).toContainText('Private room · ₹16,000/mo');
  await expect(home.getByTestId('home-rooms')).toContainText('Posted by Riya');

  const prefill = page.waitForResponse((r) => /\/api\/me\/owner-homes\/[^/]+\/prefill$/.test(new URL(r.url()).pathname));
  await home.getByRole('link', { name: 'Complete & publish' }).click();
  await expect(page).toHaveURL(/\/list-property\?deal=rent&home=/);
  expect((await (await prefill).json()).society).toBe(society);
  await expect(page.locator('[data-err="bhk"] .radio-pill.selected')).toHaveText(/2/);

  const homeId = new URL(page.url()).searchParams.get('home');
  const { accessToken: ownerToken } = await apiLogin(ownerMobile);
  const body = JSON.stringify({
    title: `Zztest owner home ${Date.now()}`, deal: 'rent', propertyType: 'Flat', bhk: 2, area: 900,
    price: 32000, deposit: 64000, city: 'Pune', locality: 'Baner', society, images: await uploadedListingPhotos(ownerToken),
  });
  const publish = () => fetch(`${API}/me/managed-properties/${homeId}/listing`, { method: 'POST', headers: auth(ownerToken), body });
  const listed = await publish();
  expect(listed.status, await listed.clone().text()).toBe(201);
  expect((await publish()).status, 'a home is listed once').toBe(409);
});

test('a link with no valid token says so instead of showing anything', async ({ page }) => {
  await page.goto('/owner-confirm#not-a-real-token');
  await expect(page.getByRole('heading', { name: 'This link is no longer valid' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Yes, I agree' })).toHaveCount(0);
});
