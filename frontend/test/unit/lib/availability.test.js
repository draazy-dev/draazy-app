import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_AVAILABLE_DAYS, MAX_POSSESSION_DAYS, addDaysIso, availabilityLabel, daysUntil, firstOfNextMonthIso, istToday, istWindowStart, shortDate,
} from '../../../src/lib/availability.js';

afterEach(() => vi.useRealTimers());
const at = (iso) => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)); };

describe('IST date helpers', () => {
  it('rolls into the next IST day after 18:30 UTC', () => {
    at('2026-03-10T18:29:00Z');
    expect(istToday()).toBe('2026-03-10');
    at('2026-03-10T18:30:00Z');
    expect(istToday()).toBe('2026-03-11');
  });

  it('adds days across month and year ends', () => {
    expect(addDaysIso('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('counts days until a date from IST today', () => {
    at('2026-03-10T10:00:00Z');
    expect(daysUntil('2026-03-10')).toBe(0);
    expect(daysUntil('2026-03-25')).toBe(15);
    expect(daysUntil('2026-03-01')).toBe(-9);
  });

  it('finds the first day of the next month', () => {
    expect(firstOfNextMonthIso('2026-03-17')).toBe('2026-04-01');
    expect(firstOfNextMonthIso('2026-12-05')).toBe('2027-01-01');
  });

  it('starts an N-day window at IST midnight', () => {
    at('2026-03-10T10:00:00Z');
    expect(istWindowStart(1)).toBe(Date.parse('2026-03-10T00:00:00+05:30'));
    expect(istWindowStart('7')).toBe(Date.parse('2026-03-04T00:00:00+05:30'));
  });

  it('formats a short date independent of timezone', () => {
    expect(shortDate('2026-03-05')).toMatch(/5\s+Mar/);
  });

  it('exposes the day limits', () => {
    expect(MAX_AVAILABLE_DAYS).toBe(365);
    expect(MAX_POSSESSION_DAYS).toBe(1825);
  });
});

describe('availabilityLabel', () => {
  const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

  it('says available now for today or the past', () => {
    at('2026-03-10T10:00:00Z');
    expect(availabilityLabel(t, { availableOn: '2026-03-10' })).toBe('availability.now');
    expect(availabilityLabel(t, { availableDate: '2026-02-01' })).toBe('availability.now');
  });

  it('shows the from date for the future, plus days in detail mode', () => {
    at('2026-03-10T10:00:00Z');
    const listing = { availableOn: '2026-03-25' };
    const from = availabilityLabel(t, listing);
    expect(from).toMatch(/^availability\.from:\{"date":"25\s+Mar"\}$/);
    const detail = availabilityLabel(t, listing, { detail: true });
    expect(detail).toBe(`${from} \u00b7 availability.inDays:{"count":15}`);
  });

  it('falls back to the bucket when there is no valid date', () => {
    expect(availabilityLabel(t, { availableFrom: 'now' })).toBe('availability.now');
    expect(availabilityLabel(t, { availableFrom: 15 })).toBe('availability.in15');
    expect(availabilityLabel(t, { availableFrom: '30', availableOn: 'soon' })).toBe('availability.in30');
    expect(availabilityLabel(t, { availableFrom: 'later' })).toBe('');
    expect(availabilityLabel(t, undefined)).toBe('');
  });
});
