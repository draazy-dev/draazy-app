import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BHK_LABEL, INTENTS, OUTCOMES_BY_CHANNEL, OUTCOME_LABEL, STAGES, STAGE_CHANGES, STAGE_FILTERS, TYPE_FILTERS,
  budgetLabel, emptyProfile, fmtBudget, inDays, isFuture, leadError, openLink, profileForm, profileLine,
  profileReady, showsBhk, toIso, toProfile, toggle, when, withType,
} from '../../../../../src/pages/admin/leads/leadsFormat.js';
import { ApiError, NetworkError } from '../../../../../src/services/http.js';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('derived tables', () => {
  it('builds filter and change lists from the stage list', () => {
    expect(STAGE_FILTERS[0]).toEqual({ value: '', label: 'All' });
    expect(STAGE_FILTERS).toHaveLength(STAGES.length + 1);
    expect(STAGE_CHANGES.map((s) => s.value)).not.toContain('new');
    expect(STAGE_CHANGES.map((s) => s.value)).not.toContain('converted');
    expect(TYPE_FILTERS.map((t) => t.value)).toEqual(['', 'owner', 'seeker', 'flatmate']);
    expect(BHK_LABEL['1rk']).toBe('1 RK');
    expect(BHK_LABEL['5+']).toBe('5+ BHK');
    expect(OUTCOME_LABEL['no-answer']).toBe('No answer');
    expect(OUTCOMES_BY_CHANNEL.call).not.toContain('message-sent');
  });
});

describe('budgetLabel / fmtBudget', () => {
  it('labels by lead type and intent', () => {
    expect(budgetLabel('owner', 'rent-out')).toBe('Expected rent / month');
    expect(budgetLabel('owner', 'sell')).toBe('Expected price');
    expect(budgetLabel('flatmate', 'has-room')).toBe('Rent / month');
    expect(budgetLabel('seeker', 'rent')).toBe('Rent budget / month');
    expect(budgetLabel('seeker', 'buy')).toBe('Budget');
  });

  it('adds /mo only for monthly intents and hides empty budgets', () => {
    expect(fmtBudget(25000, 'rent')).toMatch(/25,000\/mo$/);
    expect(fmtBudget(2500000, 'buy')).toMatch(/L$/);
    expect(fmtBudget(0, 'rent')).toBe('');
    expect(fmtBudget('', 'buy')).toBe('');
  });
});

describe('profileLine', () => {
  it('joins the non-empty parts with a separator', () => {
    const line = profileLine({
      bhk: ['2', '1rk', '9'], propertyTypes: ['flat', 'zzz'], localities: 'Baner', budget: 20000, intent: 'rent',
    });
    expect(line).toContain('2 BHK, 1 RK, 9');
    expect(line).toContain('Baner');
    expect(line).toContain('/mo');
    expect(line).toContain('zzz');
    expect(line.split(' \u00b7 ')).toHaveLength(4);
  });

  it('skips empty parts', () => {
    expect(profileLine({ bhk: [], propertyTypes: [], localities: '', budget: 0, intent: 'buy' })).toBe('');
  });
});

describe('showsBhk', () => {
  it('always shows for flatmates and when no types are picked', () => {
    expect(showsBhk('flatmate', ['plot'])).toBe(true);
    expect(showsBhk('owner', [])).toBe(true);
  });

  it('shows only when a home type is picked', () => {
    expect(showsBhk('owner', ['plot', 'villa'])).toBe(true);
    expect(showsBhk('owner', ['plot'])).toBe(false);
  });
});

describe('profile form conversions', () => {
  it('emptyProfile returns a fresh object each call', () => {
    const a = emptyProfile();
    a.bhk.push('1');
    expect(emptyProfile().bhk).toEqual([]);
    expect(a.leadType).toBe('');
  });

  it('profileForm falls back to empty values', () => {
    expect(profileForm({})).toEqual(emptyProfile());
    expect(profileForm({ name: 'Asha', profile: { budget: 5000, bhk: ['2'], leadType: 'seeker' } })).toMatchObject({
      name: 'Asha', budget: '5000', bhk: ['2'], leadType: 'seeker',
    });
  });

  it('profileReady needs lead type and source', () => {
    expect(profileReady({ leadType: 'owner', leadSource: '' })).toBe(false);
    expect(profileReady({ leadType: 'owner', leadSource: 'walk-in' })).toBe(true);
  });

  it('toProfile trims and drops blanks', () => {
    const out = toProfile({
      ...emptyProfile(), name: '  ', leadType: 'owner', intent: '', propertyTypes: ['plot'], bhk: ['2'], localities: ' Kothrud ', budget: 'abc', leadSource: 'flyer', sourceDetail: '',
    });
    expect(out).toEqual({
      name: undefined, leadType: 'owner', intent: undefined, propertyTypes: ['plot'], bhk: [], localities: 'Kothrud', budget: undefined, leadSource: 'flyer', sourceDetail: undefined,
    });
  });

  it('toProfile keeps bhk for home types and clears property types for flatmates', () => {
    const owner = toProfile({ ...emptyProfile(), leadType: 'owner', propertyTypes: ['flat'], bhk: ['2'], budget: '1200', leadSource: 'other' });
    expect(owner.bhk).toEqual(['2']);
    expect(owner.budget).toBe(1200);
    const flat = toProfile({ ...emptyProfile(), leadType: 'flatmate', propertyTypes: ['flat'], bhk: ['1'], leadSource: 'other' });
    expect(flat.propertyTypes).toEqual([]);
    expect(flat.bhk).toEqual(['1']);
  });

  it('withType keeps a valid intent and resets otherwise', () => {
    const form = { ...emptyProfile(), leadType: 'owner', intent: 'sell', propertyTypes: ['flat'] };
    expect(withType(form, 'owner').intent).toBe('sell');
    expect(withType(form, 'seeker').intent).toBe('');
    expect(withType(form, 'flatmate').propertyTypes).toEqual([]);
    expect(withType(form, 'seeker').propertyTypes).toEqual(['flat']);
    expect(Object.keys(INTENTS)).toEqual(['owner', 'seeker', 'flatmate']);
  });
});

describe('small helpers', () => {
  it('toggle adds and removes without mutating', () => {
    const list = ['a'];
    expect(toggle(list, 'b')).toEqual(['a', 'b']);
    expect(toggle(list, 'a')).toEqual([]);
    expect(list).toEqual(['a']);
  });

  it('when formats a date or falls back to a dash', () => {
    expect(when('')).toBe('\u2014');
    expect(when('2026-01-05T10:30:00Z')).toMatch(/2026/);
  });

  it('inDays builds a local datetime-local string', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 30, 8, 15));
    expect(inDays(3)).toBe('2026-02-02T10:00');
    expect(inDays(0, 7)).toBe('2026-01-30T07:00');
  });

  it('toIso / isFuture handle blanks', () => {
    expect(toIso('')).toBeNull();
    expect(toIso('2026-01-01T10:00')).toBe(new Date('2026-01-01T10:00').toISOString());
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0));
    expect(isFuture('')).toBe(false);
    expect(isFuture('2026-01-01T11:00')).toBe(false);
    expect(isFuture('2026-01-01T13:00')).toBe(true);
  });

  it('openLink clicks a temporary anchor and removes it', () => {
    const seen = [];
    const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      seen.push({ href: this.getAttribute('href'), target: this.target, rel: this.rel, inDom: document.body.contains(this) });
    });
    openLink('tel:+911234', false);
    openLink('https://wa.me/1', true);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(seen[0]).toEqual({ href: 'tel:+911234', target: '', rel: '', inDom: true });
    expect(seen[1]).toEqual({ href: 'https://wa.me/1', target: '_blank', rel: 'noopener noreferrer', inDom: true });
    expect(document.querySelector('a')).toBeNull();
  });
});

describe('leadError', () => {
  it('maps known codes to friendly copy', () => {
    expect(leadError(new ApiError({ code: 'lead-cap', status: 409 }))).toMatch(/50 open leads/);
    expect(leadError({ code: 'lead-cooldown' })).toMatch(/24 hours/);
    expect(leadError({ code: 'lead-closed' })).toMatch(/closed/);
    expect(leadError({ code: 'lead-conversion-invalid' })).toMatch(/payment/);
  });

  it('uses the server message for lead-owned when present', () => {
    expect(leadError(new ApiError({ code: 'lead-owned', status: 409, message: 'Owned by Ravi' }))).toBe('Owned by Ravi');
    expect(leadError(new ApiError({ code: 'lead-owned', status: 409 }))).toBe('Another staff member owns this lead.');
  });

  it('handles 403, network and unknown errors', () => {
    expect(leadError({ status: 403 })).toMatch(/owner/);
    expect(leadError(new NetworkError())).toMatch(/Could not reach the server/);
    expect(leadError(new Error('boom'))).toBe('That did not go through. Try again.');
    expect(leadError(undefined)).toBe('That did not go through. Try again.');
  });
});
