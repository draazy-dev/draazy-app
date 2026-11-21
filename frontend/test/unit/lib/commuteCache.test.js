import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let getCommute;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  ({ getCommute } = await import('../../../src/lib/commuteCache.js'));
});
afterEach(() => vi.useRealTimers());

const BANER = [18.559, 73.787];

describe('getCommute', () => {
  it('returns null without coordinates', () => {
    expect(getCommute(null, 73.8)).toBeNull();
    expect(getCommute(18.5, undefined)).toBeNull();
  });

  it('estimates all four IT hubs, nearest first', () => {
    const entry = getCommute(...BANER);
    expect(entry.source).toBe('live');
    expect(entry.hubs).toHaveLength(4);
    expect(entry.hubs.map((h) => h.min)).toEqual([...entry.hubs.map((h) => h.min)].sort((a, b) => a - b));
    expect(entry.hubs[0].name).toMatch(/Baner/);
    expect(entry.hubs.every((h) => Number.isFinite(h.km) && h.min >= 4)).toBe(true);
  });

  it('is deterministic for the same pin and rounds coordinates to three decimals', () => {
    const a = getCommute(18.5591, 73.7871);
    const b = getCommute(18.5589, 73.7869);
    expect(b).toBe(a);
  });

  it('stamps a fetch time between one and six hours ago', () => {
    const { fetchedAt } = getCommute(18.5204, 73.8567);
    const hoursAgo = (Date.now() - fetchedAt) / 3_600_000;
    expect(Number.isInteger(hoursAgo)).toBe(true);
    expect(hoursAgo).toBeGreaterThanOrEqual(1);
    expect(hoursAgo).toBeLessThanOrEqual(6);
  });

  it('persists to localStorage and survives a module reload', async () => {
    const first = getCommute(...BANER);
    expect(JSON.parse(localStorage.getItem('dz_commute_v1:18.559,73.787'))).toEqual(first);
    vi.resetModules();
    const again = (await import('../../../src/lib/commuteCache.js')).getCommute(...BANER);
    expect(again).toEqual(first);
  });

  it('ignores a corrupt stored entry and recomputes', () => {
    localStorage.setItem('dz_commute_v1:18.559,73.787', '{bad');
    expect(getCommute(...BANER).hubs).toHaveLength(4);
  });

  it('still works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const entry = getCommute(...BANER);
    expect(getCommute(...BANER)).toBe(entry);
  });

  it('a hub at the pin itself still reports at least 4 minutes', () => {
    const entry = getCommute(18.5913, 73.7389);
    const hinjawadi = entry.hubs.find((h) => h.name.startsWith('Hinjawadi'));
    expect(hinjawadi.min).toBe(4);
    expect(hinjawadi.km).toBe(0);
  });
});
