import { test, expect } from '@playwright/test';
import { API, apiLogin, signedInAs, uniqueMobile, shownMobile } from '../../../helpers/liveAuth.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { tenantRoomAgreement } from '../../../helpers/flatmateAgreement.js';
import { trackErrors } from '../../../helpers/console.js';
import { withSocietyId } from '../../../helpers/liveSociety.js';
import { chooseLocality } from '../../../helpers/locality.js';
import { nextStep, roomBasics } from '../../../helpers/roomWizard.js';

const STAFF = '9733798115';

const track = flatmateCleanup(test);
const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });

async function seed(token, kind, body) {
  const res = await fetch(`${API}/flatmates/${kind}`, { method: 'POST', headers: auth(token), body: JSON.stringify(await withSocietyId(token, body)) });
  expect(res.status, `seeding ${kind}`).toBe(201);
  const row = await res.json();
  track(kind, row.id, token);
  return row;
}

async function expectOpaquePanel(dialog) {
  const alpha = await dialog.evaluate((el) => {
    const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
    const parts = m ? m[1].split(',').map((s) => s.trim()) : [];
    return parts.length === 4 ? Number(parts[3]) : 1;
  });
  expect(alpha, 'the form panel must hide the page behind it').toBe(1);
}

test.describe('LIVE: editing flatmate posts from My properties', () => {
  test('group and request edits open over the dashboard and save without leaving it', async ({ page }) => {
    const mobile = uniqueMobile();
    const { accessToken } = await apiLogin(mobile, { name: 'Dash Host' });
    const title = `Dash edit ${Date.now().toString(36)}`;
    const group = await seed(accessToken, 'groups', { title, locality: 'Baner', rent: 30000, deposit: 50000, seats: 3, seatsOpen: 1, policy: 'any', role: 'tenant' });
    const post = await seed(accessToken, 'posts', { gender: 'female', age: 26, occupation: 'Engineer', budget: 18000, localities: ['Wakad'], moveIn: '2026-12-01', flatPref: 'women', roomPref: 'private', note: 'Dashboard edit coverage' });
    await signedInAs(page, mobile);
    const errors = trackErrors(page);

    await page.goto('/dashboard#properties');
    const groupCard = page.locator('.rounded-xl').filter({ hasText: title }).first();
    await groupCard.getByRole('button', { name: 'Edit' }).click();
    const groupDialog = page.getByRole('dialog', { name: 'Edit group' });
    await expect(groupDialog).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/dashboard#properties$/);
    await expectOpaquePanel(groupDialog);

    const renamed = `${title} v2`;
    await groupDialog.getByPlaceholder('e.g. 2 girls → 1 more for a 2BHK in Baner').fill(renamed);
    const patched = page.waitForResponse((r) => r.url().endsWith(`/flatmates/groups/${group.id}`) && r.request().method() === 'PATCH');
    await groupDialog.getByRole('button', { name: 'Save changes' }).click();
    expect((await patched).status(), 'the group edit should reach the server').toBe(200);
    await expect(groupDialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard#properties$/);
    await expect(page.locator('.rounded-xl').filter({ hasText: renamed }).first()).toBeVisible({ timeout: 20_000 });

    const postCard = page.locator('.rounded-xl').filter({ hasText: 'Looking to share — Wakad' }).first();
    await postCard.getByRole('button', { name: 'Edit' }).click();
    const postDialog = page.getByRole('dialog', { name: 'Edit your flatmate request' });
    await expect(postDialog).toBeVisible({ timeout: 20_000 });
    await expect(postDialog.getByPlaceholder('e.g. Software Engineer')).toHaveValue('Engineer');
    await expectOpaquePanel(postDialog);
    await postDialog.getByPlaceholder('e.g. Software Engineer').fill('Designer');
    const updated = page.waitForResponse((r) => r.url().endsWith(`/flatmates/posts/${post.id}`) && ['PATCH', 'PUT'].includes(r.request().method()));
    await postDialog.getByRole('button', { name: 'Update request' }).click();
    expect((await updated).status(), 'the request edit should reach the server').toBe(200);
    await expect(postDialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard#properties$/);

    expect(errors, `console errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  test('a group still looking for a flat saves its edited shortlist without asking for a flat', async ({ page }) => {
    const mobile = uniqueMobile();
    const { accessToken } = await apiLogin(mobile, { name: 'Hunt Host' });
    const title = `Dash hunt ${Date.now().toString(36)}`;
    const group = await seed(accessToken, 'groups', {
      title, seats: 3, policy: 'any',
      preferences: { localities: ['Baner'], bhk: ['2'], rentMin: 35000, rentMax: 40000, depositMin: 50000, depositMax: 60000, furnishing: 'furnished', gatedOnly: true, bachelors: true },
    });
    await signedInAs(page, mobile);

    await page.goto('/dashboard#listings');
    await page.locator('.rounded-xl').filter({ hasText: title }).first().getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit group' });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByRole('button', { name: /I have a flat/i })).toHaveCount(0);

    const picker = dialog.getByRole('button', { name: "Localities you'd live in" });
    await chooseLocality(page, picker, 'Wakad');
    await expect(picker).toHaveAttribute('aria-expanded', 'false');

    const patched = page.waitForResponse((r) => r.url().endsWith(`/flatmates/groups/${group.id}`) && r.request().method() === 'PATCH');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    const res = await patched;
    expect(res.status(), `edit refused: ${await res.text()}`).toBe(200);
    expect((await res.json()).preferences.localities).toEqual(['Baner', 'Wakad']);
    await expect(dialog).toHaveCount(0);
  });

  test('a room still under review opens in the room wizard from My properties and saves through PATCH', async ({ page }) => {
    const mobile = uniqueMobile();
    const { accessToken } = await apiLogin(mobile);
    const society = `Dash room ${Date.now().toString(36)}`;
    const room = await seed(accessToken, 'rooms', {
      ...(await roomBasics(accessToken)),
      society, locality: 'Baner', roomType: 'Private room', bhk: '2', furnishing: 'semi', rentShare: 18000,
      deposit: 36000, availableFrom: '2026-12-01', hostRole: 'owner', occupants: 1, maxOccupants: 3, lat: 18.559, lng: 73.776,
    });
    expect(room.modStatus, 'a room under review is not live').not.toBe('live');
    await signedInAs(page, mobile);
    const errors = trackErrors(page);

    await page.goto('/dashboard#properties');
    const card = page.locator('.rounded-xl').filter({ hasText: society }).first();
    await card.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(new RegExp(`/list-property\\?flatmate=1&editRoom=${room.id}`));
    await expect(page.getByRole('heading', { name: 'Edit your room' })).toBeVisible({ timeout: 20_000 });
    const people = page.getByRole('spinbutton', { name: 'People living there now' });
    await expect(people).toHaveValue('1');
    await people.fill('15');
    await expect(people, 'the count stops at 10').toHaveValue('10');
    await page.getByRole('button', { name: 'One fewer person' }).click();
    await expect(people).toHaveValue('9');
    await nextStep(page);
    await nextStep(page);

    const rent = page.locator('input[data-err="rentShare"]');
    await expect(rent).toHaveValue('18,000');
    await rent.fill('19500');
    await nextStep(page);

    const patched = page.waitForResponse((r) => r.url().endsWith(`/flatmates/rooms/${room.id}`) && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Save changes' }).click();
    const res = await patched;
    expect(res.status(), `room edit refused: ${await res.text()}`).toBe(200);
    expect(await res.json()).toMatchObject({ id: room.id, budget: 19500, occupants: 9, society });
    await expect(page).toHaveURL(/\/dashboard#properties$/);
    await expect(page.locator('.rounded-xl').filter({ hasText: society }).first()).toBeVisible({ timeout: 20_000 });

    expect(errors, `console errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  test('a tenant room reopens with every answer it was posted with, and a re-save keeps the agreement Ops reads', async ({ page }) => {
    const mobile = uniqueMobile();
    const consentMobile = uniqueMobile();
    const { accessToken } = await apiLogin(mobile);
    const society = `Prefill room ${Date.now().toString(36)}`;
    const details = { floor: '12', totalFloors: 18, bathrooms: 2, balconies: 2, furniture: ['Sofa', 'Bed', 'Study lamp'], tower: 'C', street: 'Baner Road', landmark: 'Near Balewadi High Street', pincode: '411045' };
    const room = await seed(accessToken, 'rooms', {
      ...(await roomBasics(accessToken)),
      society, locality: 'Baner', flatNumber: 'C-1203', homeTypeLabel: 'Flat', roomType: 'Private room', bhk: '3', attachedBath: 'attached',
      furnishing: 'furnished', rentShare: 21000, deposit: 42000, availableFrom: '2026-12-01', occupants: 2, maxOccupants: 4,
      lat: 18.559, lng: 73.776, hostRole: 'tenant', ...(await tenantRoomAgreement(accessToken)),
      ownerConsentMobile: consentMobile, details,
    });
    await signedInAs(page, mobile);
    const errors = trackErrors(page);
    const pill = (label, value) => page.getByRole('group', { name: label, exact: true }).getByRole('button', { name: value, exact: true });

    await page.goto(`/list-property?flatmate=1&editRoom=${room.id}`);
    await expect(page.getByRole('heading', { name: 'Edit your room' })).toBeVisible({ timeout: 20_000 });
    await expect(pill('Bathrooms', '2')).toHaveAttribute('aria-pressed', 'true');
    await expect(pill('Balconies', '2')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-err="floor"]')).toContainText('12');
    await expect(page.locator('[data-err="totalFloors"]')).toContainText('18');
    await expect(pill('Furnishing', 'Furnished')).toHaveAttribute('aria-pressed', 'true');
    const furniture = page.getByTestId('in-flat-features');
    await expect(furniture.getByRole('button', { name: 'Sofa', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(furniture.getByRole('button', { name: 'Remove Study lamp' })).toBeVisible();
    await nextStep(page);

    await expect(page.getByPlaceholder('e.g. Tower B')).toHaveValue('C');
    await page.getByTestId('room-more-address').locator('summary').click();
    await expect(page.getByPlaceholder('e.g. Baner-Balewadi Road')).toHaveValue('Baner Road');
    await expect(page.getByPlaceholder('e.g. Near D-Mart')).toHaveValue('Near Balewadi High Street');
    await expect(page.getByPlaceholder('411045')).toHaveValue('411045');
    await nextStep(page);

    await expect(page.locator('input[data-err="rentShare"]')).toHaveValue('21,000');
    await expect(page.locator('[data-err="ownerConsent"] input[type="checkbox"]')).toBeChecked();
    await expect(page.locator('input[autocomplete="tel-national"]')).toHaveValue(shownMobile(consentMobile));
    await nextStep(page);

    const patched = page.waitForResponse((r) => r.url().endsWith(`/flatmates/rooms/${room.id}`) && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Save changes' }).click();
    const res = await patched;
    expect(res.status(), `room edit refused: ${await res.text()}`).toBe(200);
    expect(res.request().postDataJSON().agreementDoc, 'the form names the stored file, never re-sends its bytes').not.toHaveProperty('dataUrl');

    const mine = await (await fetch(`${API}/flatmates/rooms/${room.id}`, { headers: auth(accessToken) })).json();
    expect(mine.item.host).toMatchObject({ details, ownerConsentMobile: consentMobile });
    expect(mine.item.host.agreementDoc).not.toHaveProperty('dataUrl');
    const { accessToken: staffToken } = await apiLogin(STAFF);
    const ops = await (await fetch(`${API}/admin/flatmates/${room.id}`, { headers: auth(staffToken) })).json();
    expect(ops.review.agreementDoc.dataUrl, 'Ops still opens the agreement after the host re-saves').toMatch(/^data:image\/png;base64,/);

    expect(errors, `console errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  test('Delete takes a group and a request down on the server, not just in this browser', async ({ page }) => {
    const mobile = uniqueMobile();
    const { accessToken } = await apiLogin(mobile, { name: 'Del Host' });
    const title = `Dash delete ${Date.now().toString(36)}`;
    const group = await seed(accessToken, 'groups', { title, locality: 'Hinjawadi', rent: 35000, deposit: 50000, seats: 4, policy: 'women', role: 'tenant' });
    const post = await seed(accessToken, 'posts', { gender: 'female', age: 25, occupation: 'Analyst', budget: 15000, localities: ['Kharadi'], moveIn: '2026-12-01', flatPref: 'women', roomPref: 'private', note: 'Dashboard delete coverage' });
    await signedInAs(page, mobile);

    await page.goto('/dashboard#properties');
    for (const [kind, id, text] of [['groups', group.id, title], ['posts', post.id, 'Looking to share — Kharadi']]) {
      const card = page.locator('.rounded-xl').filter({ hasText: text }).first();
      await expect(card).toBeVisible({ timeout: 20_000 });
      const deleted = page.waitForResponse((r) => r.url().endsWith(`/flatmates/${kind}/${id}`) && r.request().method() === 'DELETE');
      await card.getByRole('button', { name: 'Delete' }).click();
      await page.getByTestId('confirm-modal-ok').click();
      expect((await deleted).status(), `${kind} delete should reach the server`).toBeLessThan(300);
      await expect(page.locator('.rounded-xl').filter({ hasText: text })).toHaveCount(0, { timeout: 20_000 });
    }

    await page.reload();
    await expect(page.getByText('My properties', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.rounded-xl').filter({ hasText: title })).toHaveCount(0);
    await expect(page.locator('.rounded-xl').filter({ hasText: 'Looking to share — Kharadi' })).toHaveCount(0);
  });
});
