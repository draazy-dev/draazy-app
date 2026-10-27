import { createRequire } from 'node:module';
import { expect } from '@playwright/test';
import { ACTORS } from '../fixtures/live.js';
import { API, authHeaders, grantIdentityBadge, uniqueMobile } from './liveAuth.js';
import { approve, call, newListing, sql } from './monetisation.js';

const requireFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { PDFDocument } = requireFrontend('pdf-lib');

/** The seeded staffer who holds `referrals:read` and `referrals:write`. */
export const DESK = '9733798115';

const digits = (value) => String(value).replace(/\D/g, '');
const words = (value) => String(value).replace(/[^A-Za-z ]/g, '');

// `uniqueMobile()` can repeat within one millisecond; the last digit is spread so two accounts never merge.
let seq = 0;
export const freshMobile = () => `${uniqueMobile().slice(0, -1)}${(seq++) % 10}`;

/** A signed-in account created now; `name` is what the desk shows for it. */
export async function member(name) {
  const mobile = freshMobile();
  await authHeaders(mobile);
  if (name) sql(`update users set name = '${words(name)}' where mobile = '${mobile}'`);
  return mobile;
}

/** Like `call`, with extra request headers (the device id the browser sends as `X-Device-Id`). */
async function send(method, path, mobile, body, extra = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(await authHeaders(mobile)), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const deviceHeader = (deviceId) => (deviceId ? { 'x-device-id': deviceId } : {});

export async function summaryOf(mobile, deviceId) {
  const res = await send('GET', '/me/referrals', mobile, undefined, deviceHeader(deviceId));
  expect(res.status).toBe(200);
  return res.json;
}

export const codeOf = async (mobile, deviceId) => (await summaryOf(mobile, deviceId)).code;

/** The raw redeem answer, so a refusal can be asserted as well as a success. */
export const redeem = (mobile, code, deviceId) =>
  send('POST', '/referrals/redeem', mobile, { code }, deviceHeader(deviceId));

/** A fresh referrer and referee with the referee's code redeemed, as a friend signing up through a link would. */
export async function referredPair({ referrerName = 'Ref Erer', refereeName = 'Ref Eree' } = {}) {
  const referrer = await member(referrerName);
  const referee = await member(refereeName);
  const res = await redeem(referee, await codeOf(referrer));
  expect(res.status, `redeeming: ${JSON.stringify(res.json)}`).toBe(200);
  return { referrer, referee };
}

/** The referral row as the database holds it, keyed by the referee. */
export function rowOf(refereeMobile) {
  const out = sql(
    "select status, coalesce(risk, ''), coalesce(track, ''), coalesce(auto_reason, ''), (hold_until is not null), coalesce(qualified_property_id::text, '')"
    + ` from referrals where referred_mobile = '${digits(refereeMobile)}'`,
  );
  if (!out) return null;
  const [status, risk, track, autoReason, held, propertyId] = out.split('|');
  return { status, risk, track, autoReason, held: held === 't', propertyId };
}

/** Loopback redeem signals are identical for every test, so a test sets the risk band it needs. */
export function setRisk(refereeMobile, risk) {
  sql(`update referrals set risk = '${words(risk)}' where referred_mobile = '${digits(refereeMobile)}' and status = 'pending'`);
}

/** Moves the account's creation back, to put it outside the redeem window. */
export function ageAccount(mobile, hours) {
  sql(`update users set created_at = now() - interval '${Number(hours)} hours' where mobile = '${digits(mobile)}'`);
}

/** Fills the referrer's month with granted referrals, so the next qualification meets the cap. */
export function fillCap(referrerMobile, count) {
  for (let i = 0; i < count; i += 1) {
    sql(
      'insert into referrals (referrer_id, referrer_mobile, referred, referred_mobile, channel, status, risk, track, qualified_at, granted_at)'
      + ` select u.id, u.mobile, 'Cap filler', '${freshMobile()}', 'seeker', 'rewarded', 'low', 'seeker', now(), now()`
      + ` from users u where u.mobile = '${digits(referrerMobile)}'`,
    );
  }
}

/** The referee asks for the owner's number and the owner accepts: the seeker track's qualifying event. */
export async function acceptedContact(refereeMobile, ownerMobile, propertyId) {
  const asked = await call('POST', '/contacts/request', refereeMobile, { propertyId });
  expect(asked.status, `asking: ${JSON.stringify(asked.json)}`).toBe(200);
  const inbox = await call('GET', '/me/contact-requests?size=50', ownerMobile);
  expect(inbox.status).toBe(200);
  const rows = Array.isArray(inbox.json) ? inbox.json : inbox.json.content;
  const row = rows.find((r) => r.propertyId === propertyId);
  expect(row, 'the owner sees the request').toBeTruthy();
  const decided = await call('PATCH', `/me/contact-requests/${row.id}`, ownerMobile, { status: 'approved' });
  expect(decided.status, `approving: ${JSON.stringify(decided.json)}`).toBe(200);
}

/** A live listing for `ownerMobile`, carrying what the ownership gate reads. */
export async function liveListing(ownerMobile, overrides = {}) {
  const listing = await newListing(ownerMobile, {
    title: 'Referral fixture',
    address: 'R-101, Referral Court, Baner Road',
    pincode: '411045',
    electricityMeterNo: `00${digits(ownerMobile)}`,
    ...overrides,
  });
  await approve(listing.id);
  return listing;
}

/** The admin's ownership grant as the review panel makes it: owner ID, bill, evidence, then the explicit grant. */
export async function verifyOwnership(ownerMobile, listing) {
  const admin = await authHeaders(ACTORS.admin);
  const issuedOn = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const me = await fetch(`${API}/auth/me`, { headers: await authHeaders(ownerMobile) });
  if (!(await me.json()).verified) await grantIdentityBadge(ownerMobile);

  const pdf = await PDFDocument.create();
  pdf.addPage().drawText(`TEST DOCUMENT: Electricity Bill\nIssued: ${issuedOn}\nR-101, Referral Court, Baner Road`);
  const form = new FormData();
  form.append('category', 'Electricity Bill');
  form.append('file', new Blob([await pdf.save()], { type: 'application/pdf' }), 'msedcl-referral.pdf');
  const upload = await fetch(`${API}/me/documents/${listing.id}`, {
    method: 'POST',
    headers: { authorization: (await authHeaders(ownerMobile)).authorization },
    body: form,
  });
  expect(upload.status, 'the bill is uploaded as real PDF bytes').toBe(201);
  const { id: documentId } = await upload.json();

  const base = `${API}/properties/${listing.id}/verification/ownership`;
  const evidence = await fetch(`${base}/evidence`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ docType: 'electricity_bill', documentId, issuedOn }),
  });
  expect(evidence.status, await evidence.clone().text()).toBe(201);
  const grant = await fetch(base, { method: 'POST', headers: admin });
  expect(grant.status, await grant.clone().text()).toBe(200);
}

export async function revokeOwnership(listing, reason = 'Referral fixture withdrawal') {
  const res = await fetch(`${API}/properties/${listing.id}/verification/ownership?reason=${encodeURIComponent(reason)}`, {
    method: 'DELETE',
    headers: await authHeaders(ACTORS.admin),
  });
  expect(res.status, await res.clone().text()).toBeLessThan(300);
}

export async function featuredOf(ownerMobile, id) {
  const res = await call('GET', '/me/listings', ownerMobile);
  expect(res.status).toBe(200);
  const rows = Array.isArray(res.json) ? res.json : res.json.content;
  return rows.find((row) => row.id === id)?.featured;
}

/** Puts the verification `interval` back in time, as `featured-reward` does, to read the featured window. */
export function stampVerified(id, interval) {
  sql(
    `update properties set ownership_verified = true, ownership_verified_at = now() - interval '${interval}',`
    + ` ownership_verified_until = now() + interval '1 year' where id = '${id}'`,
  );
}

export async function deskRows(query = '') {
  const res = await call('GET', `/referrals?size=100&counts=true${query}`, DESK);
  expect(res.status).toBe(200);
  return res.json;
}

export async function deskRow(refereeMobile) {
  const page = await deskRows(`&q=${digits(refereeMobile)}`);
  return (page.content || []).find((r) => r.referredMobile === digits(refereeMobile));
}

export const decide = (id, verb, body) => call('POST', `/referrals/${id}/${verb}`, DESK, body);
