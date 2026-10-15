import { ACTORS, expect, test } from '../../fixtures/live.js';
import { authHeaders, uniqueMobile } from '../../helpers/liveAuth.js';
import { call, newListing } from '../../helpers/monetisation.js';
import { approveListing, rejectListing, tickChecklist } from '../../helpers/moderation.js';

const RERA_ID = 'P52100012345';
const RERA_ITEM = 'RERA ID checked on MahaRERA';

const created = new Set();

async function reraListing(owner = uniqueMobile(), reraId = RERA_ID) {
  const listing = await newListing(owner, { title: 'Zztest rera check', ...(reraId ? { reraId } : {}) });
  created.add(listing.id);
  return { owner, id: listing.id, title: listing.title };
}

const check = (id, result, as = ACTORS.admin) => call('POST', `/properties/${id}/rera-check`, as, { result });
const decide = (id, body) => call('POST', `/properties/${id}/verification/decision`, ACTORS.admin, body);

test.afterEach(async ({ request }) => {
  const headers = await authHeaders(ACTORS.admin);
  for (const id of created) {
    await rejectListing(request, id, headers, { reasonCode: 'other', reason: 'Zztest cleanup' });
  }
  created.clear();
});

test('only a listing that quotes a RERA ID gets the fourth checklist item', async ({ request }) => {
  const quoted = await reraListing();
  const plain = await reraListing(uniqueMobile(), null);
  const headers = await authHeaders(ACTORS.admin);

  await tickChecklist(request, quoted.id, headers);
  const withItem = await call('GET', `/properties/${quoted.id}/verification`, ACTORS.admin);
  expect(withItem.json.checklist.map((c) => c.item)).toContain(RERA_ITEM);

  await tickChecklist(request, plain.id, headers);
  const without = await call('GET', `/properties/${plain.id}/verification`, ACTORS.admin);
  expect(without.json.checklist).toHaveLength(3);
  expect((await check(plain.id, 'verified')).status).toBe(409);
});

test('not found or mismatch blocks Approve; Verified lets it through and buyers see RERA checked', async ({ request }) => {
  const { id } = await reraListing();
  const headers = await authHeaders(ACTORS.admin);
  await tickChecklist(request, id, headers);

  const pending = await decide(id, { decision: 'approve' });
  expect(pending.status).toBe(409);
  expect(pending.json.error).toBe('rera_check_pending');

  for (const result of ['not_found', 'mismatch']) {
    expect((await check(id, result)).status).toBe(200);
    const blocked = await decide(id, { decision: 'approve' });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error).toBe('rera_check_failed');
  }

  const before = await call('GET', `/properties/${id}`, ACTORS.buyer);
  expect(before.json.reraChecked).toBeUndefined();

  expect((await check(id, 'verified')).status).toBe(200);
  expect((await approveListing(request, id, headers)).status()).toBe(200);
  const after = await call('GET', `/properties/${id}`, ACTORS.buyer);
  expect(after.json.reraChecked).toBe(true);
  expect(JSON.stringify(after.json)).not.toContain('reraCheckedBy');
});

test('a failed check can be sent back with the RERA reason, and the owner hears it', async ({ request }) => {
  const { owner, id } = await reraListing();
  await tickChecklist(request, id, await authHeaders(ACTORS.admin));
  expect((await check(id, 'mismatch')).status).toBe(200);

  const sent = await decide(id, { decision: 'needs_info', reasonCode: 'rera_mismatch' });
  expect(sent.status, JSON.stringify(sent.json)).toBe(200);
  const inbox = await call('GET', '/notifications?size=50', owner);
  expect(JSON.stringify(inbox.json)).toContain('RERA ID');
});

test('the result is refused for a bad value, for a buyer, and on the staff member’s own listing', async () => {
  const { id } = await reraListing();
  expect((await check(id, 'approved')).status).toBe(400);
  expect((await check(id, 'verified', ACTORS.buyer)).status).toBe(403);

  const own = await reraListing(ACTORS.admin);
  expect((await check(own.id, 'verified')).status).toBe(403);
});

test('the review modal copies the ID, links to MahaRERA and records the three results', async ({ page, login, context }) => {
  const { id } = await reraListing();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await login.asAdmin();
  await page.goto(`/admin/properties?review=${id}`);
  const modal = page.getByRole('dialog');
  const row = modal.getByTestId('rera-check');
  await expect(row).toContainText(RERA_ID);

  const link = row.getByRole('link', { name: 'Open MahaRERA search' });
  await expect(link).toHaveAttribute('href', 'https://maharera.maharashtra.gov.in/');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);

  await row.getByTestId('rera-copy').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(RERA_ID);

  await row.getByTestId('rera-not_found').click();
  await expect(row.getByTestId('rera-not_found')).toHaveAttribute('aria-pressed', 'true');
  await expect(modal.getByRole('button', { name: 'Approve' })).toBeDisabled();

  await row.getByTestId('rera-verified').click();
  await expect(row.getByTestId('rera-verified')).toHaveAttribute('aria-pressed', 'true');
  await row.getByTestId('rera-mismatch').click();
  await expect(row.getByTestId('rera-mismatch')).toHaveAttribute('aria-pressed', 'true');
});

test('the buyer page shows RERA checked only after a verified result', async ({ page, request }) => {
  const { id } = await reraListing();
  const headers = await authHeaders(ACTORS.admin);
  await tickChecklist(request, id, headers);
  expect((await check(id, 'verified')).status).toBe(200);
  expect((await approveListing(request, id, headers)).status()).toBe(200);

  await page.goto(`/property/${id}`);
  await expect(page.getByTestId('rera-checked')).toBeVisible();

  expect((await check(id, 'not_found')).status).toBe(200);
  await page.reload();
  await expect(page.getByText(RERA_ID).first()).toBeVisible();
  await expect(page.getByTestId('rera-checked')).toHaveCount(0);
});
