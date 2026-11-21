import { describe, expect, it, vi } from 'vitest';
import { AMENDABLE_TERMS, amendmentRows, currentTerm } from '../../../src/lib/amendmentTerms.js';
import { chromeFor, TOPBAR_SCROLL } from '../../../src/lib/chrome.js';
import { dayLabel, formatTime, lastAt, messagesLinkForProp, relTime } from '../../../src/lib/chatFormat.js';
import { AUTH_REASONS, gateReason, postAuthDest, resolveAuthIntent, safeInAppPath } from '../../../src/lib/authIntent.js';
import { userMessage } from '../../../src/lib/userMessage.js';
import { UserError } from '../../../src/lib/userError.js';
import { ApiError, NetworkError } from '../../../src/services/http.js';

describe('amendmentTerms', () => {
  const details = { rent: 30000, months: 11, regArea: 'Rural', _state: { terms: { deposit: 90000, increment: 5, rent: 1 } } };

  it('reads flat terms first and falls back to the saved state', () => {
    expect(currentTerm(details, 'rent')).toBe('30000');
    expect(currentTerm(details, 'deposit')).toBe('90000');
    expect(currentTerm(details, 'increment')).toBe('5');
    expect(currentTerm({ rent: '', _state: { terms: { rent: 7 } } }, 'rent')).toBe('7');
    expect(currentTerm(details, 'incrementEvery')).toBe('');
    expect(currentTerm(undefined, 'rent')).toBe('');
  });

  it('does not read non-flat keys from the top level', () => {
    expect(currentTerm({ increment: 9 }, 'increment')).toBe('');
  });

  it('normalises the registration area', () => {
    expect(currentTerm(details, 'regArea')).toBe('rural');
    expect(currentTerm({}, 'regArea')).toBe('urban');
    expect(currentTerm({ _state: { terms: { regArea: 'urban' } } }, 'regArea')).toBe('urban');
  });

  it('builds before/after rows only for provided terms', () => {
    const rows = amendmentRows(details, { rent: 32000, deposit: 0, months: 12, increment: 6, regArea: 'urban', nrDeposit: 5000, incrementEvery: null });
    expect(rows).toEqual([
      ['Monthly rent', '\u20b930,000', '\u20b932,000'],
      ['Refundable deposit', '\u20b990,000', '\u20b90'],
      ['Non-refundable deposit', 'not set', '\u20b95,000'],
      ['Term', '11 months', '12 months'],
      ['Yearly rent increase', '5%', '6%'],
      ['Registration area (from Index II)', 'Rural / Gram Panchayat', 'Municipal / Urban'],
    ]);
    expect(amendmentRows(details, undefined)).toEqual([]);
  });

  it('lists the regArea options', () => {
    expect(AMENDABLE_TERMS.find((t) => t.key === 'regArea').options).toEqual(['urban', 'rural']);
  });
});

describe('chromeFor', () => {
  it('marks home and listing pages as self-padded', () => {
    expect(chromeFor('/').selfPadded).toBe(true);
    expect(chromeFor('/listings/x').selfPadded).toBe(true);
    expect(chromeFor('/about').selfPadded).toBe(false);
  });

  it('hides footer and assistant on full-bleed routes', () => {
    expect(chromeFor('/Reels')).toMatchObject({ fullBleed: true, showFooter: false, showAssistant: false, showBottomNav: true });
  });

  it('detects chat and auth routes', () => {
    expect(chromeFor('/messages').chatRoute).toBe(true);
    expect(chromeFor('/signin')).toMatchObject({ authRoute: true, showBottomNav: false, selfPadded: true });
    expect(chromeFor(undefined).selfPadded).toBe(true);
  });

  it('exposes the topbar scroll tuning', () => {
    expect(TOPBAR_SCROLL).toEqual({ hideAfter: 96, delta: 6 });
  });
});

describe('chatFormat', () => {
  it('lastAt prefers the last message then the chat time', () => {
    expect(lastAt({ messages: [{ at: 1 }, { at: 5 }], at: 9 })).toBe(5);
    expect(lastAt({ messages: [{}], at: 9 })).toBe(9);
    expect(lastAt({ messages: [] })).toBe(0);
  });

  it('formatTime returns the fallback for a missing time', () => {
    expect(formatTime(0, '--')).toBe('--');
    expect(formatTime(0)).toBe('');
    expect(formatTime(new Date(2026, 0, 1, 15, 5).getTime())).toMatch(/3:05\s?pm/i);
  });

  it('dayLabel buckets by calendar day', () => {
    const noon = (d) => new Date(2026, 5, d, 12).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(noon(10));
    expect(dayLabel(0)).toBe('Today');
    expect(dayLabel(noon(10))).toBe('Today');
    expect(dayLabel(noon(11))).toBe('Today');
    expect(dayLabel(noon(9))).toBe('Yesterday');
    expect(dayLabel(noon(5))).toMatch(/5\s+Jun/);
    vi.useRealTimers();
  });

  it('relTime steps from now to days and dates', () => {
    vi.useFakeTimers();
    const base = new Date(2026, 5, 10, 12).getTime();
    vi.setSystemTime(base);
    expect(relTime(0, '-')).toBe('-');
    expect(relTime(base - 30_000)).toBe('now');
    expect(relTime(base - 5 * 60_000)).toBe('5m');
    expect(relTime(base - 3 * 3600_000)).toBe('3h');
    expect(relTime(base - 30 * 3600_000)).toBe('Yesterday');
    expect(relTime(base - 3 * 86400_000)).toBe('3d');
    expect(relTime(base - 20 * 86400_000)).toMatch(/21\s+May/);
    vi.useRealTimers();
  });

  it('messagesLinkForProp encodes the uuid or id', () => {
    expect(messagesLinkForProp({ uuid: 'a b', id: 'x' })).toBe('/messages?openProp=a%20b');
    expect(messagesLinkForProp({ id: 7 })).toBe('/messages?openProp=7');
    expect(messagesLinkForProp(null)).toBe('/messages?openProp=');
  });
});

describe('authIntent', () => {
  const params = (qs) => new URLSearchParams(qs);

  it('uses an explicit known reason', () => {
    expect(resolveAuthIntent(params('reason=contact'))).toEqual({ key: 'contact', headingKey: 'auth.intent.contactHeading', subKey: 'auth.intent.contactSub', isDefault: false });
  });

  it('ignores an unknown reason and infers from next', () => {
    expect(resolveAuthIntent(params('reason=bogus&next=/checkout/1')).key).toBe('checkout');
  });

  it.each([
    ['/listings?deal=rent', 'alerts'],
    ['/services/x', 'services'],
    ['/home-loans', 'services'],
    ['/schedule-visit/1', 'schedule'],
    ['/saved', 'saved'],
    ['/notifications', 'notifications'],
    ['/messages', 'messages'],
    ['/society/x', 'society'],
    ['/list-property', 'listproperty'],
    ['/dashboard', 'dashboard'],
    ['/unknown', 'default'],
  ])('infers the reason for %s', (next, key) => {
    expect(resolveAuthIntent(params(`next=${encodeURIComponent(next)}`)).key).toBe(key);
  });

  it('defaults with no hints', () => {
    expect(resolveAuthIntent(params(''))).toMatchObject({ key: 'default', isDefault: true });
  });

  it('gateReason validates against the reason list', () => {
    expect(AUTH_REASONS).toContain('save');
    expect(gateReason('save')).toBe('save');
    expect(gateReason('hack')).toBe('default');
  });

  describe('safeInAppPath', () => {
    it.each(['/dashboard', '/listings?deal=rent', '/a/b#x', '/'])('allows %s unchanged', (p) => {
      expect(safeInAppPath(p)).toBe(p);
    });

    it.each([
      ['empty', ''],
      ['null', null],
      ['no leading slash', 'dashboard'],
      ['protocol relative', '//evil.com'],
      ['absolute url', 'https://evil.com'],
      ['backslash', '/\\evil.com'],
      ['control char', '/a\u0001b'],
      ['encoded double slash', '/%2F%2Fevil.com'],
      ['encoded backslash', '/%5Cevil.com'],
      ['double encoded slash', '/%252F%252Fevil.com'],
      ['bad percent encoding', '/%E0%A4%A'],
      ['signin loop', '/signin'],
      ['signup with slash', '/signup/'],
      ['uppercase auth screen', '/STAFF-LOGIN'],
      ['staff invite', '/staff-invite'],
    ])('rejects %s', (_label, p) => {
      expect(safeInAppPath(p)).toBeNull();
    });
  });

  describe('postAuthDest', () => {
    it('prefers a safe next, then the fallback, then the dashboard', () => {
      expect(postAuthDest(params('next=/saved'))).toBe('/saved');
      expect(postAuthDest(params('next=//evil.com'), '/messages')).toBe('/messages');
      expect(postAuthDest(params('next=//evil.com'), '//evil.com')).toBe('/dashboard');
      expect(postAuthDest(params(''))).toBe('/dashboard');
    });
  });
});

describe('userMessage', () => {
  it('returns server-authored ApiError messages only', () => {
    expect(userMessage(new ApiError({ message: 'Nope', status: 400 }), 'fb')).toBe('Nope');
    expect(userMessage(new ApiError({ message: 'Nope', status: 400, unparsed: true }), 'fb')).toBe('fb');
    expect(userMessage(new ApiError({ status: 500 }), 'fb')).toBe('fb');
    expect(userMessage(new Error('boom'), 'fb')).toBe('fb');
    expect(userMessage(null, 'fb')).toBe('fb');
  });

  it('passes through UserError and NetworkError messages', () => {
    expect(userMessage(new UserError('Please retry'), 'fb')).toBe('Please retry');
    expect(userMessage(new NetworkError(new Error('x')), 'fb')).toBe('Could not reach the server. Check your connection and try again.');
  });

  it('UserError has its own name', () => {
    expect(new UserError('x').name).toBe('UserError');
    expect(new UserError('x')).toBeInstanceOf(Error);
  });
});
