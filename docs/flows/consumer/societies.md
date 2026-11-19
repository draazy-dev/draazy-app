# Flow: Societies & Localities

> How buyers/tenants discover Pune residential societies and localities, read society facts, homes
> and reviews, follow a society for new-listing alerts, and how owners bind a listing to a society.
> A society is a Google Place ID; ops curate the graph (merge duplicates, correct facts).
> Under **badge-not-gate (ADR-019)** the only floor is **L1 mobile sign-in** (follow, review, add a
> society) — **no identity check**.
> **Primary role(s):** guest/buyer/tenant (default), owner (binds a listing to a society),
> ops/admin (merge desk, directory edits)

---

## 1. Purpose & user problem
- **Persona:** a buyer/tenant researching *where* (locality-first) and *which building* (society-first);
  an owner naming their building; ops/admin curating the society graph.
- **Job-to-be-done:**
  - *Locality:* "Show me prices, appreciation, livability, rental yield and live inventory for a
    Pune locality, and let me set an alert."
  - *Societies index:* "Browse/search Pune societies, filter by locality, follow the ones I like,
    or add mine if it is missing."
  - *Society Hub:* "See a building's facts, ratings, homes on sale/rent and location, and get
    alerted when a new home goes live."
  - *Listings search:* "Search by a named building and get that society's homes."
- **Why it matters:** society/locality-first discovery is the top-of-funnel bridge into `/listings` and
  the differentiator vs broker portals; follows and alerts capture demand even with zero inventory.

## 2. Entry points
- **Routes:**
  - `/societies` - Societies index (search/filter/follow). `Societies.jsx`.
  - `/society/:slug` - Society Hub. `Society.jsx` (+ `?tab=` deep-links overview|homes|reviews|
    location; `?name=`, `?loc=` fallbacks for an unknown slug).
  - `/locality` and `/locality/:slug` - Locality insights dashboard. `Locality.jsx` (+ `?locality=`).
- **Tiles / triggers:** nav/home "Explore societies" & "Locality insights"; home society rail;
  property detail Society section links to `/society/:slug`; `SocietiesBlock` on a Locality page links
  each building into its Hub; Locality "View Properties" links to `/listings?q=<locality>`; Services
  hub tile "Locality Insights" -> `/locality/baner`; picking a named building in the listings area
  search (section 5.6).
- **Source components:** `src/pages/consumer/Societies.jsx`, `Society.jsx`,
  `src/pages/consumer/society/useSocietyHub.js` (the hub controller) + `society/tabs/*`
  (Overview, Homes, Reviews, Location), `society/SocietySidebar.jsx`, `society/SocietySkeleton.jsx`,
  `society/constants.js`, `society/helpers.jsx`; the shared picker
  `list-property/SocietySelect.jsx`; `src/pages/consumer/Locality.jsx` + `locality/*` cards and
  `locality/helpers.js`; ops `src/pages/admin/AdminSocieties.jsx` + `societies/CandidatesTab.jsx`,
  `societies/DirectoryTab.jsx`.

## 3. Actors & roles
- **Guest / buyer / tenant:** browse the directory, hub and locality dashboards; read facts, homes and
  reviews. Following, reviewing and alerts require **sign-in only** (L1; no identity verification).
- **Owner:** binds a listing to a society through the shared picker (section 5.1); signs in to mint a
  society that is not yet on Draazy.
- **Ops / admin:** the Societies desk (`societies:read` / `societies:write`) - merge/undo duplicates
  from the Candidates tab and edit facts in the Directory tab (section 6).
- **Guards:** none of the consumer routes are `ProtectedRoute`; gating is done in-handler
  (`requireLogin` -> `useSignInGate`). Guards are UX-only - see
  [`../../system/cross-cutting.md`](../../system/cross-cutting.md) section 1.

## 4. Entities touched
Link to [`../../system/data-model.md`](../../system/data-model.md).
- **Society** - a server row whose identity is a **Google Place ID** (`societies.place_id`, unique).
  Rows are minted only from a Google Maps pick (`POST /societies`); there is no seeded catalogue.
  Ops merge duplicates via `merged_into`; `archived_at` rows never appear.
- **Locality** - canonical registry (`src/data/localities.js`, `LOCALITIES`) + curated intelligence
  (`src/data/localityIntel.js`, `LOC`, 10 fully-covered localities). **Read** only in these pages.
- **Reviews** - `listEntityReviews` / `createEntityReview` / `getEntityReviewSummary('society'|'locality',
  slug)` (`services/reviewService.js`).
- **Follows** - `context/FollowContext.jsx`, over `societyService.listFollowedSocieties` /
  `followSociety` / `unfollowSociety`: `PUT`/`DELETE /me/societies/{slug}/follow` and
  `GET /me/societies/following`. The set is held once for the app (cards ask `has(slug)` from memory).
  Writes are optimistic and roll back on failure, and `toggle` returns the state it **settled** on, so
  a toast reports what happened rather than what was attempted. A follow the server refuses (unknown
  slug) stays in a local set (`dzLocalSocietyFollows`) that is retried on every load.
- **Saved searches / alerts** - `createSavedSearch` (locality alert reuses the listings alert layer).
- **Properties** - read via `listProperties({ society: slug })`; a listing's binding is its
  `societySlug`.

## 5. Business rules & logic  *(the meat)*

### 5.1 Society identity (Google Place ID)
- **Only Google Maps suggestions name a society.** Every surface that binds a society — list-property
  (all property types incl. flatmate rooms), admin post-on-behalf, rent agreement, the directory's
  "Can't find" box and the dashboard finder — uses the one picker, `list-property/SocietySelect.jsx`.
  Free-text names are not accepted; RERA data was not usable (duplicates, unmatchable names).
- **Pick → resolve → bind or mint.** On a pick the client fetches place details and calls public
  `GET /societies/resolve?placeId&name&lat&lng`:
  - exact `place_id` hit (following `merged_into` to the survivor) → bind that society;
  - else up to 3 **candidates** (non-archived, within 250 m, token name score + 0.25 within 100 m,
    floor 0.34) → "Is it one of these?"; picking one binds it, "None of these" mints;
  - else mint via `POST /societies {placeId, name, lat, lng, origin}` (sign-in required; the picker
    stays mounted through the sign-in modal and retries). The server re-reads the place through the
    `PlacesLookup` seam (real Place Details when `GOOGLE_PLACES_SERVER_KEY` is set, client hints in
    dev), within a per-member daily lookup budget (20/day, then rate-limited). 422 for a place outside
    the Pune box (`SocietyPlaceRules`), an area-only place ("Pick your building, not an area") or a
    shop/office ("Pick your building, not a shop or office"). Residential buildings only.
- **"Not on Google Maps"** lets the owner continue with no society; the listing is simply unbound
  (rent agreement then takes free-text building text, which never becomes a society).
- New societies are visible immediately; duplicates that slip through (two Place IDs for one
  building) are merged later on the ops desk.
- Room and managed-property `society` text is derived server-side from `societyId`. PATCH with
  `societyId: ""` clears a binding; an unchanged id is not re-validated, so homes bound to an
  archived society stay editable.
- **`_thin`** = a row with no `units` and no `builder` (a freshly minted society carries only name +
  locality): the hub must NOT fabricate specs; it shows an honest "Limited details" / "details not
  confirmed yet" panel and never claims Draazy verified or confirmed it.
- **Hub:** facts + homes + reviews + location. Followers get a `match.society-listing` notification
  when a home bound to the society (or to anything merged into it) goes live.

### 5.2 Society -> listing binding
**A binding is a fact or it is nothing.** A listing's `societySlug` (derived server-side from its
`societyId`) is the only link; there is no heuristic fallback. Callers handle null - the property
page's Society section renders **nothing at all** when unbound, because a heading over a generic
"Building" still asserts membership. A hub's homes come from `listProperties({ society: slug })`, so
an unbound listing counts towards no hub.

### 5.3 Societies index (`Societies.jsx`)
- Each card is `{ slug, name, builder, localitySlug, rating, homes }`: `homes` is the server's
  `listingCount` on the `GET /societies` row and `rating` is `{ avg, count }` from the row's
  `avgRating`/`reviewCount` (`avg` null when unrated). Both are summed over the merge family.
- **One server page at a time.** The page asks `GET /societies?q&locality&sort&page&size=24` and draws
  what comes back; "Show more" asks for the next page and de-duplicates by slug. `q` is debounced
  (250 ms); `loc` and `q` mirror into the URL (shareable/deep-linkable). The locality dropdown is the
  bundled locality registry (`data/localities.js`), not derived from loaded rows.
- **Filters** (all server-side): `locality` (exact slug) and `q`, a case-insensitive substring over
  `name + builder + locality words` (`baner-road` is "baner road"). Merged-away and archived rows never
  appear.
- **Sorts** (`sort=`), ranked in SQL (`SocietyRepository.rankedIds`) over the **whole filtered set**
  before paging, so page 2 continues page 1. Homes and rating are totalled over the merge family:
  - `relevance` (default): `min(homes,3) + rating.avg/5`, desc, then name, then slug.
  - `rating`: avg desc, then review count desc, then name, then slug.
  - `homes`: homes desc, then name, then slug.
  - `name`: A-Z (a plain `ORDER BY name, slug`, paged in SQL).
- **Add-society funnel:** the "Can't find your society?" box is the Google-only picker
  (`mintOrigin: 'demand'`). A pick binds or mints as in 5.1, then the page follows it (unless already
  followed) and navigates to its Hub. Requires sign-in.

### 5.4 Society Hub (`useSocietyHub.js`)
- **Read:** `getSociety(slug)` (`GET /societies/{slug}`); `null` (404) or a thrown read falls back to
  `genericSociety(slug, name, loc)`. `socLoading` gates first paint (`SocietySkeleton`) so a real
  building never flashes as an unknown one. Homes: `listProperties({ society: slug })` (skipped for a
  generic row). Reviews: `listEntityReviews` (one page of 20) + `getEntityReviewSummary` (whole corpus).
- **Ratings are published reviews only - there is no estimate.**
  - Per-category bars: `bar[k] = catAvg[k]` for the aspects present in `catAvg`, and nothing for the
    rest. `catAvg` is sparse by contract (an aspect nobody rated is absent, not 0), so a partly
    rated society draws a partial grid. Aspects: Safety, Maintenance, Management, Amenities,
    Connectivity (`REVIEW_CATS`; ids stay stable English, labels come from `society.cat<Id>`).
  - **Overall:** `count ? rating.avg : null`. `null` is a signal, not a defence: `Stars` draws `null`
    and `0` the same empty strip; both call sites branch on `rating.count` first to keep either off the page.
  - **Where "Not rated yet" appears:** the hero on `Society.jsx` only. The Reviews tab renders
    *nothing* at the aggregate slot when `rating.count` is 0 and leaves the explaining to the
    empty-list line (`society.noReviewsYet`), gated on `reviews.length` (a different read).
    A spec looking for "Not rated yet" scoped to the Reviews tab will time out.
  - **Loading and failure are their own branches** in both surfaces, above the unrated one, so a
    failed summary never reads as "nobody has rated it".
- **Writing a review:** `requireLogin` bounces guests to sign-in; the composer takes an overall star
  and optional per-aspect stars (an untouched aspect sends no key). After a post both the list and
  the summary are re-read. A review can be reported (`ReportModal`, `REVIEW_REPORT_REASONS`).
- **Price stats from live listings in the society:** `psf = mean(price/area)` over `buy` listings
  with area; `rentAvg = mean(price)` over `rent` listings; plus `forSale` / `forRent` counts.
- **Stats tiles:** total units, towers, `built = year + age`, occupancy - each rendered only if the
  field is present (thin rows show none). Living facts (water, power, parking, lifts, security,
  maintenance, pets, food) likewise only when present. `registration` / `conveyance` are plain facts
  on the row (edited on the ops Directory tab); the hub draws no badge from them.
- **Location:** `commuteInfo(lat,lng)` + `connectivityFor({localitySlug})`; a Google Maps directions
  URL is built only when `lat/lng` exist (`hasCoords`).
- **Tabs (`TAB_IDS`):** overview (always), homes (only if listings > 0, with count), reviews (only
  from 3 reviews, `MIN_REVIEWS_FOR_TAB`, with count), location (hidden for a generic society). Active
  tab is URL-synced (`?tab=`); a hidden or unknown tab falls back to overview.
- **Sidebar:** follow card (`follows.toggle`, sign-in gated) and the "why Draazy" panel.

### 5.5 Follow & alert (`requireLogin`)
- `requireLogin()` opens the sign-in sheet via `useSignInGate`; once signed in (L1) the tapped action runs
  directly - there is no verification step. Gated: **follow, review, report a review, locality
  alert**.
- Following a society notifies the follower (`match.society-listing`) when a home bound to it goes
  live.

### 5.6 Listings area search (`EntitySearchCombobox.pickPlace`)
- Picking a Google suggestion fetches place details. If the place is a **named building**
  (`isNamedPlace` + `placeId`), the combobox calls `resolveSociety`; on a hit it adds a **society**
  token - the listings filter gets `soc=<slug>` and the chip shows the society name.
- No hit (resolve misses or throws), or an area place: a registry locality token, else a
  **near-a-place** token (`near=lat,lng`) as for any other place, else a locality by label.
- `resolveSociety` is public, so this works signed out and never mints.

### 5.7 Locality insights (`Locality.jsx` + `locality/helpers.js`)
Covered localities key off `LOC[name]`. All figures are curated/deterministic (no live API):
- `scoreOf(n)` = mean of the six livability sub-scores (Safety, Connectivity, Schools, Healthcare,
  Lifestyle, Greenery).
- `rentOf(n, bhk)` = `LOC[n].rent2 * RENT_MULT[bhk]`, `RENT_MULT = {1:0.7, 2:1, 3:1.45}`.
- `yieldOf(n, bhk)` = `(rentOf*12) / (price * SIZES[bhk]) * 100`, `SIZES = {1:550, 2:800, 3:1150}`
  sq.ft.
- `puneAvgPrice` / `puneAvgYoy` = simple means across covered localities.
- **Price trend (`buildTrend(price, yoy, range)`):** back-casts 6 yearly points via
  `price / (1+g)^k` (g = yoy/100), then interpolates geometrically per range (5Y/3Y/1Y). Forecast =
  `price*(1+g)` and `price*(1+g)^2` for the next two years; a "Pune avg" series overlays.
- **Livability rank:** `1 + count(localities with scoreOf > this)`. Score label thresholds: >=8.5
  Excellent, >=8 Very Good, >=7.5 Good, else Average.
- **Compare metric values (`metricVal`):** price | rent (rent2) | yield(2 BHK) | yoy | livability.
- **"Best for" tags (`bestForTags`):** Family-safe (Safety>=8.7), Well-connected (Connectivity>=8.7),
  Top schools (Schools>=8.7), High rental yield (yield>=4.5), Hot demand (demand=='Very High'),
  Vibrant lifestyle (Lifestyle>=8.7); first 5.
- **Live inventory bridge:** loads approved listings, indexes by `localitySlug` into
  `{count, from(min price), buy, rent}`; the KPI/CTA cards deep-link into `/listings`.
- **Emerging locality panel:** a registry-only locality with no `LOC` dashboard renders
  `EmergingPanel` instead of mislabeling Baner's data. It shows the 3 nearest covered localities by
  **haversine distance** (`haversineKm`) as an honest benchmark proxy, plus live inventory, map,
  societies and reviews for that area.
- **Local societies bridge:** `listSocietiesPage({ locality: activeSlug, size: 6, sort: 'homes' })`
  feeds `SocietiesBlock` (society-first discovery into the Hub).
- **Locality alert (`setLocalityAlert`):** reuses `buildAlertRecord` + `createSavedSearch` (the listings
  alert layer) so it lands in the dashboard Alerts panel; sign-in gated.

### 5.8 Server-side vs client
- Society identity resolution, merge redirects, family aggregates and ranking are server-side; locality
  price/yield/trend math is client-computed from curated data.

## 6. Maker-checker / approval
Applicable only on the ops Societies desk, following
[`../../system/cross-cutting.md`](../../system/cross-cutting.md) section 2. Societies are live on
mint (no approval step); ops correct afterwards:
- **Candidates tab:** the live community-minted societies, newest first, each with duplicate hints.
  **Merge** (`mergeSocieties(from, into)`) / **Undo merge** (`undoSocietyMerge(slug)`). Both directions
  are written to `audit_log`.
- **Directory tab:** edit a society's own facts - registration, conveyance, maintenance per sq ft and
  an internal `adminNote` - via `editSociety` (`PATCH /admin/societies/{slug}`). Registration and
  conveyance are plain facts, not a verification.

## 7. State machine
```
Society:  minted(community) --ops merge--> merged (redirects to survivor) --ops undo--> live
```
- Merge is a pointer (`merged_into`), never a move; chains are refused in both directions. An
  archived society (`archived_at`) is a 404 on the hub and absent from every list.

## 8. Edge cases, validation & error states
- **Unknown slug:** `getSociety` misses -> `genericSociety(slug, name, loc)`; hub hides homes &
  location tabs and shows a thin state. The placeholder carries **no** specs and no coordinates, so it
  takes the `_thin` branch: never a builder, unit count or estimated rating for a building nobody has
  confirmed exists. A read that throws (not a 404) falls back to the same row.
- **Thin society:** see `_thin` in 5.1.
- **Empty states:** Societies index "No societies match your filters" with reset; Society homes tab
  hidden when 0 listings; Reviews tab hidden below 3 reviews; Locality inventory bar handles a
  locality with no live listings.
- **Not signed in:** follow/review/alert actions bounce to sign-in; once signed in (L1) they proceed.
- **Validation:** `POST /societies` `placeId` required, `name` <= 160 chars (no contact details), `lat`/`lng`
  in range and inside the Pune box; area-only and non-residential places are 422.
- **Merged society:** a merged-away slug resolves to the survivor (hub 200, canonical slug in the
  response); lists omit it; its listings, followers and reviews read on the survivor.
- **Merge refusals (ops):** into itself 422; chains, an already-merged society, or losing a race 409,
  each naming the merge to undo first.

## 9. Backend society reads

Reasoning relocated from code comments in `catalog/society/`.

### 9.1 The merge family is the unit of aggregation

A merge moves nothing: a listing filed under the duplicate keeps pointing at the duplicate. Every
aggregate on the directory and the hub is therefore taken over the society **and everything merged
into it**; otherwise the building's listings, followers and reviews would split across two rows, one of
them invisible.

`SocietyService.families` resolves that in one query for the whole page, served by the partial
`idx_society_merged_into`. Asking per row would put an N+1 on the unauthenticated `GET /societies`,
one anybody can trigger for free. The survivor is always the first entry and an unmerged society gets a
list of exactly itself, so the aggregate code has one shape.

A slug an operator merged away **resolves rather than 404ing**, and the response carries the survivor's
slug so a client can canonicalise its URL (the old slug is in Google's index, shared links, every
listing's `society` field and every alert set on it).

A merge is **reversible**, which is why nothing is moved or deleted: `DELETE
/admin/society-merges/{slug}` takes `merged_into`, `merged_at` and `merged_by` back to null. Because an
undo erases its own evidence, both directions are written to `audit_log` (unlike the sibling society
queues, whose outcome stays legible on the row). Chains are refused in both directions: collapsing an
intermediate hop could not be undone.

### 9.2 Page-scoped aggregates, never per-row

`browse` and `summarise` cost a fixed handful of queries for any page size: the page (for the ranked
sorts, `rankedIds` for the page's ids, a `findAllById` and the filtered `count`), the merge lookup, the
grouped listing counts, follower counts and rating aggregates, and, only when signed in, which of the
page's societies the caller follows. Per-row queries on an unauthenticated endpoint are a free
denial-of-service; the standing risk on this surface is cost, not leakage (nothing here is private).

The rating is resolved for the directory, not only the hub, because the cards render it.

`summarise` is extracted from `browse` so the follow list (`GET /me/societies/following`) renders
identical cards; a second assembly in the Engagement slice would drift (a different follower count per
screen). The caller supplies the order and `summarise` preserves it (a follow list is ordered by when
you followed).

Empty id lists short-circuit before hitting the repository: an `IN ()` is not SQL.

### 9.3 Ratings over a merged family

`combinedRating` is weighted by how many reviews each row's average was over, not a plain mean of the
two averages (which would let a duplicate with one five-star review drag a survivor's 3.9-from-two-hundred
up to 4.45). The arithmetic equals every review having been written against one society.

The single-society case returns the stored aggregate untouched.

Null is not zero: `RatingLookup.forSocieties` omits unrated societies so an unrated building stays a
null average rather than a `0.0` the card would render as a one-star society.

### 9.4 `hasListings` - the home rail's `EXISTS`

The home page's society rail shows eight cards; without this filter it would read the entire directory
on the entry route's critical path.

- **`EXISTS`, not a count:** Postgres stops at the first matching row. Ranking *within* the survivors is
  the client's job (`SocietiesSection` sorts by `listingCount` desc, then name, and shows eight), so the
  request asks for the page ceiling rather than a second smaller literal.
- **Live means what it means everywhere else:** approved and unarchived, the pair `ListingCounts`
  groups on and `Property.isPubliclyVisible` enforces.
- **`FALSE` is deliberately not the inverse.** "Societies with no listings" is an ops question;
  answering it here would let an anonymous caller cheaply enumerate the quiet half of the catalogue.
- **The subquery's second root is the merge family, and it is load-bearing.** Correlating on
  `society.id` alone would exclude a survivor whose live listings all sit under a merged-away duplicate
  from the rail, while its card says it has homes, with nothing erroring.

### 9.5 `SocietySpecs.browse` constraints

- Merged-away and archived societies are excluded, deliberately not via a caller-supplied flag: a
  listable duplicate means two cards for one building. The cost: typing the merged-away spelling gets no
  result rather than the survivor, which is bounded because duplicates usually differ only by a typo or
  a phase suffix.
- The text match is a leading-wildcard `LIKE`, which no btree index can serve; acceptable only because
  `societies` is in the thousands of rows and the scan is bounded by the page-size cap. **If the
  catalogue grows by orders of magnitude, switch to a `pg_trgm` index.** `rankedIds` repeats the same
  filter in SQL and must stay in step with `browse`.
- **For `findAll` only, never delete-by-Specification.** The `hasListings` branch builds a subquery off
  the `CriteriaQuery` it is handed, and `SimpleJpaRepository.delete(Specification)` passes `null` there;
  an always-true guard predicate would silently widen a delete to the whole directory.

### 9.6 The hub's own bounds

`homes` is capped at 50 (an uncapped array would make the largest society the cheapest way to make the
server do the most work). `reviews` stays empty because the contract serves them from the paged
`GET /reviews/society/{slug}`.

`POST /societies` answers **201** for a new society and **200** when the Place ID already has one,
returning the canonical row either way; this lets the screen say "Added" or "Already on Draazy".
Sign-in is required because the row records who added it (`created_by`), which the Candidates-tab
operator needs and which makes one account minting fifty societies visible. Two people minting the
same new place at once resolve through `on conflict do nothing`: the loser re-reads and gets 200.

## The society seam (`societyService.js`, `providers/http/societyProvider.js`)

**Societies join on `slug`, never on `id`.** The server keys societies by UUID and accepts the slug as
the public alias; reviews, follows, hub reads and listing bindings (`societySlug`) all use it.

**Ratings are an index keyed by slug**, not a per-society read, so no caller issues one request per row.
`avg` is `null`, never `0`; branch on `count` (`Number(null)` turns "nobody has rated this" into "a
one-star society"). A slug absent from the index means "this reader has no opinion", not unrated. Rows
without a slug are skipped rather than indexed under `undefined`.

**Ordering, the geo blacklist and the cap live in the service, not the provider**, so a picker cannot
rank differently per mode; the pass is idempotent. `searchSocieties` (the ops merge-target search, via
`useSocietySearch`) orders a locality match first, then alphabetical, and caps at 20. `GET /societies`
does not honour the admin geo blacklist, so that is a presentation filter, not enforcement.

**The locality is deliberately not sent to the type-ahead.** `GET /societies?locality=` is a hard
filter, but to this search a locality is a *preference*: societies outside the chosen area rank below
those inside, so a user who picked the wrong locality still finds their building.

**The hub reads `GET /societies/{slug}`, not a `q=` search.** A directory read would answer with a
*near* society, worse than nothing on a page rendering one building's facts. A 404 becomes `null` (the
hub is reachable from typed URLs and pre-merge links, and renders that honestly); every other failure
propagates, so "server is down" and "building does not exist" never read the same.

**The back office reads the public `GET /societies` rather than an `/admin/societies` list.** Every
console column is already on `SocietyResponse` and `q`/`locality` already filter it. A merged-away
society is absent (the spec filters `mergedInto is null`), which is correct; the row carries
`followedByMe`/`avgRating` the console ignores. No `sort` is exposed: `SocietySort`'s whitelist is not
backed by indexes, and api-standards.md §5 forbids exposing a sort the schema cannot serve.

**Follows come in two operations on purpose.** `listFollowedSocieties` narrows to slugs for
`FollowContext` (mounted app-wide, answers `has(slug)` for every card from memory, must not hold up to
500 full records). `listFollowedSocietyRows` returns whole rows (with `listingCount`) for the dashboard
panel that draws the list; mapping `getSociety` over the slugs would be one request per followed
society. A followed slug the reader cannot resolve is **absent**, not a stub, so `length` may be below
the follow count. Both use `unwrapFullPage`: a follow set that outgrew one page would otherwise show as
unfollowed.

**Minting.** Every surface that binds a society (list-property, admin post-on-behalf, rent agreement,
the directory's "Can't find" box) goes through the one picker; the area search only resolves. The
response is the canonical society either way; `created` comes from the status code, the only place the
distinction lives.

**The Candidates queue** lists live community-minted societies, newest first (merged-away and archived
rows excluded). There is no verify action: a candidate stays live and is either left alone or merged.
Duplicate hints come from the *server's* catalogue (so a candidate that is a second copy of another
candidate never renders "No obvious match"). They are a hint, never an action: the merge is a separate
explicit call. They are fetched per candidate (`limit` 1-25), four requests at a time while the tab is
open, not as a queue column, because the scan compares a name against the whole catalogue. A 404 for an
unknown slug is deliberate, so a stale queue says so.

**Merges are pointers, not moves.** The duplicate keeps its listings, follows and reviews and the reads
union them onto the survivor, which makes a merge undoable (merging the wrong pair, or the right pair
the wrong way round, will happen). Both slugs travel in the body because they are two halves of one
statement; either in the path would read as an edit of that society. Undo is addressed by the society
that was **merged away**, not the survivor (a survivor may have absorbed several duplicates); a slug not
merged into anything 404s. Merging a society into itself is 422; either shape of chain, a retired
survivor, and losing the race to another operator on the same pair, is 409, each naming the merge to undo
first. The merge list is newest-first.

**The admin society view exists for `adminNote`.** The other fields (`registration`, `conveyance`,
`maintenancePerSqft`) are already on the directory row; the note is not, and is kept off the public
payload because it is moderator prose about a named building and often its people. The edit is a
`PATCH` and partial: the console sends all four together, but the row carries columns this form never
shows, and sending the whole shape is how a later screen reusing this call blanks them. `adminNote` is
the one field where absent and empty differ: `''` clears the note, `undefined` leaves it; neither may be
coalesced into the other at any layer. A maintenance figure outside 0-100 is rejected (it is rupees per
square foot; the monthly bill is the likely wrong entry and would quote a flat at lakhs a month).

**The society mapper (`toSociety`) writes fields out one by one** rather than passing the row through,
because `SocietyDetailResponse` also carries `homes` and `reviews` that the hub must read from
`propertyService` and `reviewService`. Units match the server exactly (`occupancy` is 92, not 0.92;
`maintenancePerSqft` is rupees). `_thin` and `_generic` are deliberately not set: they are the hub's own
words for what it got. `listingCount` is the server's count of live listings summed over the merge
family, and `0` there is a real zero.

**The directory is read one page at a time**, filtered and ordered by the server. `relevance`, `rating`
and `homes` rank on aggregates computed on read (live listings and published reviews summed over the
merge family, never the unmaintained `listing_count`/`avg_rating` columns): the database ranks the
filtered set (`SocietyRepository.rankedIds`), `SocietyService.ranked` loads only the requested page's
rows and turns them into cards; `name` and the column sorts stay a SQL `ORDER BY`. A request leading
with a computed sort echoes `sort: "<mode>,desc"`. The listing-bearing rail asks for the server's page
ceiling (the server only narrows the population via `hasListings`; the ordering of the eight shown is
client-side).
