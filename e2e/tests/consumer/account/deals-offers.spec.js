import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, authHeaders, uploadedListingPhotos, signedInAs, uniqueMobile, letterTag, shownMobile } from '../../../helpers/liveAuth.js';
import { approveListingWithFetch, rejectListingWithFetch } from '../../../helpers/moderation.js';

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

async function newActor(name) {
  const base = uniqueMobile();
  const mobile = `${base.slice(0, -1)}${actorSequence++ % 10}`;
  const headers = await authHeaders(mobile);
  const named = await api('PATCH', '/auth/me', headers, { name });
  expect(named.status, `naming ${name}`).toBe(200);
  return { mobile, headers, name };
}

async function createApprovedListing(owner) {
  const created = await api('POST', '/me/listings', owner.headers, {
    title: `Zztest deal listing ${Date.now()}`,
    deal: 'rent',
    propertyType: 'Flat',
    price: 28000,
    city: 'Pune',
    locality: 'Baner',
    bhk: 2,
    area: 900,
    images: await uploadedListingPhotos(owner.headers),
  });
  expect(created.status, 'creating the isolated deal listing').toBe(201);
  createdListings.set(created.body.id, owner.headers);

  const approved = await approveListingWithFetch(created.body.id, await authHeaders(ACTORS.admin));
  expect(approved.status, 'approving the isolated deal listing').toBe(200);
  return created.body;
}

async function contentFrom(owner, path, description) {
  const response = await api('GET', path, owner.headers);
  expect(response.status, description).toBe(200);
  return response.body.content;
}

async function approveContact(owner, buyer, propertyId) {
  const requested = await api('POST', '/contacts/request', buyer.headers, {
    propertyId,
    message: 'I would like to discuss this listing before finalizing.',
  });
  expect(requested.status, 'creating the contact request needed for finalization').toBe(200);

  const requests = await contentFrom(owner, '/me/contact-requests?size=50', 'reading the owner contact inbox');
  const contact = requests.find((request) => request.propertyId === propertyId && request.requester?.name === buyer.name);
  expect(contact, 'the owner must receive the buyer contact request').toBeTruthy();

  const approved = await api('PATCH', `/me/contact-requests/${contact.id}`, owner.headers, { status: 'approved' });
  expect(approved.status, 'approving buyer contact before finalization').toBe(200);
}

test.afterEach(async () => {
  const adminHeaders = await authHeaders(ACTORS.admin);
  for (const [id, ownerHeaders] of createdListings) {
    let rejected = await rejectListingWithFetch(id, adminHeaders, {
      reason: 'Zztest cleanup - deals and offers fixture',
    });
    if (rejected.status === 409) {
      const reopened = await api('POST', `/me/deals/${id}/reopen`, ownerHeaders, {});
      expect(reopened.status, `reopening closed isolated listing ${id}`).toBe(200);
      rejected = await rejectListingWithFetch(id, adminHeaders, {
        reason: 'Zztest cleanup - deals and offers fixture',
      });
    }
    expect(rejected.status, `cleaning up isolated listing ${id}`).toBe(200);
  }
  createdListings.clear();
});

test('a buyer offer is countered, agreed and accepted through the real deal API', async ({ page }) => {
  const owner = await newActor(`Zztest Deal Owner ${letterTag()}`);
  const buyer = await newActor(`Zztest Deal Buyer ${letterTag()}`);
  const listing = await createApprovedListing(owner);

  await signedInAs(page, buyer.mobile);
  await page.goto(`/property/${listing.id}`);
  await expect(page.getByRole('heading', { name: 'Negotiate the price' })).toBeVisible();
  await page.getByRole('button', { name: 'Make an offer', exact: true }).click();
  await page.getByLabel('Offer amount').fill('25000');

  const createdOffer = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/offers'
    && response.request().method() === 'POST'
    && response.status() === 201,
  );
  await page.getByRole('button', { name: 'Send offer' }).click();
  await createdOffer;
  await expect(page.getByRole('heading', { name: 'Your offer' })).toBeVisible();

  const buyerOffers = await contentFrom(buyer, '/offers/mine?size=50', 'reading the buyer offer book');
  const offer = buyerOffers.find((item) => item.propertyId === listing.id);
  expect(offer, 'the buyer offer must persist on the server').toBeTruthy();
  expect(offer.status).toBe('pending');

  const ownerCounter = await api('POST', `/offers/${offer.id}/respond`, owner.headers, {
    action: 'counter',
    counterAmount: 26500,
  });
  expect(ownerCounter.status, 'the owner must be able to counter the buyer offer').toBe(200);

  await signedInAs(page, buyer.mobile);
  await page.goto(`/property/${listing.id}`);
  await expect(page.getByText('Owner countered at')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Accept/ })).toHaveCount(0);
  const buyerAgreed = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/offers/${offer.id}/respond`
    && response.request().method() === 'POST'
    && response.status() === 200,
  );
  await page.getByRole('button', { name: /^Agree at ₹/ }).click();
  await buyerAgreed;

  const ownerAccepted = await api('POST', `/offers/${offer.id}/respond`, owner.headers, { action: 'accept' });
  expect(ownerAccepted.status, 'the owner must be able to accept the agreed offer').toBe(200);

  const ownerOffers = await contentFrom(owner, '/me/offers?size=50', 'reading the owner offer book after acceptance');
  expect(ownerOffers.find((item) => item.id === offer.id)?.status).toBe('accepted');
});

test('an owner can decline a real finalization request and later accept the buyer retry', async ({ page }) => {
  const owner = await newActor(`Zztest Finalize Owner ${letterTag()}`);
  const buyer = await newActor(`Zztest Finalize Buyer ${letterTag()}`);
  const listing = await createApprovedListing(owner);
  await approveContact(owner, buyer, listing.id);

  const requested = await api('POST', `/finalization/${listing.id}/request`, buyer.headers, {
    propertyId: listing.id,
    counterpartyMobile: owner.mobile,
    agreedPrice: 28000,
  });
  expect(requested.status, 'creating the buyer finalization request').toBe(200);

  const initialRequests = await contentFrom(owner, '/me/finalization-requests?size=50', 'reading pending finalization requests');
  const firstRequest = initialRequests.find((item) => item.propertyId === listing.id);
  expect(firstRequest, 'the owner must receive the buyer finalization request').toBeTruthy();

  const declined = await api('POST', `/finalization/requests/${firstRequest.id}/decline`, owner.headers, {});
  expect(declined.status, 'the owner must be able to decline the request').toBe(200);

  const declinedStatus = await api('GET', `/finalization/${listing.id}/status`, buyer.headers);
  expect(declinedStatus.status, 'reading the buyer declined finalization state').toBe(200);
  expect(declinedStatus.body.status).toBe('declined');

  await signedInAs(page, buyer.mobile);
  await page.goto(`/property/${listing.id}`);
  await expect(page.getByText("The owner hasn't confirmed yet. You can request again.")).toBeVisible();
  const retried = await api('POST', `/finalization/${listing.id}/request`, buyer.headers, {
    propertyId: listing.id,
    counterpartyMobile: owner.mobile,
    agreedPrice: 28000,
  });
  expect(retried.status, 'the buyer must be able to retry a declined request').toBe(200);

  const retryRequests = await contentFrom(owner, '/me/finalization-requests?size=50', 'reading the buyer retry');
  const retry = retryRequests.find((item) => item.propertyId === listing.id);
  expect(retry, 'the owner must receive the retry').toBeTruthy();

  const accepted = await api('POST', `/finalization/requests/${retry.id}/accept`, owner.headers, {});
  expect(accepted.status, 'the owner must be able to accept the retry').toBe(200);

  const closed = await api('GET', `/properties/${listing.id}`, owner.headers);
  expect(closed.status, 'reading the closed listing').toBe(200);
  expect(closed.body.dealStatus).toBe('closed');
});

test('an offer field keeps digits only, shows Indian grouping, and refuses an offer below half the asking price', async ({ page }) => {
  const owner = await newActor(`Zztest Floor Owner ${letterTag()}`);
  const buyer = await newActor(`Zztest Floor Buyer ${letterTag()}`);
  const listing = await createApprovedListing(owner);

  const tooLow = await api('POST', '/offers', buyer.headers, { propertyId: listing.id, amount: 1 });
  expect(tooLow.status, 'a ₹1 offer on a ₹28,000 listing').toBe(422);
  expect(tooLow.body.message).toContain('half the asking price');

  await signedInAs(page, buyer.mobile);
  await page.goto(`/property/${listing.id}`);
  await page.getByRole('button', { name: 'Make an offer', exact: true }).click();
  const offerInput = page.getByLabel('Offer amount');
  let offerPosts = 0;
  page.on('request', (req) => { if (new URL(req.url()).pathname === '/api/offers' && req.method() === 'POST') offerPosts += 1; });

  await page.getByRole('button', { name: 'Send offer' }).click();
  await expect(page.getByText('Enter an offer amount.')).toBeVisible();

  await offerInput.pressSequentially('-1a00');
  await expect(offerInput).toHaveValue('100');
  await page.getByRole('button', { name: 'Send offer' }).click();
  await expect(page.getByText('Offer at least ₹14,000, half the asking price of ₹28,000.')).toBeVisible();
  expect(offerPosts).toBe(0);

  await offerInput.fill('2500000');
  await expect(offerInput).toHaveValue('25,00,000');
  await expect(page.getByText('≈ ₹ 25 Lakh')).toBeVisible();
  await expect(page.getByText(/half the asking price/)).toHaveCount(0);
  expect((await contentFrom(buyer, '/offers/mine?size=50', 'reading the buyer offer book')).length).toBe(0);
});

test('after the owner accepts: no Revise button, the finalize price is the offer, and the deal opens a tenancy', async ({ page }) => {
  const owner = await newActor(`Zztest Agreed Owner ${letterTag()}`);
  const buyer = await newActor(`Zztest Agreed Buyer ${letterTag()}`);
  const listing = await createApprovedListing(owner);
  await approveContact(owner, buyer, listing.id);

  const noRequestYet = await api('GET', `/finalization/${listing.id}/status`, buyer.headers);
  expect(noRequestYet.status, 'nothing requested is not an error').toBe(204);

  const offered = await api('POST', '/offers', buyer.headers, { propertyId: listing.id, amount: 25000 });
  expect(offered.status).toBe(201);
  const accepted = await api('POST', `/offers/${offered.body.id}/respond`, owner.headers, { action: 'accept' });
  expect(accepted.status).toBe(200);
  const counterAfter = await api('POST', `/offers/${offered.body.id}/respond`, buyer.headers, { action: 'counter', counterAmount: 26000 });
  expect(counterAfter.status).toBe(409);
  expect(counterAfter.body.message).toBe('This offer has already been accepted.');

  const statusErrors = [];
  page.on('response', (res) => {
    if (res.url().includes('/finalization/') && res.status() >= 400) statusErrors.push(res.status());
  });
  await signedInAs(page, buyer.mobile);
  await page.goto(`/property/${listing.id}`);
  await expect(page.getByRole('heading', { name: 'Your offer' })).toBeVisible();
  await expect(page.getByRole('button', { name: /revise offer/i })).toHaveCount(0);
  expect(statusErrors, 'no failing finalization probe on a normal view').toEqual([]);

  const requested = await api('POST', `/finalization/${listing.id}/request`, buyer.headers, {
    propertyId: listing.id,
    counterpartyMobile: owner.mobile,
    agreedPrice: 28000,
  });
  expect(requested.status).toBe(200);
  expect(requested.body.agreedPrice, 'the accepted offer, not the listing price').toBe(25000);

  const first = await api('POST', `/finalization/requests/${requested.body.id}/accept`, owner.headers, {});
  expect(first.status).toBe(200);
  const second = await api('POST', `/finalization/requests/${requested.body.id}/accept`, owner.headers, {});
  expect(second.status, 'a repeat accept is a clean conflict').toBe(409);

  const tenancies = await api('GET', '/me/tenancies', buyer.headers);
  expect(tenancies.body.map((t) => t.status)).toEqual(['pending']);
});

test('Finalize rental validates each field, defaults to the local date and fires once on a double-click', async ({ page }) => {
  const owner = await newActor(`Zztest Modal Owner ${letterTag()}`);
  const tenant = await newActor(`Zztest Modal Tenant ${letterTag()}`);
  await createApprovedListing(owner);

  await signedInAs(page, owner.mobile);
  await page.goto('/dashboard#properties');
  await page.getByRole('button', { name: /Finalize rental/ }).first().click();
  const modal = page.getByRole('dialog');
  const price = modal.getByPlaceholder('e.g. 25,000');
  await expect(price).toHaveValue('28,000');
  await price.fill('');
  await modal.getByRole('button', { name: /Confirm & Finalize/ }).click();
  await expect(modal.getByText("Enter the tenant's full name, letters only.")).toBeVisible();
  await expect(modal.getByText('Enter the 10-digit mobile number of the tenant.')).toBeVisible();
  await expect(modal.getByText('Enter the final rent.')).toBeVisible();

  await modal.getByPlaceholder('Full name').fill('Asha');
  await expect(modal.getByText("Enter the tenant's full name, letters only.")).toHaveCount(0);
  await price.pressSequentially('28000');
  await expect(price).toHaveValue('28,000');
  await expect(modal.getByText('Enter the final rent.')).toHaveCount(0);
  const mobile = modal.getByPlaceholder('10-digit mobile');
  await mobile.pressSequentially('98-76x5432101234');
  await expect(mobile).toHaveValue(shownMobile('9876543210'));
  await mobile.fill('12345');
  await modal.getByRole('button', { name: /Confirm & Finalize/ }).click();
  await expect(modal.getByText('Enter the 10-digit mobile number of the tenant.')).toBeVisible();

  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const closes = [];
  page.on('request', (req) => {
    if (/\/api\/me\/deals\/[^/]+\/close$/.test(new URL(req.url()).pathname)) closes.push(req.postData());
  });
  await modal.getByPlaceholder('10-digit mobile').fill(tenant.mobile);
  await modal.getByRole('button', { name: /Confirm & Finalize/ }).dblclick();
  await expect(modal).toHaveCount(0);
  expect(closes).toHaveLength(1);
  expect(closes[0]).toContain(`on ${today}`);
});
