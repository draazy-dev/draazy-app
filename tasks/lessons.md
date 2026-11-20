# Lessons

> **One line per rule: trigger, then the rule.** Grep it for the symptom — do not read it whole. The incident behind each rule is in git.
> Add a new lesson as ONE line (≤ ~200 chars) in the matching section; merge it into an existing line if it is a near-duplicate.

## Crawling external sources

- **A 200 saying "No Records Found" is a failure** (MahaRERA overload returns a short shell, not a 5xx): detect on the body.
- **Mark work done only when it produced rows**; stamp each row with its source page so gaps are provable.

## Upload policy

- **PDF compression is part of the document flow** (`pdf.worker.js`): signed PDFs are unsupported (ask for unsigned); never call rasterizing lossless or promise every file fits 1 MB.

## Tests: what green does not prove

- **`mvnw test -Dtest=A+B` runs zero tests and reports BUILD SUCCESS**: use commas, check "Tests run:" is non-zero; with `-DfailIfNoTests=false` a typo still exits 1.
- **A green build does not prove a new prop is passed**: grep every `<Component` call site (Vite builds clean, crashes at runtime).
- **A spec never executed is a claim, not coverage.**
- **A run longer than the token TTL is a different experiment**: past 15 min a replayed refresh token trips reuse detection.
- **A spec mutating a seeded actor breaks the next spec** (DB resets per run, not per file): restore shared seed data.
- **Before enriching a shared seed row, grep who relies on it being bare**; select fixtures by the fields asserted, never `rows[0]`.
- **A `@Transactional` test base cannot see commit-time bugs, missing transactions or fetches**: wiring needs a bare `@SpringBootTest`.
- **A `@Transactional` MockMvc test cannot prove a REJECTED write did not persist** (the follow-up read auto-flushes): assert the status, say why the read is absent.
- **Arrange fixtures through the product's endpoint, not raw SQL on rows the transaction already loaded.**
- **Grep the application log after a green run**: sweeps, schedulers and listeners fail silently.
- **Prove a regression test fails on old code** (`git show HEAD:<path>` or `if (false)` the guard).
- **Before editing a red assertion, say whether the test or the product is wrong** (one in five was a real regression). If the product changed the rule on purpose, confirm it in the service, then fix the spec — never loosen the product.
- **A checklist row is Pass only if a check did what the row says**; drive each layout shell by hand.
- **A gate that now refuses what it allowed has callers the old looseness served**: enumerate them first.

## Assertions that assert nothing

- **`toBeVisible()` passes on `opacity: 0`; e2e runs reduced-motion, forcing `.reveal` to opacity 1.** Assert the `visible` class `useScrollReveal` adds.
- **`[].every(...)` is true; `expect([]).toEqual([])` passes.** Every sweep needs a floor returned by the helper.
- **A "page loaded" assertion any page satisfies is not one** (`getByRole('heading').first()`, `waitForLoadState`): name the heading.
- **A negative assertion needs a positive anchor and a negative anchor that makes a lazy assertion fail.**
- **Prove provenance before asserting on content** (observe the request or `totalElements`), or a silent fallback passes.
- **An absence assertion on the wrong ARIA role can never fail** (`Call`/WhatsApp are `tel:`/`wa.me` anchors): read what the component emits.
- **Prove a negative with a tool you have seen return a positive**; re-ask with a different command.
- **A rollback-only probe under `@Transactional` tests can be permanently `false`** (only the bound `ConnectionHolder` is marked); red-check by deleting the exception from `noRollbackFor`.

## Playwright

- **`page.route(..., { times: 1 })` is spent by StrictMode's discarded first load**: route persistently, `unroute()` before recovery.
- **`setInputFiles` skips actionability** (silently sets a disabled input): wait for `[data-err="photos"]` `aria-busy="false"`, assert the filename.
- **`getByText('X')` is a case-insensitive substring match**: use `{ exact: true }`. `title=` feeds the accessible name; scope modal footers to `getByRole('dialog', { name })`.
- **`components/ui/Table.jsx` renders rows twice** (card + table): scope to `getByRole('row', { name })`; its empty state is a `tbody tr`, so `toHaveCount(0)` never passes.
- **Anchor phone regexes**: use `MOBILE` from `fixtures/live.js`.
- **`page.addInitScript` re-runs on every navigation**: seed with `page.evaluate` after load, then `reload()`.
- **`locator.count()` does not retry**: `expect(x.first()).toBeVisible()` first.
- **A `waitForRequest` predicate must identify the caller** (admin bell shares `/admin/properties?status=pending`, `size=5`).
- **`if (await x.count()) await x.click()` silently skips; a diagnosis-sounding `test.skip` stops anyone looking.** Fail loudly.
- **`waitForTimeout`: delete it if the next line retries, else replace with an assertion on the LAST observable effect.**
- **`networkidle` is a sleep**; `page.goto` resolving does not mean a `lazy()` route's effect ran — wait on its side effect.
- **Scattered failures or a much slower run is machine contention**: check `Get-Process node` and ports; never build or run `graphify` during e2e.
- **`reuseExistingServer: !CI` attaches to a Vite you do not own**; uniform `ERR_CONNECTION_REFUSED` is infra. Keep infra-dependent specs out of the default suite.
- **Do not edit source while a suite runs** (hot reload; a new file matching an `import.meta.glob` is a call-site change).
- **`page.clock.install()` does NOT pause time** — `pauseAt()` does; `resume()` before the next `goto`.
- **Probe a session helper once** (print storage keys + one signed-in-only control).
- **Do not fabricate `draazyTokens`** (401 → `/auth/refresh` → logout): answer `/auth/me` and `/auth/refresh` with `page.route`.
- **A "nobackend" config can still reach a backend** via the Vite `/api` proxy to :8080.
- **A `has:`/`hasText:` inner locator must be built from `page`, not the scope.**
- **The cookie banner intercepts bottom-anchored clicks**: seed `dz_cookie_consent_v1`.
- **Live specs need a value only the DB holds**; a new `providers/http/<domain>Provider.js` is globbed by `config.js`, unknown domains only `console.warn`.
- **Run only the specs a change touches**, even for app-wide components; never start `run-fast.ps1 -Full` unprompted (user-directed).
- **A full e2e run must be launched detached** (`mode=async, detach`); progress is the shard log. An attached run dies with its session, leaving shard JVMs on ports.
- **Before waiting on "another session's" run, probe `e2e\.shards\lock` once**: a `run-fast` name match may be your own loop; a VS Code Playwright `test-server` is not proof of a run. Never fall back to the full suite.

## Service seam and API shape

- **An endpoint existing is not evidence it answers your question** (`GET /cities` ≠ switchable cities): one `select count(*)` first.
- **A list endpoint omits what detail carries** (`GET /properties` has `coverImage`, no `images`): diff the field lists.
- **Making a function async turns "cannot fail" into "fails invisibly"** and opens a double-submit window; review callers.

## Contracts, mappers and migrations

- **An unmapped key on a write is dropped, not rejected**; absent is not zero (never send `0` for a flats-only floor).
- **`Number('N/A')` → `NaN` → `null` = "cleared"**: coerce with `Number.isFinite` and omit.
- **When a column starts being written, re-read every projection and display-only place of it.**
- **If the server redacts on read, render read-only**, omit from payload, validate on create only.
- **`id` is the routing token (`slug || id`); `uuid` addresses the row** — binding the wrong one is the recurring bug.
- **Allowlists duplicated across Java and JS drift** (`pickListingFormDetails`, `DETAIL_KEYS` vs Java `TEXT`): `npm run check:enums`; grep BOTH.
- **A field scoped on the way out must be cleared on the way back** (hidden control kept `possession: 'ready'`).
- **`400 "Request body could not be read"` is a Jackson parse failure naming no field**; if the plainest listing fails, it is the shared write path.
- **Editing an applied migration (comments too) breaks Flyway checksums**: add a new `<yy>.<mm>.<seq>__`; re-read edited migrations in full.
- **`R__` re-applies only on checksum change** (force: `delete from flyway_schema_history where script = 'R__...'`); reference data belongs in `R__`.
- **`DELETE` a personal-data row rather than null its identifier.**

## Backend — Spring, JPA, Postgres

- **Spring 6.2+ hands a `TaskScheduler` an OutcomeTrackingRunnable**: test scheduler wrappers via a real `@Scheduled` bean.
- **Session advisory locks leak behind PgBouncer / DO pools**: use `pg_try_advisory_xact_lock` in an open transaction.
- **`@Transactional` goes on the outermost reachable method**; self-invoked/`private` calls skip the proxy.
- **`:param is null` in JPQL fails on Postgres**: `cast(:from as LocalDate) is null`.
- **A multi-column `@Query` returning `Object[]` silently nests**: use a projection interface with `as` aliases.
- **In a `@Transactional` test, `JdbcTemplate` cannot see unflushed JPA writes** (`em.flush()`), and a `jdbc.update` is invisible to a later entity read (first-level cache): change the entity and `saveAndFlush`.
- **Committed-row cleanup**: impossible per-test under `@Transactional` (use static `@AfterAll` with a captured `DataSource`); a non-`@Transactional` `@SpringBootTest` must erase its rows in `@AfterEach`.
- **"too many clients" is the context cache**: `src/test/resources/spring.properties` caps it at 12 (`max_connections=100`).
- **A Maven run going quiet is a lock wait**: check `pg_stat_activity` `wait_event_type = 'Lock'`.
- **`NoClassDefFoundError` after a fine start means the classpath changed underneath**; never `spring-boot:run` on a dir another build writes.
- **A durable cap needs both `noRollbackFor` (sequential) and `@Lock(PESSIMISTIC_WRITE)` (concurrent).**
- **A row lock cannot protect a row's absence** (`orElseGet(insert)` races): transaction-scoped advisory lock + double-checked read.
- **`spring.jpa.open-in-view=false` is a standing ruling (D185)**: fetch associations in the service.
- **Default a policy lookup to the stricter branch** and compare against the named constant; test unknown values.
- **`@Size` on a `@RequestParam` needs class-level `@Validated`**; validate in the service.

## Security and privacy

- **A scanner stripping punctuation invents matches**: space/dot/dash/bracket join digits, comma/slash/pipe/colon separate (`₹65,00,000 / 750 sq.ft` is not a phone).
- **Java `\s` is ASCII-only; pastes carry U+00A0**: use `\p{Z}`/`\p{Pd}`, NFKC, `Character.digit(cp, 10)`.
- **A browser-only kill switch is not one**: the server must read each client-published flag (`signupsEnabled`) at the write site.
- **A server switch is only as durable as its row**: an `R__` seed with whole-document `ON CONFLICT DO UPDATE` resets admin-owned keys.
- **A flag stored as the wrong type is enforced as its opposite** (`"false"`): refuse the write; assert `jsonb_typeof`.
- **"Exactly one caller" is load-bearing**: pin it with a source-scanning guard, red-check against a many-caller method.
- **Participation is not authorisation**: non-participant → 404, participant who may not act → 403; never two distinguishable 404s. A guard shared by read and write was written for the read.
- **Derive the sensitive value; don't validate what the client sent**; failure messages must not answer unasked questions.
- **A mask that still parses is worse than one that throws**: validate what bad input cannot satisfy (length 10), under-reveal; a normaliser's default must not be destructive.
- **Never render `err.message`**: render `userMessage(err, fallback)` (`lib/userMessage.js`); only `ApiError.serverMessage`, `NetworkError` or `UserError` show text; friendly local throws are `UserError`.

## UI engineering

- **A locally computed answer renders a confident false negative forever**; arithmetic on a creation date shown as history is fabrication.
- **Removing a rail leaves the documents it fed** (a "Verified" Rent Passport from self-typed figures): grep downstream artifacts for "verified".
- **"Remove feature X" rarely means all of X's vocabulary**: restate the boundary to the user first.
- **`aria-label` on a button with visible text overrides it** (breaks `getByRole({ name })`, WCAG 2.5.3); label the state, not what's already read.
- **A custom `Select` is a `<button>`, so `htmlFor` cannot reach it**: visible caption that is a substring of `ariaLabel`, plus `ariaDescribedBy`.
- **A rename is done only when locale JSON moves in every language**: `npm run check:i18n` + runtime sweep for dotted-key text.
- **Eager surfaces (Home, `components/ui/`) may only use eager namespaces** (`auth, chrome, common, help, home, misc1`); shared keys go in `chrome.json`, all three languages. A lazy `property.*` key renders raw.
- **`isIn` (`!!user`) is false for "signed out" AND "not asked yet"**: derive `gated` once, three-state.
- **Debounce the serialised string, not an object rebuilt each render**; `flush()` a debounced save before deliberate navigation.
- **Freshness is not publication status**: gate Active/Availability badges and reactivation on approval.
- **Don't move a sticky bar on input focus** (the blurring tap is lost). Phone form action rows sit in flow at the form end, never sticky (iOS keyboard; `.lp-step-actions`).
- **A hover handler on a keyboard-scrolled list must ignore pointer-less events**: gate `onMouseEnter` on `movementX/Y` (`EntitySearchCombobox`).
- **The router package is `react-router`**; importing `react-router-dom` breaks the whole lazy chunk.
- **Files containing JSX must be `.jsx`.**

## Reviews, agents and surveys

- **A reviewer's severity is a hypothesis**: verify the mechanism; comment where you reject a finding.
- **A delegated survey is a lead, not a verdict** (~30% of citations wrong): ask which directories were swept; verify each slice.
- **When a workaround proves load-bearing, grep the whole tree for it**; search the rarer of two co-occurring anti-patterns.
- **A harness reporting only what it was told to find certifies its blind spots**: fail-until-judged, compare the union of keys.
- **Ask the database about data, grep for source.**
- **Do not fix a shared helper in passing**; don't reformat JSON to insert one key.
- **`graphify update` leaves the report stale and drops community names**: run `.\scripts\graphify.ps1 report`; names need `graphify label`.

## Architecture

- **Two routes to one verdict are fine; two records saying different things are not**: the quiet route records that it ran and what it skipped.
- **When closing a record a shortcut never opened, don't tidy the evidence** or create the record.
- **Hoist preconditions the actor cannot fix before the first write.**
- **Verification is a badge that earns visibility, never a precondition to act** (ADR-019).
- **Moderation is a whitelist**; hidden-from-list but reachable by id is an unlisted page.
- **`pending ≠ active`**: a priced plan is granted by the payment webhook.
- **A nullable limit means "no number stated"**: resolve to the safe floor (`plans.listing_limit` NULL → free); unlimited needs its own boolean.
- **Never store a raw Aadhaar number**: use the aggregator's UID token. Login OTP proves the SIM; OKYC OTP proves identity.
- **Set the caching boundary before data exists** (`/api/* → NetworkOnly` in `vite.config.js`); SW `urlPattern` matches `url.pathname`.
- **An unassigned `manualChunks` module folds into whichever chunk references it**: verify `dist/index.html`.
- **`docs/flows/**` describe current UI; the architecture doc is the target SoT.** A rename is doc-wide.
- **An approve endpoint must apply what it approves** (flatmate request: add member, take seat, 409 on second decision).
- **An approved number request reveals the owner's number** unless `hide_number`; ask which way a rule goes before calling a reveal a leak.

## Environment and tooling

- **Never round-trip a source file through `Get-Content`/`Set-Content`** (PS 5.1 mangles `—`, adds a BOM): use `edit`/`create` or `[IO.File]::WriteAllText` + `UTF8Encoding $false`; scan for `U+FFFD`.
- **PowerShell 5.1**: no `&&`/`||`, no heredocs; `Out-File -Encoding utf8` writes a BOM; `git show HEAD:path > f` needs `cmd /c`.
- **Never put non-ASCII in a `.ps1`**: check `Select-String -Pattern '[^\x00-\x7F]'`.
- **The persistent shell mangles long `?`/`&` URLs and `@(...)` blocks**: write a `.ps1`. The edit tool matches raw bytes; concurrent edits hit `EBUSY`.
- **Backend is Java 25 (`C:\Program Files\Zulu\zulu-25`), Spring Boot 4.1**; `mvnw.cmd` in `backend/`; local entry `.\run-local.ps1 -Port 8099`.
- **Local Postgres password is `postgres`; never prompt.** `$env:PGPASSWORD='postgres'; & 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -U postgres -d <db> -P pager=off -v ON_ERROR_STOP=1 -c "..."`.
- **`max(version)` on `flyway_schema_history` is lexicographic**: `max(version::int) where version ~ '^[0-9]+$'`.
- **An e2e lane serves the bytecode compiled at its start** (422 on legal values = stale): compare source vs `target-<lane>\classes` and listener `StartTime`; restart, poll `/api/actuator/health`.
- **The dev DB `draazy` drifts stale**: check `draazy_e2e` or the migrations before concluding "no such column".
- **`get_errors` on `.java` is stale — compile**; `clean compile` after DTO/record/entity changes (MapStruct).
- **CLI builds write `backend/target-cli/`; `backend/target/` is the IDE's.** Maven's exit code is untrustworthy: aggregate `target-cli\surefire-reports\*.txt`.
- **A running backend must not share a build dir with CLI builds**: `run-local.ps1` → `target-local`, lanes → `target-<lane>`.
- **Never pair a bulk move with a force-delete on an untracked tree**; never run an unvalidated bulk rewrite. Local History diff restores.
- **Comment hygiene is hand work**: regex pipelines once deleted half of `playwright.config.js`.
- **Never `JSON.parse` → `JSON.stringify` hand-formatted JSON**: line-edit on `^\s*"KEY"\s*:`, assert one hit, parse to validate.
- **An "unreferenced i18n key" list is a candidate list**: template-literal keys are invisible to grep.
- **A stale exemption is silent; a guard ALREADY RED hides a new violation**: diff reported entries against HEAD (`ServiceSizeGuardTest`); delete a `BASELINE` entry once under the limit.
- **Network is a GitHub-only allowlist** (`raw.githubusercontent.com` OK; modelscope/huggingface fail TLS): probe before designing around a download.
- **Port 3322 is the user's `run-dev.ps1` frontend**: never kill or reuse it; agent dev servers use 3400+. e2e Maps uses `:1122` (UI) + `:1123` (backend).

## House style

- **Specs:** deltas for append-only ledgers; never guess a UI anchor or wrap an assertion in `if (await x.isVisible())`; locate by role and name; assert the write's status; prove a write with a reload.
- **Register items:** `## N. <claim>`, `**Where:**`, `### What happens today`, `### Options` (recommendation bolded); resolved → `> **RESOLVED — …**` under the heading.
- **Commit messages:** long-form with reasoning, "Deliberately not done" and `Verified:`; keep a corrected wrong conclusion beside the correction (`26129a2`, `368ad4f`, `48386b2`).
- **When a claim in a doc/comment/spec header proves false, quote and correct it in place**; when right, quote it.
- **Name specs for the feature, not the backend** (`live-*.spec.js` is refused); when a convention outlives its reason, remove it and add a guard.
- **The comment rule is a gate**: `check-comments --staged` misses defect/worker ids (MC-, MOD-, W3, QA-, ADR-), "now/was" narration and code-restating comments. Read every comment in touched files; run ponytail-review + code-simplifier on the diff.
- **Commit around another session's staged index**: `$env:GIT_INDEX_FILE=<temp>; git read-tree HEAD; git add -- <our paths>`, shared hunks via `git apply --cached`, commit, drop the variable, `git reset -q -- <our paths>`. Amend the same way.

## Product rules (user-directed)

### Positioning and trust

- **Owner-only: no brokers, builders or agent RERA numbers anywhere**; anti-broker guardrails stay.
- **A listing's RERA number is owner-shared, never Draazy-verified**: say "shared by owner, check it on MahaRERA" (link the search); the staff check stays internal; no "Draazy does not verify" line.
- **Draazy does not verify societies**: never "verified/confirmed/RERA-registered"; say what we hold ("Limited details").
- **Verification = two reviewer checks**: owner KYC (ID + live selfie → "KYC done") and ownership papers (Index II/7-12/property card; rent adds tax receipt or electricity bill → "Verified property"). Never claim photo checks or a title guarantee.
- **Badges to unify are only person-ID or ownership/tenancy checks** ("ID verified", "Verified property"); leave Trust score, RERA shared, Owner consented, Verified resident alone.
- **Pre-launch until the user says otherwise**: never claim live listings/users; say "building", "coming soon", "early access".
- **Not a "rentals platform"**: broker-free Pune property platform — buy, sell, rent across residential, plots, commercial, plus flatmates and services (rent agreements are done online now; the pain is agents' fees; our edge is doorstep biometrics, rent reminders, renewal vs agents' fees). SoT: Positioning in `social/instagram/voice.md`.

### Forms and posting

- **Required fields get `*`; never the word "optional" anywhere in the UI** (titles, hints, badges, tags); say what the user gains.
- **Badge proof (e.g. rent agreement) is asked after posting in Dashboard → Documents**, never on create/edit forms; never grant a badge on upload alone.
- **Deposit is required on every posting form; 0 is valid.** A tenant room asks the owner's mobile and WhatsApps them an agree/decline link.
- **A new listing (and staff-posted claim) needs 3 photos, 2 labelled key rooms** (`MIN_PUBLISH_PHOTOS` = `ListingCompleteness.MIN_PHOTOS`).
- **New listings pre-select Pune-popular answers** (Sale, flat, 2 BHK, semi-furnished, Ready to Move, whole-place rent); edits never inherit them; legal/property facts stay blank.
- **Keep real-world Indian options even if they break the taxonomy** (Power of Attorney); ask before removing one.
- **One thing, one picker**: grep the wizard for an existing control before adding a group.
- **Don't add a second search entry to a results page or duplicate a filter as a chip**; ask first.

### Flatmates

- **Forms never ask a name**: use the profile name; an unnamed profile is blocked with an Add name link.
- **Detail pages**: no save heart (tile owns it), share on the photo, location facts as an icon grid, no in-page back row, report as a text link after content.
- **Rooms tab lists room posts only; Teams lists only teams still hunting.** Drop chips true of every card on a tab.
- **An interest on a seeker post is someone offering a room**: "{name} has a room for you", never "teaming up".
- **Dashboard flatmate cards match property cards**: same status/action grouping, side-by-side Share + full Get Verified label (pending too); verification CTAs look like buttons.

### Consumer UI

- **Don't replace a familiar layout while moving features** (kept request-type tabs, chat photo panel); add cues on top.
- **Home summarises and routes**: decisions live on the full-request page. "Needs your attention" = one-line header (title + N pending) over one glass tile per type (icon, label, who, count + wait, chevron).
- **Dashboard KYC nudge**: one-row tile ("Get your KYC badge" + one benefit + Verify).
- **Saved**: heart totals include property + flatmate saves; category is "Flatmates"; no top-nav count badge (counts on Saved tabs). Verify dropdown geometry and click every saved kind through to detail.
- **Messages keeps the mobile bottom nav** (hide it only on auth): size panes off `--dz-bottom-inset`. Composers send on Enter (Shift+Enter newline), touch too; scrollbar only on overflow.
- **"Horizontal scroll UI standard" = the underline `dz-detail-tab` strip in `HScroll`**, not dashboard pill chips.
- **Service trackers show only in-progress requests**; past ones fold behind one toggle; none when nothing is filed.
- **Public refund pages state only what the user gets and how to ask**, never who approves internally.

### Staff and back-office

- **Work queues list newest first**; overdue rows are found by their rose tag.
- **Back-office shows customers' full mobiles**, no reveal step or list audit; masking is consumer-only.
- **One staff decision is final** (#330): no second reviewer, QA sample or override step; only refunds are two-person; self-action guards stay. Managers/admins may approve their own rent-agreement refund (e6f801344) — not a gap.
- **Staff alert emails go to `role='staff'` only** and ignore quiet hours; queue alerts go in `StaffSlaRule.CATALOGUE`.
- **RowCard queue cards: only the action button opens them**, never a whole-card overlay.
- **A submitted case is "in review", not "unverified"**: show what the user sent instead of re-asking.

### Rent agreement

- **Stamp duty matches the IGR L&L calculator**: 0.25% rounded to nearest rupee (min ₹100), escalated rent rounded to paise then truncated; show paise (₹918.00) and the duty line.
- **Collect every field the IGR L&L 2.0 portal needs through police records** (gender, DOB, PAN, mobile, licensor PIN/village/address); skip what it fetches (Aadhaar OTP data, photo, biometrics at the doorstep), optional fields (alias, occupation, email, mother's name) and witnesses (none anywhere in the app; staff record them on the portal). Server keeps a format-only mother's-name check for legacy requests.
- **Never ask property data staff can read off Index II** (village, road, CTS/survey, zone, construction, age, gallery); Index II upload is mandatory. Police station is plain text.
- **A filed paper is never asked again**: every reopen path restores filed docs, replace-only. No "Relation to Tenant 1" field.
- **Staff may correct every customer value** (PAN/Aadhaar too); send back only for a fresh paper or an answer staff cannot give.
- **Upload limits: registered copy 2 MB; draft and party papers 1 MB** (confirmed twice). Registered copy records only document no., SRO, date, GRN.

### Social and reels

- **Social copy reads human**: casual paragraphs, no bold headers or bullets, contractions, empathetic opener/closer; never invent anecdotes.
- **Reddit**: Pune subs first (r/Hinjewadi, r/PCMC, r/pune), national only for Pune threads; 3–5 lines; feature mentions + disclosure only in broker/agreement/verification threads; links only in promo slots.
- **Pre-launch mentions point to instagram.com/draazyapp.homes**, never draazy.com; there is no waitlist page.
- **Reels: no prices**; renewal is "renewal reminder + one-tap renewal", never "auto-renew". Keep the whole phone in frame (zoom ≤ 1.274 at base 1.35), logo only in the outro, ≤ 30 s, every line a complete sentence.
- **UGC/Flow clips**: short prompt style of take 4 (3f1741fb); never mention the phone; spell out wardrobe (closed teal pullover hoodie) every clip; each clip exactly 8 s — fill with an extra line, never stretch; sign-off is a separate shared clip; don't fix takes in Flow's edit box.
- **Dialogue**: connected sentences (cause → effect), never clipped word-lines. Ishaan is amused/wry, never sad or over-laughing; keep pain mild.
- **Flow policy**: no real brands, places or signage, and no money-scam steps (blocked with no reason). Reel 3: unsigned Hinjewadi-style entrance, fake owner without money. Reel 4: Sana's clip-2 story without money.
- **Flow voice**: spell Hindi "band" as "bandhh"; write Hindi numbers that look English in Devanagari ('दस', 'दो').
- Never print a secret's parts when checking its format: a missing separator makes partition() print the whole value; print only length/prefix counts.
