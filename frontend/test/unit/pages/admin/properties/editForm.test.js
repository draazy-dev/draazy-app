import { describe, expect, it } from 'vitest';
import {
  AGE_OPTS, amenityOpts, basicsOf, detailsOf, editPatch, isLand,
} from '../../../../../src/pages/admin/properties/editForm.js';

const listing = {
  id: 'L1', title: 'Sunny 2BHK', price: 25000, area: 900, bhkNum: 2, type: 'Flat', locality: 'Baner', localitySlug: 'baner', deal: 'rent', status: 'approved',
};

const editFrom = (l, full) => ({ ...basicsOf(l), ...(full ? detailsOf(full) : {}), _ref: l, _full: full });

describe('isLand / amenityOpts', () => {
  it('detects plot and farm types', () => {
    expect(isLand('Open Plot')).toBe(true);
    expect(isLand('Farm Land')).toBe(true);
    expect(isLand('Flat')).toBe(false);
    expect(isLand(undefined)).toBe(false);
  });

  it('merges current amenities with the catalogue without duplicates', () => {
    const opts = amenityOpts(['Zip line']);
    expect(opts).toContain('Zip line');
    expect(new Set(opts).size).toBe(opts.length);
    expect(amenityOpts()).not.toContain('Zip line');
    expect(AGE_OPTS.length).toBeGreaterThan(0);
  });
});

describe('basicsOf / detailsOf', () => {
  it('defaults missing basics', () => {
    expect(basicsOf({ id: 1 })).toEqual({
      id: 1, title: '', price: '', area: '', bhk: '', type: '', locality: '', localitySlug: '', deal: 'buy', status: 'pending',
    });
    expect(basicsOf({ id: 1, bhkNum: 0 }).bhk).toBe('0');
  });

  it('maps a full listing to form strings', () => {
    const d = detailsOf({
      carpetArea: 500, floor: 0, totalFloors: 10, bath: 2, parkingSpaces: 1, ageYears: 12, negotiable: true, pets: false,
      deposit: 100000, tenants: ['family'], amenities: ['Lift'], electricityConsumerNo: '123',
    });
    expect(d).toMatchObject({
      carpetArea: '500', floor: 'Ground', totalFloors: '10', bathrooms: '2', parking: '1', age: '10-15', negotiable: 'yes', pets: 'no',
      deposit: '100000', tenants: ['family'], amenities: ['Lift'], electricityNo: '123', maintenance: '',
    });
  });

  it('bands ages', () => {
    const age = (ageYears) => detailsOf({ ageYears }).age;
    expect([age(null), age(''), age(0), age(1), age(5), age(10), age(15)]).toEqual(['', '', 'new', '1-5', '5-10', '10-15', '15+']);
  });

  it('maps unknown yes/no to an empty string', () => {
    expect(detailsOf({}).negotiable).toBe('');
    expect(detailsOf({}).pets).toBe('');
  });
});

describe('editPatch basics validation', () => {
  it.each([
    [{ title: '  ' }, 'Title is required'],
    [{ price: '0' }, 'Enter a valid price'],
    [{ price: 'abc' }, 'Enter a valid price'],
    [{ area: '-3' }, 'Area must be a positive number'],
    [{ locality: ' ' }, 'Locality is required'],
    [{ bhk: '1.5' }, 'Configuration must be a whole number of bedrooms'],
    [{ bhk: '-1' }, 'Configuration must be a whole number of bedrooms'],
  ])('rejects %j', (override, error) => {
    expect(editPatch({ ...editFrom(listing), ...override })).toEqual({ error });
  });

  it('returns an empty patch when nothing changed', () => {
    expect(editPatch(editFrom(listing))).toEqual({ patch: {} });
  });

  it('includes only changed basics', () => {
    const edit = {
      ...editFrom(listing), title: ' New title ', price: '30000', area: '1000', bhk: '3', type: 'Villa', deal: 'buy',
    };
    expect(editPatch(edit)).toEqual({
      patch: { title: 'New title', price: 30000, area: 1000, bhk: 3, type: 'Villa', deal: 'buy' },
    });
  });

  it('changes locality together with its slug', () => {
    const patch = editPatch({ ...editFrom(listing), locality: 'Aundh', localitySlug: 'aundh' }).patch;
    expect(patch).toEqual({ locality: 'Aundh', localitySlug: 'aundh' });
    expect(editPatch({ ...editFrom(listing), localitySlug: 'baner-2' }).patch).toEqual({ locality: 'Baner', localitySlug: 'baner-2' });
  });

  it('treats a missing _ref as an empty listing', () => {
    expect(editPatch({ ...basicsOf({ id: 1 }), title: 'T', price: '10', locality: 'L' }).patch).toEqual({
      title: 'T', price: 10, locality: 'L',
    });
  });
});

describe('editPatch details', () => {
  const full = {
    carpetArea: 500, floor: 2, totalFloors: 10, furnishing: 'semi', reraId: 'P12345678901', pincode: '411045',
    address: 'Old address', maintenance: 1000, tenants: ['family'], amenities: ['Lift'], desc: 'Old', pets: true,
    availableOn: '2026-01-01', formDetails: { flatNumber: '4', tower: 'A', landmark: 'Temple' },
  };
  const edit = (override) => ({ ..._base, ...override });
  const _base = editFrom(listing, full);

  it('is empty when unchanged', () => {
    expect(editPatch(_base)).toEqual({ patch: {} });
  });

  it.each([
    [{ carpetArea: '0' }, 'Carpet area must be above zero'],
    [{ bathrooms: '-1' }, 'Bathrooms must be zero or more'],
    [{ floor: '1.5' }, 'Floor must be Ground or a whole number'],
    [{ maintenance: '-5' }, 'Maintenance must be zero or more'],
    [{ reraId: 'abc' }, 'RERA id is P followed by 11 digits'],
    [{ pincode: '12' }, 'Pincode must be 6 digits'],
  ])('rejects %j', (override, error) => {
    expect(editPatch(edit(override))).toEqual({ error });
  });

  it('collects changed numeric, text and list fields', () => {
    const { patch } = editPatch(edit({
      carpetArea: '600', parking: '2', floor: 'Ground', maintenance: '', reraId: ' p12345678902 ', pincode: '411001',
      furnishing: 'furnished', electricityNo: ' 99 ', negotiable: 'no', pets: '', availableOn: '2026-02-01',
      tenants: ['company'], amenities: ['Lift', 'Gym'], desc: ' New ', address: ' New address ',
    }));
    expect(patch).toMatchObject({
      carpetArea: 600, parkingSpaces: 2, floor: 0, clearMaintenance: true, reraId: 'P12345678902', pincode: '411001',
      furnishing: 'furnished', electricityConsumerNo: '99', negotiable: false, pets: null, available: '2026-02-01',
      tenants: ['company'], amenities: ['Lift', 'Gym'], desc: 'New', address: 'New address',
    });
  });

  it('sets maintenance and ignores empty numeric changes', () => {
    expect(editPatch(edit({ maintenance: '1500' })).patch).toEqual({ maintenance: 1500 });
    expect(editPatch(edit({ totalFloors: '' })).patch).toEqual({});
  });

  it('keeps unordered list edits as no change', () => {
    const multi = editFrom(listing, { ...full, tenants: ['family', 'company'] });
    expect(editPatch({ ...multi, tenants: ['company', 'family'] }).patch).toEqual({});
  });

  it('drops address parts from formDetails when the address changes', () => {
    const { patch } = editPatch(edit({ address: 'Somewhere else' }));
    expect(patch.address).toBe('Somewhere else');
    expect(patch.formDetails).toEqual({ landmark: 'Temple' });
  });

  it('leaves formDetails out when the listing has none', () => {
    const bare = editFrom(listing, { ...full, formDetails: {} });
    expect(editPatch({ ...bare, address: 'x' }).patch).toEqual({ address: 'x' });
  });

  it('allows clearing RERA and pincode', () => {
    expect(editPatch(edit({ reraId: '', pincode: '' })).patch).toEqual({ reraId: '', pincode: '' });
  });
});
