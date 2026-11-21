import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  displayDate, formatWhen, parseWhen, slotFromParts, slotFromWhen, todayIso, whenFromSlot,
} from '../../../src/lib/visitWhen.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 15, 10, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe('todayIso', () => {
  it('uses the local calendar date', () => {
    expect(todayIso()).toBe('2026-06-15');
    vi.setSystemTime(new Date(2026, 0, 2, 23, 59));
    expect(todayIso()).toBe('2026-01-02');
  });
});

describe('parseWhen', () => {
  it('returns empty parts for nothing', () => {
    expect(parseWhen('')).toEqual({ date: null, timeLabel: '', mode: '' });
    expect(parseWhen(undefined)).toEqual({ date: null, timeLabel: '', mode: '' });
  });

  it('parses a bare ISO date as a local date', () => {
    expect(parseWhen('2026-03-05')).toEqual({ date: new Date(2026, 2, 5), timeLabel: '', mode: '' });
  });

  it('parses date, time and mode from display text', () => {
    expect(parseWhen('5 Mar 2026, 2:30 pm (Video call)')).toEqual({ date: new Date(2026, 2, 5), timeLabel: '2:30 PM', mode: 'Video call' });
    expect(parseWhen('12 December 2026, 10:05 AM')).toMatchObject({ date: new Date(2026, 11, 12), timeLabel: '10:05 AM', mode: '' });
  });

  it('assumes the next occurrence when the year is omitted', () => {
    expect(parseWhen('5 Mar').date).toEqual(new Date(2027, 2, 5));
    expect(parseWhen('20 Aug').date).toEqual(new Date(2026, 7, 20));
    expect(parseWhen('14 Jun').date).toEqual(new Date(2026, 5, 14));
    expect(parseWhen('13 Jun').date).toEqual(new Date(2027, 5, 13));
  });

  it('ignores unknown month names', () => {
    expect(parseWhen('5 Foo 2026').date).toBeNull();
  });

  it('skips empty parentheses and unclosed ones when finding the mode', () => {
    expect(parseWhen('5 Mar 2026 () (In person)').mode).toBe('In person');
    expect(parseWhen('5 Mar 2026 (unclosed').mode).toBe('');
  });
});

describe('display helpers', () => {
  it('formats dates and combined labels', () => {
    expect(displayDate('2026-03-05')).toBe('5 Mar 2026');
    expect(displayDate('')).toBe('');
    expect(formatWhen('2026-03-05', '2:30 PM', 'Video call')).toBe('5 Mar 2026, 2:30 PM (Video call)');
    expect(formatWhen('2026-03-05', '2:30 PM')).toBe('5 Mar 2026, 2:30 PM');
  });
});

describe('slots', () => {
  it('builds an ISO instant from display text, defaulting to noon', () => {
    expect(slotFromWhen('5 Mar 2026, 2:30 PM')).toBe(new Date(2026, 2, 5, 14, 30).toISOString());
    expect(slotFromWhen('5 Mar 2026, 12:00 AM')).toBe(new Date(2026, 2, 5, 0, 0).toISOString());
    expect(slotFromWhen('5 Mar 2026, 12:15 PM')).toBe(new Date(2026, 2, 5, 12, 15).toISOString());
    expect(slotFromWhen('5 Mar 2026')).toBe(new Date(2026, 2, 5, 12, 0).toISOString());
    expect(slotFromWhen('whenever')).toBeNull();
    expect(slotFromWhen('')).toBeNull();
  });

  it('builds an ISO instant from date and time parts', () => {
    expect(slotFromParts('2026-03-05', '9:05 am')).toBe(new Date(2026, 2, 5, 9, 5).toISOString());
    expect(slotFromParts('2026-03-05', 'garbage')).toBe(new Date(2026, 2, 5, 12, 0).toISOString());
    expect(slotFromParts('', '9:05 AM')).toBeNull();
  });

  it('turns a slot back into display text', () => {
    const slot = new Date(2026, 2, 5, 14, 30).toISOString();
    expect(whenFromSlot(slot, 'In person')).toBe('5 Mar 2026, 2:30 PM (In person)');
    expect(whenFromSlot(new Date(2026, 2, 5, 0, 5).toISOString())).toBe('5 Mar 2026, 12:05 AM');
    expect(whenFromSlot(new Date(2026, 2, 5, 12, 0).toISOString())).toBe('5 Mar 2026, 12:00 PM');
    expect(whenFromSlot('')).toBe('');
    expect(whenFromSlot('not a date')).toBe('');
  });

  it('round-trips display text through a slot', () => {
    const text = '5 Mar 2026, 4:45 PM (Video call)';
    expect(whenFromSlot(slotFromWhen(text), 'Video call')).toBe(text);
  });
});
