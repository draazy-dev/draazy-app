// @ts-check
import { test, expect } from '@playwright/test';
import { API, apiLogin, authHeaders, signedInAs, signedInAsNew, uniqueMobile, shownMobile } from '../../../helpers/liveAuth.js';
import { SOCIETY_PLACEHOLDER, active, clickNext, fillOwner, fillPartyIgr, fillProperty, fillTenantPolice, fillTerms, inviteOwner, inviteTenant, payAndSubmit, uploadAll } from '../../../helpers/rentAgreementWizard.js';
import { pickDate } from '../../../helpers/datePicker.helper.js';
import { signInSheet, verifyInSheet } from '../../../helpers/signInSheet.js';
import { gotoSettled, reloadSettled } from '../../../helpers/settle.js';
// Co-fill must be live: it spans two accounts and browser contexts.
const BASE = process.env.BASE_URL || 'http://localhost:5173';

const authed = (token) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });
/** The invitations the server considers addressed to this account. */
async function invitesFor(token) {
  const res = await fetch(`${API}/me/service-request-invites`, { headers: authed(token) });
  expect(res.status, 'an account can always read its own invite list').toBe(200);
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}
/* This account's own inbox, read over the API rather than through the bell: the claim is that the
   *server* raised the row, and the page would put `notificationMapper` between it and the fact. */
async function notificationsFor(token) {
  const res = await fetch(`${API}/notifications?size=100`, { headers: authed(token) });
  expect(res.status, 'an account can always read its own inbox').toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.content), 'the notification contract returns a page envelope').toBe(true);
  return body.content;
}
/* File a co-fill request the way the wizard does, without driving it. `type` is the wire value
   `rent-agreement`, not the client's `rental`, so the wire vocabulary is spelled out, not assumed. */

async function coFillOverHttp(ownerToken, inviteeMobile) {
  const res = await fetch(`${API}/service-requests/co-fill`, {
    method: 'POST',
    headers: authed(ownerToken),
    body: JSON.stringify({
      request: {
        type: 'rent-agreement',
        details: { ownerName: 'Anita Verma', property: 'B-1204, Skyline Heights', rent: '30000', _state: { prop: { gramPanchayat: false } } },
      },
      role: 'tenant',
      mobile: inviteeMobile,
    }),
  });
  expect(res.status, 'the server accepted the co-fill request').toBe(201);
  const body = await res.json();
  const party = (body.parties || [])[0];
  expect(party?.id, 'the co-fill create returned the invited party').toBeTruthy();
  return { requestId: body.id, partyId: party.id, party };
}

const inviteUrl = ({ partyId, requestId }) =>
  `${BASE}/services/rent-agreement?party=${encodeURIComponent(partyId)}&request=${encodeURIComponent(requestId)}`;

test.describe('Rent Agreement co-fill — the invite the server addresses', () => {
  test('the requester can address two tenant rows as separate invitations', async () => {
    const tenantOne = uniqueMobile();
    const tenantTwo = uniqueMobile();
    const { accessToken: tenantOneToken } = await apiLogin(tenantOne, { api: API });
    const { accessToken: tenantTwoToken } = await apiLogin(tenantTwo, { api: API });
    const { accessToken: ownerToken } = await apiLogin(uniqueMobile(), { api: API });

    const created = await fetch(`${API}/service-requests/co-fill`, {
      method: 'POST',
      headers: authed(ownerToken),
      body: JSON.stringify({
        request: {
          type: 'rent-agreement',
          details: {
            ownerName: 'Anita Verma',
            rent: '30000',
            _state: { tenantMode: 'invite', prop: { gramPanchayat: false }, tenants: [{ name: 'Ria', mobile: tenantOne }, { name: 'Sam', mobile: tenantTwo }] },
          },
        },
        role: 'tenant',
        mobile: tenantOne,
      }),
    });
    expect(created.status).toBe(201);
    const body = await created.json();

    const second = await fetch(`${API}/service-requests/${body.id}/parties`, {
      method: 'POST',
      headers: authed(ownerToken),
      body: JSON.stringify({ role: 'tenant', partyIndex: 1, mobile: tenantTwo }),
    });
    expect(second.status, 'a second tenant row can be invited separately').toBe(201);

    const firstInvite = (await invitesFor(tenantOneToken)).find((row) => row.requestId === body.id);
    const secondInvite = (await invitesFor(tenantTwoToken)).find((row) => row.requestId === body.id);
    expect(firstInvite?.partyIndex).toBe(0);
    expect(secondInvite?.partyIndex).toBe(1);
  });

  test('the owner\'s invite becomes a row the SERVER addressed to the tenant\'s account, and the tenant opens it from a different browser with only their own section editable', async ({ page, browser }) => {
    /* Two actors, a full wizard run and a second browser context. */
    test.slow();

    const tenantMobile = uniqueMobile();
    const { accessToken: tenantToken } = await apiLogin(tenantMobile, { api: API });

    const before = new Set((await invitesFor(tenantToken)).map((r) => r.id));

    await signedInAsNew(page, { api: API });
    await gotoSettled(page, `${BASE}/services/rent-agreement`);

    await fillProperty(page);
    await fillOwner(page);
    await inviteTenant(page, tenantMobile);
    await fillTerms(page);

    const review = active(page);
    await review.getByRole('checkbox').check();
    /* Armed before the click: a wizard that swaps in a confirmation panel looks identical whether
       the POST was accepted, refused, or never sent. */

    const created = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/service-requests\/co-fill$/.test(new URL(r.url()).pathname),
    );
    await payAndSubmit(page);

    const res = await created;
    expect(res.status(), 'the server accepted the co-fill request').toBe(201);
    const body = await res.json();
    const party = (body.parties || []).find((p) => p?.role === 'tenant') || (body.parties || [])[0];
    expect(party?.id, 'the server recorded the invited party').toBeTruthy();
    expect(body.status, 'a co-fill request parks unpaid, like any rent agreement').toBe('awaiting-payment');
    /* THE claim: the invitation is readable by the tenant's own account, from outside this
       browser entirely. The mock could only ever re-read the key it had just written. */

    const after = await invitesFor(tenantToken);
    const fresh = after.filter((r) => !before.has(r.id));
    expect(fresh.length, 'exactly one new invitation reached the tenant account').toBe(1);
    expect(fresh[0].requestId, 'and it points at the request the owner just filed').toBe(body.id);
    expect(fresh[0].role).toBe('tenant');
    expect(fresh[0].requestType).toBe('rent-agreement');
    /* `pending: false` — the server found an account for that number. This is the fact behind the
       copy assertion below, so both halves are pinned. */

    expect(fresh[0].pending, 'the tenant already has an account, so nothing is pending signup').toBe(false);
    await expect(
      page.getByText('Waiting for them to open the invite'),
      'the owner is told they are waiting on a reply, not on a signup',
    ).toBeVisible();

    const href = await page.getByRole('link', { name: /Send invite on WhatsApp/ }).getAttribute('href');
    const decoded = decodeURIComponent(href || '');
    expect(decoded).toContain('wa.me/91');
    expect(decoded, 'the live invite is addressed to a party, not carried as a token').toContain('?party=');
    expect(decoded).not.toContain('?invite=');
    /* ── The tenant, in a browser that has never seen the owner's session ── */
    const tenantCtx = await browser.newContext();
    try {
      const tenantPage = await tenantCtx.newPage();
      await signedInAs(tenantPage, tenantMobile);
      await gotoSettled(tenantPage, inviteUrl({ partyId: party.id, requestId: body.id }));
      /* The owner's sections are readable but not writable, and the tenant's is the one they
         complete. Asserted from a context whose `localStorage` never held the owner's draft. */

      await expect(tenantPage.getByText('Set up by the owner — view only')).toBeVisible();
      await expect(active(tenantPage).getByPlaceholder(SOCIETY_PLACEHOLDER)).toBeDisabled();
      await expect(active(tenantPage).locator('.dz-dropdown__trigger').first()).toBeDisabled();
      const opacity = (loc) => () => loc.evaluate((el) => getComputedStyle(el).opacity);
      await expect.poll(opacity(active(tenantPage).getByPlaceholder('e.g. Near D-Mart')), { message: 'a locked text box looks locked like the dropdowns' }).toBe('0.55');
      await expect.poll(opacity(active(tenantPage).locator('.opt-pill').first()), { message: 'a locked choice pill looks locked too' }).toBe('0.55');

      await clickNext(tenantPage, 1); // Property -> Owner (still read-only)
      const ownerDob = active(tenantPage).locator('.dz-datefield').first();
      await expect(ownerDob, 'the owner\'s birth date is read-only too').toBeDisabled();
      // A forced click skips Playwright's stability wait, so let the step change's smooth scroll finish first.
      const scrollSettled = () => tenantPage.evaluate(() => new Promise((done) => {
        const y = window.scrollY;
        requestAnimationFrame(() => requestAnimationFrame(() => done(window.scrollY === y)));
      }));
      await expect.poll(scrollSettled).toBe(true);
      await expect(ownerDob).toBeInViewport();
      await ownerDob.click({ force: true });
      await expect(tenantPage.locator('.dz-cal'), 'no calendar opens on the owner\'s date').toHaveCount(0);
      await clickNext(tenantPage, 2); // Owner -> Tenant
      await expect(tenantPage.getByText('Your details — please complete this step')).toBeVisible();
      await expect(active(tenantPage).getByPlaceholder('As per PAN/Aadhaar')).toBeEnabled();
      await expect.poll(opacity(active(tenantPage).getByPlaceholder('As per PAN/Aadhaar')), { message: 'the tenant\'s own fields stay full strength' }).toBe('1');
      await expect(active(tenantPage).locator('[data-err="t0dob"]'), 'the tenant still sets their own birth date').toBeEnabled();
      await expect(active(tenantPage).getByPlaceholder('10-digit mobile').first(), 'the invitee finds their own mobile already on their step').toHaveValue(shownMobile(tenantMobile));
      /* Accepting removes the row from the *pending* invite list, so a second visit finds nothing
         there and must not read that absence as expiry — the tenant would have no way back in. */

      await reloadSettled(tenantPage);
      await expect(
        tenantPage.getByText('This invite is no longer available'),
        'reopening an accepted invite is not treated as expiry',
      ).toHaveCount(0);
      await expect(tenantPage.getByText('Set up by the owner — view only')).toBeVisible();
    } finally {
      await tenantCtx.close();
    }
  });

  test('a tenant can start the agreement and invite the owner, who takes it over from their own browser and edits every step; once complete the tenant may pay instead', async ({ page, browser }) => {
    test.slow();
    const ownerMobile = uniqueMobile();
    const { accessToken: ownerToken } = await apiLogin(ownerMobile, { api: API });
    const tenantMobile = await signedInAsNew(page, { api: API });
    await gotoSettled(page, `${BASE}/services/rent-agreement`);

    await fillProperty(page);
    await inviteOwner(page, ownerMobile, 'Rajesh Deshpande');
    const t = active(page);
    await expect(t.getByPlaceholder('10-digit mobile').first(), 'the requester is the first tenant').toHaveValue(shownMobile(tenantMobile));
    await t.getByPlaceholder('As per PAN/Aadhaar').first().fill('Rahul Nair');
    await pickDate(page, '[data-err="t0dob"]', '1995-01-01');
    await fillPartyIgr(page, t, { address: false });
    await t.getByPlaceholder('ABCDE1234F').first().fill('PQRSX6789K');
    await fillTenantPolice(page);
    await uploadAll(t, 'tenant-doc');
    await clickNext(page, 3);
    await fillTerms(page);

    const review = active(page);
    await expect(review.getByText('Invited: Rajesh Deshpande (pending)')).toBeVisible();
    await expect(review.getByRole('button', { name: /Pay .+ & Submit/ }), 'the tenant never pays').toHaveCount(0);
    await review.getByRole('checkbox').check();
    const created = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/service-requests\/co-fill$/.test(new URL(r.url()).pathname),
    );
    await review.getByRole('button', { name: /Generate Agreement & Proceed/ }).click();
    const res = await created;
    expect(res.status(), 'the server accepted the tenant-started co-fill').toBe(201);
    const body = await res.json();
    const party = (body.parties || []).find((p) => p?.role === 'owner');
    expect(party?.id, 'the invited party is the owner').toBeTruthy();
    await expect(page.getByText('Request sent to the owner!')).toBeVisible();
    await expect(page.getByText(/nothing more is needed from you/)).toBeVisible();
    expect((await invitesFor(ownerToken)).map((r) => `${r.requestId}:${r.role}`)).toContain(`${body.id}:owner`);

    const tenantHeaders = await authHeaders(tenantMobile);
    const tenantCheckout = await fetch(`${API}/service-requests/${body.id}/checkout`, {
      method: 'POST', headers: tenantHeaders, body: JSON.stringify({ declaration: 'ra-decl-2026-10' }),
    });
    expect(tenantCheckout.status, 'no one pays before the owner has accepted').toBe(403);

    const ownerCtx = await browser.newContext();
    try {
      const ownerPage = await ownerCtx.newPage();
      await signedInAs(ownerPage, ownerMobile);
      await gotoSettled(ownerPage, inviteUrl({ partyId: party.id, requestId: body.id }));
      await expect(ownerPage.getByTestId('ra-editing-note')).toContainText('Review the agreement before you pay');
      await expect(ownerPage, 'the owner now holds the request, not an invite').toHaveURL(/\/services\/rent-agreement$/);
      await expect(active(ownerPage).getByPlaceholder(SOCIETY_PLACEHOLDER), 'the property step is the owner\'s to edit').toBeEnabled();
      await clickNext(ownerPage, 1);
      const o = active(ownerPage);
      await expect(o.getByPlaceholder('10-digit mobile').first(), 'the owner\'s own number is already there').toHaveValue(shownMobile(ownerMobile));
      await o.getByPlaceholder('As per PAN/Aadhaar').first().fill('Rajesh Deshpande');
      await pickDate(ownerPage, '[data-err="oDob"]', '1974-01-01');
      await fillPartyIgr(ownerPage, o);
      await o.getByPlaceholder('ABCDE1234F').first().fill('ABCDE1234F');
      await uploadAll(o, 'owner-doc');
      await clickNext(ownerPage, 2);
      const tenantStep = active(ownerPage);
      await expect(ownerPage.getByTestId('ra-cofilled-note'), 'nothing is view-only for the owner').toHaveCount(0);
      const heldPan = tenantStep.locator('input[data-held="true"]').first();
      await expect(heldPan, 'the tenant\'s PAN stays masked but replaceable').toHaveAttribute('placeholder', /XXXXXX789K on file/);
      await expect(heldPan).toBeEnabled();
      await expect(heldPan).toHaveValue('');
      await expect(tenantStep.getByPlaceholder('12-digit Aadhaar'), 'no Aadhaar is collected or shown').toHaveCount(0);
      await expect(tenantStep.getByPlaceholder('As per PAN/Aadhaar').first(), 'the owner can correct the tenant').toBeEnabled();
      await tenantStep.getByPlaceholder('As per PAN/Aadhaar').first().fill('Rahul K Nair');
      await expect(tenantStep.locator('input[data-held="true"]'), 'a renamed tenant\'s old PAN no longer counts').toHaveCount(0);
      await clickNext(ownerPage);
      await expect(tenantStep.getByPlaceholder('ABCDE1234F').first(), 'the missing PAN is flagged on this step, not at payment').toHaveClass(/\berr\b/);
      await tenantStep.getByPlaceholder('ABCDE1234F').first().fill('PQRSX6789K');
      await clickNext(ownerPage, 3);
      await clickNext(ownerPage, 4);
      await active(ownerPage).getByRole('checkbox').check();
      const checkout = ownerPage.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/service-requests\/[^/]+\/checkout$/.test(new URL(r.url()).pathname),
      );
      ownerPage.once('dialog', (dialog) => dialog.dismiss());
      await payAndSubmit(ownerPage);
      const opened = await checkout;
      expect(opened.status(), 'the owner opened payment, then walked away').toBe(200);
      expect(new URL(opened.url()).pathname, 'for the same request, not a new one').toContain(body.id);
    } finally {
      await ownerCtx.close();
    }

    const ownerRead = await (await fetch(`${API}/service-requests/${body.id}`, { headers: await authHeaders(ownerMobile) })).json();
    expect(ownerRead.myPartyId ?? null, 'the owner is now the requester').toBeNull();
    expect(ownerRead.details._state.owner.oName).toBe('Rajesh Deshpande');
    expect(ownerRead.details._state.tenants[0].name, 'the owner\'s correction to the tenant half was saved').toBe('Rahul K Nair');
    const tenantRead = await (await fetch(`${API}/service-requests/${body.id}`, { headers: tenantHeaders })).json();
    expect(tenantRead.myPartyId, 'the tenant is now a party on the owner\'s request').toBeTruthy();

    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await expect(page.getByText('You\'re part of a rent agreement')).toBeVisible();
    expect(tenantRead.payableByMe, 'the owner left checkout unpaid, so the complete form is the tenant\'s to pay too').toBe(true);
    const panel = page.getByTestId('ra-pay-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('ra-pay-either')).toBeVisible();
    await panel.getByRole('checkbox').check();
    page.once('dialog', (dialog) => dialog.accept());
    const tenantPaid = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/service-requests\/[^/]+\/checkout$/.test(new URL(r.url()).pathname),
    );
    await panel.getByRole('button', { name: /^Pay / }).click();
    expect((await tenantPaid).status(), 'the tenant\'s checkout replaces the owner\'s abandoned order').toBe(200);
    await expect.poll(async () => (await (await fetch(`${API}/service-requests/${body.id}`, { headers: tenantHeaders })).json()).status,
      { message: 'paid once, by the tenant' }).not.toBe('awaiting-payment');
    const ownerAfter = await (await fetch(`${API}/service-requests/${body.id}`, { headers: await authHeaders(ownerMobile) })).json();
    expect(ownerAfter.paidBy, 'the owner sees that the tenant paid').toBeTruthy();
    const ownerInbox = await notificationsFor((await apiLogin(ownerMobile, { api: API })).accessToken);
    expect(ownerInbox.map((n) => n.type), 'the owner is told the other side paid').toContain('service.party-paid');
  });

  test('an owner may take over invites for two different flats, but a second unpaid agreement on the same flat is refused', async ({ page }) => {
    const ownerMobile = await signedInAsNew(page, { api: API });
    const ownerHeaders = await authHeaders(ownerMobile);
    const flat = { gramPanchayat: false, flatNo: 'A-101', society: 'Lake View', pincode: '411045' };
    const own = await fetch(`${API}/service-requests`, {
      method: 'POST', headers: ownerHeaders,
      body: JSON.stringify({ type: 'rent-agreement', details: { ownerName: 'Anita Verma', rent: '30000', _state: { prop: flat } } }),
    });
    expect(own.status, 'the owner filed their own agreement').toBe(201);
    expect((await own.json()).status).toBe('awaiting-payment');

    const tenantInvite = async (prop) => {
      const tenantMobile = uniqueMobile();
      const { accessToken } = await apiLogin(tenantMobile, { api: API });
      const created = await fetch(`${API}/service-requests/co-fill`, {
        method: 'POST', headers: authed(accessToken),
        body: JSON.stringify({
          request: { type: 'rent-agreement', details: { rent: '30000', _state: { ownerMode: 'invite', prop, tenants: [{ name: 'Rahul Nair', mobile: tenantMobile }] } } },
          role: 'owner',
          mobile: ownerMobile,
        }),
      });
      expect(created.status).toBe(201);
      const req = await created.json();
      return { req, party: (req.parties || []).find((p) => p?.role === 'owner') };
    };

    const other = await tenantInvite({ gramPanchayat: false, flatNo: 'C-303', society: 'Hill Crest', pincode: '411021' });
    const accepted = await fetch(`${API}/me/service-request-invites/${other.party.id}`, {
      method: 'POST', headers: ownerHeaders, body: JSON.stringify({ decision: 'accept' }),
    });
    expect(accepted.status, 'a second flat is not blocked by the first').toBe(200);

    const same = await tenantInvite(flat);
    await gotoSettled(page, inviteUrl({ partyId: same.party.id, requestId: same.req.id }));
    await expect(page.getByText('You already have an agreement for this flat')).toBeVisible();
    await expect(page.getByText(/already have an unpaid rent agreement for this flat/)).toBeVisible();
    const still = (await invitesFor((await apiLogin(ownerMobile, { api: API })).accessToken)).find((r) => r.requestId === same.req.id);
    expect(still?.status, 'the invite stays open for when the owner is ready').toBe('invited');
  });

  test('an invite addressed to one account is invisible to another, and a signed-out invitee gets the sign-in sheet and the invite resolves after it — the SERVER withholds it, and the mobile never enters the URL', async ({ page, browser }) => {
    const ownerMobile = uniqueMobile();
    const { accessToken: ownerToken } = await apiLogin(ownerMobile, { api: API });
    const tenantMobile = uniqueMobile();
    await apiLogin(tenantMobile, { api: API });

    const { requestId, partyId } = await coFillOverHttp(ownerToken, tenantMobile);
    const strangerMobile = uniqueMobile();
    const { accessToken: strangerToken } = await apiLogin(strangerMobile, { api: API });

    expect(
      (await invitesFor(strangerToken)).map((r) => r.id),
      'the invitation is not in a stranger\'s list at all',
    ).not.toContain(partyId);

    const peek = await fetch(`${API}/service-requests/${requestId}`, { headers: authed(strangerToken) });
    expect(peek.status, 'the request does not exist as far as a stranger is concerned').toBe(404);

    await signedInAs(page, strangerMobile);
    await gotoSettled(page, inviteUrl({ partyId, requestId }));
    /* Positive wait first. `toHaveCount(0)` is satisfied instantly by a page that has not
       rendered, so without this the two absence assertions below would pass on a blank screen. */
    await expect(page.getByText('This invite is no longer available')).toBeVisible();

    await expect(page.getByText(/sent to a different number/i)).toHaveCount(0);
    await expect(active(page).getByPlaceholder('As per PAN/Aadhaar')).toHaveCount(0);

    const signedOut = await browser.newContext();
    try {
      const anon = await signedOut.newPage();
      await gotoSettled(anon, inviteUrl({ partyId, requestId }));

      await expect(signInSheet(anon)).toBeVisible();
      await expect(anon.getByRole('dialog', { name: 'Sign in to complete your Rent Agreement' })).toBeVisible();

      const url = new URL(anon.url());
      expect(url.pathname, 'the sheet opens over the invite link').toBe('/services/rent-agreement');
      expect(url.searchParams.get('party')).toBe(partyId);
      // Live the number is never put in the URL, so a forwarded link does not disclose whose invite it is.
      expect(url.searchParams.get('mobile'), 'the invited number is not leaked into the URL').toBeNull();
      expect(anon.url()).not.toContain(tenantMobile);

      await verifyInSheet(anon, tenantMobile);
      await expect(anon.getByText('Set up by the owner — view only'), 'the invite resolves after sign-in').toBeVisible({ timeout: 20000 });
    } finally {
      await signedOut.close();
    }
  });

  test('inviting a number with no Draazy account says so, and asks for a signup rather than a resend', async ({ page }) => {
    const strangerMobile = uniqueMobile();

    await signedInAsNew(page, { api: API });
    await gotoSettled(page, `${BASE}/services/rent-agreement`);

    await fillProperty(page);
    await fillOwner(page);
    await inviteTenant(page, strangerMobile);
    await fillTerms(page);

    const review = active(page);
    await review.getByRole('checkbox').check();

    const created = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/service-requests\/co-fill$/.test(new URL(r.url()).pathname),
    );
    await payAndSubmit(page);

    const body = await (await created).json();
    const party = (body.parties || [])[0];

    expect(party?.pending, 'the server reports no account behind that number').toBe(true);
    await expect(page.getByText(/isn.t on Draazy yet/)).toBeVisible();
    await expect(page.getByText('Waiting for them to open the invite')).toHaveCount(0);
    // Mask echoed pending numbers so the panel cannot leak someone else's phone.
    expect(party.mobile, 'the echoed number is masked').not.toBe(strangerMobile);
    expect(party.mobile, 'and most of it is withheld').toContain('XXXXX');
    expect(party.mobile, 'though the last three stay, so the owner can tell who they meant').toContain(strangerMobile.slice(-3));
    expect(
      party.mobile,
      'the middle is genuinely gone, not merely styled over',
    ).not.toContain(strangerMobile.slice(2, 7));
  });

  test('the invited tenant is told from their own dashboard, and the card routes into the invite', async ({ page }) => {
    const ownerMobile = uniqueMobile();
    const { accessToken: ownerToken } = await apiLogin(ownerMobile, { api: API });
    const tenantMobile = uniqueMobile();
    const { accessToken: tenantToken } = await apiLogin(tenantMobile, { api: API });
    const invited = (rows) => rows.filter((n) => n.type === 'service.party-invited');
    expect(invited(await notificationsFor(tenantToken)), 'a brand-new account has no invitation notice to begin with').toHaveLength(0);

    const { requestId, partyId } = await coFillOverHttp(ownerToken, tenantMobile);

    const notices = invited(await notificationsFor(tenantToken));
    expect(notices, 'the invitation raised exactly one notice in the tenant\'s inbox').toHaveLength(1);
    expect(notices[0].link, 'the notice opens the invite it is about').toContain(`party=${partyId}`);
    expect(notices[0].link).toContain(`request=${requestId}`);
    expect(notices[0].link, 'not the mock bearer-token link the live wizard ignores').not.toContain('invite=');
    expect(notices[0].read, 'an unread notice is what surfaces the bell').toBe(false);
    expect(
      invited(await notificationsFor(ownerToken)),
      'the person who SENT the invitation is not the person it notifies',
    ).toHaveLength(0);

    /* A browser that has never run the owner's wizard. Nothing local could tell it this exists. */
    await signedInAs(page, tenantMobile);
    await gotoSettled(page, `${BASE}/dashboard#rental`);

    await expect(
      page.getByText('Action needed: complete your rent agreement'),
      'the invited tenant is told, in the browser they actually use',
    ).toBeVisible();

    const fill = page.getByRole('link', { name: /Fill my details/ });
    await expect(fill).toBeVisible();
    /* The link has to be the account-addressed form. A `?invite=` href would render identically
       and dead-end on the expired panel, so assert the address before following it. */

    const href = await fill.getAttribute('href');
    expect(href, 'the card links to the account-addressed invite').toContain(`party=${partyId}`);
    expect(href).toContain(`request=${requestId}`);
    expect(href, 'not the mock bearer-token link the live wizard ignores').not.toContain('invite=');

    await fill.click();
    await expect(page).toHaveURL(new RegExp(`party=${partyId}`));
    await expect(
      page.getByText('Set up by the owner — view only'),
      'and it opens the invite rather than the expired panel',
    ).toBeVisible();

    await test.step('the invitee\'s own mobile is on their step, seeded from the account rather than from the owner\'s state', async () => {
      await clickNext(page, 1);
      await clickNext(page, 2);
      await expect(active(page).getByPlaceholder('10-digit mobile').first()).toHaveValue(shownMobile(tenantMobile));
    });
  });
});
