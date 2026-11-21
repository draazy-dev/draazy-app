import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const save = vi.fn();
const texts = [];
const pages = { n: 0 };
vi.mock('jspdf', () => ({
  jsPDF: class {
    setFontSize() {}
    text(t) { texts.push(t); }
    addPage() { pages.n += 1; }
    save(name) { save(name); }
  },
}));

import {
  CAT_KEYS, EXPENSE_CATS, INCOME_CATS, cashflowAfter, exportStatementPDF, exportTransactionsCSV, filterByPeriod,
  financeSummary, getTransactions, periodStart, setTransactions, summaryAfter,
} from '../../../../src/lib/data/finances.js';

const NOW = new Date(2026, 4, 15);
const txns = [
  { date: '2026-05-02', type: 'income', category: 'Rent received', amount: 20000 },
  { date: '2026-04-10', type: 'expense', category: 'Repairs', amount: 3000 },
  { date: '2026-02-20', type: 'expense', category: 'Insurance', amount: 1000 },
  { date: '2025-12-01', type: 'income', category: 'Other income', amount: 500 },
];

beforeEach(() => { localStorage.clear(); texts.length = 0; pages.n = 0; save.mockClear(); });
afterEach(() => vi.restoreAllMocks());

describe('categories', () => {
  it('has a translation key for every category', () => {
    [...INCOME_CATS, ...EXPENSE_CATS].forEach((c) => expect(CAT_KEYS[c]).toMatch(/^fin\.cat/));
  });
});

describe('storage', () => {
  it('keys transactions by owner and property with anon/all fallbacks', () => {
    setTransactions('9876543210', 'p1', [txns[0]]);
    setTransactions(null, null, [txns[1]]);
    expect(getTransactions('9876543210', 'p1')).toEqual([txns[0]]);
    expect(localStorage.getItem('draazyFin:anon:all')).not.toBeNull();
    expect(getTransactions(undefined, undefined)).toEqual([txns[1]]);
    expect(getTransactions('x', 'y')).toEqual([]);
  });

  it('returns the default for corrupt data and survives blocked writes', () => {
    localStorage.setItem('draazyFin:m:p', '{bad');
    expect(getTransactions('m', 'p')).toEqual([]);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x'); });
    expect(setTransactions('m', 'p', [1])).toEqual([1]);
  });
});

describe('periodStart', () => {
  it.each([
    ['month', new Date(2026, 4, 1)],
    ['quarter', new Date(2026, 3, 1)],
    ['year', new Date(2026, 3, 1)],
  ])('computes %s start', (period, expected) => {
    expect(periodStart(period, NOW)).toEqual(expected);
  });

  it('starts the financial year in the previous April before April', () => {
    expect(periodStart('year', new Date(2026, 1, 10))).toEqual(new Date(2025, 3, 1));
  });

  it('returns null for all-time', () => {
    expect(periodStart('all', NOW)).toBeNull();
    expect(periodStart(undefined, NOW)).toBeNull();
  });
});

describe('filterByPeriod / financeSummary', () => {
  it('filters by period start and copies for all-time', () => {
    expect(filterByPeriod(txns, 'month', NOW)).toEqual([txns[0]]);
    expect(filterByPeriod(txns, 'year', NOW)).toEqual([txns[0], txns[1]]);
    const all = filterByPeriod(txns, 'all', NOW);
    expect(all).toEqual(txns);
    expect(all).not.toBe(txns);
    expect(filterByPeriod(undefined, 'all')).toEqual([]);
    expect(filterByPeriod(undefined, 'month')).toEqual([]);
  });

  it('totals income, expense and net', () => {
    setTransactions('m', 'p', txns);
    expect(financeSummary('m', 'p', 'year', NOW)).toEqual({ income: 20000, expense: 3000, net: 17000, count: 2 });
    expect(financeSummary('m', 'p', undefined, NOW)).toMatchObject({ income: 20500, expense: 4000, count: 4 });
    expect(financeSummary('none', 'none')).toEqual({ income: 0, expense: 0, net: 0, count: 0 });
  });
});

describe('summaryAfter', () => {
  const summary = { income: 100, expense: 40, net: 60 };

  it('adds an in-period income', () => {
    expect(summaryAfter(summary, { type: 'income', amount: 50, date: '2026-05-03' }, 1, 'month', NOW)).toEqual({ income: 150, expense: 40, net: 110 });
  });

  it('removes an expense when the sign is negative, which raises net', () => {
    expect(summaryAfter(summary, { type: 'expense', amount: 10, date: '2026-05-03' }, -1, 'month', NOW)).toEqual({ income: 100, expense: 30, net: 70 });
  });

  it('leaves the summary untouched for out-of-period transactions and tolerates bad amounts', () => {
    expect(summaryAfter(summary, { type: 'income', amount: 50, date: '2025-01-01' }, 1, 'month', NOW)).toBe(summary);
    expect(summaryAfter(summary, { type: 'income', amount: 'abc', date: '2026-05-03' }, 1, 'month', NOW)).toEqual(summary);
  });
});

describe('cashflowAfter', () => {
  const flow = [{ month: '2026-04', income: 0, expense: 0, net: 0 }, { month: '2026-05', income: 10, expense: 5, net: 5 }];

  it('adjusts only the matching month', () => {
    const next = cashflowAfter(flow, { type: 'expense', amount: 5, date: '2026-05-09' }, 1);
    expect(next[1]).toEqual({ month: '2026-05', income: 10, expense: 10, net: 0 });
    expect(next[0]).toBe(flow[0]);
  });

  it('ignores transactions outside the series', () => {
    expect(cashflowAfter(flow, { type: 'income', amount: 5, date: '2030-01-01' }, 1)).toEqual(flow);
    expect(cashflowAfter(flow, { type: 'income', amount: 5 }, 1)).toEqual(flow);
  });
});

describe('exportTransactionsCSV', () => {
  it('downloads an escaped CSV', async () => {
    let blob;
    URL.createObjectURL = vi.fn((b) => { blob = b; return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { click.href = this.href; click.download = this.download; });
    exportTransactionsCSV([{ date: '2026-05-01', type: 'income', category: 'Rent received', amount: 100, note: 'said "hi"', recurring: 'monthly' }, { date: '2026-05-02', type: 'expense', category: 'Repairs', amount: 5 }], 'p9');
    expect(click.download).toBe('draazy-transactions-p9.csv');
    const lines = (await blob.text()).split('\n');
    expect(lines[0]).toBe('"Date","Type","Category","Amount","Note","Repeat"');
    expect(lines[1]).toBe('"2026-05-01","income","Rent received","100","said ""hi""","monthly"');
    expect(lines[2]).toBe('"2026-05-02","expense","Repairs","5","","none"');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });

  it('names the file for all properties by default', () => {
    URL.createObjectURL = vi.fn(() => 'blob:y');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { click.download = this.download; });
    exportTransactionsCSV([]);
    expect(click.download).toBe('draazy-transactions-all.csv');
  });
});

describe('exportStatementPDF', () => {
  it('writes the title, totals and rows then saves', async () => {
    await exportStatementPDF(txns.slice(0, 2), 'p1', 'My Flat');
    expect(texts).toContain('Property Finance Statement');
    expect(texts).toContain('My Flat');
    expect(texts.some((t) => /Total Income: .*20,000$/.test(t))).toBe(true);
    expect(texts.some((t) => /Net: .*17,000$/.test(t))).toBe(true);
    expect(texts).toContain('Rent received');
    expect(save).toHaveBeenCalledWith('draazy-statement-p1.pdf');
  });

  it('caps rows at 40, paginates and defaults the file name', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ date: '2026-05-01', type: 'income', category: 'Rent received', amount: i }));
    await exportStatementPDF(many);
    expect(texts.filter((t) => t === 'Rent received')).toHaveLength(40);
    expect(pages.n).toBeGreaterThan(0);
    expect(save).toHaveBeenCalledWith('draazy-statement-all.pdf');
  });
});
