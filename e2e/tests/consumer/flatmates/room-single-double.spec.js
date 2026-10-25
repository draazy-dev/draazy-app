import { test, expect } from '@playwright/test';
import { API, apiLogin, signedInAsNew, uniqueMobile } from '../../../helpers/liveAuth.js';
import { ACTORS } from '../../../fixtures/live.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { tenantRoomAgreement } from '../../../helpers/flatmateAgreement.js';
import { fillRoomDetails, fillRoomLocation, nextStep, roomBasics } from '../../../helpers/roomWizard.js';
import { withSocietyId } from '../../../helpers/liveSociety.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
const track = flatmateCleanup(test);

async function doubleRoom() {
  const { accessToken } = await apiLogin(uniqueMobile());
  const created = await fetch(`${API}/flatmates/rooms`, {
    method: 'POST',
    headers: auth(accessToken),
    body: JSON.stringify({
      ...(await roomBasics(accessToken)),
      bhk: '2', roomType: 'Shared room', attachedBath: 'attached', furnishing: 'semi',
      locality: 'Baner', ...(await withSocietyId(accessToken, { society: `Double room ${Date.now().toString(36)}` })),
      rentShare: 15000, deposit: 30000, availableFrom: '2026-12-01',
      lookingFor: 'any', foodPref: 'any', hostRole: 'tenant', occupants: 2,
      ...(await tenantRoomAgreement(accessToken)),
    }),
  });
  const room = await created.json();
  expect(created.status, JSON.stringify(room)).toBe(201);
  track('rooms', room.id, accessToken);
  expect(room).toMatchObject({ seatsTotal: 2, seatsOpen: 2, priceBasis: 'room' });

  const admin = await apiLogin(ACTORS.admin);
  const published = await fetch(`${API}/admin/flatmates/${room.id}/moderation`, {
    method: 'PATCH', headers: auth(admin.accessToken),
    body: JSON.stringify({ modStatus: 'live', note: 'e2e double room fixture' }),
  });
  expect(published.status).toBeLessThan(300);
  return { room, accessToken };
}

test.describe('single and double rooms', () => {
  test('the room wizard asks single or double and shows what each sharer pays', async ({ page }) => {
    await signedInAsNew(page);
    await page.goto(`${BASE}/list-property?flatmate=1`);
    await expect(page.locator('.lp-meter')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('group', { name: 'Room type', exact: true })).toBeVisible();
    await expect(page.getByText('People the flat can hold')).toHaveCount(0);
    await fillRoomDetails(page, { roomType: 'Double sharing (up to 2)' });
    await nextStep(page);
    await fillRoomLocation(page, { society: `Split Hint ${Date.now().toString(36)}` });
    await nextStep(page);
    await expect(page.getByText('Rent per month *', { exact: true })).toBeVisible();
    await page.locator('input[data-err="rentShare"]').fill('15000');
    await expect(page.getByTestId('room-rent-split')).toHaveText('₹7,500 each when 2 share');
  });

  test('a seeker sees the per-person price, and only sharing once one place is taken', async ({ page }) => {
    const { room, accessToken } = await doubleRoom();
    await page.goto(`${BASE}/flatmates/room/${room.id}`);
    await expect(page.getByText('From, per person / mo').first()).toBeVisible({ timeout: 20_000 });
    const split = page.getByTestId('fm-split');
    await expect(split).toContainText('Just you₹15,000');
    await expect(split).toContainText('2 sharing₹7,500each');
    await expect(page.getByText(/Double sharing/).first()).toBeVisible();
    await expect(page.getByText('How will you take it?')).toBeVisible();

    const seats = await fetch(`${API}/flatmates/rooms/${room.id}/seats`, {
      method: 'PATCH', headers: auth(accessToken), body: JSON.stringify({ seatsOpen: 1 }),
    });
    expect(seats.status).toBe(200);
    expect(await seats.json()).toMatchObject({ seatsTotal: 2, seatsOpen: 1 });

    await page.reload();
    await expect(page.getByText(/1 person already in, you share the room/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Your share / mo').first()).toBeVisible();
    await expect(page.getByText('How will you take it?')).toHaveCount(0);
  });
});
