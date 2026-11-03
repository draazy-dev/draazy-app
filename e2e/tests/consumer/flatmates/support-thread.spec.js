// Flatmate hosts get the property status card and Support thread; trust badges keep plain names.
import { test, expect } from '@playwright/test';
import { API, apiLogin, signedInAs, uniqueMobile } from '../../../helpers/liveAuth.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { askForInfo } from '../../../helpers/flatmateDesk.js';
import { tenantRoomAgreement } from '../../../helpers/flatmateAgreement.js';
import { roomBasics } from '../../../helpers/roomWizard.js';
import { withSocietyId } from '../../../helpers/liveSociety.js';
import { istInDays } from '../../../helpers/availability.js';

const MOVE_IN = istInDays(28);

const track = flatmateCleanup(test);
const STAFF = '9733798115';
const auth = (token) => ({ 'content-type': 'application/json', authorization: 'Bearer ' + token });
const stamp = () => Date.now().toString(36).slice(-5);

async function send(method, path, token, body) {
  const res = await fetch(`${API}${path}`, { method, headers: auth(token), body: body && JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function seedRoom(mobile, society) {
  const { accessToken } = await apiLogin(mobile, { name: 'Thread Host' });
  const res = await send('POST', '/flatmates/rooms', accessToken, {
    ...(await roomBasics(accessToken)),
    bhk: '2', roomType: 'Private room', attachedBath: 'attached', furnishing: 'semi',
    locality: 'Baner', rentShare: 15000, deposit: 30000, availableFrom: MOVE_IN,
    lookingFor: 'any', foodPref: 'any',
    ...(await withSocietyId(accessToken, { society, hostRole: 'tenant', ...(await tenantRoomAgreement(accessToken)) })),
  });
  expect(res.status, JSON.stringify(res.json)).toBe(201);
  track('rooms', res.json.id, accessToken);
  return { group: res.json, accessToken };
}

async function seedPost(mobile) {
  const { accessToken } = await apiLogin(mobile, { name: 'Seeker Host' });
  const res = await send('POST', '/flatmates/posts', accessToken, {
    age: 26, budget: 18000, localities: ['Baner'], moveIn: MOVE_IN, note: `Status card ${stamp()}`,
  });
  expect(res.status).toBe(201);
  track('posts', res.json.id, accessToken);
  return { post: res.json, accessToken };
}

test.describe('LIVE: flatmate status card and Support thread', () => {
  test('a pending tenant room shows the status card, and Needs info opens the Support thread where the host can reply', async ({ page }) => {
    const mobile = uniqueMobile();
    const { group, accessToken } = await seedRoom(mobile, `Thread Flat ${stamp()}`);
    await signedInAs(page, mobile);
    await page.goto('/dashboard#listings');

    const statusCard = page.getByTestId(`flatmate-status-${group.id}`);
    await expect(statusCard).toContainText('Under review');
    await expect(statusCard.getByTestId('support-thread-link')).toHaveCount(0);

    const staff = (await apiLogin(STAFF)).accessToken;
    const asked = await askForInfo(API, group.id, auth(staff), { reasonCode: 'wrong_details', note: 'Please confirm the monthly rent.' });
    expect(asked.status).toBe(200);

    await page.reload();
    await expect(statusCard.getByTestId('support-thread-link')).toBeVisible();
    await statusCard.getByTestId('support-thread-link').click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText('Please confirm the monthly rent.');

    await modal.getByPlaceholder('Reply to Draazy Support…').fill('Rent is 30,000.');
    await modal.getByPlaceholder('Reply to Draazy Support…').press('Enter');
    await expect(modal).toContainText('Rent is 30,000.');

    const thread = await send('GET', `/flatmates/room/${group.id}/verification`, accessToken);
    expect(thread.json.status).toBe('in_review');
    expect(thread.json.messages.map((m) => m.from)).toEqual(['ops', 'owner']);
  });

  test('a seeker post is live at once, and the card offers Get verified until the host ID is verified', async ({ page }) => {
    const mobile = uniqueMobile();
    const { post } = await seedPost(mobile);
    await signedInAs(page, mobile);
    await page.goto('/dashboard#listings');

    const statusCard = page.getByTestId(`flatmate-status-${post.id}`);
    await expect(statusCard).toBeVisible();
    await expect(statusCard.getByTestId(`id-verification-${post.id}`)).toBeVisible();
    await expect(statusCard.getByTestId('id-verified-chip')).toHaveCount(0);
  });

  test('the Documents tab shows one ID verified card for a people post', async ({ page }) => {
    const mobile = uniqueMobile();
    const { post } = await seedPost(mobile);
    await signedInAs(page, mobile);
    await page.goto(`/dashboard?tab=documents&post=${post.id}`);

    const idCard = page.getByTestId('person-id-badge-card');
    await expect(idCard).toBeVisible();
    await expect(idCard).toHaveAttribute('data-state', 'none');
    await expect(idCard.getByTestId('person-id-badge-cta')).toHaveAttribute('href', '/dashboard?tab=profile');
  });

  test('the flatmates board hero names the badge ID verified, not KYC', async ({ page }) => {
    await page.goto('/flatmates');
    await expect(page.locator('.sf-hero').first()).toContainText('ID verified seekers');
    await expect(page.locator('.sf-hero').first()).not.toContainText('KYC');
  });
});
