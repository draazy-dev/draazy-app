import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let auth;
const cookie = (jar) => vi.spyOn(document, 'cookie', 'get').mockReturnValue(jar);

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  auth = await import('../../../src/lib/auth.js');
});

describe('user storage', () => {
  it('persists to localStorage when remembered and clears the session copy', () => {
    sessionStorage.setItem('draazyUser', JSON.stringify({ name: 'old' }));
    auth.writeUser({ name: 'Asha' });
    expect(JSON.parse(localStorage.getItem('draazyUser'))).toEqual({ name: 'Asha' });
    expect(sessionStorage.getItem('draazyUser')).toBeNull();
    expect(auth.readUser()).toEqual({ name: 'Asha' });
  });

  it('uses sessionStorage when not remembered', () => {
    auth.writeUser({ name: 'Asha' }, false);
    expect(localStorage.getItem('draazyUser')).toBeNull();
    expect(auth.readUser()).toEqual({ name: 'Asha' });
  });

  it('removes the user everywhere when set to null', () => {
    auth.writeUser({ name: 'Asha' });
    auth.writeUser(null);
    expect(auth.readUser()).toBeNull();
  });

  it('ignores corrupt stored JSON', () => {
    localStorage.setItem('draazyUser', '{bad');
    sessionStorage.setItem('draazyUser', JSON.stringify({ name: 'fallback' }));
    expect(auth.readUser()).toEqual({ name: 'fallback' });
  });

  it('survives storage write failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    expect(() => auth.writeUser({ name: 'x' })).not.toThrow();
  });
});

describe('tokens', () => {
  it('keeps tokens in memory only', () => {
    expect(auth.readTokens()).toBeNull();
    auth.writeTokens({ accessToken: 'a1' });
    expect(auth.readAccessToken()).toBe('a1');
    expect(localStorage.getItem('draazyTokens')).toBeNull();
    auth.writeTokens(null);
    expect(auth.readAccessToken()).toBeNull();
  });

  it('adopts then deletes tokens stored by older builds', async () => {
    localStorage.setItem('draazyTokens', JSON.stringify({ accessToken: 'legacy' }));
    sessionStorage.setItem('draazyTokens', JSON.stringify({ accessToken: 'other' }));
    vi.resetModules();
    auth = await import('../../../src/lib/auth.js');
    expect(auth.readAccessToken()).toBe('legacy');
    expect(localStorage.getItem('draazyTokens')).toBeNull();
    expect(sessionStorage.getItem('draazyTokens')).toBeNull();
    expect(auth.sessionRemembered()).toBe(true);
  });

  it('adopts a session-stored token as not remembered', async () => {
    sessionStorage.setItem('draazyTokens', JSON.stringify({ accessToken: 's' }));
    vi.resetModules();
    auth = await import('../../../src/lib/auth.js');
    expect(auth.readAccessToken()).toBe('s');
    expect(auth.sessionRemembered()).toBe(false);
  });

  it('ignores unparsable stored tokens', async () => {
    localStorage.setItem('draazyTokens', '{bad');
    vi.resetModules();
    auth = await import('../../../src/lib/auth.js');
    expect(auth.readTokens()).toBeNull();
  });

  it('tracks whether the session is remembered', () => {
    auth.writeTokens({ accessToken: 'a' }, false);
    expect(auth.sessionRemembered()).toBe(false);
    auth.writeTokens({ accessToken: 'a' }, true);
    expect(auth.sessionRemembered()).toBe(true);
    auth.writeTokens(null, true);
    expect(auth.sessionRemembered()).toBe(false);
  });

  it('drops the in-memory token when another tab signs out', () => {
    auth.writeTokens({ accessToken: 'a' });
    window.dispatchEvent(new StorageEvent('storage', { key: 'draazyUser', newValue: null }));
    expect(auth.readAccessToken()).toBeNull();
  });

  it('keeps the token when the storage event is unrelated or a user is still stored', () => {
    auth.writeTokens({ accessToken: 'a' });
    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: null }));
    expect(auth.readAccessToken()).toBe('a');
    auth.writeUser({ name: 'A' });
    window.dispatchEvent(new StorageEvent('storage', { key: 'draazyUser', newValue: null }));
    expect(auth.readAccessToken()).toBe('a');
  });
});

describe('session hint cookie', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is absent without a cookie', () => {
    cookie('a=1; b=2');
    expect(auth.sessionHinted()).toBe(false);
  });

  it('reads remembered and session values from the host-prefixed cookie', () => {
    cookie('x=1; __Host-draazy_session=1');
    expect(auth.sessionHinted()).toBe(true);
    expect(auth.sessionRemembered()).toBe(true);
    vi.restoreAllMocks();
    cookie('__Host-draazy_session=0');
    expect(auth.sessionRemembered()).toBe(false);
  });

  it('falls back to the insecure cookie name', () => {
    cookie('draazy_session=1');
    expect(auth.sessionRemembered()).toBe(true);
  });

  it('rejects duplicate or invalid hints', () => {
    cookie('__Host-draazy_session=1; __Host-draazy_session=0');
    expect(auth.sessionHinted()).toBe(false);
    vi.restoreAllMocks();
    cookie('__Host-draazy_session=yes');
    expect(auth.sessionHinted()).toBe(false);
  });

  it('is safe when reading the cookie throws', () => {
    vi.spyOn(document, 'cookie', 'get').mockImplementation(() => { throw new Error('denied'); });
    expect(auth.sessionHinted()).toBe(false);
  });
});

describe('logoutUser', () => {
  it('clears user, tokens and expires both hint cookies', () => {
    auth.writeUser({ name: 'A' });
    auth.writeTokens({ accessToken: 'a' });
    const set = vi.spyOn(document, 'cookie', 'set').mockImplementation(() => {});
    auth.logoutUser();
    expect(auth.readUser()).toBeNull();
    expect(auth.readAccessToken()).toBeNull();
    const written = set.mock.calls.map((c) => c[0]);
    expect(written).toHaveLength(2);
    expect(written[0]).toMatch(/^__Host-draazy_session=; Max-Age=0; Path=\/; SameSite=Lax/);
    expect(written[1]).toMatch(/^draazy_session=; Max-Age=0/);
    expect(written.every((c) => !c.includes('Secure'))).toBe(true);
  });
});

describe('localStorageWritable', () => {
  it('probes once and caches success', () => {
    expect(auth.localStorageWritable()).toBe(true);
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    expect(auth.localStorageWritable()).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(localStorage.getItem('draazyTokens__probe')).toBeNull();
  });

  it('reports false when writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(auth.localStorageWritable()).toBe(false);
  });
});

describe('name and role helpers', () => {
  it('labels roles', () => {
    expect(['owner', 'admin', 'manager', 'staff', 'tenant', undefined].map(auth.roleLabel))
      .toEqual(['Owner', 'Admin', 'Manager', 'Staff', 'Member', 'Member']);
  });

  it('validates names', () => {
    expect(auth.isValidName('Asha Rao')).toBe(true);
    expect(auth.isValidName("D'Souza-Smith Jr.")).toBe(true);
    expect(auth.isValidName('\u0905\u0936\u094b\u0915')).toBe(true);
    expect(auth.isValidName('A')).toBe(false);
    expect(auth.isValidName('x'.repeat(81))).toBe(false);
    expect(auth.isValidName('1Asha')).toBe(false);
    expect(auth.isValidName('Asha<script>')).toBe(false);
  });

  it('derives first name and initial', () => {
    expect(auth.firstName({ name: '  asha  rao ' })).toBe('asha');
    expect(auth.firstName(null)).toBe('Account');
    expect(auth.firstName({ name: '  ' })).toBe('Account');
    expect(auth.initial({ name: 'asha rao' })).toBe('A');
    expect(auth.initial(undefined)).toBe('A');
  });

  it('flags internal roles', () => {
    expect(auth.isInternal({ role: 'admin' })).toBe(true);
    expect(auth.isInternal({ role: 'staff' })).toBe(true);
    expect(auth.isInternal({ role: 'owner' })).toBe(false);
    expect(auth.isInternal(null)).toBe(false);
  });
});
