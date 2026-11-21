import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyAppPrefs, getAppPrefs, getLastSearch, getRecentProps, getRecentSearches, pushRecentProp, pushRecentSearch, setAppPrefs, setLastSearch,
} from '../../../src/lib/localPrefs.js';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.head.innerHTML = '';
  document.documentElement.className = '';
});
afterEach(() => vi.useRealTimers());

describe('app preferences', () => {
  it('defaults to a light theme with motion', () => {
    expect(getAppPrefs()).toEqual({ reduceMotion: false, theme: 'light' });
  });

  it('merges stored values over the defaults', () => {
    localStorage.setItem('dzAppPrefs', JSON.stringify({ theme: 'dark', extra: 1 }));
    expect(getAppPrefs()).toEqual({ reduceMotion: false, theme: 'dark', extra: 1 });
  });

  it('ignores corrupt stored values', () => {
    localStorage.setItem('dzAppPrefs', '{bad');
    expect(getAppPrefs()).toEqual({ reduceMotion: false, theme: 'light' });
  });

  it('persists a patch, applies it and broadcasts the change', () => {
    const seen = [];
    const listener = (e) => seen.push(e.detail.key);
    window.addEventListener('pn:store', listener);
    const next = setAppPrefs({ theme: 'dark', reduceMotion: true });
    window.removeEventListener('pn:store', listener);
    expect(next).toEqual({ reduceMotion: true, theme: 'dark' });
    expect(JSON.parse(localStorage.getItem('dzAppPrefs'))).toEqual(next);
    expect(seen).toEqual(['dzAppPrefs']);
    expect(document.documentElement.classList.contains('dz-reduce-motion')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('still returns the new prefs when storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(setAppPrefs({ theme: 'dark' }).theme).toBe('dark');
  });
});

describe('applyAppPrefs', () => {
  const head = () => {
    document.head.innerHTML = '<meta name="theme-color" content="x"><meta name="color-scheme" content="x">'
      + '<link rel="icon" href="/dark.png" data-light="/light.png">';
  };

  it('syncs theme meta tags and swaps the favicon', () => {
    head();
    applyAppPrefs({ theme: 'light' });
    expect(document.querySelector('meta[name="theme-color"]').content).toBe('#f3f7f6');
    expect(document.querySelector('meta[name="color-scheme"]').content).toBe('light');
    const icon = document.querySelector('link[rel="icon"]');
    expect(icon.getAttribute('href')).toBe('/light.png');
    applyAppPrefs({ theme: 'dark' });
    expect(document.querySelector('meta[name="theme-color"]').content).toBe('#0f0d1a');
    expect(document.querySelector('meta[name="color-scheme"]').content).toBe('dark');
    expect(icon.dataset.dark).toMatch(/dark\.png$/);
    expect(icon.href).toMatch(/dark\.png$/);
  });

  it('works without any head tags and defaults to stored prefs', () => {
    localStorage.setItem('dzAppPrefs', JSON.stringify({ reduceMotion: true }));
    expect(applyAppPrefs()).toMatchObject({ reduceMotion: true, theme: 'light' });
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
});

describe('recent properties', () => {
  it('keeps the eight most recent unique ids, newest first', () => {
    for (let i = 1; i <= 10; i += 1) pushRecentProp(i);
    pushRecentProp(5);
    expect(getRecentProps()).toEqual([5, 10, 9, 8, 7, 6, 4, 3]);
  });

  it('ignores empty ids', () => {
    expect(pushRecentProp('')).toEqual([]);
    expect(pushRecentProp(null)).toEqual([]);
  });

  it('is scoped to the signed-in mobile', () => {
    pushRecentProp('anon-1');
    localStorage.setItem('draazyUser', JSON.stringify({ mobile: '9876543210' }));
    expect(getRecentProps()).toEqual([]);
    pushRecentProp('mine');
    expect(localStorage.getItem('dzRecentProps:9876543210')).toBe('["mine"]');
    expect(localStorage.getItem('dzRecentProps:anon')).toBe('["anon-1"]');
  });
});

describe('recent searches', () => {
  it('stores label, url and timestamp, de-duplicating by url', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    pushRecentSearch({ label: 'Baner', url: '/listings?q=baner' });
    vi.setSystemTime(2000);
    const out = pushRecentSearch({ label: 'Baner again', url: '/listings?q=baner' });
    expect(out).toEqual([{ label: 'Baner again', url: '/listings?q=baner', at: 2000 }]);
  });

  it('caps the list at six', () => {
    for (let i = 0; i < 8; i += 1) pushRecentSearch({ label: `s${i}`, url: `/u${i}` });
    const saved = getRecentSearches();
    expect(saved).toHaveLength(6);
    expect(saved[0].label).toBe('s7');
  });

  it('rejects incomplete records', () => {
    expect(pushRecentSearch(null)).toEqual([]);
    expect(pushRecentSearch({ label: 'x' })).toEqual([]);
    expect(pushRecentSearch({ url: '/x' })).toEqual([]);
  });
});

describe('last search', () => {
  it('round-trips through session storage', () => {
    expect(getLastSearch()).toBeNull();
    setLastSearch({ url: '/listings?bhk=2' });
    expect(getLastSearch()).toEqual({ url: '/listings?bhk=2' });
  });

  it('degrades to null on corrupt data or blocked storage', () => {
    sessionStorage.setItem('draazyLastSearch', '{bad');
    expect(getLastSearch()).toBeNull();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => setLastSearch({ a: 1 })).not.toThrow();
  });
});
