// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SECURITY_HEADERS, NOINDEX, apiGet, edgePage, fetchShell, headersFor, htmlResponse, listingsIndexable, notFoundPage, page, propertyPage,
  propertySitemapRow, sitemapXml, societyPage, societySitemapRow,
} from '../../../edge/seo-pages.mjs';
import { listingHead, propertyHref, propertyKey, propertyPath } from '../../../src/lib/listingSeo.js';

const ID = '3f2a9c1e-7b4d-4e8a-9f10-2c3d4e5f6a7b';
const SHELL = '<!doctype html><html><head><title>Draazy</title><meta name="description" content="App" /></head><body><div id="root"></div></body></html>';
const P = {
  id: ID, propertyType: 'Apartment', deal: 'rent', bhk: 2, price: 32000, area: 950, areaUnit: 'sqft',
  locality: 'Baner', localitySlug: 'baner', societyName: 'Green Acres', societySlug: 'green-acres-baner',
  status: 'approved', dealStatus: 'active', lat: 18.559123, lng: 73.786987, furnishing: 'semi-furnished',
  description: 'Sunny flat </script><script>alert(1)</script>', amenities: ['lift', 'gym'],
  coverImage: 'https://images.unsplash.com/a.jpg', images: ['https://images.unsplash.com/a.jpg', 'photos/x/y'], createdAt: '2026-10-01T10:00:00Z',
};
const PATH = `/property/2-bhk-apartment-for-rent-baner-${ID}`;
const RUPEE = '\u20b9';
const ldOf = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const NOINDEX_TAG = '<meta data-shell="" name="robots" content="noindex" />';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listingSeo paths', () => {
  it('builds canonical property paths', () => {
    expect(propertyPath({ id: ID, bhk: 2, type: 'Apartment', deal: 'rent', locality: 'Baner' })).toBe(PATH);
    expect(propertyPath({ id: ID.toUpperCase(), bhk: 0, type: 'Independent House', deal: 'buy', locality: 'Viman Nagar' }))
      .toBe(`/property/1-rk-independent-house-for-sale-viman-nagar-${ID}`);
    expect(propertyPath({ id: ID, bhk: null, type: 'Open Plot', deal: 'buy', locality: 'Wagholi' })).toBe(`/property/open-plot-for-sale-wagholi-${ID}`);
    expect(propertyPath({ id: 'p1', bhk: 2, type: 'Flat', deal: 'rent', locality: 'Baner' })).toBe('/property/p1');
  });

  it('resolves hrefs and keys', () => {
    expect(propertyHref({ id: 'legacy-slug', uuid: ID, bhkNum: 2, type: 'Apartment', deal: 'rent', locality: 'Baner' })).toBe(PATH);
    expect(propertyHref({ id: 'p5010', uuid: ID, slug: 'p5010', bhkNum: 2, type: 'Apartment', deal: 'rent', locality: 'Baner' })).toBe('/property/p5010');
    expect(propertyKey(PATH.slice(10))).toBe(ID);
    expect(propertyKey(ID)).toBe(ID);
    expect(propertyKey('2bhk-baner-legacy')).toBe('2bhk-baner-legacy');
  });

  it('writes the listing head', () => {
    const head = listingHead({ ...P, type: P.propertyType });
    expect(head.title).toBe(`2 BHK Apartment for Rent in Baner, Pune: ${RUPEE}32,000/month | Draazy`);
    expect(head.description).toBe(`2 BHK Apartment for Rent in Baner, Pune: 950 sq.ft. at ${RUPEE}32,000/month. Contact the owner directly on Draazy, with no brokerage.`);
  });
});

describe('propertyPage', () => {
  it('redirects to the canonical path keeping the query string', () => {
    expect(propertyPage(SHELL, { ...P, slug: 'p5010' }, { pathname: `/property/${ID}` })).toEqual({ status: 301, location: '/property/p5010' });
    expect(propertyPage(SHELL, P, { pathname: `/property/${ID}`, search: '?tab=amenities' })).toEqual({ status: 301, location: `${PATH}?tab=amenities` });
  });

  it('renders a live listing with head tags, body and JSON-LD', () => {
    const live = propertyPage(SHELL, { ...P, deposit: 64000 }, { pathname: PATH });
    expect(live.status).toBe(200);
    expect(live.html).toContain(`<link data-shell="" rel="canonical" href="https://draazy.com${PATH}" />`);
    expect(live.html).toContain('<meta property="og:image" content="https://images.unsplash.com/a.jpg" />');
    expect(live.html).toContain('<link rel="preload" as="image" href="https://images.unsplash.com/a.jpg" fetchpriority="high" />');
    expect(live.html).not.toContain('noindex');
    expect(live.html).not.toContain('<script>alert(1)');
    expect(live.html).toContain('<h1 class="mt-4 text-3xl font-extrabold leading-tight text-white sm:text-4xl">2 BHK Apartment for Rent in Baner</h1>');
    expect(live.html).toContain('<a href="/locality/baner">Baner</a> \u203a <a href="/society/green-acres-baner">Green Acres</a>');
    expect(live.html).toContain('<a href="/locality/baner">Read the Baner locality guide</a>');
    expect(live.html).toContain('<li><span class="text-gray-400">Furnishing:</span> Semi-furnished</li>');
    expect(live.html).toContain(`<li><span class="text-gray-400">Deposit:</span> ${RUPEE}64,000</li>`);
    expect(live.html).toContain('<li>Lift</li><li>Gym</li>');

    const [listing, crumbs] = ldOf(live.html)['@graph'];
    expect(listing['@type']).toBe('RealEstateListing');
    expect(listing.offers.availability).toBe('https://schema.org/InStock');
    expect(listing.offers.priceSpecification.unitText).toBe('MONTH');
    expect(listing.image).toEqual(['https://images.unsplash.com/a.jpg']);
    expect(listing.mainEntity['@type']).toBe('Apartment');
    expect(listing.mainEntity.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 18.559, longitude: 73.787 });
    expect(listing.mainEntity.numberOfBedrooms).toBe(2);
    expect(listing.mainEntity.floorSize.unitCode).toBe('FTK');
    expect(crumbs.itemListElement.map((c) => c.name)).toEqual(['Home', 'Rent', 'Baner', 'Green Acres', '2 BHK Apartment for Rent in Baner']);
  });

  it('preloads the gallery first slide with a srcset for uploaded photos', () => {
    const UP = 'https://media.draazy.com/photos/0123456789abcdef/3f2a9c1e-7b4d-4e8a-9f10-2c3d4e5f6a7b-0123456789abcdef';
    const html = propertyPage(SHELL, { ...P, coverImage: 'https://images.unsplash.com/cover.jpg', images: [UP] }, { pathname: PATH }).html;
    expect(html).toContain(`<link rel="preload" as="image" href="${UP}" imagesrcset="${UP}.w480.webp 480w, ${UP}.w960.webp 960w, ${UP} 2560w" imagesizes="(max-width: 639px) 100vw, 60vw" fetchpriority="high" />`);
  });

  it('skips the preload when the first slide is not https', () => {
    expect(propertyPage(SHELL, { ...P, coverImage: null, images: ['photos/x/y'] }, { pathname: PATH }).html).not.toContain('rel="preload"');
  });

  it('falls back to the typed share card when there is no photo', () => {
    const html = propertyPage(SHELL, { ...P, coverImage: null, images: [] }, { pathname: PATH }).html;
    expect(html).toContain('<meta property="og:image" content="https://draazy.com/og/listing/rent-flat.jpg" />');
    expect(html).toContain('<meta property="og:image:alt" content="2 BHK Apartment for Rent in Baner" />');
  });

  it('omits the locality guide link for localities without a guide', () => {
    const html = propertyPage(SHELL, { ...P, locality: 'Wagholi', localitySlug: 'wagholi' }, { pathname: PATH.replace('baner', 'wagholi') }).html;
    expect(html).not.toContain('locality guide');
  });

  it('marks a closed listing noindex, sold out and unavailable', () => {
    const rented = propertyPage(SHELL, { ...P, status: 'rented', dealStatus: 'closed' }, { pathname: PATH });
    expect(rented.html).toContain(NOINDEX_TAG);
    expect(ldOf(rented.html)['@graph'][0].offers.availability).toBe('https://schema.org/SoldOut');
    expect(rented.html).toContain('no longer available');
  });

  it('renders sale listings, floors and sparse facts', () => {
    const sale = { ...P, deal: 'buy', price: 8500000, floor: 3, totalFloors: 12, furnishing: '', deposit: 0, societyName: null, societySlug: null };
    const path = propertyPath({ id: ID, bhk: 2, type: 'Apartment', deal: 'buy', locality: 'Baner' });
    const { html } = propertyPage(SHELL, sale, { pathname: path });
    expect(html).toContain('<li><span class="text-gray-400">Floor:</span> 3 of 12</li>');
    expect(html).not.toContain('Furnishing:');
    expect(html).not.toContain('Deposit:');
    expect(html).toContain('<a href="/listings?deal=buy">Buy</a>');
  });

  it('uses the plain listings link when the locality has no slug', () => {
    const { html } = propertyPage(SHELL, { ...P, localitySlug: null, societyName: null }, { pathname: PATH });
    expect(html).toContain('<a href="/listings">Baner</a>');
  });
});

describe('societyPage', () => {
  const S = { slug: 'green-acres-baner', name: 'Green Acres', builder: 'Kolte Patil', localitySlug: 'baner', year: 2015, towers: 4, units: 320, amenities: ['pool'], listingCount: 3, forRent: 2, forSale: 1, homes: [{ id: ID, title: '2 BHK for rent' }] };

  it('redirects a stale slug', () => {
    expect(societyPage(SHELL, S, { slug: 'old-name' })).toEqual({ status: 301, location: '/society/green-acres-baner' });
    expect(societyPage(SHELL, S, { slug: 'old-name', search: '?a=1' }).location).toBe('/society/green-acres-baner?a=1');
  });

  it('renders head, JSON-LD and the homes list', () => {
    const soc = societyPage(SHELL, S, { slug: S.slug });
    expect(soc.html).toContain('<title data-shell="Draazy">Green Acres, Baner, Pune: Homes, Amenities &amp; Reviews | Draazy</title>');
    expect(soc.html).toContain('Green Acres in Baner, Pune by Kolte Patil, built in 2015. 2 homes for rent and 1 home for sale from owners, with no brokerage.');
    expect(soc.html).not.toContain('noindex');
    expect(soc.html).toContain('<meta property="og:image" content="https://draazy.com/og/page/society.jpg" />');
    expect(soc.html).toContain(`<a href="/property/${ID}">2 BHK for rent</a>`);
    expect(soc.html).toContain('<li><span class="text-gray-400">Builder:</span> Kolte Patil</li>');
    const complex = ldOf(soc.html)['@graph'][0];
    expect(complex['@type']).toBe('ApartmentComplex');
    expect(complex.numberOfAccommodationUnits.value).toBe(320);
    expect(complex.amenityFeature[0]).toEqual({ '@type': 'LocationFeatureSpecification', name: 'Pool', value: true });
    expect(complex.containedInPlace.url).toBe('https://draazy.com/locality/baner');
  });

  it('includes geo when coordinates are present', () => {
    const complex = ldOf(societyPage(SHELL, { ...S, lat: '18.5', lng: 73.8 }, { slug: S.slug }).html)['@graph'][0];
    expect(complex.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 18.5, longitude: 73.8 });
  });

  it('marks a thin society noindex', () => {
    const thin = societyPage(SHELL, { slug: 'x', name: 'X', localitySlug: 'baner', listingCount: 0, homes: [] }, { slug: 'x' });
    expect(thin.html).toContain(NOINDEX_TAG);
    expect(thin.html).toContain('Facts, amenities and resident reviews on Draazy.');
  });

  it('names a homes link with a fallback title', () => {
    const html = societyPage(SHELL, { ...S, homes: [{ id: 'h1' }] }, { slug: S.slug }).html;
    expect(html).toContain('<a href="/property/h1">View home</a>');
  });
});

describe('sitemap helpers', () => {
  it('maps live properties and drops closed ones', () => {
    expect(propertySitemapRow({ ...P, propertyType: 'Apartment' })).toEqual([PATH, '2026-10-01']);
    expect(propertySitemapRow({ ...P, createdAt: null })[1]).toBeNull();
    expect(propertySitemapRow({ ...P, dealStatus: 'closed' })).toBeNull();
    expect(propertySitemapRow({ ...P, status: 'pending' })).toBeNull();
  });

  it('maps societies by slug', () => {
    expect(societySitemapRow({ slug: 'a' })).toEqual(['/society/a', null]);
    expect(societySitemapRow({})).toBeNull();
  });

  it('writes escaped XML', () => {
    expect(sitemapXml([[PATH, '2026-10-01'], ['/society/a&b', null]])).toContain(
      `<url><loc>https://draazy.com${PATH}</loc><lastmod>2026-10-01</lastmod></url>\n  <url><loc>https://draazy.com/society/a&amp;b</loc></url>`,
    );
  });
});

describe('response helpers', () => {
  it('page() renders breadcrumb, h1 and skips falsy parts', () => {
    const html = page([['Home', '/'], ['Rent', '/rent'], ['Title <x>', '/t']], '<p>a</p>', false, null, '<p>b</p>');
    expect(html).toContain('<a href="/">Home</a> \u203a <a href="/rent">Rent</a>');
    expect(html).toContain('>Title &lt;x&gt;</h1>');
    expect(html).toContain('<p>a</p>\n<p>b</p>\n</main>');
  });

  it('notFoundPage adds noindex before </head>', () => {
    const res = notFoundPage('<head></head>');
    expect(res.status).toBe(404);
    expect(res.html).toBe(`<head>    ${NOINDEX}\n  </head>`);
  });

  it('headersFor adds noindex outside production', () => {
    expect(headersFor(new Request('https://draazy.com/x'))).toBe(SECURITY_HEADERS);
    expect(headersFor(new Request('https://sandbox.draazy.com/x'))).toEqual({ ...SECURITY_HEADERS, 'X-Robots-Tag': 'noindex' });
  });

  it('listingsIndexable needs the literal string true', () => {
    expect(listingsIndexable({ INDEX_LISTINGS: 'true' })).toBe(true);
    expect(listingsIndexable({ INDEX_LISTINGS: true })).toBe(false);
    expect(listingsIndexable({})).toBe(false);
  });

  it('htmlResponse returns a bare redirect or html', async () => {
    const redirect = htmlResponse({ status: 301, location: '/x' });
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get('location')).toBe('/x');
    expect(redirect.headers.get('x-frame-options')).toBe('DENY');
    expect(await redirect.text()).toBe('');

    const ok = htmlResponse({ status: 200, html: '<p>x</p>' }, { 'X-A': '1' });
    expect(ok.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(ok.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(ok.headers.get('x-a')).toBe('1');
    expect(ok.headers.has('x-frame-options')).toBe(false);
  });

  it('fetchShell reads the /404 asset', async () => {
    const fetchAsset = vi.fn(async () => new Response('shell'));
    expect(await fetchShell({ ASSETS: { fetch: fetchAsset } }, new Request('https://draazy.com/a/b'))).toBe('shell');
    expect(String(fetchAsset.mock.calls[0][0])).toBe('https://draazy.com/404');
  });
});

describe('apiGet', () => {
  const env = { API_ORIGIN: 'https://api.example.com/', ORIGIN_SHARED_SECRET: ' s ' };
  const request = new Request('https://draazy.com/x', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });

  it('sends the shared secret and client ip and parses JSON', async () => {
    const fetchMock = vi.fn(async () => Response.json({ a: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await apiGet(env, request, '/properties/1')).toEqual({ status: 200, data: { a: 1 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/api/properties/1');
    expect(init.headers).toEqual({ Accept: 'application/json', 'X-Proxy-Auth': 's', 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '1.2.3.4' });
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('omits X-Forwarded-For without a client ip', async () => {
    const fetchMock = vi.fn(async () => Response.json({}));
    vi.stubGlobal('fetch', fetchMock);
    await apiGet(env, new Request('https://draazy.com/x'), '/p');
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('X-Forwarded-For');
  });

  it('returns the status without data for non-OK responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 404 })));
    expect(await apiGet(env, request, '/p')).toEqual({ status: 404, data: null });
  });

  it('returns status 0 on a network error or bad JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect'); }));
    expect(await apiGet(env, request, '/p')).toEqual({ status: 0 });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    expect(await apiGet(env, request, '/p')).toEqual({ status: 0 });
  });

  it('refuses to call a misconfigured origin or secret', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await apiGet({ ...env, API_ORIGIN: 'http://api.example.com' }, request, '/p')).toEqual({ status: 0 });
    expect(await apiGet({ ...env, ORIGIN_SHARED_SECRET: '' }, request, '/p')).toEqual({ status: 0 });
    expect(await apiGet({}, request, '/p')).toEqual({ status: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('edgePage', () => {
  const env = { API_ORIGIN: 'https://api.example.com', ORIGIN_SHARED_SECRET: 's', INDEX_LISTINGS: 'true', ASSETS: { fetch: async () => new Response(SHELL) } };
  const request = new Request(`https://draazy.com${PATH}`, { headers: { 'CF-Connecting-IP': '1.2.3.4' } });
  const render = (shell, p, url) => propertyPage(shell, p, { pathname: url.pathname });

  const run = async (answer, over = {}) => {
    const fetchMock = vi.fn(async () => answer());
    vi.stubGlobal('fetch', fetchMock);
    const res = await edgePage({ request, env, apiPath: `/properties/${ID}`, render, ...over });
    return { res, fetchMock, html: await res.text() };
  };

  it('serves a noindex 404 when the API says not found', async () => {
    const { res, html, fetchMock } = await run(() => new Response('{}', { status: 404 }));
    expect(res.status).toBe(404);
    expect(html).toContain('noindex');
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://api.example.com/api/properties/${ID}`);
    expect(res.headers.get('Content-Security-Policy')).toBe(SECURITY_HEADERS['Content-Security-Policy']);
  });

  it('serves the bare shell when the API is down or errors', async () => {
    const down = await run(() => { throw new Error('connect'); });
    expect(down.res.status).toBe(200);
    expect(down.html).toBe(SHELL);
    const broken = await run(() => new Response('{}', { status: 500 }));
    expect(broken.html).toBe(SHELL);
  });

  it('renders the page and is indexable in production', async () => {
    const ok = await run(() => Response.json(P));
    expect(ok.res.status).toBe(200);
    expect(ok.html).toMatch(/RealEstateListing/);
    expect(ok.res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(ok.res.headers.get('X-Robots-Tag')).toBeNull();
  });

  it('follows a render redirect', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(P)));
    const res = await edgePage({ request, env, apiPath: '/x', render: () => ({ status: 301, location: '/elsewhere' }) });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/elsewhere');
  });

  it('never indexes non-production hosts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(P)));
    const res = await edgePage({ request: new Request(`https://sandbox.draazy.com${PATH}`), env, apiPath: '/x', render });
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
  });

  it('keeps listings out of the index until INDEX_LISTINGS=true', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(P)));
    const res = await edgePage({ request, env: { ...env, INDEX_LISTINGS: undefined }, apiPath: '/x', render });
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
  });
});
