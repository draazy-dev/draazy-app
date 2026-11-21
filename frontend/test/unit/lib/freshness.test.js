import { describe, expect, it } from 'vitest';
import {
  AGING_DAYS, FRESH_DAYS, STALE_DAYS, daysSinceFresh, freshnessState, listingFreshness,
} from '../../../src/lib/freshness.js';

const NOW = Date.UTC(2026, 5, 30);
const DAY = 86_400_000;
const at = (days) => new Date(NOW - days * DAY).toISOString();

describe('daysSinceFresh', () => {
  it('prefers freshenedAt over createdAt', () => {
    expect(daysSinceFresh({ freshenedAt: at(3), createdAt: at(40) }, NOW)).toBe(3);
    expect(daysSinceFresh({ createdAt: at(10) }, NOW)).toBe(10);
  });

  it('is zero for missing, invalid or future dates', () => {
    expect(daysSinceFresh(null, NOW)).toBe(0);
    expect(daysSinceFresh({}, NOW)).toBe(0);
    expect(daysSinceFresh({ createdAt: 'junk' }, NOW)).toBe(0);
    expect(daysSinceFresh({ createdAt: at(-5) }, NOW)).toBe(0);
  });

  it('defaults to the current time', () => {
    expect(daysSinceFresh({ createdAt: new Date().toISOString() })).toBe(0);
  });
});

describe('freshnessState', () => {
  it.each([
    [0, 'active'], [FRESH_DAYS, 'active'], [FRESH_DAYS + 1, 'aging'], [AGING_DAYS, 'aging'],
    [AGING_DAYS + 1, 'stale'], [STALE_DAYS, 'stale'], [STALE_DAYS + 1, 'dormant'],
  ])('%i days old is %s', (days, state) => {
    expect(freshnessState({ createdAt: at(days) }, NOW)).toBe(state);
  });
});

describe('listingFreshness', () => {
  it('shows an active listing as confirmed with no owner action', () => {
    const f = listingFreshness({ createdAt: at(1) }, NOW);
    expect(f).toMatchObject({ state: 'active', days: 1, since: 'yesterday' });
    expect(f.owner).toEqual({ label: 'Active', tone: 'emerald', cta: null });
    expect(f.buyer).toMatchObject({ show: true, short: 'Confirmed available', icon: 'shield-check' });
  });

  it('labels today for brand-new listings', () => {
    expect(listingFreshness({ createdAt: at(0) }, NOW).since).toBe('today');
  });

  it('asks the owner to confirm an aging listing', () => {
    const f = listingFreshness({ createdAt: at(10) }, NOW);
    expect(f.owner).toMatchObject({ label: 'Confirm soon', cta: 'confirm' });
    expect(f.buyer).toMatchObject({ short: 'Updated 10 days ago', label: 'Owner last confirmed availability 10 days ago' });
  });

  it('warns buyers about a stale listing', () => {
    const f = listingFreshness({ createdAt: at(20) }, NOW);
    expect(f.owner).toMatchObject({ label: 'Stale', cta: 'confirm' });
    expect(f.buyer).toMatchObject({ show: true, tone: 'amber', short: 'Availability not recently confirmed' });
    expect(f.buyer.label).toContain('20 days');
  });

  it('hides dormant listings from buyers and offers reactivation', () => {
    const f = listingFreshness({ createdAt: at(60) }, NOW);
    expect(f.owner).toMatchObject({ label: 'Paused', cta: 'reactivate' });
    expect(f.buyer).toMatchObject({ show: false, label: '', short: '' });
  });
});
