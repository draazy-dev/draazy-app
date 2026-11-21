import { describe, expect, it } from 'vitest';
import {
  BUY_TYPES, COMMERCIAL_SUBTYPES, COMMERCIAL_TYPES, HOME_TYPE_OPTS, LANDUSE_LBL, LAND_USE, RENT_TYPES, RESIDENTIAL_KEYS,
  SEARCH_TYPES, canonicalTypeKey, isResidentialHome, isTypeKey, matchTypeKey,
} from '../../../src/data/propertyTypes.js';
import {
  CATEGORIES, CITY_POPULAR, COMMERCIAL_TYPES as HOME_COMMERCIAL, LAND_USE as HOME_LAND_USE, NEARBY, TYPE_OPTS,
  popularChipsFor, popularFor,
} from '../../../src/data/homeData.js';
import { OPTION_INFO, tipFor } from '../../../src/data/optionInfo.js';

describe('propertyTypes', () => {
  it('splits search types into buy and rent lists as key/label pairs', () => {
    expect(BUY_TYPES.map(([k]) => k)).toEqual(['flat', 'house', 'villa', 'commercial', 'plot', 'farmland']);
    expect(RENT_TYPES.map(([k]) => k)).toContain('flatmates');
    expect(BUY_TYPES.map(([k]) => k)).not.toContain('flatmates');
    expect(BUY_TYPES[0]).toEqual(['flat', 'Flat']);
  });

  it('adds the icon to the home search options', () => {
    expect(HOME_TYPE_OPTS.buy[0]).toEqual(['flat', 'Flat', 'building']);
    expect(HOME_TYPE_OPTS.rent).toHaveLength(RENT_TYPES.length);
  });

  it('knows which keys are search types', () => {
    for (const { key } of SEARCH_TYPES) expect(isTypeKey(key)).toBe(true);
    expect(isTypeKey('castle')).toBe(false);
  });

  describe('canonicalTypeKey', () => {
    it.each([
      ['flat', 'flat'], ['  VILLA ', 'villa'], ['Apartment', 'flat'], ['studio', 'flat'], ['Penthouse', 'flat'],
      ['independent house', 'house'], ['Row House', 'house'], ['villa / house', 'house'], ['plot / land', 'plot'],
      ['Plot / Plot', 'plot'], ['open plot', 'plot'], ['farm land', 'farmland'],
    ])('maps %j to %j', (raw, key) => expect(canonicalTypeKey(raw)).toBe(key));

    it.each([['castle', ''], ['', ''], [null, ''], [undefined, ''], ['   ', '']])('maps %j to nothing', (raw, key) => {
      expect(canonicalTypeKey(raw)).toBe(key);
    });
  });

  describe('matchTypeKey', () => {
    it('matches listing type text against a key case-insensitively', () => {
      expect(matchTypeKey('flat', '3 BHK Apartment')).toBe(true);
      expect(matchTypeKey('house', 'Independent House')).toBe(true);
      expect(matchTypeKey('commercial', 'Co-Working space')).toBe(true);
      expect(matchTypeKey('plot', 'Open Plot')).toBe(true);
      expect(matchTypeKey('flat', 'Villa')).toBe(false);
    });

    it('never matches an unknown key, missing text or a key without match terms', () => {
      expect(matchTypeKey('castle', 'castle')).toBe(false);
      expect(matchTypeKey('flatmates', 'shared room')).toBe(false);
      expect(matchTypeKey('flat', undefined)).toBe(false);
    });
  });

  it('treats flats, houses and villas as residential homes', () => {
    expect(RESIDENTIAL_KEYS).toEqual(['flat', 'house', 'villa']);
    expect(isResidentialHome('Studio apartment')).toBe(true);
    expect(isResidentialHome('Row house')).toBe(true);
    expect(isResidentialHome('Luxury villa')).toBe(true);
    expect(isResidentialHome('Office')).toBe(false);
    expect(isResidentialHome(null)).toBe(false);
  });

  it('derives commercial and land-use option lists from their definitions', () => {
    expect(COMMERCIAL_TYPES).toEqual(COMMERCIAL_SUBTYPES.map((t) => [t.key, t.label]));
    expect(LANDUSE_LBL).toEqual(Object.fromEntries(LAND_USE));
    expect(LANDUSE_LBL.mixed).toBe('Mixed-Use');
  });
});

describe('homeData', () => {
  it('re-exports the shared option lists', () => {
    expect(TYPE_OPTS).toBe(HOME_TYPE_OPTS);
    expect(HOME_COMMERCIAL).toBe(COMMERCIAL_TYPES);
    expect(HOME_LAND_USE).toBe(LAND_USE);
  });

  it('lists popular localities and chips for a known city', () => {
    expect(popularFor('Pune')).toEqual(CITY_POPULAR.Pune.map(([name]) => name));
    expect(popularFor('Pune')[0]).toBe('Baner');
    expect(popularChipsFor('Pune')).toBe(CITY_POPULAR.Pune);
  });

  it('returns nothing for an unknown city', () => {
    expect(popularFor('Atlantis')).toEqual([]);
    expect(popularChipsFor(undefined)).toEqual([]);
  });

  it('only points popular chips at buy or rent', () => {
    for (const [, deal] of CITY_POPULAR.Pune) expect(['buy', 'rent']).toContain(deal);
  });

  it('keeps nearby localities free of self references', () => {
    for (const [name, near] of Object.entries(NEARBY)) {
      expect(near.length).toBeGreaterThan(0);
      expect(near).not.toContain(name);
    }
  });

  it('points every category at a known search type or a link', () => {
    for (const cat of CATEGORIES) {
      if (cat.href) expect(cat.href.startsWith('/')).toBe(true);
      else cat.types.forEach((k) => expect(isTypeKey(k)).toBe(true));
    }
  });
});

describe('optionInfo', () => {
  it('returns the tip for a known key and null otherwise', () => {
    expect(tipFor('price.stampDuty')).toBe(OPTION_INFO['price.stampDuty']);
    expect(tipFor('price.stampDuty').title).toBe('Stamp duty');
    expect(tipFor('nope')).toBeNull();
    expect(tipFor(undefined)).toBeNull();
  });

  it('gives every tip a title and a body', () => {
    for (const [key, tip] of Object.entries(OPTION_INFO)) {
      expect(typeof tip.title, key).toBe('string');
      expect(tip.title.trim(), key).not.toBe('');
      expect(tip.body.trim(), key).not.toBe('');
    }
  });
});
