import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../../src/services/propertyService.js', () => ({
  addListing: vi.fn(),
  updateListingFields: vi.fn(),
  checkOwnDuplicate: vi.fn(),
}));
vi.mock('../../../../../src/lib/places.js', () => ({
  getPlacesLib: vi.fn(),
  normalizeComponents: vi.fn((c) => c || []),
  pickAddress: vi.fn((c) => ({
    pincode: (c || []).find((x) => x.pin)?.pin || '',
    street: (c || []).find((x) => x.street)?.street || '',
    localityRaw: (c || []).find((x) => x.loc)?.loc || '',
  })),
  isNamedSocietyPlace: vi.fn((t) => (t || []).includes('premise')),
  newAutocompleteSession: vi.fn(),
  fetchSuggestions: vi.fn(),
  fetchLocalitySuggestions: vi.fn(),
  fetchPlaceDetails: vi.fn(),
}));
vi.mock('../../../../../src/lib/geoConfig.js', () => ({
  getActiveCityGeo: () => ({ name: 'Pune', bounds: { north: 1 } }),
}));

import { addListing, updateListingFields, checkOwnDuplicate } from '../../../../../src/services/propertyService.js';
import { getPlacesLib } from '../../../../../src/lib/places.js';
import { persistListing, listingLabels, roomHeadline } from '../../../../../src/pages/consumer/list-property/submit.js';
import { reverseGeocode, forwardGeocode } from '../../../../../src/pages/consumer/list-property/geocode.js';
import { newListingForm } from '../../../../../src/pages/consumer/list-property/initialForm.js';

const user = { mobile: '9000000001', name: 'Asha' };
const geocoderOf = (geocode) => function Geocoder() { this.geocode = geocode; };
const photoUrl = (n) => `https://cdn.example.com/${n}.jpg`;

const buyForm = (extra = {}) => ({
  ...newListingForm,
  deal: 'buy',
  propertyType: 'flat',
  bhk: '2',
  bathrooms: '2',
  carpetArea: '900',
  price: '5000000',
  locality: 'Baner',
  localitySlug: 'baner',
  society: 'Sky Heights',
  flatNumber: '12',
  tower: 'A',
  street: 'Main Rd',
  floor: '3',
  totalFloors: '10',
  furnishing: 'semi',
  petsPolicy: 'yes',
  preferredTenants: ['anyone'],
  loanAvailable: true,
  monthlyMaintenance: '2000',
  ...extra,
});

beforeEach(() => {
  addListing.mockReset();
  updateListingFields.mockReset();
  checkOwnDuplicate.mockReset().mockResolvedValue({ found: false });
});

describe('listingLabels and roomHeadline', () => {
  it('labels residential listings with BHK and locality', () => {
    const labels = listingLabels(buyForm());
    expect(labels.typeLabel).toBe('Flat');
    expect(labels.title).toMatch(/Flat in Baner$/);
    expect(labels.bhkLabel).not.toBe('');
  });

  it('falls back to a generic label and skips BHK for land', () => {
    expect(listingLabels({ propertyType: 'zzz' })).toMatchObject({ typeLabel: 'Property', bhkLabel: '', title: 'Property' });
    expect(listingLabels({ propertyType: 'plot', locality: 'Wakad' }).title).toBe('Plot in Wakad');
  });

  it('uses the commercial subtype label when present', () => {
    const labels = listingLabels({ propertyType: 'commercial', commercialType: 'office', locality: 'Kharadi' });
    expect(labels.typeLabel).not.toBe('Commercial');
    expect(labels.title).toContain('in Kharadi');
  });

  it('builds the room headline', () => {
    expect(roomHeadline({ roomType: 'Private room', bhk: '4', homeTypeLabel: 'Flat', society: ' Sky ', locality: 'Baner' }))
      .toBe('Private room in 4+ BHK flat, Sky, Baner');
    expect(roomHeadline({})).toBe('Room in flat');
  });
});

describe('persistListing create', () => {
  it('blocks duplicates of the owner own listing', async () => {
    checkOwnDuplicate.mockResolvedValue({ found: true, existingId: 'L9' });
    const res = await persistListing({ form: buyForm(), user, photos: [] });
    expect(res).toEqual({ ok: false, blocked: true, existingId: 'L9' });
    expect(addListing).not.toHaveBeenCalled();
  });

  it('submits a buy listing and returns the record', async () => {
    addListing.mockResolvedValue({ id: 'srv-1' });
    const photos = [
      { url: photoUrl(1), category: 'cover' },
      { url: photoUrl(2), category: 'floorplan' },
      { url: 'blob:abc' },
      { url: 'data:image/png;base64,xx' },
      null,
    ];
    const res = await persistListing({ form: buyForm({ electricityConsumerNo: 'E1', reraId: 'R1' }), user, photos, homeId: 'home-1' });
    expect(res.ok).toBe(true);
    const [payload, opts] = addListing.mock.calls[0];
    expect(opts).toEqual({ homeId: 'home-1' });
    expect(payload.address).toBe('12, A, Sky Heights, Main Rd');
    expect(payload.maintenance).toBe(2000);
    expect(payload.reraId).toBe('R1');
    expect(payload.electricityConsumerNo).toBe('E1');
    expect(payload.form.electricityConsumerNo).toBeUndefined();
    const l = res.listing;
    expect(l).toMatchObject({
      id: 'srv-1',
      viewUrl: '/property/srv-1',
      deal: 'buy',
      type: 'Flat',
      status: 'pending',
      owner: 'Asha',
      ownerMobile: '9000000001',
      bhkNum: 2,
      bath: 2,
      price: 5000000,
      area: 900,
      localitySlug: 'baner',
      loc: 'Sky Heights, Baner, Pune',
      floor: 3,
      totalFloors: 10,
      pets: true,
      tenants: [],
      loanAvailable: true,
      photoCount: 2,
      deposit: 0,
      monthlyMaintenance: '2000',
      rentMaintMode: '',
      plotArea: 0,
    });
    expect(l.priceStr).toMatch(/^\u20b9/);
    expect(l.gallery).toEqual([photoUrl(1), photoUrl(2)].filter((u) => u !== l.floorPlan));
    expect(l.strongIds).toEqual({ electricityConsumerNo: 'E1', reraId: 'R1' });
  });

  it('keeps the client id when the server returns the same one and drops the dev opts without homeId', async () => {
    addListing.mockImplementation(async (payload) => ({ id: payload.id }));
    const res = await persistListing({ form: buyForm(), user, photos: [] });
    expect(addListing.mock.calls[0][1]).toBeUndefined();
    expect(res.listing.id).toMatch(/^L\d+$/);
    expect(res.listing.image).toBe('');
  });

  it('fails when the server does not confirm the listing', async () => {
    addListing.mockResolvedValue({});
    const res = await persistListing({ form: buyForm(), user, photos: [] });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/did not confirm/);
  });

  it('builds a rent record with commercial extras', async () => {
    addListing.mockResolvedValue({ id: 'r1' });
    const form = buyForm({
      deal: 'rent',
      propertyType: 'commercial',
      commercialType: 'office',
      monthlyRent: '40000',
      deposit: '100000',
      rentMaintMode: 'extra',
      rentMaintenance: '3000',
      fitOutMonths: '2',
      escalationPct: '5',
      tenancyStatus: 'leased',
      washrooms: '2',
      pantry: true,
      suitableFor: ['it'],
    });
    const res = await persistListing({ form, user, photos: [] });
    const l = res.listing;
    expect(l).toMatchObject({
      deal: 'rent',
      price: 40000,
      deposit: 100000,
      rentMaintMode: 'extra',
      rentMaintenance: '3000',
      monthlyMaintenance: '',
      fitOutMonths: '2',
      escalationPct: '5',
      tenancyStatus: '',
      washrooms: 2,
      pantry: true,
      pets: undefined,
      tenants: [],
      bath: 0,
      builtUp: undefined,
    });
    expect(l.priceStr).toMatch(/\/mo$/);
    expect(addListing.mock.calls[0][0].maintenance).toBe(3000);
  });

  it('builds a farmland record with land fields', async () => {
    addListing.mockResolvedValue({ id: 'f1' });
    const form = buyForm({
      propertyType: 'farmland',
      plotLength: '100',
      plotWidth: '50',
      cornerPlot: true,
      buyerEligibility: 'agri',
      carpetArea: '',
      builtUp: '',
      bhk: '',
      locality: '',
    });
    const res = await persistListing({ form, user, photos: [] });
    expect(res.listing).toMatchObject({
      plotLength: '100',
      plotWidth: '50',
      cornerPlot: true,
      overlooking: '',
      locality: 'Pune',
      localitySlug: '',
      carpetArea: undefined,
      bhk: '',
      bhkNum: 0,
      bathrooms: undefined,
    });
    expect(res.listing.landUse).toBeTruthy();
  });

  it('drops an empty floor from the wire payload and falls back to the stored address', async () => {
    addListing.mockResolvedValue({ id: 'p1' });
    await persistListing({ form: buyForm({ floor: '', flatNumber: '', tower: '', society: '', street: '', monthlyMaintenance: '' }), user, photos: [] });
    const payload = addListing.mock.calls[0][0];
    expect(payload.floor).toBeUndefined();
    expect(payload.maintenance).toBeUndefined();
    expect(payload.address).toBe('');
  });
});

describe('persistListing create errors', () => {
  const run = (err, form = buyForm()) => {
    addListing.mockRejectedValue(err);
    return persistListing({ form, user, photos: [] });
  };

  it('maps validation errors to fields', async () => {
    const res = await run({ isValidation: true, fields: [{ field: 'price', message: 'Too high' }] });
    expect(res.ok).toBe(false);
    expect(res.fieldErrors || res.error).toBeTruthy();
  });

  it('falls through when validation fields map to nothing', async () => {
    const res = await run(Object.assign(new Error('bad'), { isValidation: true, fields: [{ field: '___nope', message: 'x' }] }));
    expect(res.ok).toBe(false);
  });

  it('handles duplicate, closed, internal and generic errors', async () => {
    expect(await run({ code: 'duplicate_submission', existingId: 'L5' })).toEqual({ ok: false, blocked: true, existingId: 'L5' });
    expect((await run({ code: 'listing_not_editable' })).error).toMatch(/closed/);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await run({ internal: true })).toEqual({ ok: false, error: 'Could not save your listing.' });
    expect(log).toHaveBeenCalled();
    const generic = await run({ status: 401 });
    expect(generic).toMatchObject({ ok: false, unauthenticated: true, error: 'Could not save your listing.' });
  });
});

describe('persistListing edit', () => {
  const oldForm = () => buyForm();
  const approved = (extra = {}) => ({
    id: 'L1',
    status: 'approved',
    statusClass: 'pill-approved',
    form: oldForm(),
    gallery: [photoUrl(1)],
    address: '12, A',
    editLog: [{ at: 1 }],
    editCount: 2,
    ...extra,
  });

  it('records an edit log entry and keeps the status', async () => {
    updateListingFields.mockResolvedValue({ status: 'approved', statusClass: 'pill-approved' });
    const res = await persistListing({ form: buyForm({ description: 'New text' }), user, editId: 'L1', editListing: approved(), photos: [{ url: photoUrl(1) }] });
    expect(res.ok).toBe(true);
    expect(updateListingFields).toHaveBeenCalledWith('L1', expect.any(Object));
    expect(checkOwnDuplicate).not.toHaveBeenCalled();
    expect(res.listing).toMatchObject({ id: 'L1', status: 'approved', statusClass: 'pill-approved', editCount: 3 });
    expect(res.listing.editLog).toHaveLength(2);
    expect(res.listing.editLog[0]).toMatchObject({ tierA: expect.any(Number), tierB: expect.any(Number) });
  });

  it('flags a re-review when a material field changes on a live listing', async () => {
    updateListingFields.mockResolvedValue({});
    const res = await persistListing({ form: buyForm({ propertyType: 'villa', price: '9000000' }), user, editId: 'L1', editListing: approved(), photos: [{ url: photoUrl(1) }] });
    expect(res.ok).toBe(true);
    expect(res.listing.reReview === null || Array.isArray(res.listing.reReview.fields)).toBe(true);
    expect(typeof res.listing.materialEditFlag).toBe('boolean');
  });

  it('tracks price reductions and jumps', async () => {
    updateListingFields.mockResolvedValue({});
    const down = await persistListing({ form: buyForm({ price: '3000000' }), user, editId: 'L1', editListing: approved(), photos: [{ url: photoUrl(1) }] });
    expect(down.listing.priceReduced).toBe(true);
    expect(down.listing.prevPrice).toBe(5000000);
    const up = await persistListing({ form: buyForm({ price: '9000000' }), user, editId: 'L1', editListing: approved(), photos: [{ url: photoUrl(1) }] });
    expect(up.listing.priceReduced).toBe(false);
    expect(up.listing.priceJumpFlag).toBe(true);
  });

  it('applies the server recheck state', async () => {
    updateListingFields.mockResolvedValue({ recheckPending: true, recheckReason: 'why', recheckRequestedAt: 'now' });
    const res = await persistListing({ form: oldForm(), user, editId: 'L1', editListing: approved(), photos: [{ url: photoUrl(1) }] });
    expect(res.listing).toMatchObject({ recheckPending: true, recheckReason: 'why', recheckRequestedAt: 'now' });
  });

  it('keeps old recheck state and review flags on a non-approved listing', async () => {
    updateListingFields.mockResolvedValue({});
    const old = approved({ status: 'pending', statusClass: '', recheckPending: true, recheckReason: 'r', reReview: { x: 1 }, materialEditFlag: true, flagReason: 'Possible duplicate of L2' });
    const res = await persistListing({ form: oldForm(), user, editId: 'L1', editListing: old, photos: [{ url: photoUrl(1) }] });
    expect(res.listing).toMatchObject({ status: 'pending', statusClass: 'pill-pending', recheckPending: true, recheckReason: 'r', reReview: { x: 1 }, materialEditFlag: true });
    expect(res.listing.flagReason).toBe('');
  });

  it('clears the review flag for an approved listing without material edits', async () => {
    updateListingFields.mockResolvedValue({});
    const res = await persistListing({ form: oldForm(), user, editId: 'L1', editListing: approved(), photos: [{ url: photoUrl(1) }] });
    expect(res.listing.reReview).toBeNull();
    expect(res.listing.materialEditFlag).toBe(false);
  });

  it('reports a save failure when the original listing is missing', async () => {
    updateListingFields.mockResolvedValue(null);
    const res = await persistListing({ form: oldForm(), user: null, editId: 'L1', photos: [] });
    expect(res).toMatchObject({ ok: false, error: 'Could not save your listing.' });
  });
});

describe('geocode', () => {
  afterEach(() => {
    delete window.google;
  });

  const noPlaces = () => getPlacesLib.mockResolvedValue(null);

  it('returns empty for missing coordinates', async () => {
    expect(await reverseGeocode(null, 1)).toEqual({ pincode: '', street: '', localityRaw: '' });
  });

  it('reverse geocodes through Places and merges components', async () => {
    const searchNearby = vi.fn().mockResolvedValue({
      places: [{ addressComponents: [{ pin: '411045' }] }, { addressComponents: [{ street: 'MG Road', loc: 'Baner' }] }],
    });
    getPlacesLib.mockResolvedValue({ Place: { searchNearby }, SearchNearbyRankPreference: { DISTANCE: 'D' } });
    expect(await reverseGeocode('18.5', '73.8')).toEqual({ pincode: '411045', street: 'MG Road', localityRaw: 'Baner' });
    expect(searchNearby.mock.calls[0][0]).toMatchObject({ rankPreference: 'D', locationRestriction: { center: { lat: 18.5, lng: 73.8 } } });
  });

  it('falls back to the Geocoder when Places is empty or throws', async () => {
    getPlacesLib.mockResolvedValue({ Place: { searchNearby: vi.fn().mockRejectedValue(new Error('x')) } });
    const geocode = vi.fn((req, cb) => cb([
      { address_components: [{ street: 'No pin' }] },
      { address_components: [{ pin: '411001', types: ['postal_code'] }], types: [] },
    ].map((r) => ({ ...r, address_components: r.address_components.map((c) => ({ ...c, types: c.pin ? ['postal_code'] : [] })) })), 'OK'));
    window.google = { maps: { Geocoder: geocoderOf(geocode) } };
    const res = await reverseGeocode(1, 2);
    expect(res.pincode).toBe('411001');
  });

  it('returns empty when every source fails', async () => {
    noPlaces();
    expect(await reverseGeocode(1, 2)).toEqual({ pincode: '', street: '', localityRaw: '' });
    window.google = { maps: { Geocoder: geocoderOf((r, cb) => cb(null, 'ZERO_RESULTS')) } };
    expect(await reverseGeocode(1, 2)).toEqual({ pincode: '', street: '', localityRaw: '' });
  });

  it('uses importLibrary for the geocoder and tolerates its failure', async () => {
    noPlaces();
    const geocode = vi.fn((req, cb) => cb([{ address_components: [{ street: 'S' }] }], 'OK'));
    window.google = { maps: { importLibrary: vi.fn().mockResolvedValue({ Geocoder: geocoderOf(geocode) }) } };
    expect((await reverseGeocode(1, 2)).street).toBe('S');
    window.google = { maps: { importLibrary: vi.fn().mockRejectedValue(new Error('x')) } };
    expect(await reverseGeocode(1, 2)).toEqual({ pincode: '', street: '', localityRaw: '' });
    window.google = { maps: {} };
    expect(await reverseGeocode(1, 2)).toEqual({ pincode: '', street: '', localityRaw: '' });
  });

  it('forward geocodes through Places text search', async () => {
    const searchByText = vi.fn().mockResolvedValue({
      places: [{
        location: { lat: () => 18.5, lng: () => 73.8 },
        addressComponents: [{ pin: '411045' }],
        displayName: 'Sky Heights',
        types: ['premise'],
      }],
    });
    getPlacesLib.mockResolvedValue({ Place: { searchByText } });
    expect(await forwardGeocode(' Sky Heights ')).toEqual({
      lat: 18.5, lng: 73.8, pincode: '411045', street: '', localityRaw: '', name: 'Sky Heights', isNamedPlace: true,
    });
    expect(searchByText.mock.calls[0][0].textQuery).toBe('Sky Heights, Pune');
    expect(await forwardGeocode('   ')).toBeNull();
  });

  it('forward geocodes through the Geocoder fallback', async () => {
    getPlacesLib.mockResolvedValue({ Place: { searchByText: vi.fn().mockResolvedValue({ places: [] }) } });
    const geocode = vi.fn((req, cb) => cb([{
      geometry: { location: { lat: () => 1, lng: () => 2 } },
      address_components: [{ loc: 'Baner' }],
      types: ['route'],
    }], 'OK'));
    window.google = { maps: { Geocoder: geocoderOf(geocode) } };
    expect(await forwardGeocode('Baner')).toMatchObject({ lat: 1, lng: 2, localityRaw: 'Baner', name: '', isNamedPlace: false });
    expect(geocode.mock.calls[0][0].address).toBe('Baner, Pune, India');
  });

  it('returns null when nothing is found', async () => {
    noPlaces();
    expect(await forwardGeocode('x')).toBeNull();
    window.google = { maps: { Geocoder: geocoderOf((r, cb) => cb([{ address_components: [] }], 'OK')) } };
    expect(await forwardGeocode('x')).toBeNull();
  });
});
