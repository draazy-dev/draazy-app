// Admin → Properties console guards: review start, maker guard, archived actions,
// duplicates confirm, flag reason, WhatsApp pricing guard, focus return and the re-check change list.
import { test, expect, ACTORS } from '../../fixtures/live.js';
import { API, authHeaders, uploadedListingPhotos, uniqueMobile } from '../../helpers/liveAuth.js';
import { approveListing, tickChecklist } from '../../helpers/moderation.js';

const admin = () => authHeaders(ACTORS.admin);
const BASE = { deal: 'rent', propertyType: 'Flat', price: 26000, city: 'Pune', bhk: 2, area: 780, locality: 'Baner' };
const searchBox = (page) => page.getByPlaceholder('Title, owner, mobile or ID');
const rowFor = (page, title) => page.getByTestId('queue-row').filter({ has: page.getByRole('heading', { name: title }) });
const tag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function api(method, path, headers, body) {
  const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function ownerListing(title) {
  const owner = await authHeaders(uniqueMobile());
  const posted = await api('POST', '/me/listings', owner, { ...BASE, title, images: await uploadedListingPhotos(owner) });
  expect(posted.status, JSON.stringify(posted.body)).toBe(201);
  return posted.body.id;
}

async function staffListing(title) {
  const posted = await api('POST', '/admin/properties', await admin(), {
    ownerMobile: uniqueMobile(),
    listing: { ...BASE, title },
  });
  expect(posted.status, JSON.stringify(posted.body)).toBeLessThan(300);
  return posted.body.id;
}

async function findRow(page, title, path = '/admin/properties') {
  await page.goto(path);
  await searchBox(page).fill(title);
  const row = rowFor(page, title);
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  return row;
}

async function pickOption(page, ariaLabel, optionText) {
  const trigger = page.getByRole('button', { name: ariaLabel });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.dz-dropdown__option', { hasText: optionText }).first().click();
}

const created = new Set();
test.afterEach(async () => {
  const headers = await admin();
  for (const id of created) await api('PATCH', `/properties/${id}/archive`, headers, { reason: 'Zztest cleanup' });
  created.clear();
});

test.describe('LIVE: the properties console, RC fixes', () => {
  test('MOD-01: opening a pending listing starts the review', async ({ page, login }) => {
    const title = `Zztest start ${tag()}`;
    created.add(await ownerListing(title));
    await login.asAdmin();
    const row = await findRow(page, title);

    const started = page.waitForResponse((r) => r.request().method() === 'POST' && /\/properties\/[^/]+\/verification\/start$/.test(r.url()));
    await row.getByTestId('review-listing').click();
    expect((await started).status()).toBeLessThan(300);
  });

  test('MC-10: the staffer who posted a listing cannot decide or edit it, and no review is started', async ({ page, login }) => {
    const title = `Zztest maker ${tag()}`;
    created.add(await staffListing(title));
    const starts = [];
    page.on('request', (r) => { if (/\/verification\/start$/.test(r.url())) starts.push(r.url()); });
    await login.asAdmin();
    const row = await findRow(page, title);

    await expect(row.getByTestId('edit-listing')).toBeDisabled();
    await row.getByTestId('review-listing').click();
    await expect(page.getByTestId('maker-notice')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Edit details/ })).toBeDisabled();
    expect(starts).toEqual([]);
  });

  test('MOD-11: an archived row offers only View details, Edit and Restore', async ({ page, login }) => {
    const title = `Zztest archived ${tag()}`;
    const id = await ownerListing(title);
    created.add(id);
    expect((await api('PATCH', `/properties/${id}/archive`, await admin(), { reason: 'Zztest' })).status).toBeLessThan(300);
    await login.asAdmin();
    await page.goto('/admin/properties?tab=all');
    await pickOption(page, 'Filter by status', 'Archived');
    await searchBox(page).fill(title);
    const row = rowFor(page, title);
    await expect(row).toHaveCount(1, { timeout: 15_000 });

    await expect(row.getByRole('button', { name: 'Restore' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'View details' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(row.getByRole('button', { name: /^Review/ })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Flag' })).toHaveCount(0);
  });

  test('MOD-09 and MOD-14: Flag needs a reason, and a long unbroken title keeps the actions in view', async ({ page, login }) => {
    const title = `Zztest${'x'.repeat(150)}${tag()}`;
    created.add(await ownerListing(title));
    await login.asAdmin();
    await page.setViewportSize({ width: 1280, height: 800 });
    const row = await findRow(page, title.slice(0, 40));
    const box = await row.boundingBox();
    expect(box.width).toBeLessThanOrEqual(1280);
    await expect(row.getByRole('button', { name: 'Flag' })).toBeInViewport();

    await row.getByRole('button', { name: 'Flag' }).click();
    const dialog = page.getByRole('dialog', { name: 'Flag listing' });
    const submit = dialog.    getByRole('button', { name: 'Flag listing', exact: true });
    await expect(submit).toBeDisabled();
    await dialog.getByRole('textbox').first().fill('Photos do not match');
    await expect(submit).toBeEnabled();
  });

  test('MOD-15: the Duplicates tab points at a panel that exists', async ({ page, login }) => {
    await login.asAdmin();
    await page.goto('/admin/properties?tab=duplicates');
    const tabEl = page.getByRole('tab', { name: /^Duplicates/ });
    await expect(tabEl).toHaveAttribute('aria-selected', 'true');
    const controls = await tabEl.getAttribute('aria-controls');
    await expect(page.locator(`[id="${controls}"]`)).toHaveCount(1);
  });

  test('MOD-08: keeping one duplicate asks first, then names the listing instead of an id', async ({ page, login }) => {
    const meter = `17${Date.now()}`;
    const title = `Zztest dup ${tag()}`;
    const make = async (suffix) => {
      const owner = await authHeaders(uniqueMobile());
      const posted = await api('POST', '/me/listings', owner, { ...BASE, title: `${title} ${suffix}`, floor: 4, electricityMeterNo: meter, images: await uploadedListingPhotos(owner) });
      expect(posted.status).toBe(201);
      return { id: posted.body.id, owner };
    };
    const a = await make('A');
    const b = await make('B');
    created.add(a.id); created.add(b.id);

    await expect.poll(async () => {
      const desk = await api('GET', '/admin/properties/duplicates', await admin());
      return (desk.body?.clusters || []).some((c) => c.listings.some((l) => l.id === a.id));
    }, { timeout: 20_000, message: 'the pair sharing a meter never clustered' }).toBe(true);

    await login.asAdmin();
    await page.goto('/admin/properties?tab=duplicates');
    const card = page.locator('.dz-card').filter({ hasText: `${title} A` }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.getByRole('button', { name: /Keep this, archive the rest/ }).first().click();
    const dialog = page.getByRole('dialog', { name: /Archive the other listings/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    const untouched = await api('GET', `/me/listings/${b.id}`, b.owner);
    expect(untouched.body.archived).toBe(false);

    await card.getByRole('button', { name: /Keep this, archive the rest/ }).first().click();
    await page.getByTestId('confirm-keep').click();
    await expect(page.getByText(/Kept .*Zztest dup/)).toBeVisible();
    await expect(page.getByText(/Kept .*[0-9a-f]{8}-[0-9a-f]{4}-/)).toHaveCount(0);
  });

  test('MOD-19: the pricing template never sends a literal {market_rate}', async ({ page, login }) => {
    const title = `Zztest wa ${tag()}`;
    created.add(await ownerListing(title));
    await login.asAdmin();
    const row = await findRow(page, title);
    await row.getByTestId('review-listing').click();
    await page.getByTestId('review-section-messages').click();
    await page.getByRole('button', { name: /WhatsApp templates/ }).click();

    const template = page.getByRole('button', { name: /Pricing suggestion/ });
    await expect(template).toBeVisible();
    if (await template.isDisabled()) {
      await expect(template).toHaveAttribute('title', /market rate/);
    } else {
      await template.click();
      const preview = page.getByTestId('wa-preview-body');
      await expect(preview).not.toContainText('{market_rate}');
      await expect(preview).toContainText('\u20B9');
      await expect(preview).not.toContainText('\u20B9\u20B9');
    }
  });

  test('MOD-18: approving from the keyboard leaves focus in the queue, not on <body>', async ({ page, request, login }) => {
    const title = `Zztest focus ${tag()}`;
    const id = await ownerListing(title);
    created.add(id);
    await tickChecklist(request, id, await admin());
    await login.asAdmin();
    const row = await findRow(page, title);
    await row.getByTestId('review-listing').click();

    const approve = page.getByRole('button', { name: 'Approve', exact: true });
    await expect(approve).toBeEnabled();
    await approve.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('body')).not.toBeFocused();
  });

  test('DASH-13: the review modal lists what the owner changed, old to new', async ({ page, request, login }) => {
    const title = `Zztest changes ${tag()}`;
    const owner = await authHeaders(uniqueMobile());
    const posted = await api('POST', '/me/listings', owner, { ...BASE, title, images: await uploadedListingPhotos(owner) });
    const id = posted.body.id;
    created.add(id);
    await approveListing(request, id, await admin());
    expect((await api('PATCH', `/me/listings/${id}`, owner, { price: 31000 })).status).toBe(200);

    await login.asAdmin();
    await page.goto(`/admin/properties?review=${id}`);
    await expect(page.getByTestId('recheck-reason')).toContainText('price');
    await expect(page.getByTestId('recheck-changes')).toContainText(/26,?000/);
    await expect(page.getByTestId('recheck-changes')).toContainText(/31,?000/);
  });
});
