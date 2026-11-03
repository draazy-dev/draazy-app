// Publication parity on the flatmate desk: rooms need three ticks, people posts go live first.
import { expect, test } from '../../fixtures/live.js';
import { API, apiLogin, uniqueMobile } from '../../helpers/liveAuth.js';
import { flatmateCleanup } from '../../helpers/flatmateCleanup.js';
import { tenantRoomAgreement } from '../../helpers/flatmateAgreement.js';
import { roomBasics } from '../../helpers/roomWizard.js';
import { withSocietyId } from '../../helpers/liveSociety.js';
import { istInDays } from '../../helpers/availability.js';

const MOVE_IN = istInDays(28);

const STAFF = '9733798115';
const track = flatmateCleanup(test);
const auth = (token) => ({ 'content-type': 'application/json', authorization: 'Bearer ' + token });
const stamp = () => Date.now().toString(36).slice(-5);

async function send(method, path, token, body) {
  const res = await fetch(`${API}${path}`, { method, headers: auth(token), body: body && JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text, json: text ? JSON.parse(text) : null };
}

async function seedRoom() {
  const { accessToken } = await apiLogin(uniqueMobile(), { name: 'Room Host' });
  const society = `Desk Gate ${stamp()}`;
  const res = await send('POST', '/flatmates/rooms', accessToken, {
    ...(await roomBasics(accessToken)),
    roomType: 'Private room',
    locality: 'Kothrud',
    ...(await withSocietyId(accessToken, { society })),
    rentShare: 18000,
    deposit: 36000,
    bhk: '2',
    attachedBath: 'attached',
    furnishing: 'semi',
    hostRole: 'tenant',
    ...(await tenantRoomAgreement(accessToken)),
  });
  expect(res.status, res.text).toBe(201);
  track('rooms', res.json.id, accessToken);
  return { room: res.json, society, accessToken };
}

const card = (page, text) => page.getByTestId('flatmate-queue-card').filter({ hasText: text }).first();

async function openReview(page, login, text) {
  await login.asStaff('rental');
  await page.goto('/ops/flatmate-review');
  await expect(page.getByRole('heading', { name: 'Flatmate Moderation' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search the queue' }).fill(text);
  await card(page, text).getByRole('button', { name: 'Review' }).click();
  const dialog = page.getByRole('dialog', { name: /^Review / });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('Ops → flatmate desk publication parity (live)', () => {
  test('a room cannot be published until all three desk checks are ticked, and the API refuses it too', async ({ page, login }) => {
    const { room, society } = await seedRoom();
    const staff = (await apiLogin(STAFF)).accessToken;

    const early = await send('PATCH', `/admin/flatmates/${room.id}/moderation`, staff, { modStatus: 'approved' });
    expect(early.status).toBe(409);
    expect(early.json.error).toBe('checklist_incomplete');

    const dialog = await openReview(page, login, society);
    const ticks = dialog.getByTestId('flatmate-checklist-item');
    await expect(ticks).toHaveCount(3);
    const publish = dialog.getByRole('button', { name: 'Publish' });
    await expect(publish).toBeDisabled();
    await expect(dialog.getByTestId('flatmate-ticks-hint')).toBeVisible();

    await ticks.nth(0).click();
    await expect(ticks.nth(0)).toBeChecked();
    await ticks.nth(1).click();
    await expect(ticks.nth(1)).toBeChecked();
    await expect(publish).toBeDisabled();
    await ticks.nth(2).click();
    await expect(ticks.nth(2)).toBeChecked();
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(dialog).toHaveCount(0);

    const after = await send('GET', `/admin/flatmates/${room.id}`, staff);
    expect(after.json.item.modStatus).toBe('approved');
  });

  test('seeker posts are live first with no checklist, and the desk reviews them afterwards', async ({ page, login }) => {
    const { accessToken } = await apiLogin(uniqueMobile(), { name: 'Live First' });
    const note = `Live first ${stamp()}`;
    const created = await send('POST', '/flatmates/posts', accessToken, {
      age: 27, budget: 16000, localities: ['Kothrud'], moveIn: MOVE_IN, note,
    });
    expect(created.status, created.text).toBe(201);
    track('posts', created.json.id, accessToken);
    expect(created.json.modStatus).toBe('live');

    const dialog = await openReview(page, login, note);
    await expect(dialog.getByTestId('flatmate-checklist')).toHaveCount(0);
    await expect(dialog.getByTestId('flatmate-ticks-hint')).toHaveCount(0);
  });

  test('Needs info keeps the post pending, lands in the host Support thread, and a host reply shows on the desk', async ({ page, login }) => {
    const { room, society: title, accessToken } = await seedRoom();

    const dialog = await openReview(page, login, title);
    const ask = dialog.getByTestId('flatmate-decide-needs_info');
    await expect(ask).toBeDisabled();
    await dialog.getByTestId('flatmate-reason-code').selectOption('wrong_details');
    await dialog.getByLabel('Internal note').fill('Please confirm the monthly rent.');
    await ask.click();
    await expect(dialog.getByTestId('case-needs-info')).toBeVisible();
    await expect(dialog.getByTestId('flatmate-case-thread')).toContainText('Please confirm the monthly rent.');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(card(page, title)).toContainText('Needs info');

    const mine = await send('GET', `/flatmates/room/${room.id}/verification`, accessToken);
    expect(mine.json.status).toBe('needs_info');
    expect(mine.json.reasonCode).toBe('wrong_details');
    const staff = (await apiLogin(STAFF)).accessToken;
    expect((await send('GET', `/admin/flatmates/${room.id}`, staff)).json.item.modStatus).toBe('pending');

    const reply = await send('POST', `/flatmates/room/${room.id}/verification/messages`, accessToken, { body: 'Rent is 45,000.' });
    expect(reply.status).toBe(201);
    await page.reload();
    await page.getByRole('textbox', { name: 'Search the queue' }).fill(title);
    await expect(card(page, title)).toContainText('Host replied (1)');
  });
});
