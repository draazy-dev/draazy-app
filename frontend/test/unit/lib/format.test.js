import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as f from '../../../src/lib/format.js';

const RS = '\u20b9';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe('parseAmount', () => {
  it('extracts a rounded number from formatted text', () => {
    expect(f.parseAmount(`${RS} 1,25,000`)).toBe(125000);
    expect(f.parseAmount('12.6')).toBe(13);
    expect(f.parseAmount(4500)).toBe(4500);
  });

  it('returns 0 for nothing numeric', () => {
    expect(f.parseAmount('abc')).toBe(0);
    expect(f.parseAmount(null)).toBe(0);
    expect(f.parseAmount(undefined)).toBe(0);
    expect(f.parseAmount('')).toBe(0);
  });
});

describe('dates', () => {
  it('converts ISO dates to dd/mm/yyyy', () => {
    expect(f.isoToDisplay('2026-03-05')).toBe('05/03/2026');
    expect(f.isoToDisplay(' 2026-03-05 ')).toBe('05/03/2026');
    expect(f.isoToDisplay('2026-3-5')).toBe('');
    expect(f.isoToDisplay(null)).toBe('');
  });

  it('formats dates in en-IN and tolerates bad input', () => {
    expect(f.fmtDate('2026-03-05T12:00:00')).toBe('5 Mar 2026');
    expect(f.fmtDate('nonsense')).toBe('');
    expect(f.fmtDate('')).toBe('');
    expect(f.fmtDate(null)).toBe('');
  });

  it('formats date-times with an upper-case meridiem', () => {
    expect(f.fmtDateTime('2026-03-05T14:30:00')).toMatch(/^5 Mar 2026,\s+2:30\s+PM$/);
    expect(f.fmtDateTime(new Date(2026, 2, 5, 9, 5))).toMatch(/9:05\s+AM$/);
    expect(f.fmtDateTime('')).toBe('');
    expect(f.fmtDateTime(null)).toBe('');
    expect(f.fmtDateTime('bad')).toBe('');
  });
});

describe('lastActivity', () => {
  it('reports Created when nothing is newer', () => {
    const created = new Date(2026, 2, 5, 9, 0).getTime();
    expect(f.lastActivity(created)).toMatchObject({ verb: 'Created', at: created });
    expect(f.lastActivity(created, null, '')).toMatchObject({ verb: 'Created' });
  });

  it('reports Updated with the latest timestamp', () => {
    const created = new Date(2026, 2, 5, 9, 0).getTime();
    const later = new Date(2026, 2, 7, 18, 30).toISOString();
    const out = f.lastActivity(created, later, new Date(2026, 2, 6).toISOString());
    expect(out.verb).toBe('Updated');
    expect(out.at).toBe(Date.parse(later));
    expect(out.text).toMatch(/7 Mar 2026,\s+6:30\s+PM/);
  });

  it('works without a creation time and returns null with no usable times', () => {
    expect(f.lastActivity(null, new Date(2026, 2, 7).getTime())).toMatchObject({ verb: 'Created' });
    expect(f.lastActivity(null)).toBeNull();
    expect(f.lastActivity('junk', undefined)).toBeNull();
  });
});

describe('money and numbers', () => {
  it('abbreviates rupees into lakh and crore', () => {
    expect(f.fmtINR(950)).toBe(`${RS}950`);
    expect(f.fmtINR(25000)).toBe(`${RS}25,000`);
    expect(f.fmtINR(4500000)).toBe(`${RS}45 L`);
    expect(f.fmtINR(150000)).toBe(`${RS}1.50 L`);
    expect(f.fmtINR(20000000)).toBe(`${RS}2 Cr`);
    expect(f.fmtINR(15500000)).toBe(`${RS}1.55 Cr`);
    expect(f.fmtINR(null)).toBe(`${RS}0`);
    expect(f.fmtINR('abc')).toBe(`${RS}0`);
  });

  it('groups numbers the Indian way', () => {
    expect(f.fmtNum(1234567)).toBe('12,34,567');
    expect(f.fmtNum(undefined)).toBe('0');
  });

  it('labels rent and sale prices', () => {
    expect(f.rentLabel(25000)).toBe(`${RS}25,000/mo`);
    expect(f.priceLabel({ deal: 'rent', price: 25000 })).toBe(`${RS}25,000/mo`);
    expect(f.priceLabel({ deal: 'sale', price: 4500000 })).toBe(`${RS}45 L`);
  });
});

describe('areas', () => {
  it('appends the unit label with a sq.ft. default', () => {
    expect(f.fmtArea(1200, 'sqft')).toBe('1,200 sq.ft.');
    expect(f.fmtArea(1200)).toBe('1,200 sq.ft.');
    expect(f.fmtArea(10, 'guntha')).toBe('10 Guntha');
    expect(f.fmtArea(2, 'acre')).toBe('2 Acre');
    expect(f.fmtArea(1200, 'sqyd')).toBe('1,200 sq.yd.');
  });

  it('echoes unknown units safely and hides empty areas', () => {
    expect(f.fmtArea(5, 'bigha')).toBe('5 bigha');
    expect(f.fmtArea(5, 'constructor')).toBe('5 constructor');
    expect(f.fmtArea(0, 'sqft')).toBe('');
    expect(f.fmtArea(null)).toBe('');
  });

  it('recognises square feet as the default unit', () => {
    expect(f.isSqftUnit()).toBe(true);
    expect(f.isSqftUnit('sqft')).toBe(true);
    expect(f.isSqftUnit('sqm')).toBe(false);
  });
});

describe('relative time', () => {
  const ago = (ms) => new Date(Date.now() - ms).toISOString();
  const DAY = 86_400_000;

  it('timeAgo buckets by whole days', () => {
    expect(f.timeAgo(ago(3600_000))).toBe('Today');
    expect(f.timeAgo(ago(DAY))).toBe('Yesterday');
    expect(f.timeAgo(ago(5 * DAY))).toBe('5 days ago');
    expect(f.timeAgo(ago(29 * DAY))).toBe('29 days ago');
    expect(f.timeAgo(ago(45 * DAY))).toBe(new Date(Date.now() - 45 * DAY).toLocaleDateString('en-IN'));
    expect(f.timeAgo(ago(-3 * DAY))).toBe('Today');
  });

  it('timeAgo echoes unparseable input', () => {
    expect(f.timeAgo('soon')).toBe('soon');
    expect(f.timeAgo(undefined)).toBe('');
  });

  it('fmtAgo moves from seconds to days', () => {
    expect(f.fmtAgo(Date.now() - 20_000)).toBe('just now');
    expect(f.fmtAgo(Date.now() - 5 * 60_000)).toBe('5m ago');
    expect(f.fmtAgo(Date.now() - 3 * 3600_000)).toBe('3h ago');
    expect(f.fmtAgo(ago(2 * DAY))).toBe('2d ago');
    expect(f.fmtAgo(Date.now() - 40 * DAY)).toBe(new Date(Date.now() - 40 * DAY).toLocaleDateString('en-IN'));
  });

  it('fmtAgo ignores empty and invalid timestamps', () => {
    expect(f.fmtAgo(0)).toBe('');
    expect(f.fmtAgo(null)).toBe('');
    expect(f.fmtAgo('nope')).toBe('');
  });
});

describe('text helpers', () => {
  it('joins truthy class names', () => {
    expect(f.classNames('a', false, null, 'b', undefined, '', 'c')).toBe('a b c');
  });

  it('builds up to two initials', () => {
    expect(f.avatarFor('Ravi Kumar Sharma')).toBe('RK');
    expect(f.avatarFor('priya')).toBe('P');
    expect(f.avatarFor('')).toBe('?');
    expect(f.avatarFor(null)).toBe('?');
  });
});
