import { expect } from '@playwright/test';
import { API, authHeaders } from './liveAuth.js';
import { STAFF } from '../fixtures/live.js';

export const REVIEW_CHECKLIST = [
  'Photos are real and match the listing',
  'Not a duplicate of another listing',
  'Details and location look right',
];

export async function tickChecklist(request, id, headers, { api = API } = {}) {
  const opened = await request.post(`${api}/properties/${id}/verification/start`, { headers });
  expect(opened.status(), await opened.text()).toBe(200);
  for (const item of REVIEW_CHECKLIST) {
    const ticked = await request.patch(`${api}/properties/${id}/verification/checklist`, {
      headers,
      data: { item, pass: true },
    });
    expect(ticked.status(), await ticked.text()).toBe(200);
  }
}

async function jsonResult(res) {
  const text = await res.text();
  return { status: res.status, text, json: text ? JSON.parse(text) : null };
}

async function assertOk(res, label) {
  expect(res.status, `${label}: ${res.text}`).toBe(200);
}

export async function tickChecklistWithFetch(id, headers, { api = API } = {}) {
  await assertOk(await jsonResult(await fetch(`${api}/properties/${id}/verification/start`, {
    method: 'POST',
    headers,
  })), `opening review ${id}`);

  for (const item of REVIEW_CHECKLIST) {
    await assertOk(await jsonResult(await fetch(`${api}/properties/${id}/verification/checklist`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ item, pass: true }),
    })), `ticking ${item}`);
  }
}

// PATCH /status refuses to overturn a non-pending listing unless the caller names the status it saw.
async function withExpectedStatus(id, headers, api, body) {
  const seen = await fetch(`${api}/properties/${id}`, { headers });
  const expectedStatus = seen.ok ? (await seen.json()).status : undefined;
  return expectedStatus ? { ...body, expectedStatus } : body;
}

export async function approveListing(request, id, headers, { reason, api = API } = {}) {
  await tickChecklist(request, id, headers, { api });
  return request.patch(`${api}/properties/${id}/status`, {
    headers,
    data: await withExpectedStatus(id, headers, api, { status: 'approved', ...(reason ? { reason } : {}) }),
  });
}

export async function approveListingWithFetch(id, headers, { reason, api = API } = {}) {
  await tickChecklistWithFetch(id, headers, { api });
  return jsonResult(await fetch(`${api}/properties/${id}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(await withExpectedStatus(id, headers, api, { status: 'approved', ...(reason ? { reason } : {}) })),
  }));
}

export async function rejectListing(request, id, headers, { reasonCode = 'wrong_details', reason, api = API } = {}) {
  return request.patch(`${api}/properties/${id}/status`, {
    headers,
    data: await withExpectedStatus(id, headers, api, { status: 'rejected', reasonCode, ...(reason ? { reason } : {}) }),
  });
}

export async function rejectListingWithFetch(
  id,
  headers,
  { reasonCode = 'wrong_details', reason, api = API } = {},
) {
  return jsonResult(await fetch(`${api}/properties/${id}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(await withExpectedStatus(id, headers, api, { status: 'rejected', reasonCode, ...(reason ? { reason } : {}) })),
  }));
}

export async function publishFlatmate(id, { api = API } = {}) {
  const res = await jsonResult(await fetch(`${api}/admin/flatmates/${id}/moderation`, {
    method: 'PATCH',
    headers: await authHeaders(STAFF.rental),
    body: JSON.stringify({ modStatus: 'approved' }),
  }));
  expect(res.status, `publishing flatmate post ${id}: ${res.text}`).toBe(200);
  return res.json;
}
