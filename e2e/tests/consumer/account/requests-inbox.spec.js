import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, authHeaders, uniqueMobile, signedInAs, uploadedListingPhotos } from '../../../helpers/liveAuth.js';
import { approveListingWithFetch, rejectListingWithFetch } from '../../../helpers/moderation.js';
import { sql } from '../../../helpers/monetisation.js';

const created = new Set();

async function api(method, path, headers, body) {
  const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function actor(name) {
  const mobile = uniqueMobile();
  const headers = await authHeaders(mobile);
  const res = await api('PATCH', '/auth/me', headers, { name });
  expect(res.status, `naming ${name}`).toBe(200);
  return { mobile, headers, name };
}

async function listing(owner, label) {
  const title = `Zztest requests ${label} ${Date.now()}`;
  const res = await api('POST', '/me/listings', owner.headers, {
    title, deal: 'rent', propertyType: 'Flat', bhk: 2, price: 26000, area: 900, areaUnit: 'sqft',
    furnishing: 'semi-furnished', city: 'Pune', locality: 'Baner', address: 'D120 Requests Residency, B-201',
    images: await uploadedListingPhotos(owner.headers),
  });
  expect(res.status, `creating the fixture listing (${JSON.stringify(res.body)})`).toBe(201);
  created.add(res.body.id);
  expect((await approveListingWithFetch(res.body.id, await authHeaders(ACTORS.admin))).status).toBe(200);
  return { id: res.body.id, title };
}

async function ask(buyer, propertyId, message) {
  const res = await api('POST', '/contacts/request', buyer.headers, { propertyId, ...(message ? { message } : {}) });
  expect(res.status, `requesting contact (${JSON.stringify(res.body)})`).toBe(200);
  const row = sql(`select id from contact_requests where property_id = '${propertyId}' and requester_id = `
    + `(select id from users where mobile = '${buyer.mobile}')`);
  expect(row, 'the request row exists').toBeTruthy();
  return row;
}

const card = (page, text) => page.getByTestId('request-card').filter({ hasText: text });

const typeTab = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const tabCount = (page, name) => typeTab(page, name).locator('.dz-count');

async function openRequests(page) {
  await page.goto('/dashboard?tab=leads');
  await expect(page.getByTestId('requests-panel')).toBeVisible({ timeout: 20000 });
}

test.afterEach(async () => {
  const admin = await authHeaders(ACTORS.admin);
  for (const id of created) await rejectListingWithFetch(id, admin, { reason: 'Zztest cleanup \u2014 requests inbox fixture' });
  created.clear();
});

test.describe('Dashboard → Requests', () => {
  test('the owner sees each number request with the buyer\'s message or a default line, and Approve & chat opens the thread', async ({ page }) => {
    const owner = await actor('Zztest Requests Owner');
    const flat = await listing(owner, 'received');
    const writer = await actor('Zztest Writing Buyer');
    const quiet = await actor('Zztest Quiet Buyer');
    await ask(writer, flat.id, 'Zztest - is the flat pet friendly?');
    await ask(quiet, flat.id);

    const inbox = await api('GET', '/me/contact-requests', owner.headers);
    expect(inbox.body.content.find((r) => r.requester.name === writer.name).message).toBe('Zztest - is the flat pet friendly?');

    await signedInAs(page, owner.mobile);
    await openRequests(page);
    await expect(typeTab(page, 'All')).toHaveAttribute('aria-selected', 'true');
    await expect(tabCount(page, 'All')).toHaveText('2');
    await expect(tabCount(page, 'Number requests')).toHaveText('2');
    await expect(tabCount(page, 'Photo requests')).toHaveCount(0);
    await expect(card(page, writer.name).getByTestId('request-direction')).toHaveText('Received');
    await expect(card(page, writer.name)).toHaveAttribute('data-box', 'received');
    await expect(card(page, writer.name)).toContainText('is the flat pet friendly?');
    await expect(card(page, quiet.name)).toContainText(`Hi, I'm interested in ${flat.title}. Could you share your contact details?`);
    await expect(card(page, writer.name).getByTestId('request-kind')).toHaveText('Number request');

    await typeTab(page, 'Photo requests').click();
    await expect(page.getByTestId('requests-empty')).toContainText('No photo requests yet.');
    await expect(page.getByTestId('request-card')).toHaveCount(0);
    await typeTab(page, 'Number requests').click();
    await expect(page.getByTestId('request-card')).toHaveCount(2);

    await card(page, writer.name).getByRole('button', { name: 'Approve & chat' }).click();
    await expect(page).toHaveURL(/\/messages\?c=/, { timeout: 20000 });
    await expect(page.getByText(`thanks for your interest in ${flat.title}`).first()).toBeVisible({ timeout: 20000 });
    const gate = await api('GET', `/contacts/status?propertyId=${flat.id}`, writer.headers);
    expect(gate.body.status, 'approving from the dashboard opens the gate').toBe('approved');
  });

  test('a reminder unlocks a day after sending, reaches the owner, then waits another day', async ({ page }) => {
    const owner = await actor('Zztest Remind Owner');
    const flat = await listing(owner, 'remind');
    const buyer = await actor('Zztest Reminding Buyer');
    const id = await ask(buyer, flat.id);

    await signedInAs(page, buyer.mobile);
    await openRequests(page);
    const sent = card(page, flat.title);
    await expect(sent.getByTestId('request-direction')).toHaveText('Sent');
    await expect(sent).toHaveAttribute('data-box', 'sent');
    await expect(page.locator('.dz-count')).toHaveCount(0);
    await expect(sent.getByTestId('request-state')).toHaveText('Pending');
    await expect(sent.getByRole('button', { name: /^Remind (in|tomorrow)/ })).toBeDisabled();

    sql(`update contact_requests set created_at = created_at - interval '25 hours' where id = '${id}'`);
    await page.reload();
    await card(page, flat.title).getByRole('button', { name: 'Remind', exact: true }).click();
    await expect(page.getByText('Reminder sent')).toBeVisible();
    await expect(card(page, flat.title).getByRole('button', { name: /^Remind (in|tomorrow)/ })).toBeDisabled();

    const again = await api('POST', `/me/requests/contact/${id}/reminders`, buyer.headers);
    expect(again.status, 'a second reminder the same day is refused').toBe(409);
    expect(again.body.error).toBe('reminder_too_soon');
    expect(again.body.nextReminderAt).toBeTruthy();

    const bell = await api('GET', '/notifications?size=50', owner.headers);
    expect(bell.body.content.filter((n) => n.type === 'request.reminder'), 'one reminder notification').toHaveLength(1);
    const received = await api('GET', '/me/requests?box=received', owner.headers);
    expect(received.body.content[0].reminders.count).toBe(1);
  });

  test('withdrawing a number request leaves a withdrawn card, takes it off the owner\'s inbox and blocks asking again for a week; a declined one can be cleared', async ({ page }) => {
    const owner = await actor('Zztest Withdraw Owner');
    const flat = await listing(owner, 'withdraw');
    const otherOwner = await actor('Zztest Declining Owner');
    const other = await listing(otherOwner, 'declined');
    const buyer = await actor('Zztest Withdrawing Buyer');
    await ask(buyer, flat.id);
    const declinedId = await ask(buyer, other.id);
    expect((await api('PATCH', `/me/contact-requests/${declinedId}`, otherOwner.headers, { status: 'declined' })).status).toBe(200);

    await signedInAs(page, buyer.mobile);
    await openRequests(page);
    await card(page, flat.title).getByRole('button', { name: 'Withdraw' }).click();
    await expect(page.getByTestId('confirm-modal')).toContainText('Your contact credit comes back');
    await page.getByRole('button', { name: 'Keep request' }).click();
    await expect(card(page, flat.title).getByTestId('request-state')).toHaveText('Pending');

    await card(page, flat.title).getByRole('button', { name: 'Withdraw' }).click();
    await page.getByTestId('confirm-modal-ok').click();
    await expect(page.getByText('Request withdrawn')).toBeVisible();
    await expect(page.getByTestId('requests-past-toggle')).toHaveText(/Show past requests \(2\)/);
    await expect(card(page, flat.title)).toHaveCount(0);
    await page.getByTestId('requests-past-toggle').click();
    await expect(page.getByTestId('requests-past-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(card(page, flat.title)).toHaveAttribute('data-state', 'withdrawn');
    await expect(card(page, flat.title).getByTestId('request-state')).toHaveText('Withdrawn');
    await expect(card(page, flat.title).getByRole('button', { name: 'Clear' })).toBeVisible();

    const inbox = await api('GET', '/me/contact-requests', owner.headers);
    expect(inbox.body.content.filter((r) => r.propertyId === flat.id), 'the owner no longer sees it').toHaveLength(0);
    expect((await api('GET', `/contacts/status?propertyId=${flat.id}`, buyer.headers)).body.status).toBe('none');
    const reask = await api('POST', '/contacts/request', buyer.headers, { propertyId: flat.id });
    expect(reask.status).toBe(409);
    expect(reask.body.error).toBe('recently_withdrawn');

    const declined = card(page, other.title);
    await expect(declined.getByTestId('request-state')).toHaveText('Declined');
    await declined.getByRole('button', { name: 'Clear' }).click();
    await expect(declined).toHaveCount(0);
    const sentBox = await api('GET', '/me/requests?box=sent', buyer.headers);
    expect(sentBox.body.content.map((r) => r.id)).not.toContain(declinedId);
  });

  test('a seeker with no listings gets the Requests panel, opening on what they sent', async ({ page }) => {
    const owner = await actor('Zztest Seeker Panel Owner');
    const flat = await listing(owner, 'seeker-panel');
    const buyer = await actor('Zztest Seeker Panel Buyer');
    await ask(buyer, flat.id);

    await signedInAs(page, buyer.mobile);
    await page.goto('/dashboard#leads');
    await expect(page.getByTestId('requests-panel')).toBeVisible({ timeout: 20000 });
    await expect(typeTab(page, 'All')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('requests-box-received')).toHaveCount(0);
    await expect(page.getByTestId('requests-box-sent')).toHaveCount(0);
    await expect(card(page, flat.title)).toHaveAttribute('data-kind', 'contact');
    await expect(card(page, flat.title).getByTestId('request-direction')).toHaveText('Sent');
    await expect(card(page, flat.title).getByTestId('request-state')).toHaveText('Pending');
    await expect(card(page, flat.title).getByTestId('request-note')).toHaveCount(0);
    await expect(page.locator('.dz-count')).toHaveCount(0);

    await typeTab(page, 'Documents').click();
    await expect(page.getByTestId('requests-empty')).toContainText('No document requests yet.');
    await expect(page.getByRole('link', { name: 'Browse listings' })).toBeVisible();
    await typeTab(page, 'Number requests').click();
    await expect(card(page, flat.title)).toBeVisible();
  });

  test('received requests list first, sent ones follow, and a type tab counts only what awaits you', async ({ page }) => {
    const owner = await actor('Zztest Mixed Owner');
    const mine = await listing(owner, 'mixed-mine');
    const otherOwner = await actor('Zztest Mixed Other Owner');
    const theirs = await listing(otherOwner, 'mixed-theirs');
    const buyer = await actor('Zztest Mixed Buyer');
    await ask(buyer, mine.id);
    await ask(owner, theirs.id);

    await signedInAs(page, owner.mobile);
    await openRequests(page);
    const cards = page.getByTestId('request-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveAttribute('data-box', 'received');
    await expect(cards.nth(0).getByTestId('request-direction')).toHaveText('Received');
    await expect(cards.nth(1)).toHaveAttribute('data-box', 'sent');
    await expect(cards.nth(1).getByTestId('request-direction')).toHaveText('Sent');
    await expect(tabCount(page, 'All')).toHaveText('1');
    await expect(tabCount(page, 'Number requests')).toHaveText('1');

    await expect(cards.nth(0).getByTestId('request-note')).toBeVisible();
    await expect(cards.nth(1).getByTestId('request-note')).toHaveCount(0);
    await expect(cards.nth(0).getByRole('button', { name: 'Withdraw' })).toHaveCount(0);
    await expect(cards.nth(1).getByRole('button', { name: 'Withdraw' })).toBeVisible();
  });

  test('a document request reaches the owner as a Share card and stays as Granted once shared', async ({ page }) => {
    const owner = await actor('Zztest Docs Panel Owner');
    const flat = await listing(owner, 'docs');
    const buyer = await actor('Zztest Docs Panel Buyer');
    const asked = await api('POST', '/documents/requests', buyer.headers, {
      propertyId: flat.id, categories: ['Index II'], acknowledgedDisclaimer: true,
    });
    expect(asked.status, `asking for documents (${JSON.stringify(asked.body)})`).toBe(201);

    await signedInAs(page, owner.mobile);
    await openRequests(page);
    await expect(tabCount(page, 'Documents')).toHaveText('1');
    await typeTab(page, 'Number requests').click();
    await expect(page.getByTestId('requests-empty')).toContainText('No number requests yet.');
    await typeTab(page, 'Documents').click();
    const docCard = card(page, buyer.name);
    await expect(docCard.getByTestId('request-direction')).toHaveText('Received');
    await expect(docCard).toHaveAttribute('data-kind', 'document');
    await expect(docCard.getByTestId('request-kind')).toHaveText('Documents');
    await expect(docCard).toContainText('Wants to see: Index II');
    await docCard.getByRole('button', { name: 'Share', exact: true }).click();
    await page.getByTestId('requests-past-toggle').click();
    await expect(docCard).toHaveAttribute('data-state', 'accepted');
    await expect(docCard.getByTestId('request-state')).toHaveText('Granted');
    await expect(docCard.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);
    await expect(tabCount(page, 'Documents')).toHaveCount(0);

    const rows = await api('GET', '/me/documents/requests?size=50', owner.headers);
    expect(rows.body.content.find((r) => r.id === asked.body.id).status).toBe('granted');
  });

  test('an approved lead folds under Show past requests with its private note, and can be cleared', async ({ page }) => {
    const owner = await actor('Zztest History Owner');
    const flat = await listing(owner, 'history');
    const approved = await actor('Zztest History Approved Buyer');
    const waiting = await actor('Zztest History Waiting Buyer');
    const approvedId = await ask(approved, flat.id);
    await ask(waiting, flat.id);
    const noted = await api('PUT', `/me/lead-notes/${encodeURIComponent(`number:${approvedId}`)}`, owner.headers,
      { note: 'Zztest - call after 6pm about parking', followUpAt: null });
    expect(noted.status, `saving the note (${JSON.stringify(noted.body)})`).toBe(200);
    expect((await api('PATCH', `/me/contact-requests/${approvedId}`, owner.headers, { status: 'approved' })).status).toBe(200);

    await signedInAs(page, owner.mobile);
    await openRequests(page);
    const cards = page.getByTestId('request-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.nth(0)).toContainText(waiting.name);
    await expect(cards.nth(0).getByRole('button', { name: 'Approve & chat' })).toBeVisible();
    await expect(tabCount(page, 'All')).toHaveText('1');
    const toggle = page.getByTestId('requests-past-toggle');
    await expect(toggle).toHaveText(/Show past requests \(1\)/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(cards).toHaveCount(2);
    const done = page.getByTestId('requests-past').getByTestId('request-card').filter({ hasText: approved.name });
    await expect(done).toHaveAttribute('data-box', 'received');
    await expect(done.getByTestId('request-state')).toHaveText('Approved');
    await expect(done.getByTestId('request-note')).toContainText('call after 6pm about parking');
    await expect(done.getByRole('button', { name: 'Approve & chat' })).toHaveCount(0);

    await done.getByRole('button', { name: 'Open chat' }).click();
    await expect(page).toHaveURL(/\/messages\?c=/, { timeout: 20000 });
    await expect(page.locator('.pc-conv[data-request-kind]').filter({ hasText: approved.name })).toHaveCount(0);

    await openRequests(page);
    await toggle.click();
    await card(page, approved.name).getByRole('button', { name: 'Clear' }).click();
    await expect(card(page, approved.name)).toHaveCount(0);
    await expect(toggle).toHaveCount(0);
    await page.reload();
    await expect(card(page, waiting.name)).toBeVisible({ timeout: 20000 });
    await expect(toggle).toHaveCount(0);
    const sentBox = await api('GET', '/me/requests?box=sent', approved.headers);
    expect(sentBox.body.content.find((r) => r.id === approvedId)?.state, 'clearing is the owner\'s view only').toBe('accepted');
  });
});
