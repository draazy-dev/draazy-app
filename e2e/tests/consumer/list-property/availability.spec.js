import { ACTORS, expect, test } from '../../../fixtures/live.js';
import { API, authHeaders, ownerIdOf, signedInAsNew, uniqueMobile, uploadedListingPhotos } from '../../../helpers/liveAuth.js';
import { LIST_PROPERTY_DRAFT_KEY } from '../../../helpers/listingForm.helper.js';
import { uploadPublishablePhotos } from '../../../helpers/listingPhotos.helper.js';
import { approveListing, rejectListing } from '../../../helpers/moderation.js';
import { fillSociety } from '../../../helpers/places.js';
import { pickDate } from '../../../helpers/datePicker.helper.js';
import { bucketOf, displayDate, istFirstOfNextMonth, istInDays, istToday, shortLabel } from '../../../helpers/availability.js';

const created = new Set();
const CHIPS = ['Available now', '1st of next month'];

test.afterEach(async ({ request }) => {
  if (!created.size) return;
  const headers = await authHeaders(ACTORS.admin);
  for (const id of created) await rejectListing(request, id, headers, { reason: 'Zztest cleanup' });
  created.clear();
});

const field = (page) => page.getByTestId('availability-field');
const chip = (page, name) => field(page).getByRole('button', { name, exact: true });
const shown = (page) => field(page).locator('.dz-datefield__text');

async function rowOf(request, headers, id) {
  const res = await request.get(`${API}/me/listings/${id}`, { headers });
  expect(res.status()).toBe(200);
  return res.json();
}

const RENT = (images, extra = {}) => ({
  title: `Zztest avail ${Date.now()}`, deal: 'rent', propertyType: 'Flat', price: 31000, deposit: 0,
  city: 'Pune', locality: 'Baner', bhk: 2, area: 900, images, ...extra,
});

test('the rent wizard offers two chips plus a date; a chip and a picked date are one answer, sent as availableOn', async ({ page, request }) => {
  test.slow();
  const mobile = await signedInAsNew(page);
  const headers = await authHeaders(mobile);
  const ownerId = ownerIdOf(headers);
  await page.addInitScript(({ key, ownerId }) => {
    localStorage.setItem(key, JSON.stringify({
      propertyType: 'flat', bhk: '2', bathrooms: '2', carpetArea: '850', deal: 'rent', floor: '9', totalFloors: '14', __owner: ownerId,
    }));
    localStorage.setItem('dz_cookie_consent_v1', JSON.stringify({
      necessary: true, functional: true, analytics: true, marketing: false, version: 1, ts: Date.now(),
    }));
  }, { key: LIST_PROPERTY_DRAFT_KEY, ownerId });
  await page.goto('/list-property');

  const next = page.getByRole('button', { name: /Next Step/i });
  await next.click();
  await page.locator('input[data-err="flatNumber"]').fill('A-902');
  await page.locator('input[data-err="pincode"]').fill('411045');
  await fillSociety(page, `Avail Spec Residency ${Date.now()}`, { lat: 18.5602, lng: 73.7861, locality: 'Baner', pincode: '411045' });
  await expect(page.locator('[data-err="locality"] .dz-dropdown__value')).not.toHaveClass(/is-placeholder/, { timeout: 15_000 });
  await next.click();
  await page.locator('input[data-err="monthlyRent"]').fill('31000');
  await page.locator('input[data-err="deposit"]').fill('90000');

  const nextMonth = istFirstOfNextMonth();
  await test.step('two quick chips and a date, none chosen yet', async () => {
    await expect(field(page)).toBeVisible();
    for (const name of CHIPS) {
      await expect(chip(page, name)).toHaveAttribute('aria-pressed', 'false');
    }
    await expect(field(page).getByRole('button', { name: /In \d+ days/ })).toHaveCount(0);
    await expect(shown(page)).toHaveText('DD/MM/YYYY');
  });

  await test.step('a chip fills the date and lights up; a picked date takes the light away', async () => {
    await chip(page, '1st of next month').click();
    await expect(chip(page, '1st of next month')).toHaveAttribute('aria-pressed', 'true');
    await expect(shown(page)).toHaveText(displayDate(nextMonth));
    expect(nextMonth.endsWith('-01')).toBe(true);
    await pickDate(page, '[data-testid="availability-field"] .dz-datefield', istInDays(50));
    await expect(shown(page)).toHaveText(displayDate(istInDays(50)));
    for (const name of CHIPS) {
      await expect(chip(page, name)).toHaveAttribute('aria-pressed', 'false');
    }
    await chip(page, '1st of next month').click();
    await expect(shown(page)).toHaveText(displayDate(nextMonth));
  });

  await test.step('the date outside the next year cannot be picked', async () => {
    await page.locator('[data-testid="availability-field"] .dz-datefield').click();
    const far = istInDays(366);
    const [y, m] = far.split('-').map(Number);
    const cal = page.locator('.dz-cal.is-open');
    await cal.locator('.dz-cal__dd--year .dz-dropdown__trigger').click();
    await page.locator('.dz-dropdown__menu--portal [role="option"]', { hasText: new RegExp(`^${y}$`) }).first().click();
    await cal.locator('.dz-cal__dd:not(.dz-cal__dd--year) .dz-dropdown__trigger').click();
    await page.locator('.dz-dropdown__menu--portal [role="option"]', { hasText: new RegExp(`^${new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })}$`) }).first().click();
    await expect(cal.locator(`.dz-cal__day[aria-label="${far}"]:not(.is-muted)`)).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(cal).toBeHidden();
    await expect(shown(page)).toHaveText(displayDate(nextMonth));
  });

  await next.click();
  await expect(page.locator('[data-err="photos"] label.upload-zone input[type="file"][multiple]')).toBeAttached({ timeout: 20_000 });
  await uploadPublishablePhotos(page);
  const posted = page.waitForResponse((r) => /\/api\/me\/listings$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
  await page.getByRole('button', { name: /Submit Property/i }).click();
  const response = await posted;
  expect(response.status()).toBe(201);
  const body = response.request().postDataJSON();
  expect(body.availableOn).toBe(nextMonth);
  const id = (await response.json()).id;
  created.add(id);

  const row = await rowOf(request, headers, id);
  expect(row.availableOn).toBe(nextMonth);
  expect(row.availableFrom ?? null).toBe(bucketOf(nextMonth));
});

test('an exact date round-trips from the edit page to the card and the detail page, and its bucket is derived live', async ({ page, request }) => {
  test.slow();
  const mobile = await signedInAsNew(page);
  const headers = await authHeaders(mobile);
  const token = `Zztestavail${Date.now()}`;
  const seeded = await request.post(`${API}/me/listings`, {
    headers,
    data: {
      title: token, deal: 'rent', propertyType: 'Flat', bhk: 2, bathrooms: 2, balconies: 0, parking: 0, price: 31000,
      deposit: 0, maintenance: 2500, area: 1000, carpetArea: 875.5, builtUpArea: 1000.25, areaUnit: 'sqft',
      furnishing: 'semi-furnished', locality: 'Baner', city: 'Pune', lat: 18.559, lng: 73.786, floor: 0, totalFloors: 15,
      ageYears: 7, address: 'C-901, North, Edit Prefill Homes, Baner Road', pincode: '411045',
      images: await uploadedListingPhotos(headers), availableOn: istFirstOfNextMonth(),
      formDetails: {
        flatNumber: 'C-901', tower: 'North', society: 'Edit Prefill Homes', street: 'Baner Road',
        landmark: 'Near the public library', agreementDuration: '24', lockIn: '0', noticePeriod: '2',
        preferredTenants: ['family'], petsPolicy: 'no', foodPref: 'veg', rentMaintMode: 'extra', fixtures: [],
      },
    },
  });
  expect(seeded.status(), await seeded.text()).toBe(201);
  const id = (await seeded.json()).id;
  created.add(id);
  const approved = await approveListing(request, id, await authHeaders(ACTORS.admin));
  expect(approved.status()).toBeLessThan(300);
  expect((await rowOf(request, headers, id)).availableFrom ?? null).toBe(bucketOf(istFirstOfNextMonth()));

  const editAvailability = async (act) => {
    await page.goto(`/list-property?edit=${id}`);
    await expect(page.getByRole('heading', { name: 'Property details', exact: true })).toBeVisible();
    for (const title of ['Location', 'Price & terms']) {
      await page.getByRole('button', { name: 'Next Step', exact: true }).click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    }
    await act();
    await page.getByRole('button', { name: 'Next Step', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Photos & description', exact: true })).toBeVisible();
    const patched = page.waitForResponse((r) => r.request().method() === 'PATCH' && /^\/api\/me\/listings\/[^/]+$/.test(new URL(r.url()).pathname));
    await page.getByRole('button', { name: 'Submit Property', exact: true }).click();
    const response = await patched;
    expect(response.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Listing Updated!', exact: true })).toBeVisible();
    return response.request().postDataJSON();
  };

  await test.step('the stored date reopens as its chip and as a date', async () => {
    await page.goto(`/list-property?edit=${id}`);
    await expect(page.getByRole('heading', { name: 'Property details', exact: true })).toBeVisible();
    for (const title of ['Location', 'Price & terms']) {
      await page.getByRole('button', { name: 'Next Step', exact: true }).click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    }
    await expect(chip(page, '1st of next month')).toHaveAttribute('aria-pressed', 'true');
    await expect(shown(page)).toHaveText(displayDate(istFirstOfNextMonth()));
  });

  await test.step('a chip saved from the edit page is the new date and bucket', async () => {
    const patch = await editAvailability(() => chip(page, 'Available now').click());
    expect(patch.availableOn).toBe(istToday());
    const row = await rowOf(request, headers, id);
    expect(row.availableOn).toBe(istToday());
    expect(row.availableFrom).toBe('now');
  });

  const far = istInDays(200);
  await test.step('a picked date beyond a month has no bucket but keeps its exact date', async () => {
    const patch = await editAvailability(() => pickDate(page, '[data-testid="availability-field"] .dz-datefield', far));
    expect(patch.availableOn).toBe(far);
    const row = await rowOf(request, headers, id);
    expect(row.availableOn).toBe(far);
    expect(row.availableFrom == null).toBe(true);
    const search = await request.get(`${API}/properties?deal=rent&availableFrom=30&q=${token}`);
    expect((await search.json()).content.map((p) => p.id)).not.toContain(id);
  });

  await test.step('the card reads "Available from <day month>"', async () => {
    await page.goto(`/listings?deal=rent&q=${token}`);
    const card = page.locator(`a[href*="${id}"]`).filter({ has: page.locator('h3') }).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText(`Available from ${shortLabel(far)}`)).toBeVisible();
  });

  await test.step('the detail page adds how many days away it is', async () => {
    await page.goto(`/property/${id}`);
    await expect(page.getByText(new RegExp(`Available from ${shortLabel(far)}.*in 200 days`)).first()).toBeVisible({ timeout: 20_000 });
  });

  await test.step('a date that has arrived reads "Available now" on the card', async () => {
    const patch = await request.patch(`${API}/me/listings/${id}`, { headers, data: { availableOn: istToday() } });
    expect(patch.status(), await patch.text()).toBe(200);
    await page.goto(`/listings?deal=rent&q=${token}`);
    await expect(page.locator(`a[href*="${id}"]`).filter({ has: page.locator('h3') }).first().getByText('Available now')).toBeVisible({ timeout: 20_000 });
  });
});

test('the API judges the date on the IST calendar: a year for rent, five for a sale, a ready-to-move sale keeps none', async ({ request }) => {
  const headers = await authHeaders(uniqueMobile());
  const images = await uploadedListingPhotos(headers);
  const create = (data) => request.post(`${API}/me/listings`, { headers, data });
  const keep = async (res) => {
    expect(res.status(), await res.text()).toBe(201);
    const { id } = await res.json();
    created.add(id);
    return id;
  };

  await test.step('a rent more than a year away, or already past, is refused at create', async () => {
    const far = await create(RENT(images, { availableOn: istInDays(400) }));
    expect(far.status()).toBe(422);
    expect(await far.text()).toContain('within the next year');
    expect((await create(RENT(images, { availableOn: istInDays(-1) }))).status()).toBe(422);
  });

  await test.step('a rent exactly a year out is accepted and keeps no bucket', async () => {
    const id = await keep(await create(RENT(images, { availableOn: istInDays(365) })));
    const row = await rowOf(request, headers, id);
    expect(row.availableOn).toBe(istInDays(365));
    expect(row.availableFrom == null).toBe(true);
  });

  await test.step('the legacy bucket is still accepted and becomes a date', async () => {
    const id = await keep(await create(RENT(images, { availableFrom: '15' })));
    const row = await rowOf(request, headers, id);
    expect(row.availableOn).toBe(istInDays(15));
    expect(row.availableFrom).toBe('15');
  });

  await test.step('an edit may state a date already reached, and blank clears it', async () => {
    const id = await keep(await create(RENT(images, { availableOn: istInDays(10) })));
    const past = await request.patch(`${API}/me/listings/${id}`, { headers, data: { availableOn: istInDays(-3) } });
    expect(past.status(), await past.text()).toBe(200);
    const reached = await rowOf(request, headers, id);
    expect(reached.availableOn).toBe(istInDays(-3));
    expect(reached.availableFrom).toBe('now');
    const cleared = await request.patch(`${API}/me/listings/${id}`, { headers, data: { availableOn: '' } });
    expect(cleared.status(), await cleared.text()).toBe(200);
    expect((await rowOf(request, headers, id)).availableOn == null).toBe(true);
  });

  const sale = (extra) => ({
    title: `Zztest avail sale ${Date.now()}`, deal: 'buy', propertyType: 'Flat', price: 9500000, city: 'Pune',
    locality: 'Baner', bhk: 2, area: 900, images, ...extra,
  });
  await test.step('an under-construction sale may be up to five years out, not six', async () => {
    const id = await keep(await create(sale({ possession: 'under-construction', availableOn: istInDays(4 * 365) })));
    expect((await rowOf(request, headers, id)).availableOn).toBe(istInDays(4 * 365));
    const six = await create(sale({ possession: 'under-construction', availableOn: istInDays(6 * 365) }));
    expect(six.status()).toBe(422);
    expect(await six.text()).toContain('within the next 5 years');
  });

  await test.step('a ready-to-move sale carries no date at all', async () => {
    const id = await keep(await create(sale({ possession: 'ready-to-move', availableOn: istInDays(30) })));
    expect((await rowOf(request, headers, id)).availableOn == null).toBe(true);
  });
});
