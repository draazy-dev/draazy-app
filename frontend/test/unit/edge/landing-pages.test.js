// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flatmateApiPath, flatmatePage, flatmateRoute, landingApiPath, landingPage, landingRoute, landingSitemapRows } from '../../../edge/landing-pages.mjs';
import { sitemapXml } from '../../../edge/seo-pages.mjs';
import {
  LANDING_PLACES, PUNE, TAGLINES, isIndexable, isWomenOnly, landingCopy, landingPath, landingQuery, listingsUrl, parseFlatmateLanding, parseLanding,
} from '../../../src/lib/landingPages.js';

const SHELL = '<!doctype html><html><head><title>Draazy</title><meta name="description" content="App" /></head><body><div id="root"></div></body></html>';
const RUPEE = '\u20b9';
const ldOf = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const row = (n, over = {}) => ({
  id: `3f2a9c1e-7b4d-4e8a-9f10-${String(n).padStart(12, '0')}`, propertyType: 'Apartment', deal: 'rent', bhk: 2, price: 30000 + n, area: 900, areaUnit: 'sqft',
  locality: 'Baner', localitySlug: 'baner', status: 'approved', dealStatus: 'active', ...over,
});
const rows = (n, over) => Array.from({ length: n }, (_, i) => row(i + 1, over));
const baner = (deal, bhk) => parseLanding(deal, bhk ? ['baner', `${bhk}-bhk`] : ['baner']);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('landing place data', () => {
  const guideDir = new URL('../../../src/content/localities/', import.meta.url);

  it('has one guide markdown per landing place with matching name and tagline', () => {
    const guides = readdirSync(guideDir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort();
    expect(LANDING_PLACES.map((p) => p.slug).sort()).toEqual(guides);
    for (const p of LANDING_PLACES) {
      const md = readFileSync(new URL(`${p.slug}.md`, guideDir), 'utf8');
      expect(md.match(/^name:\s*["']?(.+?)["']?\s*$/m)?.[1], `${p.slug} name`).toBe(p.name);
      expect(md.match(/^tagline:\s*["']?(.+?)["']?\s*$/m)?.[1], `${p.slug} tagline`).toBe(TAGLINES[p.slug]);
    }
  });
});

describe('landing url parsing and copy', () => {
  it('parses valid landing urls', () => {
    expect(parseLanding('rent', ['pune'])).toEqual({ deal: 'rent', place: PUNE, bhk: null });
    expect(parseLanding('buy', ['baner', '2-bhk']).bhk).toBe(2);
  });

  it.each([[[]], [['nowhere']], [['baner', '5-bhk']], [['baner', '0-bhk']], [['baner', '2']], [['baner', '2-bhk', 'x']], [['pune', '2-bhk']]])('rejects %j', (bad) => {
    expect(parseLanding('rent', bad)).toBeNull();
  });

  it('rejects an unknown deal', () => {
    expect(parseLanding('lease', ['baner'])).toBeNull();
  });

  it('builds paths', () => {
    expect(landingPath('rent', 'baner', 2)).toBe('/rent/baner/2-bhk');
    expect(landingPath('buy')).toBe('/buy/pune');
  });

  it('parses flatmate landings', () => {
    expect(parseFlatmateLanding('women-only-pune')).toEqual({ women: true, place: PUNE });
    expect(parseFlatmateLanding('baner').place.name).toBe('Baner');
    expect(parseFlatmateLanding('nowhere')).toBeNull();
  });

  it('writes copy and queries', () => {
    expect(landingCopy(baner('rent')).h1).toBe('Flats and homes for rent in Baner, Pune');
    expect(landingCopy(baner('buy', 3)).h1).toBe('3 BHK flats for sale in Baner, Pune');
    expect(landingCopy(parseLanding('rent', ['pune'])).h1).toBe('Flats and homes for rent in Pune');
    expect(landingCopy(baner('rent')).intro).toHaveLength(2);
    expect(landingQuery(baner('buy', 2))).toEqual({ deal: 'buy', localities: ['baner'], bhks: ['2'], rank: 'relevance' });
    expect(landingQuery(baner('rent', 4)).bhks).toEqual(['4plus']);
    expect(landingQuery(parseLanding('rent', ['pune']))).toEqual({ deal: 'rent', rank: 'relevance' });
    expect(listingsUrl(baner('rent', 2))).toBe('/listings?deal=rent&loc=baner&bhks=2');
    expect(landingApiPath(baner('rent', 2))).toBe('/properties?deal=rent&localities=baner&bhks=2&rank=relevance&size=20&page=0');
  });

  it('applies indexability thresholds', () => {
    expect(isIndexable(baner('rent'), 4)).toBe(false);
    expect(isIndexable(baner('rent'), 5)).toBe(true);
    expect(isIndexable(baner('rent', 2), 2)).toBe(false);
    expect(isIndexable(baner('rent', 2), 3)).toBe(true);
  });
});

describe('landingPage', () => {
  it('renders an indexable area page', () => {
    const lived = landingPage(SHELL, baner('rent'), { content: rows(6), totalElements: 6 });
    expect(lived.status).toBe(200);
    expect(lived.html).toContain('<link data-shell="" rel="canonical" href="https://draazy.com/rent/baner" />');
    expect(lived.html).not.toContain('noindex');
    expect(lived.html).toContain('Flats and homes for rent in Baner, Pune</h1>');
    expect(lived.html).toContain('href="/locality/baner"');
    expect(lived.html).toContain('href="/buy/baner"');
    expect(lived.html).toContain('href="/rent/baner/2-bhk"');
    expect(lived.html).toContain('href="/listings?deal=rent&amp;loc=baner"');
    expect(lived.html).toContain('6 homes listed');
    expect(lived.html).toContain('<meta property="og:image" content="https://draazy.com/og/rent/baner.jpg" />');
    const [list, crumbs] = ldOf(lived.html)['@graph'];
    expect(list['@type']).toBe('ItemList');
    expect(list.itemListElement).toHaveLength(6);
    expect(list.itemListElement[0].url.startsWith('https://draazy.com/property/2-bhk-apartment-for-rent-baner-')).toBe(true);
    expect(crumbs.itemListElement.map((c) => c.name)).toEqual(['Home', 'Rent', 'Baner']);
  });

  it('marks thin pages noindex and clears BHK pages at three homes', () => {
    expect(landingPage(SHELL, baner('rent'), { content: rows(4), totalElements: 4 }).html).toContain('name="robots" content="noindex"');
    const bhkPage = landingPage(SHELL, baner('rent', 2), { content: rows(3), totalElements: 3 });
    expect(bhkPage.html).not.toContain('noindex');
    expect(bhkPage.html).toContain('content="https://draazy.com/og/rent/baner.jpg"');
    expect(ldOf(bhkPage.html)['@graph'][1].itemListElement.map((c) => c.name)).toEqual(['Home', 'Rent', 'Baner', '2 BHK']);
  });

  it('renders an empty page without an ItemList', () => {
    const empty = landingPage(SHELL, baner('buy'), { content: [], totalElements: 0 });
    expect(empty.html).toContain('noindex');
    expect(empty.html).toContain('No homes listed right now');
    expect(ldOf(empty.html)['@graph'].some((n) => n['@type'] === 'ItemList')).toBe(false);
  });

  it('uses the city trail and singular count for Pune', () => {
    const pune = landingPage(SHELL, parseLanding('buy', ['pune']), { content: rows(1, { deal: 'buy' }), totalElements: 1 });
    expect(pune.html).toContain('1 home listed');
    expect(ldOf(pune.html)['@graph'][1].itemListElement.map((c) => c.name)).toEqual(['Home', 'Buy']);
    expect(pune.html).not.toContain('href="/locality/pune"');
  });

  it('skips closed deals and caps the list at 20', () => {
    const closed = landingPage(SHELL, baner('rent'), { content: [...rows(2), row(9, { dealStatus: 'closed' })], totalElements: 3 });
    expect(ldOf(closed.html)['@graph'][0].itemListElement).toHaveLength(2);
    const many = landingPage(SHELL, baner('rent'), { content: rows(25), totalElements: 25 });
    expect(ldOf(many.html)['@graph'][0].itemListElement).toHaveLength(20);
    expect(many.html).toContain('See all 25 homes');
  });

  it('escapes listing text', () => {
    const xss = landingPage(SHELL, baner('rent'), { content: [row(1, { locality: '</script><script>alert(1)</script>' })], totalElements: 1 });
    expect(xss.html).not.toContain('<script>alert(1)');
  });
});

describe('flatmate landing', () => {
  const room = (n, over = {}) => ({ id: `r${n}`, title: `Room ${n}`, roomType: 'Private room', budget: 9000, locality: 'Baner', gender: 'any', owner: 'Secret Name', ownerMobile: '9999999999', ...over });
  const group = (n, over = {}) => ({ id: `g${n}`, title: `Group ${n}`, locality: 'Baner', policy: 'any', perHead: 8000, seatsOpen: 1, seatsTotal: 3, members: [], ...over });
  const baFm = parseFlatmateLanding('baner');
  const women = parseFlatmateLanding('women-only-pune');

  it('builds feed api paths', () => {
    expect(flatmateApiPath(baFm)).toBe('/flatmates/feed?tab=move-in&locality=Baner&size=50&page=0');
    expect(flatmateApiPath(women, 1)).toBe('/flatmates/feed?tab=move-in&gender=female&size=1&page=0');
  });

  it('recognises women-only posts', () => {
    expect(isWomenOnly(room(1, { gender: 'female' }))).toBe(true);
    expect(isWomenOnly(group(1, { policy: 'women' }))).toBe(true);
    expect(isWomenOnly(room(1))).toBe(false);
  });

  it('renders rooms and groups without personal data', () => {
    const fm = flatmatePage(SHELL, baFm, { content: [room(1, { seatsTotal: 1, seatsOpen: 1 }), room(2), group(3)], totalElements: 3 });
    expect(fm.html).not.toContain('noindex');
    expect(fm.html).toContain('<meta property="og:image" content="https://draazy.com/og/flatmates/baner.jpg" />');
    expect(fm.html).toContain('href="/flatmates/room/r1"');
    expect(fm.html).toContain('href="/flatmates/group/g3"');
    expect(fm.html).toContain(`${RUPEE}9,000/month`);
    expect(fm.html).toContain(`${RUPEE}8,000/month each`);
    expect(fm.html).toContain('1 seat open');
    expect(fm.html).toContain('3 posts live');
    expect(fm.html).not.toContain('Secret Name');
    expect(fm.html).not.toContain('9999999999');
  });

  it('pluralises seats and falls back to default names', () => {
    const html = flatmatePage(SHELL, baFm, { content: [group(1, { title: '', seatsOpen: 2 }), { id: 'r9' }], totalElements: 2 }).html;
    expect(html).toContain('Flat share in Baner');
    expect(html).toContain('2 seats open');
    expect(html).toContain('Room in Baner');
  });

  it('is noindex below the threshold', () => {
    expect(flatmatePage(SHELL, baFm, { content: [room(1), room(2)], totalElements: 2 }).html).toContain('noindex');
    expect(flatmatePage(SHELL, baFm, { content: [], totalElements: 0 }).html).toContain('No posts live right now');
  });

  it('women-only pages count only strictly women-only posts', () => {
    const womenFm = flatmatePage(SHELL, women, { content: [room(1, { gender: 'female' }), room(2), room(3, { gender: 'female' }), group(4, { policy: 'women' }), group(5)], totalElements: 5 });
    expect(womenFm.html).not.toContain('noindex');
    expect(womenFm.html).toContain('content="https://draazy.com/og/flatmates/women-only-pune.jpg"');
    expect(womenFm.html).not.toContain('area guide');
    expect(ldOf(womenFm.html)['@graph'][0].itemListElement).toHaveLength(3);
    expect(flatmatePage(SHELL, women, { content: [room(1, { gender: 'female' }), room(2), room(3)], totalElements: 3 }).html).toContain('noindex');
  });
});

describe('landingSitemapRows', () => {
  const getter = (over = () => null) => async (path) => {
    const forced = over(path);
    if (forced) return forced;
    const q = new URLSearchParams(path.split('?')[1]);
    if (path.startsWith('/flatmates/feed')) {
      return { status: 200, data: { content: q.get('locality') === 'Baner' || q.get('gender') ? rows(3).map((r) => ({ ...r, gender: 'female', roomType: 'x' })) : [], totalElements: q.get('locality') === 'Baner' ? 3 : 0 } };
    }
    if (q.get('localities') === 'baner' && q.get('deal') === 'rent') {
      return { status: 200, data: { content: [...rows(3, { bhk: 2 }), ...rows(3, { bhk: 3 }), ...rows(2, { bhk: 1 })], totalElements: 8 } };
    }
    if (!q.get('localities')) return { status: 200, data: { content: [], totalElements: q.get('deal') === 'rent' ? 40 : 2 } };
    return { status: 200, data: { content: [], totalElements: 0 } };
  };

  it('lists only indexable pages with a bounded number of API calls', async () => {
    const calls = [];
    const siteRows = await landingSitemapRows(async (p) => { calls.push(p); return getter()(p); });
    expect(siteRows.map(([p]) => p)).toEqual(['/rent/pune', '/rent/baner', '/rent/baner/2-bhk', '/rent/baner/3-bhk', '/flatmates/women-only-pune', '/flatmates/baner']);
    expect(calls).toHaveLength(39);
    expect(sitemapXml(siteRows)).toContain('<loc>https://draazy.com/rent/baner/2-bhk</loc>');
  });

  it('returns null rather than a partial sitemap when an API call fails', async () => {
    expect(await landingSitemapRows(getter((p) => (p.includes('localities=wakad') ? { status: 500, data: null } : null)))).toBeNull();
    expect(await landingSitemapRows(getter((p) => (p.startsWith('/properties?deal=rent&size=1') ? { status: 0 } : null)))).toBeNull();
    expect(await landingSitemapRows(getter((p) => (p.startsWith('/flatmates/feed') ? { status: 503, data: null } : null)))).toBeNull();
  });
});

describe('landing routes', () => {
  const env = { API_ORIGIN: 'https://api.example.com', ORIGIN_SHARED_SECRET: 's', ASSETS: { fetch: async () => new Response(SHELL) } };
  const req = (path, host = 'draazy.com') => new Request(`https://${host}${path}`, { headers: { 'CF-Connecting-IP': '1.2.3.4' } });
  const stubApi = (answer) => {
    const fetchMock = vi.fn(async () => answer());
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const okApi = () => new Response(JSON.stringify({ content: rows(6), totalElements: 6 }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  it('404s unknown landing urls without calling the API', async () => {
    const fetchMock = stubApi(okApi);
    expect((await landingRoute({ request: req('/rent/nowhere'), env, deal: 'rent', segments: ['nowhere'] })).status).toBe(404);
    expect((await landingRoute({ request: req('/buy/baner/9-bhk'), env, deal: 'buy', segments: ['baner', '9-bhk'] })).status).toBe(404);
    expect((await landingRoute({ request: req('/rent/baner/?x=1'), env, deal: 'rent', segments: ['baner', ''] })).status).toBe(404);
    expect((await landingRoute({ request: req('/rent'), env, deal: 'rent', segments: undefined })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a single string segment', async () => {
    stubApi(okApi);
    expect((await landingRoute({ request: req('/rent/baner'), env, deal: 'rent', segments: 'baner' })).status).toBe(200);
  });

  it('redirects a non-canonical path keeping the query, without calling the API', async () => {
    const fetchMock = stubApi(okApi);
    const res = await landingRoute({ request: req('/rent/baner/?x=1'), env, deal: 'rent', segments: ['baner'] });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/rent/baner?x=1');
    expect(fetchMock).not.toHaveBeenCalled();
    const fm = await flatmateRoute({ request: req('/flatmates/baner/?x=1'), env, slug: 'baner' });
    expect(fm.status).toBe(301);
    expect(fm.headers.get('location')).toBe('/flatmates/baner?x=1');
  });

  it('renders a landing page with security headers, noindex off production', async () => {
    stubApi(okApi);
    const up = await landingRoute({ request: req('/rent/baner'), env, deal: 'rent', segments: ['baner'] });
    expect(up.status).toBe(200);
    expect(up.headers.get('X-Frame-Options')).toBe('DENY');
    expect(await up.text()).toMatch(/ItemList/);
    const sandbox = await landingRoute({ request: req('/rent/baner', 'sandbox.draazy.com'), env, deal: 'rent', segments: ['baner'] });
    expect(sandbox.headers.get('X-Robots-Tag')).toBe('noindex');
  });

  it('routes flatmate landings', async () => {
    stubApi(okApi);
    expect((await flatmateRoute({ request: req('/flatmates/nowhere'), env, slug: 'nowhere' })).status).toBe(404);
    expect((await flatmateRoute({ request: req('/flatmates/baner'), env, slug: 'baner' })).status).toBe(200);
  });

  it('serves a 404 when the API has nothing and the bare shell when it is down', async () => {
    stubApi(() => new Response('{}', { status: 404 }));
    expect((await landingRoute({ request: req('/rent/baner'), env, deal: 'rent', segments: ['baner'] })).status).toBe(404);
    stubApi(() => { throw new Error('down'); });
    const down = await landingRoute({ request: req('/rent/baner'), env, deal: 'rent', segments: ['baner'] });
    expect(down.status).toBe(200);
    expect(await down.text()).toBe(SHELL);
  });
});
