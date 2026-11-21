import { afterEach, describe, expect, it } from 'vitest';
import {
  AGE_BANDS, applyFlatmateStateToSearchParams, clearRememberedFlatmateSearch, flatmateFiltersActive,
  flatmateFiltersEqual, flatmateFiltersFromParams, flatmateFiltersToParams, hasFlatmateSearchParams,
  normalizeVibe, readRememberedFlatmateSearch, saveRememberedFlatmateSearch, sortFromParams,
} from '../../../../src/lib/flatmates/filterState.js';

const defaults = {
  q: '', locality: '', budget: [0, 50000], moveIn: '', gender: '', genderOnly: false, roomType: '', furnishing: '',
  sharing: '', verifiedOnly: false, gated: false, attachedBath: false, bhk: '', vegOnly: false, parking: '', age: '',
  roomForTwo: false, vibe: [], near: '', nearLabel: '', nearRadius: 5, nearMode: 'km',
};
const qs = (s) => new URLSearchParams(s);
const KEY = 'draazy.flatmates.lastSearch.v1';

afterEach(() => localStorage.clear());

describe('normalizeVibe', () => {
  it('keeps valid tokens, dedupes and orders by key', () => {
    expect(normalizeVibe(['sleep:1', 'food:2', 'food:0', 'food:0', 'bad:1', 'pets:9', 5, null])).toEqual(['food:0', 'food:2', 'sleep:1']);
    expect(normalizeVibe(undefined)).toEqual([]);
  });
});

describe('flatmateFiltersFromParams', () => {
  it('returns defaults for no params without sharing arrays', () => {
    const f = flatmateFiltersFromParams(qs(''), defaults);
    expect(f).toEqual(defaults);
    expect(f.budget).not.toBe(defaults.budget);
    expect(f.vibe).not.toBe(defaults.vibe);
  });

  it('parses valid params', () => {
    const f = flatmateFiltersFromParams(qs('q= hi &loc= Baner &g=female&gonly=1&room=private&furn=semi&budget=5000-20000&movein=2026-12-01&sharing=3&v=1&gated=1&bath=1&bhk=2&veg=1&park=car&age=25-30&seats=2&vibe=food:0,sleep:1&near=18.5,73.8&nearlabel=Office&nearmode=min&nearr=10'), defaults);
    expect(f).toMatchObject({
      q: ' hi ', locality: 'Baner', gender: 'female', genderOnly: true, roomType: 'private', furnishing: 'semi',
      budget: [5000, 20000], moveIn: '2026-12-01', sharing: '3', verifiedOnly: true, gated: true, attachedBath: true,
      bhk: '2', vegOnly: true, parking: 'car', age: '25-30', roomForTwo: true, vibe: ['food:0', 'sleep:1'],
      near: '18.5,73.8', nearLabel: 'Office', nearMode: 'min', nearRadius: 10,
    });
  });

  it('rejects invalid values', () => {
    const f = flatmateFiltersFromParams(qs('g=other&gonly=1&room=x&furn=y&budget=9-1&movein=tomorrow&sharing=9&bhk=9&park=bus&age=40&seats=3&near=abc&veg=0'), defaults);
    expect(f).toEqual(defaults);
  });

  it('only honours gonly with a gender and clamps budget to the defaults', () => {
    expect(flatmateFiltersFromParams(qs('gonly=1'), defaults).genderOnly).toBe(false);
    expect(flatmateFiltersFromParams(qs('budget=0-99999'), defaults).budget).toEqual([0, 50000]);
    expect(flatmateFiltersFromParams(qs('movein=now'), defaults).moveIn).toBe('now');
  });

  it('translates legacy habits to vibe tokens', () => {
    expect(flatmateFiltersFromParams(qs('habits=Non-Smoker,vegetarian,pet-friendly,unknown'), defaults).vibe)
      .toEqual(['food:0', 'smoking:0', 'pets:1', 'pets:2']);
  });

  it('defaults the near label, mode and radius', () => {
    const f = flatmateFiltersFromParams(qs('near=1,2&nearmode=zz&nearr=500'), defaults);
    expect(f).toMatchObject({ near: '1,2', nearLabel: 'Selected place', nearMode: 'km', nearRadius: 25 });
  });
});

describe('flatmateFiltersToParams', () => {
  it('is empty for defaults and ignores genderOnly without gender', () => {
    expect(Object.keys(flatmateFiltersToParams(defaults, defaults))).toEqual([]);
    expect({ ...flatmateFiltersToParams({ ...defaults, genderOnly: true }, defaults) }).toEqual({});
  });

  it('serialises every active filter', () => {
    const filters = {
      ...defaults, q: 'x', locality: 'Baner', gender: 'male', genderOnly: true, roomType: 'shared', furnishing: 'furnished',
      budget: [1000, 2000], moveIn: 'now', sharing: 2, verifiedOnly: true, gated: true, attachedBath: true, bhk: '1',
      vegOnly: true, parking: 'bike', age: '18-24', roomForTwo: true, vibe: ['food:0'], near: '1,2', nearLabel: 'L',
      nearRadius: 0, nearMode: '',
    };
    expect({ ...flatmateFiltersToParams(filters, defaults) }).toEqual({
      q: 'x', loc: 'Baner', g: 'male', gonly: '1', room: 'shared', furn: 'furnished', budget: '1000-2000', movein: 'now',
      sharing: '2', v: '1', gated: '1', bath: '1', bhk: '1', veg: '1', park: 'bike', age: '18-24', seats: '2',
      vibe: 'food:0', near: '1,2', nearlabel: 'L', nearr: '5', nearmode: 'km',
    });
  });

  it('round-trips through params', () => {
    const filters = { ...defaults, locality: 'Kothrud', budget: [3000, 9000], vibe: ['pets:1'], gender: 'female', genderOnly: true };
    const back = flatmateFiltersFromParams(new URLSearchParams({ ...flatmateFiltersToParams(filters, defaults) }), defaults);
    expect(flatmateFiltersEqual(back, filters)).toBe(true);
  });
});

describe('flatmateFiltersEqual / Active', () => {
  it('compares each field', () => {
    expect(flatmateFiltersEqual(defaults, { ...defaults })).toBe(true);
    ['q', 'locality', 'gender', 'bhk', 'near', 'nearRadius', 'age'].forEach((k) => {
      expect(flatmateFiltersEqual(defaults, { ...defaults, [k]: 'z' })).toBe(false);
    });
    expect(flatmateFiltersEqual(defaults, { ...defaults, budget: [1, 2] })).toBe(false);
    expect(flatmateFiltersEqual(defaults, { ...defaults, vibe: ['food:0'] })).toBe(false);
    expect(flatmateFiltersEqual({ ...defaults, vibe: ['food:0'] }, { ...defaults, vibe: ['food:1'] })).toBe(false);
  });

  it('reports activity', () => {
    expect(flatmateFiltersActive(defaults, defaults)).toBe(false);
    expect(flatmateFiltersActive({ ...defaults, gated: true }, defaults)).toBe(true);
  });
});

describe('search-param helpers', () => {
  it('detects any params', () => {
    expect(hasFlatmateSearchParams(qs(''))).toBe(false);
    expect(hasFlatmateSearchParams(qs('a=1'))).toBe(true);
  });

  it('applies state, replacing old keys and keeping unrelated ones', () => {
    const next = applyFlatmateStateToSearchParams(qs('keep=1&loc=old&sort=newest&view=x'), { ...defaults, locality: 'Baner' }, defaults, { sort: 'newest', tab: 'groups' });
    expect(Object.fromEntries(next)).toMatchObject({ keep: '1', loc: 'Baner', sort: 'newest', view: 'groups' });
    const plain = applyFlatmateStateToSearchParams(qs('sort=newest'), defaults, defaults, { tab: 'move-in' });
    expect(plain.toString()).toBe('');
    expect(applyFlatmateStateToSearchParams(qs(''), defaults, defaults, { sort: null }).has('sort')).toBe(false);
  });

  it('reads the sort', () => {
    expect(sortFromParams(qs('sort=budget-low'))).toBe('budget-low');
    expect(sortFromParams(qs('sort=bogus'))).toBe('verified');
    expect(sortFromParams(qs(''))).toBe('verified');
  });

  it('exposes age bands', () => {
    expect(AGE_BANDS['31-']).toEqual([31, undefined]);
  });
});

describe('remembered search', () => {
  it('returns null when nothing is saved or the data is corrupt', () => {
    expect(readRememberedFlatmateSearch(defaults)).toBeNull();
    localStorage.setItem(KEY, '{bad');
    expect(readRememberedFlatmateSearch(defaults)).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ filters: 'x' }));
    expect(readRememberedFlatmateSearch(defaults)).toBeNull();
    localStorage.setItem(KEY, 'null');
    expect(readRememberedFlatmateSearch(defaults)).toBeNull();
  });

  it('saves active filters and reads them back', () => {
    const filters = { ...defaults, q: 'quiet', locality: 'Baner', budget: [2000, 8000], gender: 'male', genderOnly: true, sharing: '3', vibe: ['food:0'], near: '1,2', nearLabel: 'L', nearRadius: 7, nearMode: 'min', roomType: 'private', verifiedOnly: true, age: '25-30', bhk: '2', parking: 'car', vegOnly: true, roomForTwo: true, gated: true, attachedBath: true, furnishing: 'semi', moveIn: 'now' };
    saveRememberedFlatmateSearch(filters, defaults);
    const stored = JSON.parse(localStorage.getItem(KEY));
    expect(typeof stored.savedAt).toBe('number');
    expect(readRememberedFlatmateSearch(defaults)).toEqual(filters);
  });

  it('clears the stored search when filters become inactive', () => {
    saveRememberedFlatmateSearch({ ...defaults, gated: true }, defaults);
    expect(localStorage.getItem(KEY)).not.toBeNull();
    saveRememberedFlatmateSearch(defaults, defaults);
    expect(localStorage.getItem(KEY)).toBeNull();
    saveRememberedFlatmateSearch({ ...defaults, gated: true }, defaults);
    clearRememberedFlatmateSearch();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('sanitises stored values and migrates legacy habits', () => {
    localStorage.setItem(KEY, JSON.stringify({ filters: {
      q: 5, locality: ' Aundh ', gender: 'x', sharing: 9, budget: [100, 1], verifiedOnly: 'yes', roomType: 'private',
      habits: ['vegetarian'], vibe: ['sleep:2'], near: 'bad', nearRadius: 3, age: 'zzz', bhk: '7', genderOnly: true,
    } }));
    expect(readRememberedFlatmateSearch(defaults)).toMatchObject({
      locality: 'Aundh', gender: '', sharing: '', budget: [0, 50000], verifiedOnly: false, roomType: 'private',
      vibe: ['food:0', 'sleep:2'], near: '', nearLabel: '', age: '', bhk: '', genderOnly: false,
    });
  });

  it('returns null when the stored filters equal the defaults', () => {
    localStorage.setItem(KEY, JSON.stringify({ filters: { q: '' } }));
    expect(readRememberedFlatmateSearch(defaults)).toBeNull();
  });

  it('repairs an invalid near mode and clamps the radius', () => {
    localStorage.setItem(KEY, JSON.stringify({ filters: { near: '1,2', nearMode: 'zz', nearRadius: 400 } }));
    expect(readRememberedFlatmateSearch(defaults)).toMatchObject({ near: '1,2', nearMode: 'km', nearRadius: 25 });
  });
});
