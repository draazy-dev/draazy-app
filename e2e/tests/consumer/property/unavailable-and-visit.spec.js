import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, authHeaders, signedInAs, uniqueMobile, uploadedListingPhotos } from '../../../helpers/liveAuth.js';
import { approveListingWithFetch, rejectListingWithFetch } from '../../../helpers/moderation.js';

const created = new Set();

const LISTING = {
  title: 'Zztest unavailable visit listing',
  deal: 'rent',
  propertyType: 'Flat',
  bhk: 2,
  price: 42000,
  locality: 'Baner',
  city: 'Pune',
  address: 'Zztest Unavailable Visit Residency, A-902',
  area: 940,
  areaUnit: 'sqft',
  furnishing: 'semi-furnished',
  description: 'Synthetic property detail fixture.',
};

async function api(method, path, headers, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function owner() {
  const mobile = uniqueMobile();
  return { mobile, headers: await authHeaders(mobile) };
}

async function listing(fields = {}) {
  const me = await owner();
  const res = await api('POST', '/me/listings', me.headers, {
    ...LISTING,
    title: `Zztest unavailable visit ${Date.now().toString(36)}`,
    images: await uploadedListingPhotos(me.headers),
    ...fields,
  });
  expect(res.status, `POST /me/listings (${JSON.stringify(res.body)})`).toBe(201);
  created.add(res.body.id);
  return { owner: me, id: res.body.id };
}

async function setStatus(id, status) {
  const headers = await authHeaders(ACTORS.admin);
  const res = status === 'approved'
    ? await approveListingWithFetch(id, headers)
    : await rejectListingWithFetch(id, headers, { reason: 'Zztest live unavailable and visit fixture' });
  expect(res.status, `PATCH /properties/${id}/status`).toBe(200);
}

test.afterEach(async () => {
  if (!created.size) return;
  const headers = await authHeaders(ACTORS.admin);
  for (const id of created) {
    await rejectListingWithFetch(id, headers, { reason: 'Zztest cleanup' });
  }
  created.clear();
});

test.describe('LIVE — unavailable listings and visit leads', () => {
  test('a removed listing resolves as not found but keeps a browse recovery CTA', async ({ page }) => {
    const { id } = await listing();
    await setStatus(id, 'rejected');

    const detail404 = page.waitForResponse((res) =>
      new URL(res.url()).pathname === `/api/properties/${id}`
      && res.request().method() === 'GET'
      && res.status() === 404);
    await page.goto(`/property/${id}`);
    await detail404;

    await expect(page.getByRole('heading', { name: /property not found/i })).toBeVisible();
    await expect(page.getByText(/under review/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /back to results/i })).toHaveAttribute('href', /\/listings$/);
  });

  test('the schedule visit modal posts only the account-scoped visit fields, and the owner sees the profile name', async ({ page, flags }) => {
    await flags.enable('scheduleVisit');
    const { owner: host, id } = await listing();
    await setStatus(id, 'approved');

    const mobile = uniqueMobile();
    const name = 'Zztest Meera Joshi';
    expect((await api('PATCH', '/auth/me', await authHeaders(mobile), { name })).status).toBe(200);
    await signedInAs(page, mobile);
    await page.goto(`/property/${id}`);
    await page.getByRole('button', { name: /schedule a visit/i }).click();

    const dialog = page.getByRole('dialog', { name: /schedule a visit/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/full name/i)).toHaveCount(0);
    await expect(dialog.getByText(/mobile number/i)).toHaveCount(0);
    await expect(dialog.getByText(/video/i)).toHaveCount(0);

    await dialog.getByRole('button', { name: /select a time/i }).click();
    const picker = page.locator('.dz-timepicker');
    await picker.getByRole('button', { name: 'PM', exact: true }).click();
    await picker.getByRole('button', { name: /confirm/i }).click();
    await expect(dialog.getByRole('button', { name: /select a time/i })).toContainText('10:30 PM');

    const request = page.waitForRequest((req) =>
      new URL(req.url()).pathname === '/api/visits'
      && req.method() === 'POST');
    await dialog.getByRole('button', { name: /confirm visit/i }).click();
    const payload = JSON.parse((await request).postData() || '{}');

    expect(payload.propertyId).toBe(id);
    expect(await page.evaluate((s) => new Date(s).getHours(), payload.slot)).toBe(22);
    expect(payload.mode).toBe('in-person');
    expect(payload).not.toHaveProperty('visitorName');
    expect(payload).not.toHaveProperty('phone');
    await expect(dialog.getByText(/visit requested/i)).toBeVisible();

    const rows = await api('GET', '/me/visit-requests?size=100', host.headers);
    expect(rows.status).toBe(200);
    const row = rows.body.content.find((r) => r.propertyId === id);
    expect(row?.visitor?.name, 'the owner sees the name the visitor set on their profile').toBe(name);
  });

  test('Esc inside the time picker closes only the picker, and the owner then sees the visitor note', async ({ page, flags }) => {
    await flags.enable('scheduleVisit');
    const { owner: host, id } = await listing();
    await setStatus(id, 'approved');

    await signedInAs(page, uniqueMobile());
    await page.goto(`/property/${id}`);
    await page.getByRole('button', { name: /schedule a visit/i }).click();
    const dialog = page.getByRole('dialog', { name: /schedule a visit/i });
    await dialog.getByPlaceholder(/any specific requirements/i).fill('Will come with family');

    await dialog.getByRole('button', { name: /select a time/i }).click();
    const picker = page.locator('.dz-timepicker');
    await expect(picker).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(dialog, 'the sheet and its typed message survive Esc').toBeVisible();
    await expect(dialog.getByPlaceholder(/any specific requirements/i)).toHaveValue('Will come with family');

    await dialog.getByRole('button', { name: /confirm visit/i }).click();
    await expect(dialog.getByText(/visit requested/i)).toBeVisible();

    const rows = await api('GET', '/me/visit-requests?size=100', host.headers);
    expect(rows.body.content.find((r) => r.propertyId === id)?.note).toBe('Will come with family');
  });

  test('a listing opened by its slug books with its UUID, not the slug', async ({ page, flags }) => {
    await flags.enable('scheduleVisit');
    const { id } = (await api('GET', '/properties/p5021')).body;
    await signedInAs(page, uniqueMobile());
    await page.goto('/property/p5021?visit=1');

    const dialog = page.getByRole('dialog', { name: /schedule a visit/i });
    const response = page.waitForResponse((res) =>
      new URL(res.url()).pathname === '/api/visits'
      && res.request().method() === 'POST');
    await dialog.getByRole('button', { name: /confirm visit/i }).click();
    const res = await response;

    expect(JSON.parse(res.request().postData() || '{}').propertyId).toBe(id);
    expect(res.status()).toBe(201);
    await expect(dialog.getByText(/visit requested/i)).toBeVisible();
  });

  test('a video visit is refused by the API', async () => {
    const { id } = await listing();
    await setStatus(id, 'approved');
    const slot = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const res = await api('POST', '/visits', await authHeaders(uniqueMobile()), { propertyId: id, slot, mode: 'video' });
    expect(res.status).toBe(422);
  });

  test('a visit spends one owner contact, and contacting that owner afterwards costs nothing more', async () => {
    const { id } = await listing();
    await setStatus(id, 'approved');
    const headers = await authHeaders(uniqueMobile());
    const used = async () => (await api('GET', '/me/entitlements', headers)).body.contacts.used;
    const slot = new Date(Date.now() + 2 * 86_400_000).toISOString();

    expect((await api('POST', '/visits', headers, { propertyId: id, slot })).status).toBe(201);
    expect(await used()).toBe(1);
    expect((await api('POST', '/contacts/request', headers, { propertyId: id })).status).toBe(200);
    expect(await used()).toBe(1);
  });

  test('with no owner contacts left, booking offers a referral or a Contact Pack', async ({ page, flags }) => {
    await flags.enable('scheduleVisit');
    await signedInAs(page, uniqueMobile());
    await page.route('**/api/visits', (route) => route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'contact_quota_exhausted', message: 'stubbed', status: 422 }),
    }));
    await page.goto('/property/p5021?visit=1');

    await page.getByRole('dialog', { name: /schedule a visit/i }).getByRole('button', { name: /confirm visit/i }).click();

    await expect(page.getByTestId('contacts-exhausted')).toBeVisible();
    await expect(page.getByTestId('contacts-exhausted-plan')).toHaveAttribute('href', /plan=contact-pack&next=%2Fproperty%2Fp5021/);
  });

  test('/schedule-visit opens the property booking popup, or offers to browse without a listing', async ({ page, flags }) => {
    await flags.enable('scheduleVisit');
    const { id } = await listing();
    await setStatus(id, 'approved');
    await signedInAs(page, uniqueMobile());

    await page.goto(`/schedule-visit?listing=${id}`);
    await expect(page).toHaveURL(new RegExp(`/property/${id}`));
    await expect(page.getByRole('dialog', { name: /schedule a visit/i })).toBeVisible();

    await page.goto('/schedule-visit');
    await expect(page.getByRole('link', { name: /browse listings/i })).toHaveAttribute('href', '/listings');
  });
});
