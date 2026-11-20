import { ACTORS, expect, test } from '../../fixtures/live.js';
import { API, authHeaders, uniqueMobile, uploadedListingPhotos } from '../../helpers/liveAuth.js';
import { call, newListing } from '../../helpers/monetisation.js';
import { rejectListing } from '../../helpers/moderation.js';

const created = new Set();

async function listingWithPhotos(count) {
  const owner = uniqueMobile();
  const images = await uploadedListingPhotos(await authHeaders(owner), count);
  const listing = await newListing(owner, { title: 'Zztest photo takedown', images });
  created.add(listing.id);
  return { owner, id: listing.id, title: listing.title, images };
}

const takedown = (id, body, as = ACTORS.admin) => call('POST', `/properties/${id}/photos/takedown`, as, body);

test.afterEach(async ({ request }) => {
  const headers = await authHeaders(ACTORS.admin);
  for (const id of created) {
    await rejectListing(request, id, headers, { reasonCode: 'other', reason: 'Zztest cleanup' });
  }
  created.clear();
});

test('staff take one photo off: it leaves the gallery and cover, the owner is told, and the row is audited', async () => {
  const { owner, id, images } = await listingWithPhotos(2);

  const res = await takedown(id, { photo: images[0], reason: 'people_visible' });
  expect(res.status, JSON.stringify(res.json)).toBe(200);
  expect(res.json.images).toEqual([images[1]]);
  expect(res.json.coverImage).toBe(images[1]);

  const inbox = await call('GET', '/notifications?size=50', owner);
  expect(JSON.stringify(inbox.json)).toContain('A photo was removed from your listing');
  expect(JSON.stringify(inbox.json)).toContain(`/list-property?edit=${id}&step=photos`);

  const audit = await call('GET', '/admin/audit-log?size=100', ACTORS.admin);
  expect(JSON.stringify(audit.json)).toContain('listing.photo.takedown');
});

test('taking the last photo sends the listing back for changes', async () => {
  const { id, images } = await listingWithPhotos(1);

  const res = await takedown(id, { photo: images[0], reason: 'not_the_property' });
  expect(res.status, JSON.stringify(res.json)).toBe(200);
  expect(res.json.images).toEqual([]);

  const review = await call('GET', `/properties/${id}/verification`, ACTORS.admin);
  expect(review.json.status).toBe('needs_info');
});

test('a bad reason is a 400, an unknown photo a 404, and a buyer or the listing’s own staff owner a 403', async () => {
  const { id, images } = await listingWithPhotos(2);
  expect((await takedown(id, { photo: images[0], reason: 'because' })).status).toBe(400);
  expect((await takedown(id, { photo: `${images[0]}-gone`, reason: 'other' })).status).toBe(404);
  expect((await takedown(id, { photo: images[0], reason: 'other' }, ACTORS.buyer)).status).toBe(403);

  const ownImages = await uploadedListingPhotos(await authHeaders(ACTORS.admin), 2);
  const own = await newListing(ACTORS.admin, { title: 'Zztest own photo', images: ownImages });
  created.add(own.id);
  expect((await takedown(own.id, { photo: ownImages[0], reason: 'other' })).status).toBe(403);
});

test('the review modal removes a photo after asking why, with one toast', async ({ page, login }) => {
  const { id, images } = await listingWithPhotos(2);

  await login.asAdmin();
  await page.goto(`/admin/properties?review=${id}`);
  const modal = page.getByRole('dialog');
  await expect(modal.getByTestId('remove-photo')).toHaveCount(2);

  await modal.getByTestId('remove-photo').first().click();
  await expect(modal.getByTestId('remove-photo-confirm')).toBeDisabled();
  await modal.getByTestId('remove-photo-reason').selectOption('contact_info');
  await modal.getByTestId('remove-photo-confirm').click();

  await expect(page.getByText('Photo removed')).toHaveCount(1);
  await expect(modal.getByTestId('remove-photo')).toHaveCount(1);
  const listing = await call('GET', `/admin/properties/${id}`, ACTORS.admin);
  expect(listing.json.images).toEqual([images[1]]);
});

test('Edit listing offers Remove photo too', async ({ page, login }) => {
  const { title } = await listingWithPhotos(2);

  await login.asAdmin();
  await page.goto('/admin/properties');
  await page.getByPlaceholder('Title, owner, mobile or ID').first().fill(title);
  const row = page.getByTestId('queue-row').filter({ hasText: title });
  await expect(row).toBeVisible({ timeout: 20000 });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();

  const modal = page.getByRole('dialog', { name: 'Edit listing' });
  await modal.getByRole('tab', { name: 'Photos' }).click();
  await expect(modal.getByTestId('remove-photo')).toHaveCount(2);
  await modal.getByTestId('remove-photo').first().click();
  await modal.getByTestId('remove-photo-reason').selectOption('other');
  await modal.getByTestId('remove-photo-confirm').click();
  await expect(modal.getByTestId('remove-photo')).toHaveCount(1);
});
