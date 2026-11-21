import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';

vi.mock('../../../../../src/lib/commuteCache.js', () => ({ getCommute: vi.fn() }));
vi.mock('../../../../../src/services/contactService.js', () => ({ contactStatus: vi.fn() }));
vi.mock('../../../../../src/services/entitlementService.js', () => ({ getEntitlements: vi.fn() }));
vi.mock('../../../../../src/services/localityService.js', () => ({ getLocality: vi.fn() }));
vi.mock('../../../../../src/services/visitService.js', () => ({ listVisits: vi.fn() }));

import { getCommute } from '../../../../../src/lib/commuteCache.js';
import { contactStatus } from '../../../../../src/services/contactService.js';
import { getEntitlements } from '../../../../../src/services/entitlementService.js';
import { getLocality } from '../../../../../src/services/localityService.js';
import { listVisits } from '../../../../../src/services/visitService.js';
import { NO_CONTACT_GATE } from '../../../../../src/lib/contact.js';
import {
  AMEN_ICON,
  AMEN_LABEL,
  possessionDateLabel,
  availableLabel,
  propertyKind,
  deriveFloor,
  deriveFacing,
  deriveOverlooking,
  deriveAge,
} from '../../../../../src/pages/consumer/property/derivations.js';
import { dialableMobile, telHref } from '../../../../../src/pages/consumer/property/contactPhone.js';
import { valueBenchmark, commuteInfo } from '../../../../../src/pages/consumer/property/locationIntel.js';
import { useContactGate } from '../../../../../src/pages/consumer/property/useContactGate.js';
import { useEntitlements, contactsLeft, freeContactsTill } from '../../../../../src/pages/consumer/property/useEntitlements.js';
import { useLocalityStats, localitySlugOf } from '../../../../../src/pages/consumer/property/useLocalityStats.js';
import { useMyVisits } from '../../../../../src/pages/consumer/property/useMyVisits.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const tr = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);

describe('derivations', () => {
  it('exposes amenity icon and label maps', () => {
    expect(AMEN_ICON.gym).toBe('sparkles');
    expect(AMEN_LABEL.parking).toBe('Covered Parking');
  });

  it('labels possession dates relative to today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 10, 12));
    expect(possessionDateLabel(tr, '2026-03-10')).toBe('property.readyToMove');
    expect(possessionDateLabel(tr, '2020-01-01')).toBe('property.readyToMove');
    expect(possessionDateLabel(tr, '2026-09-15')).toMatch(/^property\.availableFromDate:\{"date":"Sep\w*\s2026"\}$/);
    expect(possessionDateLabel(tr, '2026-02-30')).toBe('');
    expect(possessionDateLabel(tr, 'garbage')).toBe('');
    expect(possessionDateLabel(tr, null)).toBe('');
  });

  it('builds the availability label with an em dash fallback', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T06:30:00Z'));
    expect(availableLabel(tr, {})).toBe('\u2014');
    expect(availableLabel(tr, { availableFrom: 'now' })).toBe('availability.now');
    expect(availableLabel(tr, { availableOn: '2026-03-20' })).toContain('availability.inDays');
  });

  it('classifies property kinds', () => {
    expect(propertyKind({ type: 'Open Plot' })).toBe('land');
    expect(propertyKind({ type: 'farmland' })).toBe('land');
    expect(propertyKind({ type: 'Office Space' })).toBe('commercial');
    expect(propertyKind({ type: 'Co-working' })).toBe('commercial');
    expect(propertyKind({ type: 'Flat' })).toBe('residential');
    expect(propertyKind(null)).toBe('residential');
  });

  it('derives floor labels', () => {
    expect(deriveFloor({})).toBe('');
    expect(deriveFloor({ floor: 2, totalFloors: 10 })).toBe('2nd of 10');
    expect(deriveFloor({ form: { floor: '1', totalFloors: 4 } })).toBe('1st of 4');
    expect(deriveFloor({ form: { floor: 'Ground' } })).toBe('Ground');
    expect(deriveFloor({ floor: 3 })).toBe('3rd');
    expect(deriveFloor({ floor: 11 })).toBe('11th');
    expect(deriveFloor({ floor: 22 })).toBe('22nd');
    expect(deriveFloor({ floor: 'Top' })).toBe('Top');
  });

  it('derives facing and overlooking from the property or its form', () => {
    expect(deriveFacing({ facing: 'East' })).toBe('East');
    expect(deriveFacing({ form: { facing: 'West' } })).toBe('West');
    expect(deriveFacing({})).toBe('');
    expect(deriveOverlooking({ overlooking: 'Garden' })).toBe('Garden');
    expect(deriveOverlooking({ form: { overlooking: 'Road' } })).toBe('Road');
    expect(deriveOverlooking({})).toBe('');
  });

  it('derives age labels', () => {
    expect(deriveAge({ age: '1-5' })).toBe('1\u20135 yrs');
    expect(deriveAge({ form: { age: 'new' } })).toBe('New');
    expect(deriveAge({ age: 'custom-age' })).toBe('custom-age');
    expect(deriveAge({ construction: 'new' })).toBe('New');
    expect(deriveAge({ ageYears: 1 })).toBe('1 Year');
    expect(deriveAge({ ageYears: 7 })).toBe('7 Years');
    expect(deriveAge({})).toBe('');
  });
});

describe('contactPhone', () => {
  it('only dials full ten digit numbers', () => {
    expect(dialableMobile('98765 43210')).toBe('9876543210');
    expect(dialableMobile('12345')).toBe('');
    expect(dialableMobile(null)).toBe('');
    expect(telHref('9876543210')).toBe('tel:+919876543210');
    expect(telHref('123')).toBe('');
  });
});

describe('locationIntel', () => {
  it('has no benchmark without data', () => {
    const none = valueBenchmark({ type: 'Flat', price: 5000000, area: 0 }, { ratePerSqft: 5000 });
    expect(none).toMatchObject({ hasData: false, rating: '', tone: 'fair', pct: 60, perSqft: 0 });
    expect(valueBenchmark(null, null).hasData).toBe(false);
    expect(valueBenchmark({ type: 'Open Plot', price: 1000000, area: 1000 }, { ratePerSqft: 900 })).toMatchObject({ hasData: false, perSqft: 1000 });
    expect(valueBenchmark({ type: 'Flat', price: 1000000, area: 1000 }, {}).hasData).toBe(false);
  });

  it('rates a good deal, market and above average prices', () => {
    const good = valueBenchmark({ type: 'Flat', price: 8000000, area: 1000 }, { ratePerSqft: 10000 });
    expect(good).toMatchObject({ hasData: true, diffPct: -20, rating: 'Good deal', tone: 'good', arrow: 'arrow-down', pct: 44 });
    const fair = valueBenchmark({ type: 'Flat', price: 10000000, area: 1000 }, { ratePerSqft: 10000 });
    expect(fair).toMatchObject({ diffPct: 0, rating: 'At market', tone: 'fair', arrow: 'minus', pct: 55 });
    const high = valueBenchmark({ type: 'Flat', price: 12000000, area: 1000 }, { ratePerSqft: 10000 });
    expect(high).toMatchObject({ diffPct: 20, rating: 'Above average', tone: 'high', arrow: 'arrow-up', pct: 66 });
  });

  it('clamps the gauge position', () => {
    expect(valueBenchmark({ type: 'Flat', price: 100000000, area: 1000 }, { ratePerSqft: 10000 }).pct).toBe(95);
    expect(valueBenchmark({ type: 'Flat', price: 1000000, area: 1000 }, { ratePerSqft: 10000 }).pct).toBe(20);
  });

  it('returns no legs without coordinates', () => {
    expect(commuteInfo(null, 73)).toEqual({ legs: [], source: 'none', fetchedAt: 0 });
    expect(commuteInfo(18.5, undefined)).toEqual({ legs: [], source: 'none', fetchedAt: 0 });
  });

  it('uses cached live legs when available', () => {
    getCommute.mockReturnValue({ hubs: [{ name: 'Hub', min: 10 }], fetchedAt: 42 });
    expect(commuteInfo(18.5, 73.8)).toEqual({ legs: [{ name: 'Hub', min: 10 }], source: 'live', fetchedAt: 42 });
  });

  it('falls back to a sorted estimate', () => {
    getCommute.mockReturnValue(null);
    const info = commuteInfo(18.5590, 73.7870);
    expect(info.source).toBe('estimate');
    expect(info.legs).toHaveLength(4);
    expect(info.legs[0].name).toContain('Baner');
    expect(info.legs[0].min).toBeGreaterThanOrEqual(4);
    const mins = info.legs.map((l) => l.min);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
    getCommute.mockReturnValue({ hubs: [], fetchedAt: 1 });
    expect(commuteInfo(18.5, 73.8).source).toBe('estimate');
  });
});

describe('useContactGate', () => {
  beforeEach(() => { contactStatus.mockReset(); });

  it('returns the no-gate default without a property', async () => {
    const { result } = renderHook(() => useContactGate(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.gate).toBe(NO_CONTACT_GATE);
    let value;
    await act(async () => { value = await result.current.refresh(); });
    expect(value).toBe(NO_CONTACT_GATE);
    expect(contactStatus).not.toHaveBeenCalled();
  });

  it('loads the gate for a property', async () => {
    contactStatus.mockResolvedValue({ status: 'approved' });
    const { result } = renderHook(() => useContactGate('p1'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.gate).toEqual({ status: 'approved' });
    expect(contactStatus).toHaveBeenCalledWith('p1', expect.objectContaining({ maxAge: expect.anything() }));
  });

  it('falls back to no gate on error', async () => {
    contactStatus.mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useContactGate('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.gate).toBe(NO_CONTACT_GATE);
  });

  it('refresh fetches and stores a new gate', async () => {
    contactStatus.mockResolvedValueOnce({ status: 'pending' });
    const { result } = renderHook(() => useContactGate('p1'));
    await waitFor(() => expect(result.current.gate.status).toBe('pending'));
    contactStatus.mockResolvedValueOnce({ status: 'approved' });
    let next;
    await act(async () => { next = await result.current.refresh({ fresh: true }); });
    expect(next).toEqual({ status: 'approved' });
    expect(result.current.gate).toEqual({ status: 'approved' });
    expect(contactStatus).toHaveBeenLastCalledWith('p1', { fresh: true });
  });

  it('reloads when the refresh key changes and exposes setGate', async () => {
    contactStatus.mockResolvedValue({ status: 'a' });
    const { result, rerender } = renderHook(({ k }) => useContactGate('p1', k), { initialProps: { k: '1' } });
    await waitFor(() => expect(result.current.gate.status).toBe('a'));
    rerender({ k: '2' });
    await waitFor(() => expect(contactStatus).toHaveBeenCalledTimes(2));
    act(() => result.current.setGate({ status: 'manual' }));
    expect(result.current.gate.status).toBe('manual');
  });
});

describe('useEntitlements and helpers', () => {
  beforeEach(() => { getEntitlements.mockReset(); });

  it('does nothing when disabled', async () => {
    const { result } = renderHook(() => useEntitlements(false));
    expect(result.current.entitlements).toBeNull();
    let value;
    await act(async () => { value = await result.current.refresh(); });
    expect(value).toBeNull();
    expect(getEntitlements).not.toHaveBeenCalled();
  });

  it('loads entitlements and refreshes them', async () => {
    getEntitlements.mockResolvedValueOnce({ contacts: { remaining: 3 } });
    const { result } = renderHook(() => useEntitlements());
    await waitFor(() => expect(result.current.entitlements).toEqual({ contacts: { remaining: 3 } }));
    getEntitlements.mockResolvedValueOnce({ contacts: { remaining: 2 } });
    await act(async () => { await result.current.refresh(); });
    expect(result.current.entitlements.contacts.remaining).toBe(2);
    getEntitlements.mockRejectedValueOnce(new Error('x'));
    let value;
    await act(async () => { value = await result.current.refresh(); });
    expect(value).toBeNull();
    expect(result.current.entitlements).toBeNull();
  });

  it('clears entitlements when the initial load fails', async () => {
    getEntitlements.mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useEntitlements());
    await waitFor(() => expect(getEntitlements).toHaveBeenCalled());
    expect(result.current.entitlements).toBeNull();
  });

  it('computes contacts left by deal', () => {
    expect(contactsLeft(null, 'rent')).toBeNull();
    expect(contactsLeft({ contacts: { unlimited: true, remaining: 5 } })).toBeNull();
    expect(contactsLeft({ contacts: { remaining: 5 } })).toBe(5);
    const e = { contacts: { remaining: 9, remainingBuy: 2, remainingRent: 4 } };
    expect(contactsLeft(e, 'buy')).toBe(2);
    expect(contactsLeft(e, 'sale')).toBe(2);
    expect(contactsLeft(e, 'rent')).toBe(4);
    expect(contactsLeft({ contacts: { remaining: 9, remainingBuy: 'x' } }, 'buy')).toBe(9);
    expect(contactsLeft({ contacts: {} })).toBeNull();
  });

  it('formats the free contact window only while it is open', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T10:00:00Z'));
    expect(freeContactsTill(null)).toBe('');
    expect(freeContactsTill({ contacts: { freeWindowEndsAt: '2026-03-01T00:00:00Z' } })).toBe('');
    expect(freeContactsTill({ contacts: { freeWindowEndsAt: '2026-04-01T00:00:00Z' } })).not.toBe('');
  });
});

describe('useLocalityStats', () => {
  beforeEach(() => { getLocality.mockReset(); });

  it('derives slugs from the property', () => {
    expect(localitySlugOf({ localitySlug: 'baner' })).toBe('baner');
    expect(localitySlugOf({ locality: 'Koregaon Park' })).toBe('koregaon-park');
    expect(localitySlugOf(null)).toBeFalsy();
  });

  it('loads locality stats once per slug within the cache window', async () => {
    getLocality.mockResolvedValue({ ratePerSqft: 9000 });
    const p = { localitySlug: 'stats-a' };
    const first = renderHook(() => useLocalityStats(p));
    expect(first.result.current).toBeNull();
    await waitFor(() => expect(first.result.current).toEqual({ ratePerSqft: 9000 }));
    const second = renderHook(() => useLocalityStats(p));
    await waitFor(() => expect(second.result.current).toEqual({ ratePerSqft: 9000 }));
    expect(getLocality).toHaveBeenCalledTimes(1);
  });

  it('stays null without a slug or on failure', async () => {
    const { result } = renderHook(() => useLocalityStats({}));
    expect(result.current).toBeNull();
    getLocality.mockRejectedValue(new Error('x'));
    const failing = renderHook(() => useLocalityStats({ localitySlug: 'stats-fail' }));
    await waitFor(() => expect(getLocality).toHaveBeenCalled());
    expect(failing.result.current).toBeNull();
  });
});

describe('useMyVisits', () => {
  beforeEach(() => { listVisits.mockReset(); });

  it('stays empty without identity or property', () => {
    const { result } = renderHook(() => useMyVisits('p1', ''));
    expect(result.current.visits).toBeNull();
    act(() => result.current.refresh());
    expect(listVisits).not.toHaveBeenCalled();
  });

  it('summarises booked and completed visits', async () => {
    listVisits.mockResolvedValue([
      { id: 1, status: 'cancelled' },
      { id: 2, status: 'confirmed' },
      { id: 3, status: 'completed' },
    ]);
    const { result } = renderHook(() => useMyVisits('p1', 'u1'));
    await waitFor(() => expect(result.current.visits).not.toBeNull());
    expect(result.current.visits.booked.id).toBe(2);
    expect(result.current.visits.completed).toBe(true);
    expect(listVisits).toHaveBeenCalledWith(expect.objectContaining({ propertyId: 'p1' }));
  });

  it('reports no booked visit', async () => {
    listVisits.mockResolvedValue([]);
    const { result } = renderHook(() => useMyVisits('p1', 'u1'));
    await waitFor(() => expect(result.current.visits).toEqual({ booked: null, completed: false }));
  });

  it('ignores failures and supports manual refresh', async () => {
    listVisits.mockRejectedValueOnce(new Error('x'));
    const { result } = renderHook(() => useMyVisits('p1', 'u1'));
    await waitFor(() => expect(listVisits).toHaveBeenCalledTimes(1));
    expect(result.current.visits).toBeNull();
    listVisits.mockResolvedValueOnce([{ id: 9, status: 'scheduled' }]);
    act(() => result.current.refresh({ fresh: true }));
    await waitFor(() => expect(result.current.visits.booked.id).toBe(9));
  });
});
