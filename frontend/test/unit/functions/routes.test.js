// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet as buyGet, onRequestHead as buyHead } from '../../../functions/buy/[[path]].js';
import { onRequestGet as rentGet } from '../../../functions/rent/[[path]].js';
import { onRequestGet as flatmateSlugGet } from '../../../functions/flatmates/[slug].js';
import { onRequestGet as flatmateKindGet, onRequestHead as flatmateKindHead } from '../../../functions/flatmates/[kind]/[id].js';
import { onRequestGet as propertyGet, onRequestHead as propertyHead } from '../../../functions/property/[id].js';
import { onRequestGet as societyGet } from '../../../functions/society/[slug].js';
import { onRequestGet as signupGet, onRequestHead as signupHead } from '../../../functions/signup.js';
import { onRequestGet as sitemapGet } from '../../../functions/sitemaps/[name].js';

const ID = '3f2a9c1e-7b4d-4e8a-9f10-2c3d4e5f6a7b';
const SHELL = '<!doctype html><html><head><title>Draazy</title><meta name="description" content="App" /></head><body><div id="root"></div></body></html>';
const baseEnv = { API_ORIGIN: 'https://api.example.com', ORIGIN_SHARED_SECRET: 's', INDEX_LISTINGS: 'true', ASSETS: { fetch: vi.fn(async () => new Response(SHELL)) } };
const req = (path, host = 'draazy.com') => new Request(`https://${host}${path}`, { headers: { 'CF-Connecting-IP': '1.2.3.4' } });

const property = {
  id: ID, propertyType: 'Apartment', deal: 'rent', bhk: 2, price: 32000, area: 950, areaUnit: 'sqft', locality: 'Baner',
  status: 'approved', dealStatus: 'active', createdAt: '2026-10-01T10:00:00Z',
};
const PATH = `/property/2-bhk-apartment-for-rent-baner-${ID}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('page route handlers', () => {
  it('HEAD handlers reuse the GET handlers', () => {
    expect(buyHead).toBe(buyGet);
    expect(flatmateKindHead).toBe(flatmateKindGet);
    expect(propertyHead).toBe(propertyGet);
    expect(signupHead).toBe(signupGet);
  });

  it('buy and rent pass the deal and path segments to the landing route', async () => {
    const buy = await buyGet({ request: req('/buy/nowhere'), env: baseEnv, params: { path: ['nowhere'] } });
    const rent = await rentGet({ request: req('/rent/nowhere'), env: baseEnv, params: { path: ['nowhere'] } });
    expect(buy.status).toBe(404);
    expect(rent.status).toBe(404);
  });

  it('a landing page with no segments redirects nowhere and is a 404', async () => {
    const res = await buyGet({ request: req('/buy'), env: baseEnv, params: {} });
    expect(res.status).toBe(404);
  });

  it('flatmates/[slug] 404s an unknown slug', async () => {
    const res = await flatmateSlugGet({ request: req('/flatmates/nowhere'), env: baseEnv, params: { slug: 'nowhere' } });
    expect(res.status).toBe(404);
  });

  it('flatmates/[kind]/[id] hands unknown kinds back to the SPA, including inherited keys', () => {
    const next = vi.fn(() => 'spa');
    expect(flatmateKindGet({ request: req('/flatmates/zzz/1'), env: baseEnv, params: { kind: 'zzz', id: '1' }, next })).toBe('spa');
    expect(flatmateKindGet({ request: req('/flatmates/x/1'), env: baseEnv, params: { kind: 'constructor', id: '1' }, next })).toBe('spa');
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('signup serves a noindex share card without the referral code in the canonical', async () => {
    const res = await signupGet({ request: req('/signup?ref=ABC'), env: baseEnv });
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(await res.text()).toContain('href="https://draazy.com/signup"');
  });

  it('property looks the listing up by its uuid key and renders it', async () => {
    const fetchMock = vi.fn(async () => Response.json(property));
    vi.stubGlobal('fetch', fetchMock);
    const res = await propertyGet({ request: req(PATH), env: baseEnv, params: { id: PATH.slice('/property/'.length) } });
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://api.example.com/api/properties/${ID}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('RealEstateListing');
  });

  it('property redirects a bare uuid to the canonical path keeping the query', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(property)));
    const res = await propertyGet({ request: req(`/property/${ID}?tab=x`), env: baseEnv, params: { id: ID } });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`${PATH}?tab=x`);
  });

  it('property encodes odd ids into the API path', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await propertyGet({ request: req('/property/a%20b'), env: baseEnv, params: { id: 'a b/c' } });
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.example.com/api/properties/a%20b%2Fc');
    expect(res.status).toBe(404);
  });

  it('society renders the society, redirecting a stale slug', async () => {
    const society = { slug: 'green-acres', name: 'Green Acres', localitySlug: 'baner', listingCount: 2, forRent: 2, homes: [] };
    const fetchMock = vi.fn(async () => Response.json(society));
    vi.stubGlobal('fetch', fetchMock);
    const ok = await societyGet({ request: req('/society/green-acres'), env: baseEnv, params: { slug: 'green-acres' } });
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.example.com/api/societies/green-acres');
    expect(await ok.text()).toContain('ApartmentComplex');
    const moved = await societyGet({ request: req('/society/old?x=1'), env: baseEnv, params: { slug: 'old' } });
    expect(moved.status).toBe(301);
    expect(moved.headers.get('location')).toBe('/society/green-acres?x=1');
  });
});

describe('sitemaps function', () => {
  const run = (name, { env = baseEnv, request = req(`/sitemaps/${name}`), waitUntil = vi.fn() } = {}) => sitemapGet({ request, env, params: { name }, waitUntil });

  it('404s an unknown sitemap name with security headers', async () => {
    const res = await run('other.xml');
    expect(res.status).toBe(404);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('serves an empty sitemap and skips the API while listings are not indexable', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await run('properties.xml', { env: { ...baseEnv, INDEX_LISTINGS: 'false' } });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('<url>');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pages through properties and lists only live ones', async () => {
    const pages = [
      { content: [property, { ...property, id: 'x', status: 'rented', dealStatus: 'closed' }], totalPages: 2 },
      { content: [{ ...property, id: '3f2a9c1e-7b4d-4e8a-9f10-000000000002' }], totalPages: 2 },
    ];
    const fetchMock = vi.fn(async (url) => Response.json(pages[Number(new URL(url).searchParams.get('page'))]));
    vi.stubGlobal('fetch', fetchMock);
    const waitUntil = vi.fn();
    const res = await run('properties.xml', { waitUntil });
    const xml = await res.text();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.example.com/api/properties?size=100&page=0');
    expect(xml.match(/<url>/g)).toHaveLength(2);
    expect(xml).toContain(`<loc>https://draazy.com${PATH}</loc><lastmod>2026-10-01</lastmod>`);
    expect(res.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('lists societies that have a slug', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ content: [{ slug: 'a' }, {}], totalPages: 1 })));
    const xml = await (await run('societies.xml')).text();
    expect(xml.match(/<url>/g)).toHaveLength(1);
    expect(xml).toContain('<loc>https://draazy.com/society/a</loc>');
  });

  it('responds 503 with Retry-After when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    const res = await run('properties.xml');
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('3600');
  });

  it('stops after the page cap', async () => {
    const fetchMock = vi.fn(async () => Response.json({ content: [], totalPages: 1000 }));
    vi.stubGlobal('fetch', fetchMock);
    await run('societies.xml');
    expect(fetchMock).toHaveBeenCalledTimes(50);
  });

  it('landing.xml is 503 when the landing source is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    expect((await run('landing.xml')).status).toBe(503);
  });

  it('caches the rendered sitemap and serves from the cache next time', async () => {
    const cache = { match: vi.fn(async () => undefined), put: vi.fn(async () => undefined) };
    vi.stubGlobal('caches', { default: cache });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ content: [], totalPages: 1 })));
    const waitUntil = vi.fn();
    await run('societies.xml', { waitUntil, request: req('/sitemaps/societies.xml?cb=1') });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(cache.match.mock.calls[0][0].url).toBe('https://draazy.com/sitemaps/societies.xml');

    const hit = new Response('cached');
    cache.match.mockResolvedValue(hit);
    expect(await run('societies.xml')).toBe(hit);
  });
});
