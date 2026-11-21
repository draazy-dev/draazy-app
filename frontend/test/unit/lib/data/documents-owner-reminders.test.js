import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DOC_CATEGORIES, DOC_INFO, HOME_LOAN_CHECKLIST, checklistFromDocs, docIcon, docInfo, formatSize, offersHomeLoan, ownerDocCategories,
} from '../../../../src/lib/data/documents.js';
import { composeOwnerProperties } from '../../../../src/lib/data/ownerProperties.js';
import { currentDueStatus, recentMonths, ymLabel } from '../../../../src/lib/data/rentReminders.js';

afterEach(() => vi.useRealTimers());

describe('document catalogue', () => {
  it('has guidance for every category and checklist item', () => {
    Object.values(DOC_CATEGORIES).flat().filter((c) => c !== 'Rent Agreement').forEach((c) => expect(DOC_INFO[c], c).toBeDefined());
    HOME_LOAN_CHECKLIST.forEach((c) => expect(DOC_INFO[c], c).toBeDefined());
    expect(docInfo('Sale Deed').title).toBe('Sale Deed');
    expect(docInfo('Nope')).toBeNull();
  });
});

describe('ownerDocCategories', () => {
  it('lists ready flat sale documents', () => {
    const cats = ownerDocCategories({ type: 'Flat', deal: 'sale' });
    expect(cats).toEqual(expect.arrayContaining(['Sale Deed', 'Society NOC', 'Occupancy Certificate', 'Agreement to Sale']));
    expect(cats).not.toContain('7/12 Extract');
    expect(cats).not.toContain('NA Order (Non-Agricultural)');
  });

  it('drops sale-only documents for rentals', () => {
    const cats = ownerDocCategories({ type: 'flat', deal: 'rent' });
    expect(cats).toContain('Society NOC');
    expect(cats).not.toContain('Agreement to Sale');
    expect(cats).not.toContain('Encumbrance Certificate');
  });

  it('drops completion-only documents for under-construction and new launches', () => {
    const under = ownerDocCategories({ type: 'flat', deal: 'sale', construction: 'under' });
    expect(under).not.toContain('Occupancy Certificate');
    expect(under).not.toContain('Sale Deed');
    expect(under).toContain('Allotment Letter');
    expect(ownerDocCategories({ type: 'flat', deal: 'sale', construction: 'new' })).not.toContain('Possession Letter');
  });

  it('shows land records for land types and maps type aliases', () => {
    expect(ownerDocCategories({ type: 'farmland', deal: 'sale' })).toEqual(expect.arrayContaining(['7/12 Extract', '8A Extract']));
    expect(ownerDocCategories({ type: 'Open Plot', deal: 'sale' })).toContain('Property Card');
    expect(ownerDocCategories({ type: 'Studio apartment', deal: 'sale' })).toContain('Floor Plan');
    expect(ownerDocCategories({ type: 'unknown thing' })).toContain('Floor Plan');
    expect(ownerDocCategories()).toContain('Sale Deed');
  });
});

describe('offersHomeLoan', () => {
  it('is for sale listings other than farmland', () => {
    expect(offersHomeLoan({ deal: 'sale', type: 'flat' })).toBe(true);
    expect(offersHomeLoan({ deal: 'rent', type: 'flat' })).toBe(false);
    expect(offersHomeLoan({ deal: 'sale', type: 'farmland' })).toBe(false);
    expect(offersHomeLoan(undefined)).toBe(true);
  });
});

describe('checklistFromDocs', () => {
  it('marks uploaded categories on the relevant checklist items', () => {
    const { items } = checklistFromDocs([{ category: 'Sale Deed' }, { category: 'Other' }], ['Sale Deed', 'Index II', 'Not in list']);
    expect(items).toEqual([{ name: 'Sale Deed', done: true }, { name: 'Index II', done: false }]);
    expect(checklistFromDocs(undefined, ['Sale Deed']).items[0].done).toBe(false);
  });
});

describe('formatSize / docIcon', () => {
  it('formats sizes', () => {
    expect(formatSize(0)).toBe('');
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(1048576 * 2.5)).toBe('2.5 MB');
  });

  it('chooses icons by mime type', () => {
    expect(docIcon('application/pdf')).toBe('file-text');
    expect(docIcon('image/png')).toBe('image');
    expect(docIcon('text/plain')).toBe('file');
  });
});

describe('composeOwnerProperties', () => {
  const managed = [
    { id: 'm1', publishedListingId: 'L1', title: 'Published', deal: 'rent' },
    { id: 'm2', title: 'Private', locality: 'Baner', price: 20000, deal: 'rent', img: 'i.jpg', rented: 1, agreementVerified: 1, sourceRoomId: 'room-7', createdAt: 't' },
    { id: 'm3', title: 'Via fromManaged', publishedListingId: 'OTHER' },
  ];

  it('attaches the managed record to its published listing', () => {
    const out = composeOwnerProperties([{ id: 'L1', title: 'A' }, { uuid: 'U9', id: 'L2', fromManaged: 'm3' }, { id: 'L3' }], managed);
    const byId = Object.fromEntries(out.filter((p) => !p.private).map((p) => [p.id, p]));
    expect(byId.L1.managedId).toBe('m1');
    expect(typeof byId.L1.passportPct).toBe('number');
    expect(byId.L2.managedId).toBe('m3');
    expect(byId.L3.managedId).toBeUndefined();
  });

  it('leaves flatmate posts untouched', () => {
    const post = { id: 'L1', flatmatePost: true };
    const out = composeOwnerProperties([post], managed);
    expect(out.find((p) => p.id === 'L1')).toBe(post);
  });

  it('puts unpublished managed properties first as private rows', () => {
    const out = composeOwnerProperties([{ id: 'L1' }], managed);
    expect(out[0]).toMatchObject({
      id: 'm2', managedId: 'm2', private: true, status: 'private', views: 0, real: true, sourceRoomId: 'room-7',
      image: 'i.jpg', img: 'i.jpg', rented: true, agreementVerified: true, createdAt: 't',
    });
    expect(out.filter((p) => p.private)).toHaveLength(1);
  });
});

describe('rent reminders', () => {
  it('labels year-months', () => {
    expect(ymLabel('2026-03')).toBe('Mar 2026');
    expect(ymLabel('2026-12', 'en')).toBe('Dec 2026');
  });

  it('flags a due month overdue after the due day (IST)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T06:00:00Z'));
    expect(currentDueStatus({ dueDay: 5 })).toEqual({ ym: '2026-05', label: 'May 2026', overdue: true, dueDay: 5 });
    expect(currentDueStatus({ dueDay: 25 }).overdue).toBe(false);
  });

  it('clamps and defaults the due day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-29T06:00:00Z'));
    expect(currentDueStatus({ dueDay: 40 }).dueDay).toBe(28);
    expect(currentDueStatus({ dueDay: 0 }).dueDay).toBe(5);
    expect(currentDueStatus({}).dueDay).toBe(5);
  });

  it('uses the IST calendar date near midnight UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-31T20:00:00Z'));
    expect(currentDueStatus({ dueDay: 5 }).ym).toBe('2026-06');
  });

  it('is not yet owed before the first rent month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T06:00:00Z'));
    expect(currentDueStatus({ firstRentMonth: '2026-07', dueDay: 5 })).toMatchObject({ ym: '2026-07', overdue: false });
    expect(currentDueStatus({ firstRentMonth: '2026-04', dueDay: 5 })).toMatchObject({ ym: '2026-05', overdue: true });
  });

  it('lists recent months newest first across a year boundary', () => {
    expect(recentMonths(3, 'en', '2026-01')).toEqual([
      { ym: '2026-01', label: 'Jan 2026' },
      { ym: '2025-12', label: 'Dec 2025' },
      { ym: '2025-11', label: 'Nov 2025' },
    ]);
  });
});
