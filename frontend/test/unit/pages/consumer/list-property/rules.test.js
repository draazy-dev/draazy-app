import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from '../../../../../src/pages/consumer/list-property/constants.js';
import * as P from '../../../../../src/pages/consumer/list-property/editPolicy.js';
import * as V from '../../../../../src/pages/consumer/list-property/validation.js';

describe('list-property constants', () => {
  it('classifies property types', () => {
    expect(C.groupOf('flat')).toBe('residential');
    expect(C.groupOf('unknown')).toBe('residential');
    expect(C.isResidentialType('villa')).toBe(true);
    expect(C.isCommercialType('commercial')).toBe(true);
    expect(C.isLandType('farmland')).toBe(true);
    expect(C.isLandType('flat')).toBe(false);
    expect(C.isHouseType('independent')).toBe(true);
    expect(C.isHouseType('flat')).toBe(false);
    expect(C.copyContextOf('openplot')).toBe('land');
    expect(C.copyContextOf('commercial')).toBe('space');
    expect(C.copyContextOf('flat')).toBeUndefined();
    expect(C.leaseKindOf('commercial')).toBe('commercial');
    expect(C.leaseKindOf('openplot')).toBe('land');
    expect(C.leaseKindOf('flat')).toBe('residential');
    expect(C.homeTypeLabelFor('nope')).toBe('');
    expect(C.homeTypeLabelFor(C.HOME_TYPE_PILLS[0][0])).toBe(C.HOME_TYPE_PILLS[0][1]);
    expect(C.commercialSubtypeOptions()).toBe(C.COMMERCIAL_SUBTYPES);
    expect(C.commercialLabelOf(C.COMMERCIAL_SUBTYPES[0].value)).toBe(C.COMMERCIAL_SUBTYPES[0].label);
    expect(C.commercialLabelOf('zzz')).toBe('');
  });

  it('moves legacy in-flat amenities into furniture', () => {
    const listing = { amenities: ['Gym', 'AC', 'Wardrobes'], furniture: ['Bed', 'AC'] };
    expect(C.withInFlatAsFurniture(listing)).toEqual({ amenities: ['Gym'], furniture: ['Bed', 'AC', 'Wardrobe'] });
    expect(C.withInFlatAsFurniture({ amenities: ['Gym'] })).toEqual({ amenities: ['Gym'] });
    const bare = {};
    expect(C.withInFlatAsFurniture(bare)).toBe(bare);
    expect(C.withInFlatAsFurniture({ amenities: ['Geyser'] }).furniture).toEqual(['Geyser']);
  });

  it('chooses badge documents by deal and type', () => {
    expect(C.badgeDocsFor('rent', 'flat')[0].key).toBe('Electricity Bill');
    expect(C.badgeDocsFor('buy', 'flat').at(-1).key).toBe('Electricity Bill');
    expect(C.badgeDocsFor('buy', 'farmland').map((d) => d.key)).toEqual(['7/12 Extract', '8A Extract']);
    expect(C.badgeDocsFor('rent', 'openplot')).toHaveLength(3);
    expect(C.badgeDocsFor('buy', 'plot')).toHaveLength(2);
    expect(C.badgeDocumentProgress('rent', 'flat', { 'Electricity Bill': 'x' })).toBe(1);
    expect(C.badgeDocumentProgress('rent', 'flat', {})).toBe(0);
    expect(C.badgeDocumentProgress('buy', 'flat', { 'Electricity Bill': 'x' })).toBe(0);
    expect(C.badgeDocumentProgress('buy', 'flat', { 'Index II': 'x' })).toBe(1);
    expect(C.badgeDocumentProgress('buy', 'flat')).toBe(0);
  });

  it('chooses document checklists', () => {
    expect(C.docsFor('buy', 'flat')).toBe(C.saleDocs);
    expect(C.docsFor('rent', 'flat')).toBe(C.rentDocs);
    expect(C.docsFor('buy', 'farmland')).toBe(C.farmSaleDocs);
    expect(C.docsFor('buy', 'openplot')).toBe(C.plotSaleDocs);
    expect(C.docsFor('rent', 'farmland')).toBe(C.farmRentDocs);
    expect(C.docsFor('rent', 'openplot')).toBe(C.plotRentDocs);
    expect(C.docsFor('buy', 'commercial', 'shop').length).toBeGreaterThanOrEqual(C.docsFor('buy', 'commercial').length);
    expect(C.docsFor('rent', 'commercial', 'warehouse').length).toBeGreaterThan(0);
  });

  it('maps land use and units', () => {
    expect(C.landUseFor('flat', 'Residential')).toBeUndefined();
    expect(C.landUseFor('farmland', 'x')).toBe('agricultural');
    expect(C.landUseFor('openplot', 'Industrial')).toBe('industrial');
    expect(C.landUnitOptionsFor('farmland')).toBe(C.farmUnitOptions);
    expect(C.landUnitOptionsFor('openplot')).toBe(C.plotUnitOptions);
    expect(C.defaultAreaUnitFor('farmland')).toBe('guntha');
    expect(C.defaultAreaUnitFor('flat')).toBe('sqft');
    expect(C.areaRangeFor('openplot', 'acre')).toEqual([0.1, 100]);
    expect(C.areaRangeFor('openplot', 'zzz')).toEqual([1, 1000000]);
    expect(C.areaRangeFor('flat', 'acre')).toEqual([1, 1000000]);
  });

  it('derives commercial profiles', () => {
    expect(C.commercialProfileOf('shop')).toBe('retail');
    expect(C.commercialProfileOf('industrial')).toBe('industrial');
    expect(C.commercialProfileOf('office')).toBe('workspace');
    expect(C.commercialProfileOf('')).toBeNull();
    expect(C.commercialProfileFromType('')).toBe('workspace');
    expect(C.commercialProfileFromType('Fancy Mall Unit')).toBe('retail');
    expect(C.commercialProfileFromType('old godown')).toBe('industrial');
    expect(C.commercialProfileFromType('coworking')).toBe('workspace');
    C.COMMERCIAL_SUBTYPES.forEach((s) => {
      expect(C.commercialProfileFromType(s.value)).toBe(C.commercialProfileOf(s.value));
      expect(C.commercialProfileFromType(s.label)).toBe(C.commercialProfileOf(s.value));
    });
    expect(C.fixturesFor('shop')).toBe(C.COMMERCIAL_FIXTURES.retail);
    expect(C.fixturesFor('')).toEqual([]);
    expect(C.suitableForFor('warehouse')).toEqual(['Warehouse', 'Showroom']);
    expect(C.commercialSpecsFor('warehouse')).toHaveLength(4);
    expect(C.commercialSpecsFor('')).toEqual([]);
    expect(C.COMMERCIAL_SPEC_KEYS).toContain('dockCount');
  });

  it('chooses photo categories and amenities', () => {
    expect(C.photoCategoriesFor('flat')).toContain('Kitchen');
    expect(C.photoCategoriesFor('farmland')).toContain('Water Source');
    expect(C.photoCategoriesFor('openplot')).toContain('Layout Plan');
    expect(C.photoCategoriesFor('commercial', 'shop')).toContain('Signage');
    expect(C.photoCategoriesFor('commercial', '')).toEqual([]);
    expect(C.keyPhotoCategoriesFor('flat')).toHaveLength(4);
    expect(C.keyPhotoCategoriesFor('farmland')).toContain('Boundary');
    expect(C.keyPhotoCategoriesFor('openplot')).toContain('Corner / Boundary');
    expect(C.keyPhotoCategoriesFor('commercial', 'warehouse')).toContain('Loading Bay');
    expect(C.amenitiesFor('openplot')).toEqual([]);
    expect(C.amenitiesFor('flat').length).toBeGreaterThan(0);
    expect(C.amenitiesFor('commercial', 'warehouse').length).toBeGreaterThan(0);
    expect(C.amenitiesFor('commercial', '')).toEqual([]);
    expect(C.amenitiesFor('commercial', 'shop').length).toBeLessThan(C.amenitiesFor('commercial', 'office').length + 1);
  });
});

describe('editPolicy', () => {
  it('detects removed photos', () => {
    expect(P.photosRemoved([], ['a'])).toBe(false);
    expect(P.photosRemoved(['a', 'b'], ['a'])).toBe(true);
    expect(P.photosRemoved(['a'], ['a', 'b'])).toBe(false);
    expect(P.photosRemoved(undefined, undefined)).toBe(false);
  });

  it('measures price swings', () => {
    expect(P.priceSwing({ deal: 'rent', monthlyRent: '10,000' }, { monthlyRent: '8,000' })).toMatchObject({ from: 10000, to: 8000, dir: 'down', abs: 0.2 });
    expect(P.priceSwing({ price: '100' }, { price: '150' })).toMatchObject({ dir: 'up', pct: 0.5 });
    expect(P.priceSwing({ price: '100' }, { price: '100' })).toBeNull();
    expect(P.priceSwing({ price: '' }, { price: '100' })).toBeNull();
    expect(P.priceSwing()).toBeNull();
  });

  it('classifies changes into tiers', () => {
    const oldForm = { deal: 'buy', bhk: '2', price: '100', description: 'a', furnishing: 'semi', carpetArea: '500', amenities: ['Gym'], society: 'S', locality: 'Baner', propertyType: 'flat' };
    const same = P.classifyChanges(oldForm, { ...oldForm }, ['a'], ['a']);
    expect(same.tierA).toEqual([]);
    expect(same.recheck).toEqual([]);
    expect(same.priceSwing).toBeNull();
    expect(same.identityChanged).toBe(false);

    const out = P.classifyChanges(
      oldForm,
      { ...oldForm, bhk: '3', price: '120', description: 'b', locality: 'Aundh', carpetArea: '600', amenities: ['Gym', 'Lift'], society: 'T', bestTimeToCall: 'x' },
      ['a', 'b'],
      ['a'],
    );
    expect(out.remoderation.map((c) => c.key).sort()).toEqual(['bhk', 'locality']);
    expect(out.staysLive.map((c) => c.key)).toEqual(expect.arrayContaining(['price', 'description', 'amenities', 'carpetArea', 'photos', 'society']));
    expect(out.instant.map((c) => c.key)).toEqual(['bestTimeToCall']);
    expect(out.tierA.map((c) => c.key)).toContain('photos');
    expect(out.recheck.length).toBeGreaterThan(5);
    expect(out.identityChanged).toBe(true);
    expect(out.photosRemoved).toBe(true);
    expect(out.priceSwing.dir).toBe('up');
  });

  it('flags reordered or added photos as a tier A change', () => {
    expect(P.classifyChanges({}, {}, ['a', 'b'], ['b', 'a']).tierA.map((c) => c.key)).toEqual(['photos']);
    expect(P.classifyChanges({}, {}, undefined, ['a']).photosRemoved).toBe(false);
  });

  it('counts recent material edits in the window', () => {
    const now = Date.UTC(2026, 0, 31);
    const day = 86400000;
    expect(P.recentMaterialEdits([
      { at: now - 2 * day, tierA: 1 }, { at: now - 40 * day, tierA: 2 }, { at: now - day, tierA: 0 }, null, { at: now - 3 * day },
    ], now)).toBe(1);
    expect(P.recentMaterialEdits()).toBe(0);
  });

  it('formats display values', () => {
    expect(P.displayValue(['a', 'b'])).toBe('a, b');
    expect(P.displayValue([])).toBe('\u2014');
    expect(P.displayValue(true)).toBe('Yes');
    expect(P.displayValue(false)).toBe('No');
    expect(P.displayValue(' x ')).toBe('x');
    expect(P.displayValue(null)).toBe('\u2014');
    expect(P.FOUNDATION_FORM_KEYS.bhk).toEqual(['bhk']);
  });
});

describe('listing validation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T06:30:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const flat = { deal: 'rent', propertyType: 'flat', bhk: '2', bathrooms: '2', carpetArea: '800', builtUp: '900', superBuiltUp: '1000', floor: '3', totalFloors: '10' };

  describe('step 1', () => {
    it('accepts a complete flat and reports missing fields', () => {
      expect(V.validateStep1(flat)).toEqual({});
      expect(V.validateStep1({})).toMatchObject({ deal: true, propertyType: true, carpetArea: 'range' });
      expect(V.validateStep1({ ...flat, bhk: '', bathrooms: '', floor: '', totalFloors: undefined })).toMatchObject({ bhk: true, bathrooms: true, floor: true, totalFloors: true });
    });

    it('validates area relations', () => {
      expect(V.validateStep1({ ...flat, builtUp: '700' }).builtUp).toBe('min');
      expect(V.validateStep1({ ...flat, builtUp: 'x' }).builtUp).toBe('min');
      expect(V.validateStep1({ ...flat, builtUp: '', superBuiltUp: '700' }).superBuiltUp).toBe('min');
      expect(V.validateStep1({ ...flat, superBuiltUp: 'x' }).superBuiltUp).toBe('min');
      expect(V.validateStep1({ ...flat, builtUp: '', superBuiltUp: '' })).toEqual({});
    });

    it('validates floors', () => {
      expect(V.validateStep1({ ...flat, floor: '11' }).floor).toBe('aboveTotal');
      expect(V.validateStep1({ ...flat, floor: 'Ground' })).toEqual({});
    });

    it('validates land and commercial extras', () => {
      const plot = { deal: 'buy', propertyType: 'farmland', carpetArea: '5', areaUnit: 'acre' };
      expect(V.validateStep1(plot)).toMatchObject({ naStatus: true, otherRights: true, buyerEligibility: true });
      expect(V.validateStep1({ ...plot, naStatus: 'na', otherRights: 'none', buyerEligibility: 'any' })).toEqual({});
      expect(V.validateStep1({ deal: 'rent', propertyType: 'commercial', carpetArea: '500', floor: '1', totalFloors: '0' })).toMatchObject({ commercialType: true, shellType: true, floor: 'aboveTotal' });
    });

    it('drops untouched errors when editing an existing listing', () => {
      const original = { ...flat, builtUp: '' };
      expect(V.validateStep1({ ...flat, bhk: '' }, { ...flat, bhk: '' })).toEqual({});
      expect(V.validateStep1({ ...flat, bhk: '' }, { ...flat, bhk: '2' })).toEqual({ bhk: true });
      expect(V.validateStep1({ ...flat, builtUp: '700' }, original).builtUp).toBe('min');
      expect(V.validateStep1({ ...flat, bhk: '' }, { ...flat, deal: 'buy', bhk: '' }).bhk).toBe(true);
    });
  });

  describe('location step', () => {
    const loc = { propertyType: 'flat', locality: 'Baner', localitySlug: 'baner', pincode: '411045', flatNumber: '4', societyId: 's1' };

    it('accepts a valid address and flags gaps', () => {
      expect(V.validateLocationStep(loc)).toEqual({});
      expect(V.validateLocationStep({ propertyType: 'flat' })).toMatchObject({ locality: true, pincode: true, flatNumber: true, society: true });
      expect(V.validateLocationStep({ ...loc, societyId: '', societyNotOnMaps: true })).toEqual({});
    });

    it('skips unit fields for land and industrial', () => {
      expect(V.validateLocationStep({ ...loc, propertyType: 'openplot', flatNumber: '', societyId: '' })).toEqual({});
      expect(V.validateLocationStep({ ...loc, propertyType: 'commercial', commercialType: 'warehouse', flatNumber: '', societyId: '' })).toEqual({});
    });

    it('refuses contact details in address parts', () => {
      expect(V.validateLocationStep({ ...loc, street: 'call 9876543210' }).street).toBe('contact');
    });

    it('trusts an unchanged saved address', () => {
      const original = { ...loc, existingAddress: 'Saved', deal: undefined, street: 'call 9876543210' };
      expect(V.validateLocationStep({ ...loc, street: 'call 9876543210', flatNumber: '' }, { ...original, flatNumber: '' })).toEqual({});
    });
  });

  describe('pricing step', () => {
    it('validates rent', () => {
      const rent = { deal: 'rent', propertyType: 'flat', monthlyRent: '30000', deposit: '60000', availableFrom: '2026-04-01' };
      expect(V.validatePricingStep(rent)).toEqual({});
      expect(V.validatePricingStep({ ...rent, monthlyRent: '' }).monthlyRent).toBe(true);
      expect(V.validatePricingStep({ ...rent, monthlyRent: '500' }).monthlyRent).toBe('min');
      expect(V.validatePricingStep({ ...rent, monthlyRent: '99999999' }).monthlyRent).toBe('max');
      expect(V.validatePricingStep({ ...rent, deposit: '' }).deposit).toBe(true);
      expect(V.validatePricingStep({ ...rent, deposit: '9999999' }).deposit).toBe('max');
      expect(V.validatePricingStep({ ...rent, availableFrom: '' }).availableFrom).toBe(true);
      expect(V.validatePricingStep({ ...rent, availableFrom: '2026-01-01' }).availableFrom).toBe(true);
      expect(V.validatePricingStep({ ...rent, availableFrom: '2030-01-01' }).availableFrom).toBe(true);
    });

    it('validates sale', () => {
      const sale = { deal: 'buy', propertyType: 'flat', price: '5000000', construction: 'ready', ownership: 'Freehold' };
      expect(V.validatePricingStep(sale)).toEqual({});
      expect(V.validatePricingStep({ ...sale, price: '' }).price).toBe(true);
      expect(V.validatePricingStep({ ...sale, price: '5' }).price).toBe('min');
      expect(V.validatePricingStep({ ...sale, price: '99999999999' }).price).toBe('max');
      expect(V.validatePricingStep({ ...sale, construction: '', ownership: '' })).toMatchObject({ possession: true, ownership: true });
      expect(V.validatePricingStep({ ...sale, construction: 'under' }).availableFrom).toBe(true);
      expect(V.validatePricingStep({ ...sale, construction: 'under', availableFrom: '2027-01-01' })).toEqual({});
      expect(V.validatePricingStep({ ...sale, reraId: 'bad' }).reraId).toBe('format');
      expect(V.validatePricingStep({ ...sale, reraId: 'P12345678901' })).toEqual({});
      expect(V.validatePricingStep({ ...sale, propertyType: 'openplot', construction: '' }).plottedProject).toBe(true);
    });

    it('does not re-flag sanity errors on untouched values when editing', () => {
      const original = { deal: 'buy', propertyType: 'flat', price: '5', construction: 'ready', ownership: 'Freehold' };
      expect(V.validatePricingStep({ ...original }, original)).toEqual({});
      expect(V.validatePricingStep({ ...original, price: '6' }, original).price).toBe('min');
    });
  });

  describe('photos step', () => {
    const photo = (category, extra = {}) => ({ url: 'u', category, ...extra });
    const four = [photo('Living Room'), photo('Kitchen'), photo('Bedroom'), photo('Bathroom')];

    it('requires enough photos in enough categories', () => {
      expect(V.validateStep3({ propertyType: 'flat' }, four, null, 10)).toEqual({});
      expect(V.validateStep3({ propertyType: 'flat' }, [], null, 10)).toEqual({ photos: 'min' });
      expect(V.validateStep3({ propertyType: 'flat' }, [photo('Other'), photo('Other'), photo('Other')], null, 10)).toEqual({ photos: 'categories' });
      expect(V.validateStep3({ propertyType: 'flat' }, [...four, photo('Other', { uploading: true })], null, 10)).toEqual({});
      expect(V.validateStep3({ propertyType: 'flat' }, four, null, 2)).toEqual({ photos: 'max' });
      expect(V.validateStep3({ propertyType: 'flat' }, [...four, { url: 'x', error: true }], null, 10)).toEqual({});
    });

    it('relaxes photo rules when editing', () => {
      const original = { images: ['a'], form: {} };
      expect(V.validateStep3({ propertyType: 'flat' }, [photo('Other')], original, 10)).toEqual({});
      expect(V.validateStep3({ propertyType: 'flat' }, [], original, 10)).toEqual({ photos: 'min' });
    });

    it('validates video, description and title', () => {
      const ok = { propertyType: 'flat' };
      expect(V.validateStep3({ ...ok, youtubeId: 'bad id' }, four, null, 10).youtubeId).toBe('format');
      expect(V.validateStep3({ ...ok, youtubeId: 'dQw4w9WgXcQ' }, four, null, 10)).toEqual({});
      expect(V.validateStep3({ ...ok, description: 'x'.repeat(4001) }, four, null, 10).description).toBe('length');
      expect(V.validateStep3({ ...ok, description: 'call 9876543210' }, four, null, 10).description).toBe('contact');
      expect(V.validateStep3({ ...ok, title: 'ring 9876543210' }, four, null, 10).title).toBe('contact');
      const original = { gallery: ['a'], form: { description: 'call 9876543210', title: 'ring 9876543210' } };
      expect(V.validateStep3({ ...ok, description: 'call 9876543210', title: 'ring 9876543210' }, four, original, 10)).toEqual({});
    });
  });

  describe('flatmate validation', () => {
    const room = { homeTypeLabel: 'Flat', bhk: '2', roomType: 'private', attachedBath: 'yes', bathrooms: '1', furnishing: 'semi', floor: '2', totalFloors: '5' };

    it('validates room details', () => {
      expect(V.validateFlatmateRoom(room)).toEqual({});
      expect(V.validateFlatmateRoom({})).toMatchObject({ homeTypeLabel: true, bhk: true, roomType: true, attachedBath: true, bathrooms: true, furnishing: true, floor: true, totalFloors: true });
      expect(V.validateFlatmateRoom({ ...room, floor: '9' }).floor).toBe('aboveTotal');
      expect(V.validateFlatmateRoom({ ...room, propertyType: 'villa', floorsInHouse: '' }).floorsInHouse).toBe(true);
      expect(V.validateFlatmateRoom({ ...room, propertyType: 'villa', floorsInHouse: '2', floor: '' })).toEqual({});
    });

    it('validates location', () => {
      const loc = { flatNumber: '4', societyId: 's', pinPlaced: true, locality: 'Baner', localitySlug: 'baner' };
      expect(V.validateFlatmateLocation(loc)).toEqual({});
      expect(V.validateFlatmateLocation({})).toMatchObject({ flatNumber: true, society: true, location: true, locality: true });
      expect(V.validateFlatmateLocation({ ...loc, societyId: '' }, { societyId: '' })).toEqual({});
      expect(V.validateFlatmateLocation({ ...loc, localitySlug: '' }, { societyId: 's' })).toEqual({});
      expect(V.validateFlatmateLocation({ ...loc, localitySlug: '' }).locality).toBe(true);
    });

    it('validates pricing and tenant consent', () => {
      const pricing = { noticePeriodDays: '30', lockInMonths: '6', rentShare: '9000', deposit: '0', availableFrom: '2026-04-01', hostRole: 'owner' };
      expect(V.validateFlatmatePricing(pricing)).toEqual({});
      expect(V.validateFlatmatePricing({})).toMatchObject({ noticePeriodDays: true, lockInMonths: true, rentShare: true, deposit: true, availableFrom: true });
      expect(V.validateFlatmatePricing({ ...pricing, noticePeriodDays: '181', lockInMonths: '1.5' })).toMatchObject({ noticePeriodDays: true, lockInMonths: true });
      expect(V.validateFlatmatePricing({ ...pricing, hostRole: 'tenant', ownerConsentMobile: '123' })).toMatchObject({ ownerConsent: true, ownerConsentMobile: true });
      expect(V.validateFlatmatePricing({ ...pricing, hostRole: 'tenant', ownerConsent: true, ownerConsentMobile: '9876543210' })).toEqual({});
    });
  });

  describe('helpers', () => {
    it('exposes listing predicates', () => {
      expect(V.isIndustrial({ propertyType: 'commercial', commercialType: 'warehouse' })).toBe(true);
      expect(V.isIndustrial({ propertyType: 'flat' })).toBe(false);
      expect(V.isPreCompletion({ propertyType: 'flat', construction: 'new' })).toBe(true);
      expect(V.isPreCompletion({ propertyType: 'openplot', construction: 'new' })).toBe(false);
      expect(V.isPlotSale({ deal: 'buy', propertyType: 'plot' })).toBe(true);
      expect(V.isPlotSale({ deal: 'rent', propertyType: 'openplot' })).toBe(false);
      expect(V.reraRequired()).toBe(false);
    });

    it('scrolls to and focuses the first error field', () => {
      document.body.innerHTML = '<div data-err="price"><input id="f" /></div><button data-err="deal"></button>';
      const scroll = vi.fn();
      Element.prototype.scrollIntoView = scroll;
      vi.stubGlobal('requestAnimationFrame', (cb) => cb());
      V.scrollToError({ price: true });
      expect(scroll).toHaveBeenCalled();
      expect(document.activeElement.id).toBe('f');
      V.scrollToError({ deal: true });
      expect(document.activeElement.tagName).toBe('BUTTON');
      V.scrollToError({});
      V.scrollToError({ missing: true });
      vi.unstubAllGlobals();
      delete Element.prototype.scrollIntoView;
      document.body.innerHTML = '';
    });
  });
});
