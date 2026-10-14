import { expect } from '@playwright/test';
import { API, authHeaders, signedInAs, uniqueMobile } from './liveAuth.js';

// Books a fresh visit via the API so the dashboard has a Reschedule button to open.
export async function openRescheduleDialog(page, slug = 'p5021') {
  const mobile = uniqueMobile();
  const headers = await authHeaders(mobile);
  const { id } = await (await fetch(`${API}/properties/${slug}`, { headers })).json();
  const slot = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const res = await fetch(`${API}/visits`, { method: 'POST', headers, body: JSON.stringify({ propertyId: id, slot }) });
  expect(res.status, `booking a visit on ${slug}`).toBe(201);
  await signedInAs(page, mobile);
  await page.goto('/dashboard#visits');
  await page.getByRole('button', { name: /^Reschedule$/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}
