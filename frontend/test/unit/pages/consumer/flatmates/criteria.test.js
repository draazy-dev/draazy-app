import { describe, expect, it, vi } from 'vitest';
import {
  buildFlatmateAlertRecord, flatmateAlertLabel, flatmateCriteriaChips, fmtDate, tabMeta,
} from '../../../../../src/pages/consumer/flatmates/alertCriteria.js';
import toFlatmateQuery from '../../../../../src/pages/consumer/flatmates/facetQuery.js';
import flatmateActiveChips from '../../../../../src/pages/consumer/flatmates/activeChips.js';
import { BUDGET_MAX, BUDGET_MIN } from '../../../../../src/pages/consumer/flatmates/helpers.js';
import {
  KIND_WORD, TABS, TAB_ICON, TAB_MOVE_IN, TAB_PEOPLE, TAB_TEAMS, TAB_TEAM_UP, normalizeTab,
} from '../../../../../src/pages/consumer/flatmates/model.js';

vi.mock('../../../../../src/services/documentService.js', () => ({ uploadPersonalDocument: vi.fn() }));

const blank = () => ({
  q: '', locality: '', budget: [BUDGET_MIN, BUDGET_MAX], moveIn: '', gender: '', genderOnly: false, roomType: '', furnishing: '',
  sharing: '', verifiedOnly: false, gated: false, attachedBath: false, bhk: '', vegOnly: false, parking: '', age: '',
  roomForTwo: false, vibe: [], near: '', nearLabel: '', nearRadius: 5, nearMode: 'km',
});

describe('tabs', () => {
  it('normalizes aliases and unknown values', () => {
    expect(normalizeTab('rooms')).toBe(TAB_MOVE_IN);
    expect(normalizeTab('flatmates')).toBe(TAB_PEOPLE);
    expect(normalizeTab(TAB_TEAM_UP)).toBe(TAB_PEOPLE);
    expect(normalizeTab('groups')).toBe(TAB_TEAMS);
    expect(normalizeTab('teams')).toBe(TAB_TEAMS);
    expect(normalizeTab('nope')).toBe(TAB_MOVE_IN);
    expect(normalizeTab(undefined)).toBe(TAB_MOVE_IN);
    expect(TABS).toEqual([TAB_MOVE_IN, TAB_PEOPLE, TAB_TEAMS]);
    expect(Object.keys(TAB_ICON)).toEqual(TABS);
    expect(KIND_WORD[TAB_PEOPLE]).toBe('flatmates');
  });
});

describe('toFlatmateQuery', () => {
  it('drops empty filters', () => {
    const q = toFlatmateQuery(blank());
    expect(Object.values(q).every((v) => v === undefined)).toBe(true);
  });

  it('maps every active filter', () => {
    const q = toFlatmateQuery({
      ...blank(), q: 'baner', locality: 'Baner', budget: [5000, 20000], moveIn: 'now', gender: 'female', genderOnly: true, roomType: 'private',
      furnishing: 'semi', sharing: '3', verifiedOnly: true, gated: true, attachedBath: true, bhk: '2', vegOnly: true, parking: 'car',
      age: '25-30', roomForTwo: true, vibe: ['food:0'], near: '18.5,73.8', nearRadius: 7, nearMode: 'min',
    }, { sort: 'newest' });
    expect(q).toEqual({
      q: 'baner', locality: 'Baner', budget: [5000, 20000], moveIn: 'now', gender: 'female', strictGender: true, roomType: 'private',
      furnishing: 'semi', sharing: '3', verifiedOnly: true, gated: true, attachedBath: true, bhk: '2', vegOnly: true, parking: 'car',
      minAge: 25, maxAge: 30, minOpenSeats: 2, vibe: ['food:0'], near: '18.5,73.8', nearRadius: 7, nearMode: 'min', sort: 'newest', me: undefined,
    });
  });

  it('only sends a budget when it narrows the default range', () => {
    expect(toFlatmateQuery({ budget: [0, 30000] }).budget).toEqual([0, 30000]);
    expect(toFlatmateQuery({ budget: [1000, BUDGET_MAX] }).budget).toEqual([1000, BUDGET_MAX]);
    expect(toFlatmateQuery({ budget: [BUDGET_MIN, BUDGET_MAX] }).budget).toBeUndefined();
    expect(toFlatmateQuery().budget).toBeUndefined();
  });

  it('only sends strictGender when a gender is chosen', () => {
    expect(toFlatmateQuery({ genderOnly: true }).strictGender).toBeUndefined();
  });

  it('supports an open-ended age band', () => {
    const q = toFlatmateQuery({ age: '31-' });
    expect(q.minAge).toBe(31);
    expect(q.maxAge).toBeUndefined();
  });

  describe('match sort', () => {
    it('adds facets from my post', () => {
      expect(toFlatmateQuery({}, { sort: 'match', myPost: { localities: ['Baner', 'Aundh'], budget: 15000, gender: 'male' } }).me)
        .toEqual({ localities: ['Baner', 'Aundh'], budget: 15000, gender: 'male' });
    });

    it('derives locality and per-seat budget from a group post', () => {
      expect(toFlatmateQuery({}, { sort: 'match', myPost: { locality: 'Wakad', rent: 30000, seatsTotal: 3 } }).me)
        .toEqual({ localities: ['Wakad'], budget: 10000, gender: undefined });
      expect(toFlatmateQuery({}, { sort: 'match', myPost: { rent: 9000 } }).me).toEqual({ localities: undefined, budget: 9000, gender: undefined });
    });

    it('omits facets when nothing is known or there is no post', () => {
      expect(toFlatmateQuery({}, { sort: 'match', myPost: {} }).me).toBeUndefined();
      expect(toFlatmateQuery({}, { sort: 'match' }).me).toBeUndefined();
      expect(toFlatmateQuery({}, { sort: 'newest', myPost: { locality: 'X' } }).me).toBeUndefined();
    });
  });
});

describe('alert records', () => {
  it('builds a rooms record with budget bounds and tab-scoped fields', () => {
    const rec = buildFlatmateAlertRecord({
      ...blank(), locality: 'Baner', budget: [5000, 20000], gender: 'female', genderOnly: true, roomType: 'private', furnishing: 'furnished',
      sharing: '3', attachedBath: true, gated: true, bhk: '2', vegOnly: true, parking: 'bike', verifiedOnly: true, vibe: ['food:0'], age: '25-30',
      roomForTwo: true,
    }, TAB_MOVE_IN);
    expect(rec).toMatchObject({
      kind: 'flatmates', tab: TAB_MOVE_IN, locality: 'Baner', budget: 20000, budgetMin: 5000, gender: 'female', strictGender: true,
      roomType: 'private', furnishing: 'furnished', sharing: '', attachedBath: true, gated: true, bhk: '2', vegOnly: true, parking: 'bike',
      verifiedOnly: true, vibe: ['food:0'],
    });
    expect(rec.minAge).toBeUndefined();
    expect(rec.minOpenSeats).toBeUndefined();
    expect(rec.label).toBe(flatmateAlertLabel(rec));
  });

  it('builds a people record with age and no placement fields', () => {
    const rec = buildFlatmateAlertRecord({ ...blank(), age: '18-24', genderOnly: true, gender: 'male', bhk: '2', furnishing: 'semi' }, TAB_PEOPLE);
    expect(rec).toMatchObject({ minAge: 18, maxAge: 24, strictGender: false, bhk: '', furnishing: '', budget: undefined, budgetMin: undefined });
  });

  it('builds a teams record with sharing and seats', () => {
    const rec = buildFlatmateAlertRecord({ ...blank(), sharing: '4', roomForTwo: true, roomType: 'private' }, TAB_TEAMS);
    expect(rec).toMatchObject({ sharing: '4', minOpenSeats: 2, roomType: '' });
  });

  it('copies the vibe array', () => {
    const filters = { ...blank(), vibe: ['pets:1'] };
    const rec = buildFlatmateAlertRecord(filters, TAB_MOVE_IN);
    rec.vibe.push('x');
    expect(filters.vibe).toEqual(['pets:1']);
  });
});

describe('flatmateAlertLabel', () => {
  it('starts with the tab word and joins parts', () => {
    expect(flatmateAlertLabel({ tab: TAB_MOVE_IN })).toBe('Rooms');
    expect(flatmateAlertLabel({ tab: 'unknown' })).toBe('Rooms');
    const label = flatmateAlertLabel({
      tab: TAB_TEAMS, locality: 'Baner', budget: 20000, budgetMin: 5000, gender: 'male', strictGender: true, roomType: 'shared',
      furnishing: 'semi', sharing: '3', bhk: '4', minOpenSeats: 2, minAge: 20, maxAge: 30, vegOnly: true, parking: 'car',
      attachedBath: true, gated: true, verifiedOnly: true,
    });
    const parts = label.split(' \u00b7 ');
    expect(parts[0]).toBe('Teams');
    expect(parts).toEqual(expect.arrayContaining([
      'Baner', 'Men-only homes', 'Shared room', 'Semi-furnished', '3 sharing', '4+ BHK', '2+ seats open', 'Veg-only', 'Car parking',
      'Attached bath', 'Gated', 'Verified',
    ]));
    expect(parts.some((p) => p.includes('\u2013'))).toBe(true);
  });

  it('formats open-ended budgets and ages', () => {
    expect(flatmateAlertLabel({ tab: TAB_MOVE_IN, budget: 9000 })).toMatch(/\u2264/);
    expect(flatmateAlertLabel({ tab: TAB_MOVE_IN, budgetMin: 9000 })).toMatch(/\u2265/);
    expect(flatmateAlertLabel({ tab: TAB_MOVE_IN, budget: BUDGET_MAX })).toBe('Rooms');
    expect(flatmateAlertLabel({ tab: TAB_PEOPLE, minAge: 31 })).toMatch(/Age 31\+$/);
    expect(flatmateAlertLabel({ tab: TAB_PEOPLE, maxAge: 24 })).toMatch(/Age \u2264 24$/);
  });

  it('shows sharing only for team tabs and non-strict gender names', () => {
    expect(flatmateAlertLabel({ tab: TAB_MOVE_IN, sharing: '3' })).toBe('Rooms');
    expect(flatmateAlertLabel({ tab: TAB_TEAM_UP, sharing: '3' })).toMatch(/3 sharing/);
    expect(flatmateAlertLabel({ tab: TAB_PEOPLE, gender: 'female' })).toMatch(/Women$/);
    expect(flatmateAlertLabel({ tab: TAB_PEOPLE, gender: 'other' })).toMatch(/other$/);
  });
});

describe('flatmateCriteriaChips', () => {
  it('always starts with the tab chip', () => {
    expect(flatmateCriteriaChips({ tab: TAB_PEOPLE })).toEqual([{ icon: 'user-search', text: 'Flatmates' }]);
  });

  it('adds one chip per criterion', () => {
    const chips = flatmateCriteriaChips({
      tab: TAB_MOVE_IN, locality: 'Baner', budget: 20000, moveIn: 'now', gender: 'female', strictGender: true, roomType: 'private',
      furnishing: 'furnished', bhk: '2', vegOnly: true, parking: 'bike', attachedBath: true, gated: true, verifiedOnly: true,
      vibe: ['food:0', 'food:1', 'sleep:2', 'bogus:1', 'pets:9'],
    });
    const byText = Object.fromEntries(chips.map((c) => [c.text, c.icon]));
    expect(byText['Baner']).toBe('map-pin');
    expect(chips.find((c) => c.icon === 'wallet').text).toMatch(/\/mo$/);
    expect(byText['Move-in: Immediate']).toBe('calendar');
    expect(byText['Women-only homes']).toBe('venus');
    expect(byText['Private room']).toBe('door-open');
    expect(byText['Furnished']).toBe('sofa');
    expect(byText['2 BHK']).toBe('building-2');
    expect(byText['Veg-only home']).toBe('utensils');
    expect(byText['Bike parking']).toBe('car');
    expect(byText['Gated society']).toBe('lock-keyhole');
    expect(byText['Verified only']).toBe('shield-check');
    expect(byText['Veg only / Eggs ok']).toBe('sparkles');
    expect(byText['Night owl']).toBe('sparkles');
    expect(chips.filter((c) => c.icon === 'sparkles')).toHaveLength(2);
  });

  it('uses the plain user icon for a non-strict gender and formats dated move-in', () => {
    const chips = flatmateCriteriaChips({ tab: TAB_TEAMS, gender: 'male', moveIn: '2026-03-05', sharing: '3', minOpenSeats: 2, minAge: 20, maxAge: 30 });
    expect(chips.find((c) => c.text === 'Men')).toEqual({ icon: 'user', text: 'Men' });
    expect(chips.find((c) => c.icon === 'calendar').text).toBe(`Move-in by ${fmtDate('2026-03-05')}`);
    expect(chips.find((c) => c.text === '3 sharing')).toBeTruthy();
    expect(chips.find((c) => c.text === '2+ seats open').icon).toBe('user-plus');
    expect(chips.find((c) => c.text.startsWith('Age ')).text).toContain('20');
  });

  it('skips a move-in that is neither "now" nor a date', () => {
    expect(flatmateCriteriaChips({ tab: TAB_PEOPLE, moveIn: '15' })).toHaveLength(1);
  });

  it('tabMeta falls back to rooms', () => {
    expect(tabMeta('groups').word).toBe('Teams');
    expect(tabMeta('zzz').word).toBe('Rooms');
  });
});

describe('flatmateActiveChips', () => {
  const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
  const chips = (filters, tab) => flatmateActiveChips({ ...blank(), ...filters }, tab, t, '5k-20k', vi.fn());
  const ids = (list) => list.map((c) => c.id);

  it('is empty for default filters', () => {
    expect(chips({}, TAB_MOVE_IN)).toEqual([]);
  });

  it('builds placement chips for the rooms tab', () => {
    const list = chips({
      q: 'x', budget: [5000, 20000], locality: 'Baner', furnishing: 'semi', gated: true, attachedBath: true, bhk: '4', vegOnly: true,
      parking: 'car', roomType: 'private', verifiedOnly: true, moveIn: 'now',
    }, TAB_MOVE_IN);
    expect(ids(list)).toEqual([
      'q', 'budget', 'locality', 'moveIn', 'roomType', 'furnishing', 'verifiedOnly', 'gated', 'attachedBath', 'bhk', 'vegOnly', 'parking',
    ]);
    expect(list.find((c) => c.id === 'budget').label).toBe('5k-20kflatmates.perMonth');
    expect(list.find((c) => c.id === 'moveIn').label).toBe('flatmates.chipMoveInNow');
    expect(list.find((c) => c.id === 'roomType').label).toBe('flatmates.optPrivateRoom');
    expect(list.find((c) => c.id === 'furnishing').label).toBe('flatmates.furnSemi');
    expect(list.find((c) => c.id === 'bhk').label).toBe('flatmates.bhk4Plus');
    expect(list.find((c) => c.id === 'parking').label).toBe('flatmates.parking_car');
  });

  it('hides tab-specific chips on other tabs', () => {
    const f = { furnishing: 'furnished', gated: true, vegOnly: true, parking: 'bike', attachedBath: true, sharing: '3', roomForTwo: true, age: '18-24', bhk: '2', roomType: 'shared' };
    expect(ids(chips(f, TAB_PEOPLE))).toEqual(['roomType', 'age']);
    expect(ids(chips(f, TAB_TEAMS))).toEqual(['sharing', 'bhk', 'roomForTwo']);
  });

  it('labels gender depending on the strict flag and tab', () => {
    expect(chips({ gender: 'male', genderOnly: true }, TAB_MOVE_IN)[0].label).toBe('flatmates.menOnlyHomes');
    expect(chips({ gender: 'female', genderOnly: true }, TAB_MOVE_IN)[0].label).toBe('flatmates.womenOnlyHomes');
    expect(chips({ gender: 'male', genderOnly: true }, TAB_PEOPLE)[0].label).toBe('flatmates.gMen');
    expect(chips({ gender: 'female' }, TAB_MOVE_IN)[0].label).toBe('flatmates.gWomen');
  });

  it('describes near, dated move-in, age and vibe chips', () => {
    const list = chips({
      near: 'x', nearLabel: '', nearRadius: 3, nearMode: 'min', moveIn: '2026-03-05', age: '31-', vibe: ['food:0', 'pets:1'],
    }, TAB_PEOPLE);
    expect(list.find((c) => c.id === 'near').label).toContain('"unit":"flatmates.unitMin"');
    expect(list.find((c) => c.id === 'near').label).toContain('flatmates.placeWord');
    expect(list.find((c) => c.id === 'moveIn').label).toContain(fmtDate('2026-03-05'));
    expect(list.find((c) => c.id === 'age').label).toContain('31+');
    expect(chips({ age: '18-24' }, TAB_PEOPLE)[0].label).toContain('18\u201324');
    expect(ids(list)).toEqual(expect.arrayContaining(['vibe:food:0', 'vibe:pets:1']));
  });

  it('remove() resets the filter through setF', () => {
    const setF = vi.fn();
    const list = flatmateActiveChips({ ...blank(), q: 'x', near: 'y', gender: 'male', vibe: ['food:0', 'pets:1'] }, TAB_MOVE_IN, t, '', setF);
    list.find((c) => c.id === 'q').remove();
    expect(setF).toHaveBeenLastCalledWith({ q: '' });
    list.find((c) => c.id === 'near').remove();
    expect(setF).toHaveBeenLastCalledWith({ near: '', nearLabel: '', nearRadius: 5, nearMode: 'km' });
    list.find((c) => c.id === 'gender').remove();
    expect(setF).toHaveBeenLastCalledWith({ gender: '', genderOnly: false });
    list.find((c) => c.id === 'vibe:food:0').remove();
    expect(setF).toHaveBeenLastCalledWith({ vibe: ['pets:1'] });
  });
});
