import { test, expect } from '../../../fixtures/live.js';
import { signedInAs, seedConsent } from '../../../helpers/liveAuth.js';
import { call, entitlementsOf, sql } from '../../../helpers/monetisation.js';
import { liveListing, member } from '../../../helpers/referral.js';
import { putSettings, settingsSnapshot } from '../../../helpers/refunds.js';

const ask = (mobile, propertyId) => call('POST', '/contacts/request', mobile, { propertyId });
const remaining = async (mobile) => (await entitlementsOf(mobile)).contacts.remaining;
const card = (page, name) => page.getByTestId('request-card').filter({ hasText: name });

async function notificationTypes(mobile) {
  const res = await call('GET', '/notifications?size=100', mobile);
  expect(res.status).toBe(200);
  return (Array.isArray(res.json) ? res.json : res.json.content).map((n) => n.type);
}

async function requestIdFor(owner, propertyId) {
  const inbox = await call('GET', '/me/contact-requests?size=50', owner);
  expect(inbox.status).toBe(200);
  return (Array.isArray(inbox.json) ? inbox.json : inbox.json.content).find((r) => r.propertyId === propertyId);
}

async function openOwnerRequests(page, owner) {
  await signedInAs(page, owner);
  await page.goto('/dashboard?tab=leads');
}

const pressRequestNumber = async (page) => {
  const press = page.getByRole('button', { name: /Request number/i }).first();
  await press.waitFor({ timeout: 20000 });
  await press.click();
};

test.describe('LIVE: contacts come back', () => {
  test('a declined request returns the contact, stays on the listing as Contact returned, and cannot be asked again for free', async ({ page }) => {
    test.slow();
    await seedConsent(page);
    const owner = await member('Returns Owner');
    const seeker = await member('Returns Seeker');
    const listing = await liveListing(owner);

    expect((await ask(seeker, listing.id)).status).toBe(200);
    expect(await remaining(seeker), 'a pending request counts against the allowance').toBe(14);

    await test.step('the owner declines it from the Requests tab', async () => {
      await openOwnerRequests(page, owner);
      const lead = card(page, 'Returns Seeker');
      await expect(lead).toBeVisible({ timeout: 20000 });
      const decided = page.waitForResponse((r) => /\/api\/me\/contact-requests\//.test(r.url()) && r.request().method() === 'PATCH');
      await lead.getByRole('button', { name: 'Decline' }).click();
      expect((await decided).status()).toBe(200);
      await page.getByTestId('requests-past-toggle').click();
      await expect(card(page, 'Returns Seeker')).toHaveAttribute('data-state', 'declined');
      expect((await requestIdFor(owner, listing.id)).status).toBe('declined');
    });

    await test.step('the seeker has the contact back and is told', async () => {
      expect(await remaining(seeker)).toBe(15);
      expect(await notificationTypes(seeker)).toContain('contact.returned');
    });

    await test.step('the listing page shows the chip in place of the button', async () => {
      await signedInAs(page, seeker);
      await page.goto(`/property/${listing.id}`);
      await expect(page.getByText('Contact returned').first()).toBeVisible({ timeout: 20000 });
      await expect(page.getByRole('button', { name: /Request number/i })).toHaveCount(0);
    });

    await test.step('asking again spends nothing and does not reopen it', async () => {
      const again = await ask(seeker, listing.id);
      expect(again.status).toBe(200);
      expect(again.json.status).toBe('declined');
      expect(await remaining(seeker)).toBe(15);
    });
  });

  test('a request nobody answers within the reply window stops counting, the owner can no longer accept it, and asking again costs a new contact', async ({ page }) => {
    test.slow();
    await seedConsent(page);
    const owner = await member('Lapse Owner');
    const seeker = await member('Lapse Seeker');
    const listing = await liveListing(owner);

    expect((await ask(seeker, listing.id)).status).toBe(200);
    const request = await requestIdFor(owner, listing.id);
    expect(request.status).toBe('pending');
    expect(await remaining(seeker)).toBe(14);

    sql(`update contact_requests set created_at = now() - interval '8 days' where property_id = '${listing.id}'`);

    await test.step('past the window it is given back without any sweep having run', async () => {
      expect(await remaining(seeker)).toBe(15);
      expect((await requestIdFor(owner, listing.id)).status).toBe('expired');
      const lapsed = await call('PATCH', `/me/contact-requests/${request.id}`, owner, { status: 'approved' });
      expect(lapsed.status, 'a lapsed request cannot be accepted').toBe(409);
    });

    await test.step('once the daily sweep stores the expiry the seeker can still ask again from the page', async () => {
      sql(`update contact_requests set status = 'expired' where property_id = '${listing.id}'`);
      await signedInAs(page, seeker);
      await page.goto(`/property/${listing.id}`);
      await expect(page.getByText('Contact returned').first()).toBeVisible({ timeout: 20000 });
      await expect(page.getByRole('button', { name: /Request number/i }).first()).toBeVisible();
    });

    await test.step('renewing it is a new spend', async () => {
      await pressRequestNumber(page);
      await expect(page.getByText(/Request sent|sent your request/i).first()).toBeVisible();
      expect(await remaining(seeker)).toBe(14);
      expect((await requestIdFor(owner, listing.id)).status).toBe('pending');
    });
  });

  test('past the cap on open requests the press is refused with a message, and an answer frees the slot', async ({ page }) => {
    test.slow();
    await seedConsent(page);
    const before = await settingsSnapshot();
    const [ownerOne, ownerTwo, seeker] = [await member('Cap Owner One'), await member('Cap Owner Two'), await member('Cap Seeker')];
    const [one, two] = [await liveListing(ownerOne), await liveListing(ownerTwo)];

    try {
      expect((await putSettings({ fees: { contactPendingMax: 1 } })).status).toBe(200);
      expect((await ask(seeker, one.id)).status).toBe(200);

      await signedInAs(page, seeker);
      await page.goto(`/property/${two.id}`);
      const [refused] = await Promise.all([
        page.waitForResponse((r) => /\/api\/contacts\/request$/.test(r.url()) && r.request().method() === 'POST'),
        pressRequestNumber(page),
      ]);
      expect(refused.status()).toBe(422);
      expect((await refused.json()).error).toBe('contact_pending_limit');
      await expect(page.getByText('Too many requests are awaiting a reply. Try again once an owner responds.')).toBeVisible();
      expect(await remaining(seeker), 'the refused press costs nothing').toBe(14);

      const first = await requestIdFor(ownerOne, one.id);
      expect((await call('PATCH', `/me/contact-requests/${first.id}`, ownerOne, { status: 'declined' })).status).toBe(200);
      expect((await ask(seeker, two.id)).status, 'an answered request no longer holds a slot').toBe(200);
    } finally {
      await putSettings({ fees: { contactPendingMax: before.fees.contactPendingMax } });
    }
  });

  test('a listing that is not live takes no new request, and its owner cannot accept one until it is live again', async ({ page }) => {
    test.slow();
    await seedConsent(page);
    const owner = await member('Paused Owner');
    const early = await member('Early Seeker');
    const late = await member('Late Seeker');
    const listing = await liveListing(owner);

    expect((await ask(early, listing.id)).status).toBe(200);
    await signedInAs(page, late);
    await page.goto(`/property/${listing.id}`);
    await expect(page.getByRole('button', { name: /Request number/i }).first()).toBeVisible({ timeout: 20000 });
    expect((await call('POST', `/me/listings/${listing.id}/pause`, owner)).status).toBe(200);

    await test.step('a new press is refused as not live and costs nothing', async () => {
      const refused = await ask(late, listing.id);
      expect(refused.status).toBe(409);
      expect(refused.json.error).toBe('listing_not_live');

      const [response] = await Promise.all([
        page.waitForResponse((r) => /\/api\/contacts\/request$/.test(r.url()) && r.request().method() === 'POST'),
        pressRequestNumber(page),
      ]);
      expect(response.status()).toBe(409);
      await expect(page.getByText(/isn.t taking enquiries right now/)).toBeVisible();
      expect(await remaining(late)).toBe(15);
    });

    await test.step('the owner’s Accept is refused with the way forward, and the request stays pending', async () => {
      await openOwnerRequests(page, owner);
      const lead = card(page, 'Early Seeker');
      await expect(lead).toBeVisible({ timeout: 20000 });
      await lead.getByRole('button', { name: 'Approve & chat' }).click();
      await expect(page.getByText('Make the listing live to share your number.')).toBeVisible();
      expect((await requestIdFor(owner, listing.id)).status).toBe('pending');
    });

    await test.step('live again, the same Accept goes through', async () => {
      expect((await call('POST', `/me/listings/${listing.id}/resume`, owner)).status).toBe(200);
      const request = await requestIdFor(owner, listing.id);
      expect((await call('PATCH', `/me/contact-requests/${request.id}`, owner, { status: 'approved' })).status).toBe(200);
    });
  });
});
