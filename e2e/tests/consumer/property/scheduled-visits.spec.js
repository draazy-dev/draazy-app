import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, authHeaders, uniqueMobile, signedInAs, uploadedListingPhotos } from '../../../helpers/liveAuth.js';
import { pickDate } from '../../../helpers/datePicker.helper.js';
import { approveListingWithFetch } from '../../../helpers/moderation.js';
import { sql } from '../../../helpers/monetisation.js';

async function api(method, path, headers, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
/* An ISO instant `days` out, at a fixed local time. Local, not UTC-arithmetic: the row is rendered
   in the browser's zone, so a slot built in UTC could land on the previous day in the assertion. */
function slotDaysAhead(days, hour = 11, minute = 30) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
// Owner + approved listing + one booked visit per named visitor.
async function scene(visitorNames) {
  const owner = await actor('Zztest Visit Owner');
  const res = await api('POST', '/me/listings', owner.headers, {
    title: `Zztest scheduled-visits ${Date.now()}`,
    deal: 'rent',
    propertyType: 'Flat',
    bhk: 2,
    price: 25000,
    area: 920,
    areaUnit: 'sqft',
    furnishing: 'semi-furnished',
    city: 'Pune',
    locality: 'Baner',
    address: 'D110 Visit Test Residency, A-701',
    images: await uploadedListingPhotos(owner.headers),
  });
  expect(res.status, `creating the fixture listing (${JSON.stringify(res.body)})`).toBe(201);
  const listingId = res.body.id;
  expect(listingId, 'the server issued an id').toBeTruthy();

  const admin = await authHeaders(ACTORS.admin);
  const appr = await approveListingWithFetch(listingId, admin);
  expect(appr.status, 'approving the fixture listing').toBe(200);

  const visitors = [];
  for (const [i, name] of visitorNames.entries()) {
    const visitor = await actor(name);
    // Slots 3 and 5 days out, ascending in the order the names were given, so `upcoming`
    // (sorted by slot) puts them on screen in that same order.
    const slot = slotDaysAhead(3 + i * 2);
    const booked = await api('POST', '/visits', visitor.headers, {
      propertyId: listingId,
      slot,
      mode: 'in-person',
    });
    expect(booked.status, `booking a visit for ${name} (${JSON.stringify(booked.body)})`).toBe(201);
    visitors.push({ ...visitor, visitId: booked.body.id, slot });
  }

  return { owner, listingId, visitors };
}

async function visitRowsOnMine(owner) {
  const res = await api('GET', '/me/visit-requests?size=100', owner.headers);
  expect(res.status, 'reading visits on my listings').toBe(200);
  return res.body.content;
}
// Scope badge locator tightly; loose text also catches toast copies.
const badges = (page, label) => page.getByText(label, { exact: true });

test.describe('Scheduled visits (live)', () => {
  test('the owner works the visits: masked until confirmed, then a confirmation that persists, a reschedule and a cancellation', async ({ page }) => {
    test.slow();
    const { owner, visitors } = await scene(['Asha Kulkarni', 'Rohit More']);
    const [asha, rohit] = visitors;
    const rowOf = async (visitor) => (await visitRowsOnMine(owner)).find((r) => r.id === visitor.visitId);
    const upcoming = page.getByRole('heading', { name: /Upcoming visits/i }).first();
    await signedInAs(page, owner.mobile);
    await page.goto('/dashboard#visits');

    await test.step('owner sees an actionable Upcoming list, with the visitor number masked until they confirm', async () => {
      await expect(upcoming).toBeVisible();
      await expect(badges(page, 'Awaiting confirmation')).toHaveCount(2);
      await expect(page.getByText('Asha Kulkarni')).toBeVisible();
      // `isFullMobile` suppresses the in-app Message button for the five-digit fragment a masked value strips to.
      await expect(page.getByRole('button', { name: /^Message / })).toHaveCount(0);
      expect((await rowOf(asha)).visitor.mobile, 'masked to the owner while merely scheduled')
        .toBe(`${asha.mobile.slice(0, 2)}XXXXX${asha.mobile.slice(-3)}`);
    });

    await test.step('confirming one visit moves only that row, and the handoff appears without a reload', async () => {
      await page.getByRole('button', { name: /^Confirm$/ }).first().click();
      // Re-read from the server after the write (useDashboardData#mutateVisit), so this is the server's answer.
      await expect(badges(page, 'Confirmed')).toHaveCount(1);
      await expect(badges(page, 'Awaiting confirmation')).toHaveCount(1);

      await expect(page.getByRole('button', { name: 'Message Asha Kulkarni' })).toHaveCount(1);
      await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0);
      expect((await rowOf(asha)).visitor.mobile, 'revealed to the owner once confirmed').toBe(asha.mobile);
    });

    await test.step('a confirmed visit persists across a full reload', async () => {
      await page.reload();
      await expect(upcoming).toBeVisible();
      await expect(badges(page, 'Confirmed')).toHaveCount(1);
      expect((await rowOf(asha)).status, 'the confirmation was written, not just rendered').toBe('confirmed');
    });

    await test.step('the reschedule dialog opens, and dismissing it leaves the slot untouched', async () => {
      await page.getByRole('button', { name: /^Reschedule$/ }).first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const dateInput = dialog.getByRole('button', { name: 'New visit date' });
      await expect(dateInput).toBeVisible();

      await dialog.getByRole('button', { name: /^Cancel$/ }).click();
      await expect(dateInput).toHaveCount(0);
      const row = await rowOf(asha);
      expect(new Date(row.slot).getTime(), 'slot unchanged by opening and dismissing the dialog')
        .toBe(new Date(asha.slot).getTime());
      expect(row.status, 'status unchanged by opening and dismissing the dialog').toBe('confirmed');
    });

    await test.step('completing a reschedule moves the slot and resets the visit to scheduled (D87)', async () => {
      await page.getByRole('button', { name: /^Reschedule$/ }).first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      const target = new Date();
      target.setDate(target.getDate() + 9);
      const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
      await pickDate(page, '[aria-label="New visit date"]', iso);
      await dialog.getByRole('button', { name: 'Save new slot' }).click();
      await expect(page.getByText('Visit rescheduled')).toBeVisible();
      // `weekday, day, month` in the runner's locale, so match either word order.
      const mon = target.toLocaleDateString('en-US', { month: 'short' });
      const dateRe = new RegExp(`${mon} ${target.getDate()}\\b|\\b${target.getDate()} ${mon}`);
      await expect(page.getByText(dateRe).first()).toBeVisible();
      // The confirmation was undone by the move, so both rows are awaiting again.
      await expect(badges(page, 'Awaiting confirmation')).toHaveCount(2);
      await expect(badges(page, 'Confirmed')).toHaveCount(0);

      const moved = await rowOf(asha);
      expect(moved.status, 'the server reset the moved visit to scheduled').toBe('scheduled');
      expect(new Date(moved.slot).getDate(), 'the server stored the new day').toBe(target.getDate());
    });

    await test.step('cancelling a visit drops it from Upcoming and is cancelled on the server', async () => {
      // Asha now sits nine days out, so the first row, and its Cancel button, is Rohit's.
      await page.getByRole('button', { name: /^Cancel$/ }).first().click();
      await expect(badges(page, 'Awaiting confirmation')).toHaveCount(1);
      // A cancelled visit leaves Upcoming entirely, so the DOM alone cannot say which row was cancelled.
      expect((await rowOf(rohit)).status, 'the cancelled row is the one whose button was clicked').toBe('cancelled');
      expect((await rowOf(asha)).status, 'the other booking is untouched').toBe('scheduled');
    });

    await test.step('the Requests tab shows the pending visit as a card under All only, with no summary strip', async () => {
      await page.goto('/dashboard#leads');
      await page.reload();
      await expect(page.getByTestId('requests-panel')).toBeVisible();
      await expect(page.getByTestId('requests-box-received')).toHaveCount(0);
      const visitCards = page.locator('[data-testid="request-card"][data-state="pending"]').filter({ has: page.getByTestId('request-kind').filter({ hasText: /^Visit/ }) });
      await expect(visitCards).toHaveCount(1);
      await expect(visitCards.getByTestId('request-direction')).toHaveText('Received');
      for (const tab of ['Number requests', 'Photo requests', 'Documents', 'Flatmate']) {
        await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
        await expect(visitCards).toHaveCount(0);
      }
      await expect(page.getByRole('tab', { name: /^Visit requests$/ })).toHaveCount(0);
      await expect(page.getByText('Open leads')).toHaveCount(0);
      await expect(page.getByText('Oldest waiting')).toHaveCount(0);
    });
  });
  test('a buyer viewing their booked visit gets no WhatsApp handoff to the owner', async ({ page }) => {
    const { visitors } = await scene(['Asha Kulkarni']);
    const [asha] = visitors;
    await signedInAs(page, asha.mobile);
    await page.goto('/dashboard#visits');

    await expect(page.getByRole('heading', { name: /upcoming visits/i }).first()).toBeVisible();
    await expect(page.getByText('Your in-person')).toBeVisible();
    await expect(badges(page, 'Awaiting confirmation')).toHaveCount(1);
    await expect(page.getByText('Awaiting owner')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Confirm$/ })).toHaveCount(0);
    // The row is on screen and fully rendered — and carries no route to the owner's number.
    await expect(page.getByRole('link', { name: /WhatsApp/i })).toHaveCount(0);
    await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0);
  });

  test('Message on a confirmed visit opens the in-app thread with the visitor, once', async ({ page }) => {
    const { owner, visitors } = await scene(['Chat Visitor']);
    const [visitor] = visitors;
    const confirmed = await api('PATCH', `/visit-requests/${visitor.visitId}/status`, owner.headers, { status: 'confirmed' });
    expect(confirmed.status).toBe(200);

    await signedInAs(page, owner.mobile);
    for (const attempt of [1, 2]) {
      await page.goto('/dashboard#visits');
      await page.getByRole('button', { name: 'Message Chat Visitor' }).click();
      await expect(page, `attempt ${attempt} lands in Messages`).toHaveURL(/\/messages\?c=/);
      await expect(page.getByText(/your visit to .* is confirmed/).first()).toBeVisible();
    }

    const threads = await api('GET', '/messages?size=100', visitor.headers);
    expect(threads.status).toBe(200);
    expect(threads.body.content, 'one thread, not one per tap').toHaveLength(1);
    const thread = await api('GET', `/messages/${threads.body.content[0].id}`, visitor.headers);
    expect(thread.body.messages, 'a second tap reuses the thread without re-sending the greeting').toHaveLength(1);
  });

  test('the owner marks a past confirmed visit as a no-show', async ({ page }) => {
    const { owner, visitors } = await scene(['No Show Visitor']);
    const [visitor] = visitors;
    const confirmed = await api('PATCH', `/visit-requests/${visitor.visitId}/status`, owner.headers, { status: 'confirmed' });
    expect(confirmed.status).toBe(200);
    // A slot cannot be booked in the past, so age the confirmed row in place.
    sql(`UPDATE visits SET slot = now() - interval '2 days' WHERE id = '${visitor.visitId}'`);

    await signedInAs(page, owner.mobile);
    await page.goto('/dashboard#visits');
    await page.getByRole('button', { name: "Didn't come" }).click();
    await expect(page.getByText('Marked as a no-show')).toBeVisible();
    await expect(page.getByRole('button', { name: "Didn't come" })).toHaveCount(0);
    expect((await visitRowsOnMine(owner)).find((r) => r.id === visitor.visitId).status).toBe('no-show');
  });

  test('a slot in the past is refused at booking and at reschedule', async () => {
    const { listingId, visitors } = await scene(['Past Slot Visitor']);
    const [visitor] = visitors;
    const past = slotDaysAhead(-1);
    const booked = await api('POST', '/visits', visitor.headers, { propertyId: listingId, slot: past, mode: 'in-person' });
    expect(booked.status).toBe(422);
    const moved = await api('PATCH', `/visits/${visitor.visitId}/slot`, visitor.headers, { slot: past });
    expect(moved.status).toBe(422);
  });

  test('taking the listing down cancels its booked visits', async () => {
    const { owner, listingId, visitors } = await scene(['Archive Visit Visitor']);
    const [visitor] = visitors;
    const archived = await api('PATCH', `/properties/${listingId}/archive`, owner.headers, { reason: 'Let out offline' });
    expect(archived.status).toBe(200);
    const mine = await api('GET', '/visits?size=50', visitor.headers);
    expect(mine.status).toBe(200);
    expect(mine.body.content.find((v) => v.id === visitor.visitId)?.status).toBe('cancelled');
  });

  test('a suspended owner\'s listing is hidden and takes no visits until reactivated', async () => {
    const { owner, listingId } = await scene([]);
    const ownerId = (await api('GET', '/auth/me', owner.headers)).body.id;
    const admin = await authHeaders(ACTORS.admin);
    const buyer = await actor('Suspended Owner Buyer');
    expect((await api('PATCH', `/users/${ownerId}/suspend`, admin, { reason: 'QA check' })).status).toBe(200);

    expect((await api('GET', `/properties/${listingId}`, buyer.headers)).status).toBe(404);
    const booked = await api('POST', '/visits', buyer.headers, { propertyId: listingId, slot: slotDaysAhead(2), mode: 'in-person' });
    expect(booked.status).toBe(404);

    expect((await api('PATCH', `/users/${ownerId}/reactivate`, admin)).status).toBe(200);
    expect((await api('GET', `/properties/${listingId}`, buyer.headers)).status).toBe(200);
  });
});
