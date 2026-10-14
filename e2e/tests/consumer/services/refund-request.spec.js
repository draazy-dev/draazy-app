import { test, expect } from '../../../fixtures/live.js';
import { API, apiLogin, signedInAs, uniqueMobile, seedConsent } from '../../../helpers/liveAuth.js';
import { approve, call, entitlementsOf, newListing, openOrder, settleOrder, sql, statusOf, LISTING_PASS_PLAN } from '../../../helpers/monetisation.js';
import {
  ageOrder, decide, paidPack, paidPass, paymentOf, paymentsOf, refundIdOf, requestRefund, seedCreditNote, seedInvoice,
} from '../../../helpers/refunds.js';

const serial = () => String(Math.floor(100000 + Math.random() * 899999));
const row = (page) => page.getByTestId('payment-row');
const rowFor = (page, text) => row(page).filter({ hasText: text });

async function newBuyer() {
  const mobile = uniqueMobile();
  await apiLogin(mobile);
  return mobile;
}

async function notificationTypes(mobile) {
  const res = await call('GET', '/notifications?size=100', mobile);
  expect(res.status).toBe(200);
  return (Array.isArray(res.json) ? res.json : res.json.content).map((n) => n.type);
}

async function twoListings(mobile) {
  const live = await newListing(mobile, { title: 'Refund live' });
  await approve(live.id);
  const parked = await newListing(mobile, { title: 'Refund parked' });
  await approve(parked.id);
  expect(await statusOf(mobile, parked.id), 'the second listing is over the free tier, so it is parked').toBe('paused');
  return { live, parked };
}

test.describe('LIVE: a customer asks for a refund', () => {
  test('an unused pack is refundable on the billing panel; asking freezes it, the desk approves, and the row ends Refunded with its credit note', async ({ page, consoleErrors }) => {
    test.slow();
    await seedConsent(page);
    const mobile = await newBuyer();
    const orderId = await paidPack(mobile);
    const invoice = seedInvoice(mobile, orderId, `INV-FY2627-${serial()}`);
    expect((await entitlementsOf(mobile)).contacts.remaining, 'free contacts plus the pack').toBe(30);

    await signedInAs(page, mobile);
    await page.goto('/dashboard#billing');

    await test.step('the paid pack lists with its invoice and a refund offer', async () => {
      const pack = rowFor(page, 'Contact Pack');
      await expect(pack).toHaveCount(1, { timeout: 20000 });
      await expect(pack).toContainText('₹199');
      await expect(pack).toContainText(invoice);
      await expect(pack).toContainText('Paid');
      await expect(pack.getByTestId('refund-open')).toContainText(/Refund · until/);
    });

    await test.step('the sheet says what is frozen and the request is sent once', async () => {
      await rowFor(page, 'Contact Pack').getByTestId('refund-open').click();
      await expect(page.getByRole('dialog', { name: 'Request a refund' })).toBeVisible();
      await expect(page.getByText('₹199 goes back to your original payment method.')).toBeVisible();
      await expect(page.getByText(/contacts are frozen until we decide/)).toBeVisible();
      await expect(page.getByTestId('refund-reason')).toHaveAttribute('maxlength', '500');
      await page.getByTestId('refund-reason').fill('Bought by mistake');
      await page.getByTestId('refund-confirm').click();
      await expect(page.getByText(/Request sent/)).toBeVisible();

      const pack = rowFor(page, 'Contact Pack');
      await expect(pack).toContainText('Refund pending');
      await expect(pack.getByTestId('refund-open')).toHaveCount(0);
    });

    await test.step('the pack is frozen the moment it is asked for', async () => {
      expect((await entitlementsOf(mobile)).contacts.remaining, 'only the free contacts are left').toBe(15);
      expect((await paymentOf(mobile, orderId)).status).toBe('refund_pending');
    });

    await test.step('the desk approves and the customer is told', async () => {
      const approved = await decide(refundIdOf(orderId), 'approve');
      expect(approved.status, JSON.stringify(approved.json)).toBe(200);
      expect(approved.json.status).toBe('approved');
      expect(await notificationTypes(mobile)).toContain('refund.decided');
      expect((await entitlementsOf(mobile)).contacts.remaining, 'an approved refund does not give the pack back').toBe(15);
    });

    await test.step('the row reads Refunded, then carries the credit note once the gateway confirms', async () => {
      await page.reload();
      await expect(rowFor(page, 'Contact Pack')).toContainText('Refunded', { timeout: 20000 });
      await expect(rowFor(page, 'Contact Pack').getByTestId('refund-open')).toHaveCount(0);

      const note = seedCreditNote(orderId, `CN-FY2627-${serial()}`, invoice);
      await page.reload();
      await expect(rowFor(page, 'Contact Pack')).toContainText(`Credit note ${note}`, { timeout: 20000 });
      expect((await paymentOf(mobile, orderId)).creditNoteNo).toBe(note);
    });

    expect(consoleErrors).toEqual([]);
  });

  test('a rejected refund gives the pack back, says so on the row, and cannot be asked for again', async ({ page }) => {
    test.slow();
    await seedConsent(page);
    const mobile = await newBuyer();
    const orderId = await paidPack(mobile);

    const asked = await requestRefund(mobile, orderId);
    expect(asked.status, JSON.stringify(asked.json)).toBe(200);
    expect(asked.json.status).toBe('refund_pending');
    expect((await entitlementsOf(mobile)).contacts.remaining).toBe(15);

    const rejected = await decide(refundIdOf(orderId), 'reject', 'Pack was used on another account');
    expect(rejected.status, JSON.stringify(rejected.json)).toBe(200);
    expect(rejected.json.status).toBe('rejected');

    expect((await entitlementsOf(mobile)).contacts.remaining, 'the pack is whole again').toBe(30);
    expect(await notificationTypes(mobile)).toContain('refund.decided');
    const after = await paymentOf(mobile, orderId);
    expect(after.status).toBe('refund_rejected');

    await signedInAs(page, mobile);
    await page.goto('/dashboard#billing');
    const pack = rowFor(page, 'Contact Pack');
    await expect(pack).toContainText('Refund declined', { timeout: 20000 });
    await expect(pack.getByTestId('refund-open')).toHaveCount(0);
    await expect(pack.getByRole('link', { name: 'Ask for a review' })).toHaveAttribute('href', /\/support\?cat=payment/);

    const again = await requestRefund(mobile, orderId);
    expect(again.status).toBe(422);
    expect(again.json.reason).toBe('already_requested');
  });

  test('a used pack and a late pack each show why on the row instead of a button', async ({ page }) => {
    test.slow();
    await seedConsent(page);

    const spender = await newBuyer();
    const [first, second] = (await (await fetch(`${API}/properties?size=2`)).json()).content;
    expect((await call('POST', '/contacts/request', spender, { propertyId: first.id })).status).toBe(200);
    sql(`update contact_requests set first_requested_at = now() - interval '31 days' where requester_id = (select id from users where mobile = '${spender}')`);
    const usedPack = await paidPack(spender);
    expect((await call('POST', '/contacts/request', spender, { propertyId: second.id })).status, 'a pack contact is spent').toBe(200);

    const late = await newBuyer();
    const latePack = await paidPack(late, { ageDays: 8 });

    await test.step('a pack with a contact drawn from it is refused with the reason, over the wire and on screen', async () => {
      const refused = await requestRefund(spender, usedPack);
      expect(refused.status).toBe(422);
      expect(refused.json.error).toBe('refund_not_eligible');
      expect(refused.json.reason).toBe('not_eligible_used');

      await signedInAs(page, spender);
      await page.goto('/dashboard#billing');
      const pack = rowFor(page, 'Contact Pack');
      await expect(pack).toContainText('Already used, so it can’t be refunded.', { timeout: 20000 });
      await expect(pack.getByTestId('refund-open')).toHaveCount(0);
      await expect(pack.getByRole('link', { name: 'Ask for a review' })).toBeVisible();
    });

    await test.step('a pack older than the window is refused as closed', async () => {
      expect((await paymentOf(late, latePack)).refund.reason).toBe('window_closed');
      const refused = await requestRefund(late, latePack);
      expect(refused.status).toBe(422);
      expect(refused.json.reason).toBe('window_closed');

      await signedInAs(page, late);
      await page.goto('/dashboard#billing');
      await expect(rowFor(page, 'Contact Pack')).toContainText('The refund window has closed.', { timeout: 20000 });
    });
  });

  test('asking twice with one key is one request, asking again with a new key is refused, and nobody else can ask', async () => {
    const mobile = await newBuyer();
    const stranger = await newBuyer();
    const orderId = await paidPack(mobile);

    const key = crypto.randomUUID();
    const one = await requestRefund(mobile, orderId, { key });
    const replay = await requestRefund(mobile, orderId, { key });
    expect([one.status, replay.status]).toEqual([200, 200]);
    expect(replay.json.status).toBe('refund_pending');
    expect(sql(`select count(*) from refund_requests where subscription_id = '${orderId}'`)).toBe('1');

    const second = await requestRefund(mobile, orderId);
    expect(second.status).toBe(422);
    expect(second.json.reason).toBe('already_requested');

    expect((await requestRefund(stranger, orderId)).status, 'another account’s order is not found').toBe(404);
    expect((await paymentsOf(stranger)).find((p) => p.id === orderId), 'and not listed').toBeUndefined();

    const noKey = await fetch(`${API}/me/payments/${orderId}/refund`, { method: 'POST' });
    expect(noKey.status, 'signed out').toBe(401);
  });

  test('a listing pass is refundable only once its guarantee window opens and only while no enquiry has arrived; asking pauses the listing and a rejection resumes it', async () => {
    test.slow();
    const owner = await newBuyer();
    const { parked } = await twoListings(owner);
    const orderId = await paidPass(owner, parked.id);
    expect((await call('POST', `/me/listings/${parked.id}/resume`, owner)).status, 'the pass lets the parked listing go live').toBe(200);
    expect(await statusOf(owner, parked.id)).toBe('approved');

    await test.step('inside the first days the refund is not open yet and says from when', async () => {
      const early = (await paymentOf(owner, orderId)).refund;
      expect(early.eligible).toBe(false);
      expect(early.reason).toBe('window_not_open');
      expect(Date.parse(early.from)).toBeGreaterThan(Date.now());
      expect((await requestRefund(owner, orderId)).json.reason).toBe('window_not_open');
    });

    await test.step('after the guarantee days with no enquiry it is open', async () => {
      ageOrder(orderId, 8);
      const open = (await paymentOf(owner, orderId)).refund;
      expect(open.eligible).toBe(true);
      expect(open.reason).toBe('pass_no_enquiries');
      expect(open.amount).toBe(999);
    });

    await test.step('an enquiry on the listing closes it', async () => {
      const seeker = await newBuyer();
      expect((await call('POST', '/contacts/request', seeker, { propertyId: parked.id })).status).toBe(200);
      const used = await requestRefund(owner, orderId);
      expect(used.status).toBe(422);
      expect(used.json.reason).toBe('not_eligible_used');
      sql(`delete from contact_requests where property_id = '${parked.id}'`);
      expect((await paymentOf(owner, orderId)).refund.eligible, 'with the enquiry gone it is open again').toBe(true);
    });

    await test.step('asking freezes the pass, which pauses the listing it carried', async () => {
      const asked = await requestRefund(owner, orderId);
      expect(asked.status, JSON.stringify(asked.json)).toBe(200);
      expect(asked.json.status).toBe('refund_pending');
      expect(await statusOf(owner, parked.id)).toBe('paused');
    });

    await test.step('a rejection restores the pass and the listing goes live again', async () => {
      expect((await decide(refundIdOf(orderId), 'reject', 'Enquiry found on the phone line')).status).toBe(200);
      expect(await statusOf(owner, parked.id)).toBe('approved');
      expect((await paymentOf(owner, orderId)).status).toBe('refund_rejected');
    });
  });

  test('a pass is refused as closed once the window has gone by, and as paused if the listing left live inside it', async () => {
    test.slow();
    const owner = await newBuyer();
    const { parked } = await twoListings(owner);
    const orderId = await paidPass(owner, parked.id);
    expect((await call('POST', `/me/listings/${parked.id}/resume`, owner)).status).toBe(200);

    ageOrder(orderId, 8);
    sql(
      'insert into property_live_gaps (property_id, left_live_at, returned_live_at)'
      + ` values ('${parked.id}', now() - interval '5 days', now() - interval '4 days')`,
    );
    expect((await paymentOf(owner, orderId)).refund.reason, 'it was paused during the first week').toBe('listing_paused');

    sql(`delete from property_live_gaps where property_id = '${parked.id}'`);
    ageOrder(orderId, 12);
    expect((await paymentOf(owner, orderId)).refund.reason).toBe('window_closed');
  });

  test('a second no-enquiry guarantee inside twelve months is refused', async () => {
    test.slow();
    const owner = await newBuyer();
    const { parked } = await twoListings(owner);

    const first = await paidPass(owner, parked.id, { ageDays: 8 });
    expect((await call('POST', `/me/listings/${parked.id}/resume`, owner)).status).toBe(200);
    const claimed = await requestRefund(owner, first);
    expect(claimed.status, JSON.stringify(claimed.json)).toBe(200);
    expect((await decide(refundIdOf(first), 'approve')).status).toBe(200);

    const third = await newListing(owner, { title: 'Refund third' });
    await approve(third.id);

    const order = await openOrder(owner, LISTING_PASS_PLAN, third.id);
    settleOrder(order.id, 30);
    expect((await call('POST', `/me/listings/${third.id}/resume`, owner)).status).toBe(200);
    ageOrder(order.id, 8);
    expect((await paymentOf(owner, order.id)).refund.reason).toBe('guarantee_used_recently');
  });
});
