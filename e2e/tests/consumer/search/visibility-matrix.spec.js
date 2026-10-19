import { test, expect } from '../../../fixtures/live.js';
import { API } from '../../../helpers/liveAuth.js';
import { sql } from '../../../helpers/monetisation.js';

/* Each state is a clone of a live reel-eligible listing, so a missing visibility predicate surfaces it on
   every rail. Paused/sold/rented open by direct link with their badge but never list (P1 ruling). */

const STATES = `values ('pending','pending',false,false,false,false), ('needsinfo','pending',false,true,false,false),
  ('rejected','rejected',false,false,false,false), ('flagged','flagged',false,false,false,false),
  ('paused','paused',false,false,false,false), ('sold','sold',false,false,false,false),
  ('rented','rented',false,false,false,false), ('archived','archived',true,false,false,false),
  ('arch-approved','approved',true,false,false,false), ('recheck','approved',false,false,true,false),
  ('suspended','approved',false,false,false,true)`;

test.beforeAll(async () => {
  expect(sql("select count(*) from users where status = 'suspended'"), 'the seed has no suspended user to own the suspended clone').not.toBe('0');
  const cols = sql("select string_agg(quote_ident(column_name), ',' order by ordinal_position) from information_schema.columns "
    + "where table_name = 'properties' and is_generated = 'NEVER'");
  for (const deal of ['buy', 'rent']) {
    const template = (await (await fetch(`${API}/properties/reels`)).json()).find((r) => r.deal === deal);
    expect(template, `no live ${deal} reel to clone`).toBeTruthy();
    sql(`insert into properties (${cols}) select ${cols.split(',').map((c) => `c.${c}`).join(',')} from properties t, (${STATES}) s(st, status, archived, info, recheck, susp),
      jsonb_populate_record(null::properties, to_jsonb(t) || jsonb_build_object(
      'id', gen_random_uuid(), 'slug', 'qavis-' || s.st || '-' || t.deal, 'status', s.status, 'archived', s.archived,
      'info_requested_at', case when s.info then now() end,
      'recheck_requested_at', case when s.recheck then now() end, 'recheck_reason', case when s.recheck then 'price' end,
      'owner_id', case when s.susp then (select id from users where status = 'suspended' order by id limit 1) else t.owner_id end)) c
      where t.id = '${template.id}' on conflict (slug) do nothing`);
  }
});

// The live re-check clones would otherwise shift every later spec's counts on this database.
test.afterAll(() => { sql("delete from properties where slug like 'qavis-%'"); });

const rows = () => sql("select p.slug, p.id, p.status, p.archived, u.status, p.deal from properties p "
  + "join users u on u.id = p.owner_id where p.slug like 'qavis-%' order by p.slug")
  .split('\n').map((l) => { const [slug, id, status, archived, owner, deal] = l.split('|'); return { slug, id, status, archived: archived === 't', suspended: owner === 'suspended', deal }; });

const live = (r) => r.status === 'approved' && !r.archived && !r.suspended;
const byLink = (r) => ['paused', 'sold', 'rented'].includes(r.status) && !r.archived && !r.suspended;
const chunk = (xs, n) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

async function ids(path) {
  const res = await fetch(`${API}${path}`);
  expect(res.status, path).toBe(200);
  const body = await res.json();
  return new Set((body.content ?? body).map((x) => x.id));
}

test('no public list read returns a listing that is not approved, live and owned by an active user', async () => {
  const all = rows();
  expect(all.length, 'qavis seed missing').toBeGreaterThanOrEqual(20);
  const hidden = all.filter((r) => !live(r));
  const hiddenIds = hidden.map((r) => r.id);
  const reads = ['/properties/featured', '/properties/reels'];
  for (const deal of ['buy', 'rent']) {
    reads.push(`/properties?deal=${deal}&size=100`, `/properties?deal=${deal}&q=qavis&size=100`, `/properties/reels?deal=${deal}`);
    for (const s of ['pending', 'needs_info', 'rejected', 'flagged', 'paused', 'sold', 'rented', 'archived']) {
      reads.push(`/properties?deal=${deal}&status=${s}&size=100`);
    }
    const slug = sql(`select locality_slug from properties where slug = 'qavis-recheck-${deal}'`);
    reads.push(`/properties/similar?deal=${deal}&locality=${slug}`);
  }
  for (const owner of new Set(sql("select distinct owner_id from properties where slug like 'qavis-%'").split('\n'))) {
    reads.push(`/properties?owner=${owner}&size=100`);
  }
  for (const c of chunk(hiddenIds, 16)) reads.push(`/properties?ids=${c.join(',')}&size=100`, `/properties/cards?ids=${c.join(',')}`);
  for (const c of chunk(hiddenIds, 4)) reads.push(`/properties/compare?ids=${c.join(',')}`);

  for (const path of reads) {
    const leaked = [...(await ids(path))].filter((id) => hiddenIds.includes(id));
    expect(leaked.map((id) => hidden.find((r) => r.id === id).slug), path).toEqual([]);
  }

  const recheck = all.filter((r) => live(r)).map((r) => r.id);
  expect([...(await ids(`/properties/cards?ids=${recheck.join(',')}`))].sort(), 'a live re-check row must stay listed').toEqual(recheck.sort());

  // Index entries carry no id, so the hero's counts are held to the search total instead.
  const index = await (await fetch(`${API}/properties/search-index`, { headers: { 'Cache-Control': 'no-cache' } })).json();
  const wagholi = await (await fetch(`${API}/properties?locality=wagholi&size=1`)).json();
  expect(index.filter((e) => e.localitySlug === 'wagholi').length).toBe(wagholi.totalElements);
});

test('a direct link opens only approved rows, plus paused/sold/rented with their badge', async () => {
  for (const r of rows()) {
    for (const key of [r.id, r.slug]) {
      const res = await fetch(`${API}/properties/${key}`);
      const want = live(r) || byLink(r) ? 200 : 404;
      expect(res.status, `${r.slug} via ${key === r.id ? 'id' : 'slug'}`).toBe(want);
      if (want === 200) expect((await res.json()).status).toBe(r.status);
    }
  }
});

test('hostile search input answers 4xx or is ignored, never 5xx', async () => {
  const paths = [`q=${'a'.repeat(121)}`, 'minPrice=9000000&maxPrice=100', 'minPrice=-5', 'minArea=900&maxArea=100',
    'minAge=10&maxAge=1', 'minFloor=10&maxFloor=1', 'page=999999999', 'page=-1', 'size=100000', 'size=-1',
    'nearLat=999&nearLng=999&nearRadiusKm=5', 'nearLat=abc&nearLng=73.9', 'nearLat=18.5&nearLng=73.9&nearRadiusKm=-1',
    'nearLat=NaN&nearLng=Infinity&nearRadiusKm=5', 'bhk=abc', 'minPrice=99999999999999999999', 'sort=owner.mobile,asc',
    'owner=not-a-uuid', 'ids=not-a-uuid', 'availableFrom=notadate'];
  for (const p of paths) {
    const res = await fetch(`${API}/properties?${p}`);
    expect(res.status, p).toBeLessThan(500);
  }
  for (const p of ['/properties/similar?deal=buy&lat=999&lng=999', '/properties/compare?ids=a,b,c,d,e', `/properties/${'z'.repeat(400)}`]) {
    expect((await fetch(`${API}${p}`)).status, p).toBeLessThan(500);
  }
});
