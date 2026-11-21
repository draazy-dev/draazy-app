import { describe, expect, it } from 'vitest';
import {
  computeStampDuty, isPan, leaveLicenceStamp, monthLabel, monthOptions, monthsBetween, rentalYield, rentForTerm,
} from '../../../src/lib/toolCalc.js';

describe('computeStampDuty', () => {
  it('adds registration to stamp duty', () => {
    expect(computeStampDuty(7500000, 7)).toEqual({ stamp: 525000, reg: 30000, total: 555000, rate: 7 });
  });

  it('clamps a negative value to zero', () => {
    expect(computeStampDuty(-5, 7).total).toBe(0);
  });

  it('charges registration at 1% below the cap', () => {
    expect(computeStampDuty(1000000, 7).reg).toBe(10000);
  });
});

describe('leaveLicenceStamp', () => {
  it('computes exact paise and rounded stamp', () => {
    expect(leaveLicenceStamp(275000, 0, 100000, 1)).toEqual({ exactPaise: 71250, stamp: 713 });
    expect(leaveLicenceStamp(352000, 0, 150000, 1)).toEqual({ exactPaise: 91750, stamp: 918 });
  });

  it('enforces the minimum stamp of 100 and rounds at the boundary', () => {
    expect(leaveLicenceStamp(33000, 0, 70040, 1).stamp).toBe(100);
    expect(leaveLicenceStamp(33000, 0, 72000, 1).stamp).toBe(101);
    expect(leaveLicenceStamp(0, 0, 0, 1)).toEqual({ exactPaise: 0, stamp: 100 });
  });
});

describe('rentForTerm', () => {
  it('applies the increment after each period', () => {
    expect(rentForTerm(11130, 24, 5, 12)).toBe(11130 * 12 + 11686 * 12);
    expect(rentForTerm(10000, 36, 10, 12)).toBe(10000 * 12 + 11000 * 12 + 12100 * 12);
  });

  it('steps every 11 months unless 12 is asked for', () => {
    expect(rentForTerm(1000, 22, 10, 11)).toBe(1000 * 11 + 1100 * 11);
    expect(rentForTerm(1000, 22, 10, 'x')).toBe(1000 * 11 + 1100 * 11);
    expect(rentForTerm(1000, 5, 10, 11)).toBe(5000);
  });

  it('ignores an out-of-range increment', () => {
    expect(rentForTerm(1000, 24, -5, 12)).toBe(24000);
    expect(rentForTerm(1000, 24, 150, 12)).toBe(24000);
    expect(rentForTerm(1000, 24, 'abc', 12)).toBe(24000);
  });
});

describe('monthsBetween', () => {
  it('lists the inclusive month range across years', () => {
    expect(monthsBetween('2026-03', '2026-05')).toEqual(['2026-03', '2026-04', '2026-05']);
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthsBetween('2026-04', '2027-03')).toHaveLength(12);
  });

  it('rejects over-long, reversed and malformed ranges', () => {
    expect(monthsBetween('2026-04', '2027-04')).toEqual([]);
    expect(monthsBetween('2026-05', '2026-04')).toEqual([]);
    expect(monthsBetween('', '2026-04')).toEqual([]);
    expect(monthsBetween('2026-13', '2026-14')).toEqual([]);
  });
});

describe('month options and labels', () => {
  it('spans 36 months back to 12 months ahead', () => {
    const opts = monthOptions(new Date(2025, 5, 15));
    expect(opts).toHaveLength(49);
    expect(opts[0]).toBe('2022-06');
    expect(opts[36]).toBe('2025-06');
    expect(opts[48]).toBe('2026-06');
  });

  it('defaults to the current date', () => {
    const opts = monthOptions();
    const now = new Date();
    expect(opts[36]).toBe(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  });

  it('labels a month in the given locale', () => {
    expect(monthLabel('2025-01')).toBe('January 2025');
    expect(monthLabel('2025-01', 'en-US')).toBe('January 2025');
  });
});

describe('rentalYield', () => {
  it('computes gross and net yield with vacancy', () => {
    const y = rentalYield({ price: 6000000, rent: 25000, maintenance: 2000, propertyTax: 12000, vacancyMonths: 1 });
    expect(y.grossRent).toBe(300000);
    expect(y.netIncome).toBe(25000 * 11 - 24000 - 12000);
    expect(y.gross).toBe(5);
    expect(y.net).toBeCloseTo((239000 / 6000000) * 100, 9);
    expect(y.payback).toBeCloseTo(6000000 / 239000, 9);
  });

  it('clamps vacancy to a year', () => {
    expect(rentalYield({ price: 100, rent: 10, maintenance: 0, propertyTax: 0, vacancyMonths: 99 }).netIncome).toBe(0);
    expect(rentalYield({ price: 100, rent: 10, maintenance: 0, propertyTax: 0, vacancyMonths: -3 }).netIncome).toBe(120);
  });

  it('returns nulls without a price or positive income', () => {
    expect(rentalYield({ price: 0, rent: 1, maintenance: 0, propertyTax: 0, vacancyMonths: 0 })).toMatchObject({ gross: null, net: null, payback: null });
    expect(rentalYield({ price: 100, rent: 1, maintenance: 5, propertyTax: 0, vacancyMonths: 0 }).payback).toBeNull();
  });
});

describe('isPan', () => {
  it('accepts the AAAAA9999A shape only', () => {
    expect(isPan('ABCDE1234F')).toBe(true);
    expect(isPan('abcde1234f')).toBe(false);
    expect(isPan('ABCD1234F')).toBe(false);
  });
});
