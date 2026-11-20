import { execFileSync } from 'node:child_process';
import { expect } from '@playwright/test';
import { ACTORS } from '../fixtures/live.js';
import { API, authHeaders, uploadedListingPhotos } from './liveAuth.js';
import { approveListingWithFetch } from './moderation.js';

export const LISTING_PASS_PLAN = 'b1000000-0000-4000-8000-000000000005';
export const CONTACT_PACK_PLAN = 'b1000000-0000-4000-8000-000000000006';

const PSQL = process.env.PSQL || 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';

/** Runs one statement against the database this shard's backend uses and returns the trimmed stdout. */
export function sql(statement) {
  return execFileSync(
    PSQL,
    ['-U', process.env.E2E_DB_USER || 'postgres', '-d', process.env.E2E_DB_NAME || 'draazy_e2e', '-At', '-c', statement],
    { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'postgres' } },
  ).trim();
}

const UUID = /^[0-9a-f-]{36}$/i;
const uuid = (value) => {
  if (!UUID.test(value)) throw new Error(`not an id: ${value}`);
  return value;
};

export async function call(method, path, mobile, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: await authHeaders(mobile),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

export const entitlementsOf = async (mobile) => {
  const res = await call('GET', '/me/entitlements', mobile);
  expect(res.status).toBe(200);
  return res.json;
};

/** Creates a rent listing for `mobile`. Creation is never refused for the free tier, however many are live. */
export async function newListing(mobile, overrides = {}) {
  const { title = 'Monetisation fixture', ...rest } = overrides;
  const sent = `${title} ${Date.now()}`;
  const created = await call('POST', '/me/listings', mobile, {
    title: sent,
    deal: 'rent',
    propertyType: 'Flat',
    price: 24000,
    city: 'Pune',
    locality: 'Baner',
    bhk: 2,
    area: 850,
    images: await uploadedListingPhotos(await authHeaders(mobile)),
    ...rest,
  });
  expect(created.status, `creating a listing: ${JSON.stringify(created.json)}`).toBe(201);
  return { ...created.json, title: sent };
}

/** Moderation approval; an over-tier listing lands PAUSED rather than live. */
export async function approve(id) {
  const res = await approveListingWithFetch(id, await authHeaders(ACTORS.admin));
  expect(res.status, `approving ${id}: ${res.text}`).toBe(200);
}

export async function statusOf(mobile, id) {
  const res = await call('GET', '/me/listings', mobile);
  expect(res.status).toBe(200);
  const rows = Array.isArray(res.json) ? res.json : res.json.content;
  return String(rows.find((r) => r.id === id)?.status ?? '').toLowerCase();
}

/** Opens the unpaid order the checkout button opens, over HTTP. */
export async function openOrder(mobile, planId, propertyId) {
  const res = await call('POST', '/me/subscription', mobile, { planId, ...(propertyId ? { propertyId } : {}) });
  expect(res.status, `opening an order: ${JSON.stringify(res.json)}`).toBe(201);
  expect(res.json.status).toBe('pending');
  return res.json;
}

/** Stands in for the signed payment webhook, whose secret is machine-local, by writing its row outcome. */
export function settleOrder(subscriptionId, days) {
  const out = sql(
    `update subscriptions set status = 'active', started_at = now(), renews_at = now() + interval '${Number(days)} days'`
    + ` where id = '${uuid(subscriptionId)}' and status = 'pending' returning id`,
  );
  if (!out.includes(subscriptionId)) throw new Error(`could not settle ${subscriptionId}`);
}

/** Owners answer every request `mobile` has open, so spending the full allowance never meets the pending cap. */
export function ownersApproveAll(mobile) {
  sql(
    "update contact_requests set status = 'approved' where status = 'pending'"
    + ` and requester_id = (select id from users where mobile = '${String(mobile).replace(/\D/g, '')}')`,
  );
}

export async function pendingOrderId(mobile) {
  const me = await call('GET', '/auth/me', mobile);
  const id = sql(`select id from subscriptions where user_id = '${uuid(me.json.id)}' and status = 'pending' order by created_at desc limit 1`).split(/\r?\n/)[0];
  return uuid(id);
}

/** A registered rent agreement on `listingId` ending `daysLeft` days from now, filed as the desk files it. */
export async function seedAgreement(ownerMobile, listingId, tenantMobile, { daysLeft, rent = 24000, status = 'registered' }) {
  const request = await call('POST', '/service-requests', ownerMobile, {
    type: 'rent-agreement',
    details: { ownerName: 'Anita Verma', rent, deposit: rent * 5, months: 11, _state: { tenantMode: 'fill', prop: { gramPanchayat: false }, owner: { oMobile: ownerMobile } } },
  });
  expect(request.status, JSON.stringify(request.json)).toBe(201);
  const serviceRequestId = request.json.id;

  const id = sql(
    'insert into rent_agreements (id, property_id, owner_id, tenant_mobile, rent, deposit, start_date, duration_months, status, service_request_id)'
    + ` select gen_random_uuid(), p.id, p.owner_id, '${String(tenantMobile).replace(/\D/g, '')}', ${Number(rent)}, ${Number(rent) * 5},`
    + ` (current_date + ${Number(daysLeft) + 1}) - interval '11 months', 11, '${status.replace(/[^a-z-]/g, '')}', '${uuid(serviceRequestId)}'`
    + ` from properties p where p.id = '${uuid(listingId)}' returning id`,
  ).split(/\r?\n/)[0];
  return { id: uuid(id), serviceRequestId };
}
