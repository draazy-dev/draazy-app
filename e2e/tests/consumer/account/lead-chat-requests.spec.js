import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, authHeaders, signedInAs, uniqueMobile, uploadedListingPhotos, letterTag } from '../../../helpers/liveAuth.js';
import { approveListingWithFetch, rejectListingWithFetch } from '../../../helpers/moderation.js';

/* A site visit or a price offer introduces two people, so each waits in Messages as a request thread
   counted on the orange badge, and the owner's yes opens one listing chat both sides land in. */

const createdListings = new Map();
let actorSequence = 0;

async function api(method, path, headers, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function actor(name) {
  const base = uniqueMobile();
  const mobile = `${base.slice(0, -1)}${actorSequence++ % 10}`;
  const headers = await authHeaders(mobile);
  const named = await api('PATCH', '/auth/me', headers, { name });
  expect(named.status, `naming ${name}`).toBe(200);
  return { mobile, headers, name };
}

async function approvedListing(owner) {
  const created = await api('POST', '/me/listings', owner.headers, {
    title: `Zztest lead chat ${Date.now()}`,
    deal: 'rent',
    propertyType: 'Flat',
    price: 26000,
    city: 'Pune',
    locality: 'Baner',
    bhk: 2,
    area: 880,
    images: await uploadedListingPhotos(owner.headers),
  });
  expect(created.status, 'creating the isolated listing').toBe(201);
  createdListings.set(created.body.id, owner.headers);
  const approved = await approveListingWithFetch(created.body.id, await authHeaders(ACTORS.admin));
  expect(approved.status, 'approving the isolated listing').toBe(200);
  return created.body;
}

test.afterEach(async () => {
  const adminHeaders = await authHeaders(ACTORS.admin);
  for (const [id] of createdListings) {
    const rejected = await rejectListingWithFetch(id, adminHeaders, { reason: 'Zztest cleanup - lead chat fixture' });
    expect(rejected.status, `cleaning up isolated listing ${id}`).toBe(200);
  }
  createdListings.clear();
});

const chatUrl = /\/messages\?c=(?!request:)[^&]+/;

test.describe('Visit and offer requests in Messages - live API', () => {
  test('a visit request waits in Messages on the badge, and confirming opens the listing chat for both sides', async ({ page }) => {
    const owner = await actor(`Zztest Lead Owner ${letterTag()}`);
    const visitor = await actor(`Zztest Lead Visitor ${letterTag()}`);
    const listing = await approvedListing(owner);
    const visit = await api('POST', '/visits', visitor.headers, {
      propertyId: listing.id, slot: new Date(Date.now() + 3 * 86_400_000).toISOString(), mode: 'in-person',
    });
    expect(visit.status, 'booking the visit').toBe(201);
    expect((await api('POST', `/messages/requests/visit/${visit.body.id}`, visitor.headers)).status,
      'no chat before the owner confirms').toBe(404);

    await signedInAs(page, owner.mobile);
    await page.goto('/messages');
    const badge = page.getByTestId('messages-request-badge');
    await expect(badge).toHaveText('1', { timeout: 20000 });
    await page.locator(`.pc-conv[data-conversation-id="request:visit:${visit.body.id}"]`).click();
    const thread = page.getByTestId('request-thread');
    await expect(thread).toHaveAttribute('data-kind', 'visit');
    await expect(thread).toHaveAttribute('data-box', 'received');
    await expect(thread).toContainText('Confirming opens the chat.');

    await thread.getByRole('button', { name: 'Confirm & chat' }).click();
    await expect(page).toHaveURL(chatUrl, { timeout: 20000 });
    await expect(page.locator('.pc-input')).toBeVisible({ timeout: 20000 });
    await expect(badge).toHaveCount(0);

    const ownerChips = page.locator('.pc-quick-chip');
    await expect(ownerChips.filter({ hasText: /^Is it still available\?$/ })).toHaveCount(0);
    const pin = ownerChips.filter({ hasText: "I'll share the location pin" });
    await expect(pin).toBeVisible({ timeout: 20000 });
    await pin.click();
    await expect(page.locator('.pc-bubble.me', { hasText: "I'll share the location pin" })).toBeVisible();
    await expect(ownerChips, 'the owner has opened the chat').toHaveCount(0);

    const ownerThread = new URL(page.url()).searchParams.get('c');
    const fromVisitor = await api('POST', `/messages/requests/visit/${visit.body.id}`, visitor.headers);
    expect(fromVisitor.status, 'the visitor opens the same chat').toBe(200);
    expect(fromVisitor.body.id).toBe(ownerThread);

    await signedInAs(page, visitor.mobile);
    await page.goto(`/messages?c=${ownerThread}`);
    await expect(page.locator('.pc-quick-chip').filter({ hasText: 'Please share the location pin' })).toBeVisible({ timeout: 20000 });
  });

  test('an offer waits under Offers on the badge, and accepting opens the listing chat', async ({ page }) => {
    const owner = await actor(`Zztest Offer Owner ${letterTag()}`);
    const buyer = await actor(`Zztest Offer Buyer ${letterTag()}`);
    const listing = await approvedListing(owner);
    const offer = await api('POST', '/offers', buyer.headers, { propertyId: listing.id, amount: 24000, message: 'Zztest can move in next month' });
    expect(offer.status, 'making the offer').toBe(201);

    await signedInAs(page, owner.mobile);
    await page.goto('/dashboard?tab=leads');
    await expect(page.getByTestId('messages-request-badge')).toHaveText('1', { timeout: 20000 });
    await page.getByRole('tab', { name: /^Offers/ }).click();
    const card = page.getByTestId('request-card').filter({ hasText: buyer.name });
    await expect(card).toHaveAttribute('data-kind', 'offer', { timeout: 20000 });
    await expect(card.getByTestId('request-kind')).toHaveText('Price offer');
    await expect(card).toContainText('Offered ₹24,000. Zztest can move in next month');
    await expect(card.getByTestId('request-counter')).toHaveAttribute('href', /^\/property\//);

    await card.getByRole('button', { name: 'Accept & chat' }).click();
    await expect(page).toHaveURL(chatUrl, { timeout: 20000 });
    await expect(page.locator('.pc-input')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('messages-request-badge')).toHaveCount(0);
    await expect(page.locator('.pc-quick-chip').filter({ hasText: "Let's fix a date for the agreement" })).toBeVisible({ timeout: 20000 });

    const fromBuyer = await api('POST', `/messages/requests/offer/${offer.body.id}`, buyer.headers);
    expect(fromBuyer.status, 'the buyer opens the same chat').toBe(200);
    expect(fromBuyer.body.id).toBe(new URL(page.url()).searchParams.get('c'));
  });

  test('an owner counter leaves the buyer a request thread that sends them back to the listing', async ({ page }) => {
    const owner = await actor(`Zztest Counter Owner ${letterTag()}`);
    const buyer = await actor(`Zztest Counter Buyer ${letterTag()}`);
    const listing = await approvedListing(owner);
    const offer = await api('POST', '/offers', buyer.headers, { propertyId: listing.id, amount: 24000 });
    expect(offer.status, 'making the offer').toBe(201);
    expect((await api('POST', `/offers/${offer.body.id}/respond`, owner.headers, { action: 'counter', counterAmount: 25000 })).status).toBe(200);

    const ownerBox = await api('GET', '/me/requests?box=received', owner.headers);
    expect(ownerBox.body.content.find((r) => r.id === offer.body.id)?.state, 'the owner waits on the buyer').toBe('countered');

    await signedInAs(page, buyer.mobile);
    await page.goto('/messages');
    await page.locator(`.pc-conv[data-conversation-id="request:offer:${offer.body.id}"]`).click({ timeout: 20000 });
    const thread = page.getByTestId('request-thread');
    await expect(thread).toHaveAttribute('data-state', 'countered');
    await expect(thread).toContainText('Owner countered at ₹25,000');
    await expect(thread).toContainText('sent a counter-offer');
    await expect(thread.getByTestId('request-respond')).toHaveAttribute('href', /^\/property\//);
  });
});
