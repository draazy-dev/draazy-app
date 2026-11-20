import { expect } from '@playwright/test';

const json = (headers) => ({ 'content-type': 'application/json', ...headers });

/** Ticks every desk check on a room or flat-holding group so the next Publish is allowed. */
export async function tickDeskChecklist(api, id, headers) {
  const res = await fetch(`${api}/admin/flatmates/${id}`, { headers: json(headers) });
  if (res.status !== 200) return;
  const detail = await res.json();
  if (!detail.item?.checklistRequired) return;
  for (const check of detail.caseFile?.checklist || []) {
    if (check.pass) continue;
    const ticked = await fetch(`${api}/admin/flatmates/${id}/moderation/checklist`, {
      method: 'PATCH',
      headers: json(headers),
      body: JSON.stringify({ item: check.item, pass: true }),
    });
    expect(ticked.status, `ticking "${check.item}" on ${id}`).toBe(200);
  }
}

export async function askForInfo(api, id, headers, { reasonCode = 'wrong_details', note = 'Please confirm the rent.' } = {}) {
  return fetch(`${api}/admin/flatmates/${id}/moderation`, {
    method: 'PATCH',
    headers: json(headers),
    body: JSON.stringify({ modStatus: 'needs_info', reasonCode, note }),
  });
}
