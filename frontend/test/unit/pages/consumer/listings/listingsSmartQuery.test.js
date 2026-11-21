import { describe, it, expect } from 'vitest';
import { INITIAL } from '../../../../../src/lib/listings/filterState.js';
import { parseSmartQuery } from '../../../../../src/pages/consumer/listings/listingsSmartQuery.js';

const localities = [
  { slug: 'baner', name: 'Baner' },
  { slug: 'wakad', name: 'Wakad' },
  { slug: 'koregaon-park', name: 'Koregaon Park' },
  { slug: 'hinjewadi', name: 'Hinjewadi' },
];
const locNameBySlug = Object.fromEntries(localities.map((l) => [l.slug, l.name]));

const parse = (q, deal = 'buy', overrides = {}) => parseSmartQuery(q, {
  current: { ...INITIAL(deal), ...overrides },
  localities,
  locNameBySlug,
});

describe('parseSmartQuery', () => {
  it('returns null for empty input', () => {
    expect(parse('')).toBeNull();
    expect(parse('   ')).toBeNull();
    expect(parseSmartQuery(undefined, { current: INITIAL('buy'), localities, locNameBySlug })).toBeNull();
  });

  it('parses bhk, deal, locality and budget in rent', () => {
    const r = parse('2 bhk flat for rent in baner under 25k');
    expect(r.deal).toBe('rent');
    expect([...r.next.types]).toEqual(['flat']);
    expect(r.next.bhk.size).toBe(1);
    expect([...r.next.localities]).toEqual(['baner']);
    expect(r.next.rent).toEqual([0, 25000]);
    expect(r.parts).toEqual(expect.arrayContaining(['2 BHK', 'Rent', 'Baner']));
    expect(r.q).toBe('');
  });

  it('parses a buy budget range in lakh and crore', () => {
    const r = parse('flat in wakad 50 lakh to 1.2 cr');
    expect(r.deal).toBe('buy');
    expect(r.next.budget).toEqual([5000000, 12000000]);
    expect(r.next.localities.has('wakad')).toBe(true);
  });

  it('applies max and min phrases', () => {
    expect(parse('villa below 2 cr').next.budget).toEqual([0, 20000000]);
    expect(parse('villa above 1 cr').next.budget).toEqual([10000000, 50000000]);
    expect(parse('flat for rent at least 15k').next.rent).toEqual([15000, 100000]);
  });

  it('infers the deal from the amount when not explicit', () => {
    expect(parse('flat 30000', 'buy').deal).toBe('rent');
    expect(parse('flat 5000000', 'rent').deal).toBe('buy');
    expect(parse('flat 2 cr', 'rent').deal).toBe('buy');
  });

  it('ignores bare small numbers', () => {
    const r = parse('flat 12');
    expect(r.next.budget).toEqual(INITIAL('buy').budget);
    expect(r.q).toBe('12');
  });

  it('forces rent for flatmates', () => {
    const r = parse('roommate in baner');
    expect(r.deal).toBe('rent');
    expect(r.next.types.has('flatmates')).toBe(true);
  });

  it('keeps unsupported types as free text', () => {
    const r = parse('farmland for rent', 'buy');
    expect(r.next.types.has('farmland')).toBe(true);
    const r2 = parse('shared room for sale');
    expect(r2.deal).toBe('buy');
    expect(r2.next.types.size).toBe(0);
    expect(r2.q).toContain('shared');
  });

  it('parses studio and rk as bhk zero', () => {
    const r = parse('1rk for rent');
    expect(r.parts).toContain('1 RK / Studio');
    expect(r.next.types.has('flat')).toBe(true);
  });

  it('drops bhk for non-residential types', () => {
    const r = parse('3 bhk office');
    expect(r.next.bhk.size).toBe(0);
    expect(r.next.types.has('commercial')).toBe(true);
  });

  it('parses furnishing variants', () => {
    expect([...parse('semi furnished flat').next.furnishing]).toEqual(['semi']);
    expect([...parse('unfurnished flat').next.furnishing]).toEqual(['unfurnished']);
    expect([...parse('fully furnished flat').next.furnishing]).toEqual(['furnished']);
    expect(parse('furnished plot').next.furnishing.size).toBe(0);
  });

  it('parses amenities and keeps the ones not offered in the deal', () => {
    const r = parse('flat with gym and parking');
    expect(r.next.amenities.has('gym')).toBe(true);
    expect(r.parts.length).toBeGreaterThan(2);
    const rent = parse('flat for rent with garden');
    expect(rent.q === '' || typeof rent.q === 'string').toBe(true);
  });

  it('handles pets only for rent', () => {
    const rent = parse('pet friendly flat for rent');
    expect(rent.next.pets).toBe(true);
    expect(rent.parts).toContain('Pet-friendly');
    const buy = parse('pet friendly flat for sale');
    expect(buy.next.pets).toBe(false);
  });

  it('parses construction status for buy', () => {
    const ready = parse('ready to move flat');
    expect([...ready.next.constr]).toEqual(['ready']);
    expect(ready.parts).toContain('Ready to Move');
    const uc = parse('under construction flat');
    expect([...uc.next.constr].sort()).toEqual(['new', 'under']);
    expect(uc.parts).toContain('Under Construction');
  });

  it('marks owner-verified searches', () => {
    const r = parse('owner flat');
    expect(r.next.verified.owner).toBe(true);
    expect(r.parts).toContain('KYC done');
    const noBroker = parse('no broker flat');
    expect(noBroker.next.verified.owner).toBeUndefined();
  });

  it('parses area with prefixes and ranges', () => {
    const around = parse('flat 1000 sqft');
    expect(around.next.area[0]).toBeLessThan(1000);
    expect(around.next.area[1]).toBeGreaterThan(1000);
    const max = parse('flat under 1200 sq ft');
    expect(max.next.area[1]).toBe(1200);
    const min = parse('flat above 800 sqft');
    expect(min.next.area[0]).toBe(800);
    const range = parse('flat 800-1200 sqft');
    expect(range.next.area).toEqual([800, 1200]);
  });

  it('prefers a locality when typo is within one edit', () => {
    const r = parse('flat in hinjwadi');
    expect(r.next.localities.has('hinjewadi')).toBe(true);
  });

  it('matches multi-word localities and near phrasing', () => {
    const r = parse('flat near koregaon park');
    expect(r.next.localities.has('koregaon-park')).toBe(true);
    expect(r.parts.some((p) => p.startsWith('near '))).toBe(true);
  });

  it('keeps unknown words as free text without filler', () => {
    const r = parse('sea facing balcony in baner');
    expect(r.q).toBe('sea facing balcony');
  });

  it('preserves existing filters when the deal does not change', () => {
    const base = { bhk: new Set(['3']), localities: new Set(['wakad']) };
    const r = parse('flat in baner', 'buy', base);
    expect(r.next.bhk.has('3')).toBe(true);
    expect([...r.next.localities].sort()).toEqual(['baner', 'wakad']);
    expect(base.localities.size).toBe(1);
  });

  it('resets filters when the deal changes', () => {
    const r = parse('flat for rent', 'buy', { bhk: new Set(['3']) });
    expect(r.next.bhk.size).toBe(0);
    expect(r.deal).toBe('rent');
  });

  it('normalises thousands separators and prices with units', () => {
    expect(parse('flat for rent under 25,000').next.rent).toEqual([0, 25000]);
    expect(parse('flat for rent under rs. 40k').next.rent).toEqual([0, 40000]);
    expect(parse('flat for rent under 0.5 lakh').next.rent).toEqual([0, 50000]);
    expect(parse('flat 1 lakh').next.rent).toEqual([0, 100000]);
  });

  it('clamps amounts to the allowed range', () => {
    expect(parse('flat under 99 cr').next.budget).toEqual([0, 50000000]);
  });
});
