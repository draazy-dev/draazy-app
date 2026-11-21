import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const save = vi.fn();
const instances = [];
vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor(opts) {
      this.opts = opts;
      this.texts = [];
      this.pages = 1;
      this.save = save;
      instances.push(this);
    }

    setDrawColor() {}
    setLineWidth() {}
    rect() {}
    line() {}
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    text(t) { this.texts.push(Array.isArray(t) ? t.join(' ') : t); }
    splitTextToSize(t) { return [t]; }
    addPage() { this.pages += 1; }
  },
}));

import { drawReceipt, fyLabel, fyOf, generateMany, generateSingle, monthMeta, numToWordsIndian } from '../../../src/lib/rentReceipt.js';

beforeEach(() => { instances.length = 0; save.mockClear(); });
afterEach(() => vi.useRealTimers());

describe('numToWordsIndian', () => {
  it.each([
    [0, 'Zero'],
    [7, 'Seven'],
    [19, 'Nineteen'],
    [20, 'Twenty'],
    [45, 'Forty Five'],
    [100, 'One Hundred'],
    [999, 'Nine Hundred Ninety Nine'],
    [1000, 'One Thousand'],
    [25000, 'Twenty Five Thousand'],
    [100000, 'One Lakh'],
    [1234567, 'Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven'],
    [10000000, 'One Crore'],
    [123456789, 'Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine'],
    ['32500.4', 'Thirty Two Thousand Five Hundred'],
    ['abc', 'Zero'],
  ])('converts %s', (n, words) => {
    expect(numToWordsIndian(n)).toBe(words);
  });
});

describe('monthMeta', () => {
  it('builds the month label and period', () => {
    expect(monthMeta('2026-02')).toEqual({ label: 'February 2026', startStr: '01/02/2026', endStr: '28/02/2026', receiptDate: '28/02/2026' });
    expect(monthMeta('2028-02').endStr).toBe('29/02/2028');
    expect(monthMeta('2026-12').label).toBe('December 2026');
  });

  it('defaults to the current month for a bad value', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15));
    expect(monthMeta('').label).toBe('June 2026');
    expect(monthMeta(undefined).startStr).toBe('01/06/2026');
    expect(monthMeta('2026').label).toBe('January 2026');
  });
});

describe('financial year helpers', () => {
  it('starts the Indian FY in April', () => {
    expect(fyOf('2026-03')).toBe(2025);
    expect(fyOf('2026-04')).toBe(2026);
    expect(fyOf('2026-12')).toBe(2026);
  });

  it('labels the FY', () => {
    expect(fyLabel(2025)).toBe('FY 2025-26');
    expect(fyLabel(2099)).toBe('FY 2099-00');
  });
});

describe('drawReceipt', () => {
  const data = {
    no: 'R-1', receiptDate: '28/02/2026', rent: 25000, tenant: 'Asha', address: '12 Baner', startStr: '01/02/2026',
    endStr: '28/02/2026', label: 'February 2026', mode: 'UPI', txnRef: 'T123', landlord: 'Ravi', pan: 'ABCDE1234F', paidOnline: true,
  };

  it('writes the receipt text, amount in figures and words', async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    drawReceipt(doc, 0, 0, 180, 124, data);
    const all = doc.texts.join('\n');
    expect(all).toContain('RENT RECEIPT');
    expect(all).toContain('Receipt No: R-1');
    expect(all).toContain('Rs. 25,000/-');
    expect(all).toContain('Rupees Twenty Five Thousand Only');
    expect(all).toContain('from Mr./Ms. Asha');
    expect(all).toContain('Mode of payment: UPI');
    expect(all).toContain('Transaction ref: T123');
    expect(all).toContain('PAN: ABCDE1234F');
    expect(all).toContain('Paid online');
  });

  it('omits optional lines', async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    drawReceipt(doc, 0, 0, 180, 124, { ...data, txnRef: '', pan: '', paidOnline: false });
    const all = doc.texts.join('\n');
    expect(all).not.toContain('Transaction ref');
    expect(all).not.toContain('PAN:');
    expect(all).not.toContain('Paid online');
  });
});

describe('generateSingle', () => {
  it('saves a named PDF with defaults for missing fields', async () => {
    const name = await generateSingle({ month: '2026-03', rent: 1000 });
    expect(name).toBe('Rent-Receipt-March-2026.pdf');
    expect(save).toHaveBeenCalledWith('Rent-Receipt-March-2026.pdf');
    expect(instances[0].opts).toEqual({ unit: 'mm', format: 'a4' });
    const all = instances[0].texts.join('\n');
    expect(all).toContain('Receipt No: 1');
    expect(all).toContain('Mode of payment: UPI');
    expect(all).toContain('Paid online');
    expect(all).toContain('\u2014');
  });

  it('uses the supplied filename, receipt number and uppercases PAN', async () => {
    expect(await generateSingle({ month: '2026-03', rent: 1, no: 'X9', pan: 'abcde1234f', paidOnline: false }, 'mine.pdf')).toBe('mine.pdf');
    const all = instances[0].texts.join('\n');
    expect(all).toContain('Receipt No: X9');
    expect(all).toContain('PAN: ABCDE1234F');
    expect(all).not.toContain('Paid online');
  });
});

describe('generateMany', () => {
  it('puts two receipts per page', async () => {
    const list = [1, 2, 3, 4, 5].map((i) => ({ month: `2026-0${i}`, rent: 1000 * i }));
    expect(await generateMany(list, 'all.pdf')).toBe('all.pdf');
    expect(instances[0].pages).toBe(3);
    expect(save).toHaveBeenCalledWith('all.pdf');
    expect(instances[0].texts.filter((t) => t.startsWith('Receipt No')).map((t) => t)).toEqual(['Receipt No: 1', 'Receipt No: 2', 'Receipt No: 3', 'Receipt No: 4', 'Receipt No: 5']);
  });
});
