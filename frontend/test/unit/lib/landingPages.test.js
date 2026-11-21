import { describe, expect, it } from 'vitest';
import {
  LANDING_BHKS, LANDING_PLACES, MIN_INDEXABLE, PUNE, TAGLINES, bhkMatches, flatmateCopy, flatmatePath, isIndexable, isWomenOnly,
  landingCopy, landingPath, landingQuery, listingsUrl, parseFlatmateLanding, parseLanding,
} from '../../../src/lib/landingPages.js';

const baner = LANDING_PLACES.find((p) => p.slug === 'baner');

describe('catalogue', () => {
  it('gives every guide locality a tagline', () => {
    expect(LANDING_PLACES.length).toBeGreaterThan(0);
    expect(LANDING_PLACES.every((p) => p.tagline && p.name)).toBe(true);
    expect(Object.keys(TAGLINES).sort()).toEqual(LANDING_PLACES.map((p) => p.slug).sort());
    expect(LANDING_BHKS).toEqual([1, 2, 3, 4]);
  });
});

describe('landingPath / parseLanding', () => {
  it('builds paths', () => {
    expect(landingPath('rent')).toBe('/rent/pune');
    expect(landingPath('buy', 'baner', 2)).toBe('/buy/baner/2-bhk');
  });

  it('parses city, area and BHK pages', () => {
    expect(parseLanding('rent', ['pune'])).toEqual({ deal: 'rent', place: PUNE, bhk: null });
    expect(parseLanding('buy', ['baner'])).toEqual({ deal: 'buy', place: baner, bhk: null });
    expect(parseLanding('rent', ['baner', '3-bhk'])).toEqual({ deal: 'rent', place: baner, bhk: 3 });
  });

  it('rejects unknown deals, places and malformed segments', () => {
    expect(parseLanding('lease', ['baner'])).toBeNull();
    expect(parseLanding('rent', ['atlantis'])).toBeNull();
    expect(parseLanding('rent', [])).toBeNull();
    expect(parseLanding('rent', undefined)).toBeNull();
    expect(parseLanding('rent', ['baner', '5-bhk'])).toBeNull();
    expect(parseLanding('rent', ['baner', 'nonsense'])).toBeNull();
    expect(parseLanding('rent', ['baner', '2-bhk', 'extra'])).toBeNull();
    expect(parseLanding('rent', ['pune', '2-bhk'])).toBeNull();
  });
});

describe('bhkMatches / isIndexable', () => {
  it('treats 4 BHK rent pages as 4 and above', () => {
    expect(bhkMatches({ deal: 'rent' }, 4, { bhk: 5 })).toBe(true);
    expect(bhkMatches({ deal: 'buy' }, 4, { bhk: 5 })).toBe(false);
    expect(bhkMatches({ deal: 'rent' }, 2, { bhk: '2' })).toBe(true);
    expect(bhkMatches({ deal: 'rent' }, 2, { bhk: 3 })).toBe(false);
  });

  it('uses lower thresholds for BHK pages', () => {
    expect(isIndexable({ bhk: null }, MIN_INDEXABLE.place - 1)).toBe(false);
    expect(isIndexable({ bhk: null }, MIN_INDEXABLE.place)).toBe(true);
    expect(isIndexable({ bhk: 2 }, MIN_INDEXABLE.bhk - 1)).toBe(false);
    expect(isIndexable({ bhk: 2 }, MIN_INDEXABLE.bhk)).toBe(true);
  });
});

describe('landingCopy', () => {
  it('describes the city page', () => {
    const c = landingCopy({ deal: 'rent', place: PUNE, bhk: null });
    expect(c.where).toBe('Pune');
    expect(c.h1).toBe('Flats and homes for rent in Pune');
    expect(c.title).toBe('Flats and homes for rent in Pune | Draazy');
    expect(c.intro[1]).toMatch(/area guide/);
  });

  it('describes an area BHK page with the tagline and sale wording', () => {
    const c = landingCopy({ deal: 'buy', place: baner, bhk: 2 });
    expect(c.h1).toBe('2 BHK flats for sale in Baner, Pune');
    expect(c.intro[1]).toBe(`About Baner: ${baner.tagline}.`);
    expect(c.description).toContain('pay no brokerage');
  });
});

describe('landingQuery / listingsUrl', () => {
  it('omits locality for the city and expands BHK per deal', () => {
    expect(landingQuery({ deal: 'rent', place: PUNE, bhk: null })).toEqual({ deal: 'rent', rank: 'relevance' });
    const q = landingQuery({ deal: 'rent', place: baner, bhk: 2 });
    expect(q).toMatchObject({ deal: 'rent', localities: ['baner'], rank: 'relevance' });
    expect(q.bhks).toEqual(['2']);
  });

  it('builds the listings search URL', () => {
    expect(listingsUrl({ deal: 'rent', place: PUNE, bhk: null })).toBe('/listings?deal=rent');
    expect(listingsUrl({ deal: 'buy', place: baner, bhk: 3 })).toBe('/listings?deal=buy&loc=baner&bhks=3');
  });
});

describe('flatmate landings', () => {
  it('parses the women-only page and area pages', () => {
    expect(parseFlatmateLanding('women-only-pune')).toEqual({ women: true, place: PUNE });
    expect(parseFlatmateLanding('baner')).toEqual({ women: false, place: baner });
    expect(parseFlatmateLanding('nowhere')).toBeNull();
  });

  it('builds paths', () => {
    expect(flatmatePath({ women: true, place: PUNE })).toBe('/flatmates/women-only-pune');
    expect(flatmatePath({ women: false, place: baner })).toBe('/flatmates/baner');
  });

  it('writes copy for both variants', () => {
    const w = flatmateCopy({ women: true, place: PUNE });
    expect(w.h1).toBe('Women-only flats and rooms to share in Pune');
    expect(w.description).toMatch(/women flatmates/);
    const a = flatmateCopy({ women: false, place: baner });
    expect(a.h1).toBe('Flats and rooms to share in Baner, Pune');
    expect(a.title).toBe(`${a.h1} | Draazy`);
    expect(a.intro[1]).toContain(baner.tagline);
  });

  it('detects women-only rows', () => {
    expect(isWomenOnly({ gender: 'female' })).toBe(true);
    expect(isWomenOnly({ policy: 'women' })).toBe(true);
    expect(isWomenOnly({ gender: 'male', policy: 'any' })).toBe(false);
  });
});
