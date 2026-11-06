// @ts-check
import { test, expect } from '@playwright/test';
import { STAFF } from '../../../fixtures/live.js';
import { API, apiLogin, authHeaders, signedInAs, signedInAsNew, uniqueMobile } from '../../../helpers/liveAuth.js';
import { active, clickNext, fillOwner, fillProperty, fillTerms, inviteTenant, payAndSubmit } from '../../../helpers/rentAgreementWizard.js';
import { newListing, sql } from '../../../helpers/monetisation.js';
import { trackErrors } from '../../../helpers/console.js';
import { gotoSettled, reloadSettled } from '../../../helpers/settle.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const authed = (token) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });
const inviteUrl = (partyId, requestId) =>
  `${BASE}/services/rent-agreement?party=${encodeURIComponent(partyId)}&request=${encodeURIComponent(requestId)}`;

// e2e has no payment webhook, so the paid transition is written directly.
function settle(requestId) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error(`not a request id: ${requestId}`);
  const out = sql(`update service_requests set status = 'new' where id = '${requestId}' and status = 'awaiting-payment' returning id`);
  if (!out.includes(requestId)) throw new Error(`could not settle ${requestId}`);
}

async function staffTakes(requestId) {
  const { accessToken } = await apiLogin(STAFF.rental, { api: API });
  const res = await fetch(`${API}/service-requests/${requestId}/status`, {
    method: 'PATCH', headers: authed(accessToken), body: JSON.stringify({ status: 'assigned' }),
  });
  expect(res.status, await res.text()).toBe(200);
}

const START = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
const SEEDED_STATE = (ownerMobile) => ({
  tenantMode: 'invite',
  owner: { oName: 'Asha Patil', oAge: '52', oAddr: 'MG Road, Pune', oMobile: ownerMobile, capacity: 'owner' },
  prop: { gramPanchayat: false, propType: 'Flat / Apartment', flatNo: 'B-1204', society: 'Skyline Heights', locality: 'Baner', pincode: '411045', area: '850' },
  terms: { rent: '30000', deposit: '0', months: '11', startDate: START },
});

async function expectReadOnlyReview(page) {
  for (const step of [1, 2, 3, 4]) await clickNext(page, step);
  const review = active(page);
  await expect(review.getByRole('checkbox'), 'no declaration to accept on a view').toHaveCount(0);
  await expect(review.getByRole('button', { name: /Save changes|Generate|Pay/ }), 'nothing to submit on a view').toHaveCount(0);
}

async function invitedTenant() {
  const ownerMobile = uniqueMobile();
  const tenantMobile = uniqueMobile();
  const { accessToken: ownerToken } = await apiLogin(ownerMobile, { api: API });
  const { accessToken: tenantToken } = await apiLogin(tenantMobile, { api: API });
  const created = await fetch(`${API}/service-requests/co-fill`, {
    method: 'POST',
    headers: authed(ownerToken),
    body: JSON.stringify({
      request: { type: 'rent-agreement', details: { ownerName: 'Asha Patil', property: 'B-1204, Skyline Heights', rent: '30000', _state: SEEDED_STATE(ownerMobile) } },
      role: 'tenant',
      mobile: tenantMobile,
    }),
  });
  expect(created.status, 'the co-fill request was created').toBe(201);
  const body = await created.json();
  const party = (body.parties || []).find((p) => p?.role === 'tenant');
  const accepted = await fetch(`${API}/me/service-request-invites/${party.id}`, {
    method: 'POST', headers: authed(tenantToken), body: JSON.stringify({ decision: 'accept' }),
  });
  expect(accepted.status, await accepted.text()).toBe(200);
  return { body, party, tenantMobile, tenantToken };
}

test.describe('Rent Agreement — a submitted side opens as a locked wizard', () => {
  test('the invited tenant who has submitted steps through every field locked, and may edit until their side is complete', async ({ browser }) => {
    test.slow();
    const { body, party, tenantMobile, tenantToken } = await invitedTenant();
    const tenantSide = { _state: { tenants: [{ name: 'Rahul Nair', age: '29', addr: 'FC Road, Pune', mobile: tenantMobile }] } };
    const submitted = await fetch(`${API}/service-requests/${body.id}/party-details`, {
      method: 'PUT', headers: authed(tenantToken), body: JSON.stringify({ details: tenantSide }),
    });
    const submittedText = await submitted.text();
    expect(submitted.status, submittedText).toBe(200);
    expect(JSON.parse(submittedText).mySideSubmitted, 'the server records that this side was submitted').toBe(true);

    const ctx = await browser.newContext();
    try {
      const t = await ctx.newPage();
      const errors = trackErrors(t);
      await signedInAs(t, tenantMobile);
      await gotoSettled(t, inviteUrl(party.id, body.id));

      const note = t.getByTestId('ra-view-note');
      await expect(note, 'a submitted invitee lands on the locked wizard').toBeVisible();
      await expect(note.getByTestId('ra-view-close'), 'the invitee can close the view, like the owner').toBeVisible();
      await expect(t.locator('.step-dot'), 'the step bar is there to step through').toHaveCount(5);
      await expect(t.locator('.step-dot').nth(0)).toHaveClass(/\bactive\b/);
      for (const i of [1, 2, 3, 4]) await expect(t.locator('.step-dot').nth(i), `a filed form shows step ${i + 1} as filled`).toHaveClass(/\bdone\b/);
      await clickNext(t, 1);
      await clickNext(t, 2);
      const name = active(t).getByPlaceholder('As per PAN/Aadhaar').first();
      await expect(name).toHaveValue('Rahul Nair');
      await expect(name, 'their own side is locked until they choose to edit').toBeDisabled();
      for (const step of [3, 4]) await clickNext(t, step);
      await expect(active(t).getByRole('checkbox'), 'no declaration on a view').toHaveCount(0);

      await note.getByTestId('ra-view-edit').click();
      await expect(t.getByTestId('ra-editing-note')).toBeVisible();
      await expect(t.locator('.step-dot').nth(2), 'editing opens on the tenant\'s own step').toHaveClass(/\bactive\b/);
      await expect(active(t).getByPlaceholder('As per PAN/Aadhaar').first()).toBeEnabled();
      await t.getByTestId('ra-editing-note').getByRole('button', { name: 'Discard changes' }).click();
      await expect(note).toBeVisible();
      await expect(t.locator('.step-dot').nth(0)).toHaveClass(/\bactive\b/);

      settle(body.id);
      await staffTakes(body.id);
      await reloadSettled(t);
      await expect(note).toBeVisible();
      await expect(
        note.getByTestId('ra-view-edit'),
        'a tenant invited to fill in after payment may still finish an incomplete side after pickup',
      ).toBeVisible();
      await expect(note.getByTestId('ra-view-locked')).toHaveCount(0);
      expect(errors, 'no console errors on the invitee view').toEqual([]);
    } finally {
      await ctx.close();
    }

    const late = await fetch(`${API}/service-requests/${body.id}/party-details`, {
      method: 'PUT', headers: authed(tenantToken), body: JSON.stringify({ details: tenantSide }),
    });
    expect(late.status, 'the server agrees with the page').toBe(200);
  });

  test('a tenant who joined but has not filled in reaches their side from the request card, and is not shown the owner\'s lock', async ({ page }) => {
    test.slow();
    const errors = trackErrors(page);
    const { body, party, tenantMobile, tenantToken } = await invitedTenant();
    settle(body.id);
    await signedInAs(page, tenantMobile);
    await page.goto(`${BASE}/services/rent-agreement`, { waitUntil: 'domcontentloaded' });

    const view = page.getByTestId('tracker-view-details');
    await expect(view, 'the joined request offers the tenant their own part, styled like the owner\'s').toHaveText(/View details/);
    await expect(page.locator('.step-dot'), 'the page opens collapsed, like the owner\'s').toHaveCount(0);
    await expect(page.getByText('Your request is already submitted'), 'someone else\'s request does not lock this page').toHaveCount(0);
    await view.click();
    await expect(page).toHaveURL(new RegExp(`party=${party.id}`));
    const note = page.getByTestId('ra-view-note');
    await expect(note, 'the card opens a view first, like the owner\'s').toBeVisible();
    await expect(note.getByTestId('ra-view-edit')).toHaveText(/Fill my details/);
    await expect(active(page).getByPlaceholder('e.g. B-1204'), 'nothing is editable on a view').toBeDisabled();

    await note.getByTestId('ra-view-close').click();
    await expect(page).not.toHaveURL(/party=/);
    await expect(note, 'closing leaves the view').toHaveCount(0);
    await expect(page.getByTestId('tracker-view-details'), 'closing returns to the request card').toBeVisible();
    await expect(page.locator('.step-dot'), 'closing collapses the form, as it does for the owner').toHaveCount(0);
    await expect(page.getByText('You\'re part of a rent agreement')).toBeVisible();
    await expect(page.getByText('Your request is already submitted'), 'the joined tenant is not told they filed it').toHaveCount(0);

    await page.getByTestId('tracker-view-details').click();
    await note.getByTestId('ra-view-edit').click();
    await expect(note).toHaveCount(0);
    await expect(page.getByTestId('ra-editing-note'), 'filling a first time is not an edit of a filed side').toHaveCount(0);
    await expect(page.locator('.step-dot').nth(2), 'filling opens on the tenant\'s own step').toHaveClass(/\bactive\b/);
    await expect(active(page).getByPlaceholder('As per PAN/Aadhaar').first()).toBeEnabled();
    await page.getByTestId('ra-invite-close').click();
    await expect(page).not.toHaveURL(/party=/);

    const tenantSide = { _state: { tenants: [{ name: 'Rahul Nair', age: '29', addr: 'FC Road, Pune', mobile: tenantMobile }] } };
    const submitted = await fetch(`${API}/service-requests/${body.id}/party-details`, {
      method: 'PUT', headers: authed(tenantToken), body: JSON.stringify({ details: tenantSide }),
    });
    expect(submitted.status, await submitted.text()).toBe(200);
    await page.goto(`${BASE}/services/rent-agreement`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('tracker-view-details').click();
    await expect(page).toHaveURL(new RegExp(`party=${party.id}`));
    await expect(note, 'once filed, the card opens the locked view').toBeVisible();
    await expect(note.getByTestId('ra-view-edit')).toHaveText(/Edit my details/);
    await note.getByTestId('ra-view-close').click();
    await expect(page).not.toHaveURL(/party=/);
    await expect(page.getByTestId('tracker-view-details')).toBeVisible();
    await page.getByRole('button', { name: 'Start a new agreement' }).click();
    await expect(page.locator('.step-dot'), 'the tenant can still start an agreement of their own').toHaveCount(5);
    expect(errors, 'no console errors for the joined tenant').toEqual([]);
  });

  test('a joined tenant can still view an approved request, even if their side was never marked sent', async ({ page }) => {
    const errors = trackErrors(page);
    const { body, party, tenantMobile, tenantToken } = await invitedTenant();
    settle(body.id);
    const tenantSide = { _state: { tenants: [{ name: 'Rahul Nair', age: '29', addr: 'FC Road, Pune', mobile: tenantMobile }] } };
    const filled = await fetch(`${API}/service-requests/${body.id}/party-details`, {
      method: 'PUT', headers: authed(tenantToken), body: JSON.stringify({ details: tenantSide }),
    });
    expect(filled.status, await filled.text()).toBe(200);
    // Sides filed before `details_submitted_at` existed were never backfilled.
    sql(`update service_request_parties set details_submitted_at = null where id = '${party.id}'`);
    sql(`update service_requests set status = 'approved' where id = '${body.id}'`);
    await signedInAs(page, tenantMobile);
    await page.goto(`${BASE}/services/rent-agreement`, { waitUntil: 'domcontentloaded' });

    await page.getByTestId('tracker-view-details').click();
    await expect(page).toHaveURL(new RegExp(`party=${party.id}`));
    const note = page.getByTestId('ra-view-note');
    await expect(note.getByTestId('ra-view-locked'), 'an approved case is view only').toBeVisible();
    await expect(note.getByTestId('ra-view-edit')).toHaveCount(0);
    await expect(active(page).getByPlaceholder('e.g. B-1204')).toBeDisabled();
    expect(errors, 'no console errors for the joined tenant').toEqual([]);
  });

  test('the owner opens a paid request from the tracker as a locked wizard, saves an edit before pickup, and is locked out after', async ({ page }) => {
    test.slow();
    const errors = trackErrors(page);
    const ownerMobile = await signedInAsNew(page, { api: API });
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await fillProperty(page);
    await fillOwner(page);
    await inviteTenant(page, uniqueMobile());
    await fillTerms(page);
    await active(page).getByRole('checkbox').check();
    const createdRes = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/service-requests\/co-fill$/.test(new URL(r.url()).pathname),
    );
    await payAndSubmit(page);
    const { id } = await (await createdRes).json();
    const ownerAuth = await authHeaders(ownerMobile);
    const read = async () => (await fetch(`${API}/service-requests/${id}`, { headers: ownerAuth })).json();
    await expect.poll(async () => ((await read()).documents || []).length, { message: 'the ownership proof finished filing', timeout: 30_000 }).toBeGreaterThan(0);

    settle(id);
    await newListing(ownerMobile, { title: 'Owner listing for the picker' });
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await expect(page.locator('.step-dot'), 'an active request starts on the lock panel').toHaveCount(0);
    const viewDetails = page.getByTestId('tracker-view-details');
    await viewDetails.click();
    const note = page.getByTestId('ra-view-note');
    await expect(note).toBeVisible();
    const summary = active(page).getByTestId('ra-property-summary');
    await expect(summary, 'a view names the agreement\'s property in short').toContainText('B-1204');
    await expect(active(page).getByText('Which property is this agreement for?'), 'no listing picker on a view, even for an owner with listings').toHaveCount(0);
    await expect(active(page).getByPlaceholder('e.g. B-1204')).toHaveValue('B-1204');
    await expect(active(page).getByPlaceholder('e.g. B-1204'), 'shared fields are locked on a view').toBeDisabled();
    const opacity = (loc) => loc.evaluate((el) => getComputedStyle(el).opacity);
    expect(await opacity(active(page).getByPlaceholder('Search your society on Google Maps')), 'the society field is dimmed like every other locked field')
      .toBe(await opacity(active(page).getByPlaceholder('e.g. B-1204')));
    await clickNext(page, 1);
    const ownerName = active(page).getByPlaceholder('As per PAN/Aadhaar').first();
    await expect(ownerName).toHaveValue('Anita Verma');
    await expect(ownerName).toBeDisabled();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.step-dot').nth(0)).toHaveClass(/\bactive\b/);
    await expectReadOnlyReview(page);
    await note.getByTestId('ra-view-close').click();
    await expect(note).toHaveCount(0);
    await expect(page.locator('.step-dot'), 'closing returns to the lock panel').toHaveCount(0);

    const repriced = await fetch(`${API}/service-requests/${id}/details`, {
      method: 'PUT',
      headers: ownerAuth,
      body: JSON.stringify({ details: { ...(await read()).details, rent: '45000' } }),
    });
    expect(repriced.status, 'priced terms cannot be changed after payment').toBe(409);

    await viewDetails.click();
    await note.getByTestId('ra-view-edit').click();
    await expect(page.getByTestId('ra-editing-note')).toBeVisible();
    await expect(page.locator('.step-dot').nth(0)).toHaveClass(/\bactive\b/);
    await active(page).getByPlaceholder('e.g. Near D-Mart').fill('Opposite Baner Gaon');
    for (const step of [1, 2, 3, 4]) await clickNext(page, step);
    const review = active(page);
    const consent = review.getByRole('checkbox');
    if (!(await consent.isChecked())) await consent.check();
    const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname.endsWith(`/service-requests/${id}/details`));
    await review.getByRole('button', { name: 'Save changes' }).click();
    expect((await saved).status(), 'the edit reached the server').toBe(200);
    await expect(page.locator('.step-dot'), 'saving returns to the lock panel').toHaveCount(0);
    expect(JSON.stringify((await read()).details._state.prop), 'the saved request carries the edit').toContain('Opposite Baner Gaon');

    await staffTakes(id);
    await reloadSettled(page);
    await viewDetails.click();
    await expect(note.getByTestId('ra-view-locked')).toBeVisible();
    await expect(note.getByTestId('ra-view-edit')).toHaveCount(0);
    await expect(active(page).getByPlaceholder('e.g. Near D-Mart')).toHaveValue('Opposite Baner Gaon');
    expect(errors, 'no console errors on the owner view').toEqual([]);
  });
});
