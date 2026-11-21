import { describe, expect, it } from 'vitest';
import {
  PROGRESS_OPTS, STATUS_OPTS, cap, dealLabel, detailKvs, editBhkOpts, editStatusOpts, editTypeOpts, isMadeBy, liveHref,
  perSqftLabel, statusLabel, statusQuery,
} from '../../../../../src/pages/admin/properties/constants.js';
import {
  DOC_TYPES, KIND_LABELS, dateLabel, docTypeLabel, istDate, missingEvidenceId,
} from '../../../../../src/pages/admin/properties/review-modal/ownership/vocabulary.js';

describe('isMadeBy', () => {
  it('matches owner or staff poster as strings', () => {
    expect(isMadeBy({ ownerId: 5 }, '5')).toBe(true);
    expect(isMadeBy({ postedByStaff: '7' }, 7)).toBe(true);
    expect(isMadeBy({ ownerId: 5 }, 6)).toBe(false);
    expect(isMadeBy({ ownerId: 5 }, null)).toBe(false);
    expect(isMadeBy(undefined, 1)).toBe(false);
  });
});

describe('statusQuery', () => {
  it('maps UI statuses to API params', () => {
    expect(statusQuery('archived')).toEqual({ archived: true });
    expect(statusQuery('in_review')).toEqual({ archived: false, progress: 'in_review' });
    expect(statusQuery('approved')).toEqual({ archived: false, status: 'approved' });
    expect(statusQuery('')).toEqual({ archived: false, status: undefined });
    expect(STATUS_OPTS.slice(1, 1 + PROGRESS_OPTS.length)).toEqual(PROGRESS_OPTS);
  });
});

describe('edit option helpers', () => {
  it('appends the current value only when it is not in the list', () => {
    expect(editTypeOpts('Flat')).toBe(editTypeOpts());
    expect(editTypeOpts('Castle').at(-1)).toEqual({ value: 'Castle', label: 'Castle' });
    expect(editBhkOpts('7').at(-1)).toEqual({ value: '7', label: '7 BHK' });
    expect(editBhkOpts('3').some((o) => o.value === '3')).toBe(true);
    expect(editBhkOpts('')).toBe(editBhkOpts());
    expect(editStatusOpts('flagged').at(-1)).toEqual({ value: 'flagged', label: 'Flagged (current)' });
    expect(editStatusOpts('approved')).toHaveLength(2);
  });
});

describe('labels', () => {
  it('formats statuses, deals and capitalisation', () => {
    expect(statusLabel('needs_info')).toBe('Needs info');
    expect(statusLabel('under_review')).toBe('Under review');
    expect(statusLabel(undefined)).toBe('');
    expect(dealLabel('rent')).toBe('For Rent');
    expect(dealLabel('buy')).toBe('For Sale');
    expect(cap('abc')).toBe('Abc');
    expect(cap('')).toBe('');
    expect(liveHref({ id: 'a', realId: 'b' })).toBe('/property/b');
    expect(liveHref({ id: 'a' })).toBe('/property/a');
  });

  it('computes the per-sqft label', () => {
    expect(perSqftLabel({ area: 1000, price: 5000000, deal: 'buy', areaUnit: 'sqft' })).toMatch(/5,000 \/ sq\.ft$/);
    expect(perSqftLabel({ area: 1000, price: 5000, deal: 'rent' })).toBe('Monthly rent');
    expect(perSqftLabel({ area: 10, price: 5000, deal: 'buy', areaUnit: 'acre' })).toBe('\u2014');
    expect(perSqftLabel({ price: 5000, deal: 'buy' })).toBe('\u2014');
  });
});

describe('detailKvs', () => {
  const labels = (kvs) => kvs.map((kv) => kv[0]);
  const get = (kvs, label) => kvs.find((kv) => kv[0] === label);

  it('always lists the core rows', () => {
    const kvs = detailKvs({ id: 'L1', status: 'pending', deal: 'buy', price: 2500000, owner: 'Asha' });
    expect(labels(kvs)).toEqual([
      'Listing ID', 'Status', 'Property type', 'Configuration', 'Deal', 'Locality', 'Price', 'Rate',
      'Owner', 'Owner mobile', 'Submitted', 'Documents on file',
    ]);
    expect(get(kvs, 'Configuration')[1]).toBe('\u2014');
    expect(get(kvs, 'Owner mobile')[1]).toBe('\u2014');
    expect(get(kvs, 'Documents on file')[1]).toBe('0');
  });

  it('adds stated optional fields, with full-width rows for long ones', () => {
    const kvs = detailKvs({
      id: 'L1', status: 'approved', deal: 'rent', price: 20000, area: 800, areaUnit: 'sqft', carpetArea: 600, deposit: 100000, maintenance: 0,
      negotiable: false, floor: 3, totalFloors: 10, bath: 2, parkingSpaces: 0, facing: 'East', ageYears: 4, furnishing: 'semi',
      amenities: ['Lift', 'Gym'], reraId: 'P1', ownership: 'freehold', tenants: ['family'], pets: true, agreementDuration: '11 months',
      featured: true, views: 1200, enquiries: 3, qualityScore: 80, flagReason: 'Spam', docsCount: 2,
    });
    expect(get(kvs, 'Carpet area')[1]).toBe('600 sq.ft');
    expect(get(kvs, 'Area')).toBeUndefined();
    expect(get(kvs, 'Deposit')[1]).toMatch(/1 L$/);
    expect(get(kvs, 'Maintenance')[1]).toMatch(/0$/);
    expect(get(kvs, 'Negotiable')[1]).toBe('No');
    expect(get(kvs, 'Floor')[1]).toBe('3 of 10');
    expect(get(kvs, 'Parking')[1]).toBe('0');
    expect(get(kvs, 'Age')[1]).toBe('4 yr');
    expect(get(kvs, 'Furnishing')[1]).toBe('Semi');
    expect(get(kvs, 'Amenities')).toEqual(['Amenities', 'Lift, Gym', true]);
    expect(get(kvs, 'Ownership')[1]).toBe('Freehold');
    expect(get(kvs, 'Preferred tenants')[1]).toBe('family');
    expect(get(kvs, 'Pets')[1]).toBe('Allowed');
    expect(get(kvs, 'Agreement duration')[1]).toBe('11 months');
    expect(get(kvs, 'Featured')[1]).toBe('Yes \u2605');
    expect(get(kvs, 'Views')[1]).toBe('1,200');
    expect(get(kvs, 'Quality score')[1]).toBe('80/100');
    expect(get(kvs, 'Flag reason')).toEqual(['Flag reason', 'Spam', true]);
    expect(get(kvs, 'Documents on file')[1]).toBe('2');
  });

  it('shows an unqualified area only when no qualified area exists', () => {
    const kvs = detailKvs({ status: 'pending', deal: 'buy', area: 1000, areaUnit: 'sqft' });
    expect(get(kvs, 'Area')[1]).toBe('1,000 sq.ft. (unqualified)');
  });

  it('hides live-only stats unless approved and omits unstated booleans', () => {
    const kvs = detailKvs({ status: 'pending', deal: 'buy', negotiable: null, pets: undefined, rera: 'R9', featured: false });
    expect(get(kvs, 'Views')).toBeUndefined();
    expect(get(kvs, 'Negotiable')).toBeUndefined();
    expect(get(kvs, 'Pets')).toBeUndefined();
    expect(get(kvs, 'RERA ID')[1]).toBe('R9');
    expect(detailKvs({ status: 'approved', deal: 'buy', featured: false }).find((kv) => kv[0] === 'Featured')[1]).toBe('No');
  });

  it('formats string amenities and empty lists', () => {
    expect(get(detailKvs({ status: 'x', deal: 'buy', amenities: 'Pool' }), 'Amenities')[1]).toBe('Pool');
    expect(get(detailKvs({ status: 'x', deal: 'buy', amenities: [] }), 'Amenities')).toBeUndefined();
  });
});

describe('ownership vocabulary', () => {
  it('labels doc types, legacy types and falls back', () => {
    expect(docTypeLabel('index_ii')).toBe('Index II');
    expect(docTypeLabel('aadhaar')).toBe('Aadhaar (legacy)');
    expect(docTypeLabel('pan', 'x')).toBe('PAN (legacy)');
    expect(docTypeLabel('mystery', 'Mystery')).toBe('Mystery');
    expect(DOC_TYPES.every((t) => t.category)).toBe(true);
    expect(KIND_LABELS.title_proof).toBe('Title proof');
  });

  it('formats dates and ids', () => {
    expect(dateLabel('')).toBe('Not recorded');
    expect(dateLabel('2026-03-04T00:00:00Z')).toMatch(/2026/);
    expect(missingEvidenceId('panel')).toBe('panel-missing');
  });

  it('renders an IST calendar date', () => {
    expect(istDate(new Date('2026-03-04T20:00:00Z'))).toBe('2026-03-05');
    expect(istDate(new Date('2026-03-04T10:00:00Z'))).toBe('2026-03-04');
    expect(istDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
