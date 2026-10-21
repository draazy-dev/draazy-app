import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, authHeaders, signedInAs, uniqueMobile } from '../../../helpers/liveAuth.js';

/* This drives the owner's actual grant screen and verifies the write outside the browser, so a
   dashboard-only local copy cannot pass as a database grant. */

/** Not `Sale Deed` (property-integration) and not `Society NOC` (buyer-document-access). */
const CATEGORIES = ['Index II', 'Encumbrance Certificate'];

const BUYER_NAME = 'Priya Docseeker';

const asOwner = () => authHeaders(ACTORS.owner);

/* Multipart uploads need only the bearer; `authHeaders` would replace Playwright's form boundary
   with JSON and be refused as 415. */
async function bearerOnly(mobile) {
  return { authorization: (await authHeaders(mobile)).authorization };
}

/** The owner's newest listing — what `/me/documents/{propId}` is scoped by. */
async function ownedListing(request) {
  const res = await request.get(`${API}/me/listings?size=5`, { headers: await asOwner() });
  expect(res.status()).toBe(200);
  const rows = (await res.json()).content;
  // A floor, not scenery: with no listing the uploads 404 and the failure reads as a broken
  // endpoint rather than as an owner with nothing to share.
  expect(rows.length, 'the fixture owner must hold a listing').toBeGreaterThan(0);
  return rows[0].id;
}

async function upload(request, propId, category) {
  const res = await request.post(`${API}/me/documents/${propId}`, {
    headers: await bearerOnly(ACTORS.owner),
    multipart: {
      category,
      file: {
        name: `${category.replace(/\W+/g, '-').toLowerCase()}.pdf`,
        mimeType: 'application/pdf',
        buffer: Buffer.from(`%PDF-1.4 ${category} for the grant test`),
      },
    },
  });
  expect(res.status(), `uploading ${category}`).toBe(201);
  return (await res.json()).id;
}

/** The owner's inbox row, which is the projection the dashboard renders. */
async function ownerRow(request, reqId) {
  const res = await request.get(`${API}/me/documents/requests?size=50`, { headers: await asOwner() });
  expect(res.status()).toBe(200);
  const row = (await res.json()).content.find((r) => r.id === reqId);
  expect(row, 'the owner must see the request in their inbox').toBeTruthy();
  return row;
}

test.describe('the owner shares documents from the Requests inbox', () => {
  let propId;
  let docIds = [];
  let reqId;
  let buyerMobile;

  test.beforeEach(async ({ request }) => {
    propId = await ownedListing(request);
    docIds = [];
    for (const category of CATEGORIES) {
      docIds.push(await upload(request, propId, category));
    }

    // No browser sign-in here: a seeded buyer session would be re-applied over the owner's on every navigation.
    buyerMobile = uniqueMobile();
    const buyerAuth = await authHeaders(buyerMobile);
    /* A registered-but-unnamed account renders blank in the inbox; naming it makes the assertion
       unconditional. */
    const named = await request.patch(`${API}/auth/me`, {
      headers: buyerAuth,
      data: { name: BUYER_NAME },
    });
    expect(named.status(), 'the buyer must be nameable').toBe(200);

    const asked = await request.post(`${API}/documents/requests`, {
      headers: buyerAuth,
      data: { propertyId: propId, categories: CATEGORIES, acknowledgedDisclaimer: true },
    });
    expect(asked.status()).toBe(201);
    reqId = (await asked.json()).id;
  });

  test.afterEach(async ({ request }) => {
    // The database resets per run, not per spec; a leftover document would skew the next grant count.
    for (const docId of docIds) {
      await request.delete(`${API}/me/documents/${propId}/${docId}`, { headers: await asOwner() });
    }
  });

  test('shares from the dashboard Requests panel, and the grant reaches the database', async ({ page, request }) => {
    const before = await ownerRow(request, reqId);
    expect(before.status).toBe('pending');
    const caption = `Wants to see: ${before.categories.join(', ')}`;

    await signedInAs(page, ACTORS.owner);
    await page.goto('/dashboard?tab=leads');

    const card = page.getByTestId('request-card').filter({ hasText: BUYER_NAME });
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toHaveAttribute('data-kind', 'document');
    await expect(card.getByTestId('request-kind')).toHaveText('Documents');
    await expect(card).toContainText(caption);

    const patched = page.waitForResponse((r) =>
      /\/api\/me\/documents\/requests\/[^/?]+$/.test(r.url()) && r.request().method() === 'PATCH',
    );
    await card.getByRole('button', { name: 'Share', exact: true }).click();
    expect((await patched).status(), 'the grant was refused').toBe(200);

    await expect(page.getByRole('alert')).toContainText(/Documents shared/i);
    await expect(card).toHaveCount(0);

    /* `sharedDocumentCount` counts files, not categories: it stays at zero if the grant matched no uploads. */
    const after = await ownerRow(request, reqId);
    expect(after.status).toBe('granted');
    expect(after.sharedDocumentCount).toBe(CATEGORIES.length);
    expect(after, 'the bearer token stays out of the owner inbox').not.toHaveProperty('shareToken');
  });

  test('the buyer sees the document request in Sent as Granted once shared', async ({ page, request }) => {
    const granted = await request.patch(`${API}/me/documents/requests/${reqId}`, {
      headers: await asOwner(),
      data: { status: 'granted' },
    });
    expect(granted.status()).toBe(200);
    const sent = await request.get(`${API}/me/requests?box=sent`, { headers: await authHeaders(buyerMobile) });
    expect(sent.status()).toBe(200);
    const row = (await sent.json()).content.find((r) => r.kind === 'document' && r.id === reqId);
    expect(row, 'a document request is part of the buyer feed').toMatchObject({ state: 'accepted' });

    await signedInAs(page, buyerMobile);
    await page.goto('/dashboard?tab=leads');
    const card = page.getByTestId('request-card').filter({ hasText: 'Wants to see' });
    await expect(card.getByTestId('request-state')).toHaveText('Granted');
  });
});