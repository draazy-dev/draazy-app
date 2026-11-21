import { describe, expect, it } from 'vitest';
import {
  HOUR_OPTIONS, displayTime, formatTime, minuteOptions, parseTime, to12h, to24h,
} from '../../../src/lib/timeOfDay.js';

describe('parseTime', () => {
  it('reads 12-hour times in any case', () => {
    expect(parseTime('2:30 PM')).toEqual({ h24: 14, min: 30 });
    expect(parseTime('12:00 am')).toEqual({ h24: 0, min: 0 });
    expect(parseTime('12:15pm')).toEqual({ h24: 12, min: 15 });
    expect(parseTime(' 9:05 Am ')).toEqual({ h24: 9, min: 5 });
  });

  it('reads 24-hour times within range', () => {
    expect(parseTime('23:59')).toEqual({ h24: 23, min: 59 });
    expect(parseTime('7:05')).toEqual({ h24: 7, min: 5 });
  });

  it('rejects invalid input', () => {
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('12:60')).toBeNull();
    expect(parseTime('noon')).toBeNull();
    expect(parseTime('')).toBeNull();
    expect(parseTime(null)).toBeNull();
  });
});

describe('formatting', () => {
  it('converts to 12-hour and 24-hour text', () => {
    expect(to12h({ h24: 0, min: 5 })).toBe('12:05 AM');
    expect(to12h({ h24: 12, min: 0 })).toBe('12:00 PM');
    expect(to12h({ h24: 17, min: 45 })).toBe('5:45 PM');
    expect(to24h({ h24: 7, min: 5 })).toBe('07:05');
  });

  it('chooses the format and tolerates bad values', () => {
    expect(formatTime({ h24: 17, min: 45 })).toBe('5:45 PM');
    expect(formatTime({ h24: 17, min: 45 }, '24h')).toBe('17:45');
    expect(displayTime('17:45')).toBe('5:45 PM');
    expect(displayTime('5:45 PM', '24h')).toBe('17:45');
    expect(displayTime('nope')).toBe('');
  });
});

describe('options', () => {
  it('lists hours 1-12', () => {
    expect(HOUR_OPTIONS).toHaveLength(12);
    expect(HOUR_OPTIONS[0]).toEqual({ value: '1', label: '1' });
    expect(HOUR_OPTIONS[11]).toEqual({ value: '12', label: '12' });
  });

  it('lists minutes by step with zero padding', () => {
    expect(minuteOptions()).toHaveLength(12);
    expect(minuteOptions()[1]).toEqual({ value: '5', label: '05' });
    expect(minuteOptions(30)).toEqual([{ value: '0', label: '00' }, { value: '30', label: '30' }]);
  });
});
