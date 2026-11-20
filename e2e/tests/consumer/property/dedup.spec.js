import { expect, test } from '../../../fixtures/live.js';
import { API, authHeaders, uniqueMobile, uploadedListingPhotos } from '../../../helpers/liveAuth.js';
import { png } from '../../../helpers/listingPhotos.helper.js';


const PHOTO = 'ffff0000ffff0000';
const PHOTO_RECOMPRESSED = 'ffff0000ffff0003';

// Black/white 8×8 blocks whose server-side average hash is exactly `hex`, so the gallery holds a real file.
const hashedPng = (hex) => {
  const bits = BigInt(`0x${hex}`);
  return png(64, 64, (x, y) => ((bits >> BigInt(63 - (Math.floor(y / 8) * 8 + Math.floor(x / 8)))) & 1n ? 255 : 0));
};

async function photoHashed(hex, headers) {
  const [url] = await uploadedListingPhotos(headers, 1, { image: hashedPng(hex) });
  expect(url).toMatch(new RegExp(`-${hex}$`));
  return url;
}

async function api(method, path, headers, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
/** A fresh owner nobody else in this file shares. */
async function owner() {
  const mobile = uniqueMobile();
  return { mobile, headers: await authHeaders(mobile) };
}

const BASE_LISTING = {
  deal: 'rent',
  propertyType: 'Flat',
  price: 26000,
  city: 'Pune',
  bhk: 2,
  area: 900,
  areaUnit: 'sqft',
  furnishing: 'semi-furnished',
};

async function listing(headers, fields) {
  const created = await api('POST', '/me/listings', headers, {
    title: 'Bright 2BHK',
    locality: 'Baner',
    images: await uploadedListingPhotos(headers),
    ...BASE_LISTING,
    ...fields,
  });
  expect(created.status).toBe(201);
  return created.body.id;
}

const caseFile = (headers, id) => api('GET', `/properties/${id}/verification`, headers);

test.describe('LIVE — the cross-owner duplicate probe', () => {
  test('a stranger on the same doorway is flagged to ops, on write, without being told, and the owner never sees the finding', async () => {
    const first = await owner();
    const second = await owner();
    const admin = await authHeaders('9000000000');

    const address = `Flat 902, C Wing, Probe Heights ${Date.now()}`;
    const firstId = await listing(first.headers, { address, locality: 'Kharadi' });

    expect((await caseFile(admin, firstId)).status).toBe(404);

    const secondId = await listing(second.headers, {
      address: address.replace('Flat 902, C Wing,', 'C-902,').toUpperCase(),
      locality: 'Kharadi',
    });

    const opsView = await caseFile(admin, secondId);
    expect(opsView.status).toBe(200);
    expect(opsView.body.messages).toHaveLength(1);
    expect(opsView.body.messages[0].internal).toBe(true);
    expect(opsView.body.messages[0].body).toContain('matches an active listing by another owner');
    expect(opsView.body.messages[0].body).toContain(firstId);

    // The owner's token must 404 rather than see an empty case, and their review inbox stays silent.
    expect((await caseFile(second.headers, secondId)).status).toBe(404);
    const inbox = await api('GET', '/me/property-reviews', second.headers);
    expect(inbox.status).toBe(200);
    expect(inbox.body.content).toHaveLength(0);
  });

  test('reused photographs are caught across localities, where the address arm is blind, and the owner who posted first is not accused of copying themselves', async () => {
    const first = await owner();
    const second = await owner();
    const admin = await authHeaders('9000000000');

    const firstId = await listing(first.headers, {
      locality: 'Kothrud',
      title: 'Bright 2BHK in Kothrud',
      images: [await photoHashed(PHOTO, first.headers)],
    });

    const secondId = await listing(second.headers, {
      locality: 'Baner',
      title: 'Bright 2BHK in Baner',
      images: [await photoHashed(PHOTO_RECOMPRESSED, second.headers)],
    });

    const opsView = await caseFile(admin, secondId);
    expect(opsView.status).toBe(200);
    expect(opsView.body.messages).toHaveLength(1);
    expect(opsView.body.messages[0].internal).toBe(true);
    expect(opsView.body.messages[0].body).toContain('reuses photographs');
    expect(opsView.body.messages[0].body).toContain(firstId);
    expect((await caseFile(admin, firstId)).status).toBe(404);
  });
});
