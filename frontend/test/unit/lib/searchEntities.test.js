import { describe, expect, it } from 'vitest';
import { LANDMARKS } from '../../../src/pages/consumer/listings/constants.js';
import { KIND_ICON, LANDMARK_RADIUS_KM, buildEntityIndex, paramsFromTokens, searchEntities, slugOfName } from '../../../src/lib/searchEntities.js';

const hinjawadi = LANDMARKS.find((l) => l.label === 'Hinjawadi IT Park');
const [hLat, hLng] = hinjawadi.value.split(',').map(Number);

const listings = [
  { localitySlug: 'baner', locality: 'Baner', societySlug: 'park-view', lat: hLat, lng: hLng },
  { localitySlug: 'baner', locality: 'Baner (alt)', societySlug: 'park-view', lat: hLat + 0.01, lng: hLng },
  { localitySlug: 'wakad', locality: 'Wakad', lat: 0, lng: 0 },
  { localitySlug: 'aundh', locality: 'Aundh' },
  null,
  { lat: null, lng: null },
];
const societies = [
  { name: 'Park View', slug: 'park-view', localitySlug: 'baner' },
  { name: 'Park Lane', slug: 'park-lane', localitySlug: 'baner' },
  { name: 'Unlisted Park', slug: 'ghost' },
];

describe('slugOfName', () => {
  it('slugifies free text', () => {
    expect(slugOfName('  Viman Nagar! ')).toBe('viman-nagar');
    expect(slugOfName(null)).toBe('');
  });

  it('prefers the slug of a known locality name, case-insensitively', () => {
    const index = buildEntityIndex(listings);
    expect(slugOfName('BANER', index)).toBe('baner');
    expect(slugOfName('Kothrud', index)).toBe('kothrud');
  });
});

describe('buildEntityIndex', () => {
  const index = buildEntityIndex(listings, societies);

  it('counts listings per locality and society, keeping the first name seen', () => {
    expect(index.locCount.get('baner')).toBe(2);
    expect(index.locNames.get('baner')).toBe('Baner');
    expect(index.socCount.get('park-view')).toBe(2);
    expect(index.size).toBe(listings.length);
    expect(index.societies).toBe(societies);
  });

  it('counts listings within the landmark radius only', () => {
    expect(LANDMARK_RADIUS_KM).toBe(5);
    expect(index.lmCount.get(hinjawadi.value)).toBe(2);
    expect(index.lmCount.has('')).toBe(false);
  });

  it('copes with non-array input', () => {
    const empty = buildEntityIndex(undefined);
    expect(empty.size).toBe(0);
    expect(empty.societies).toEqual([]);
    expect([...empty.lmCount.values()].every((n) => n === 0)).toBe(true);
  });
});

describe('searchEntities', () => {
  const index = buildEntityIndex(listings, societies);

  it('returns nothing for blank queries or a missing index', () => {
    expect(searchEntities('', index)).toEqual([]);
    expect(searchEntities('  ', index)).toEqual([]);
    expect(searchEntities('baner', undefined)).toEqual([]);
  });

  it('matches localities with counts', () => {
    expect(searchEntities('ban', index)).toEqual([
      { kind: 'locality', id: 'baner', slug: 'baner', label: 'Baner', sublabel: 'Locality', count: 2 },
    ]);
  });

  it('matches only societies that have listings, labelled with their locality', () => {
    const out = searchEntities('park', index).filter((r) => r.kind === 'society');
    expect(out).toEqual([
      { kind: 'society', id: 'park-view', slug: 'park-view', label: 'Park View', sublabel: 'Society \u00b7 Baner', count: 2, loc: 'baner' },
    ]);
  });

  it('matches landmarks that have nearby listings', () => {
    const out = searchEntities('hinjawadi', index);
    expect(out).toEqual([
      { kind: 'landmark', id: hinjawadi.value, value: hinjawadi.value, label: hinjawadi.label, sublabel: hinjawadi.group, count: 2 },
    ]);
  });

  it('applies the overall limit', () => {
    expect(searchEntities('a', index, { limit: 2 })).toHaveLength(2);
  });

  it('applies the per-kind limit and orders by count then label', () => {
    const many = buildEntityIndex(['a', 'b', 'c', 'd', 'e'].flatMap((x, i) =>
      Array.from({ length: 5 - i }, () => ({ localitySlug: `x${x}`, locality: `X ${x}` }))));
    const out = searchEntities('x', many, { perKind: 3 }).filter((r) => r.kind === 'locality');
    expect(out.map((r) => r.slug)).toEqual(['xa', 'xb', 'xc']);
  });

  it('labels societies without a known locality plainly', () => {
    const idx = buildEntityIndex([{ societySlug: 'solo' }], [{ name: 'Solo Tower', slug: 'solo' }]);
    expect(searchEntities('solo', idx)[0]).toMatchObject({ sublabel: 'Society', loc: null });
  });
});

describe('paramsFromTokens', () => {
  it('builds loc/soc params and dedupes localities', () => {
    expect(paramsFromTokens([
      { kind: 'locality', slug: 'baner' },
      { kind: 'society', slug: 's1', loc: 'baner' },
      { kind: 'society', slug: 's2', loc: 'wakad' },
      { kind: 'locality', slug: 'baner' },
    ])).toEqual({ loc: 'baner,wakad', soc: 's1,s2' });
  });

  it('uses the last landmark or place as the near point', () => {
    expect(paramsFromTokens([
      { kind: 'landmark', value: '18.5,73.8', label: 'Spot' },
      { kind: 'place', near: '18.6,73.9', nearLabel: 'Cafe' },
    ])).toEqual({ near: '18.6,73.9', nearlabel: 'Cafe' });
    expect(paramsFromTokens([{ kind: 'place', near: '18.6,73.9', label: 'Fallback' }])).toEqual({ near: '18.6,73.9', nearlabel: 'Fallback' });
  });

  it('ignores unknown tokens, places without a point and bad input', () => {
    expect(paramsFromTokens([{ kind: 'place' }, { kind: 'zzz' }])).toEqual({});
    expect(paramsFromTokens(undefined)).toEqual({});
  });
});

describe('KIND_ICON', () => {
  it('maps every kind to an icon', () => {
    expect(Object.keys(KIND_ICON).sort()).toEqual(['landmark', 'locality', 'place', 'society']);
  });
});
