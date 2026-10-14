# Security hardening plan

Scope: the three-phase E2E audit (UI → API → DB), filtered to what reaches **sandbox.draazy.com**
(Cloudflare Pages + `/api` Pages Function → Cloud Run `draazy-api-sandbox` → Supabase Postgres).
Local-only config (the `DB_USER:postgres` default, local actuator, e2e-lane DB settings) is out of scope.
Tests that run on the local e2e/test lanes are in scope: they prove code that ships to sandbox.

Tick a slice when it is green; owner-only steps also go to [OWNER-CHECKLIST.md](OWNER-CHECKLIST.md).

## Facts taken 2026-10-10

| # | Fact | Source |
|---|---|---|
| E1 | This machine reaches sandbox through a TLS-inspecting proxy (issuer `mci-prisma`, Palo Alto) that strips CSP/HSTS/XFO and adds `Access-Control-Allow-Origin: *`. Header checks from here are meaningless; only CI is a trustworthy vantage. | cert + `curl -D -` |
| E2 | `frontend/public/_headers` holds a strict CSP, HSTS, XFO, no-referrer. The CSP smoke assertion in `deploy.yml` is **uncommitted**, so no deploy has ever enforced it. | `git diff deploy.yml` |
| E3 | Sandbox runtime **and** Flyway both log in as `SANDBOX_DB_USER` = `postgres.<project-ref>` (Supabase's owner role: CREATEDB/CREATEROLE/BYPASSRLS, owns every table). | `cloudrun-sandbox.yaml`, `bootstrap-project.sh:275`, `application-sandbox.properties:7,44` |
| E4 | Supabase exposes `public` through the Data API (PostgREST) for the `anon`/`authenticated` roles. The app never uses it (0 `supabase` refs in `frontend/src`); no RLS or grants in any migration. Unverified whether the Data API is on. | grep |
| E5 | Actuator exposes `health` only on sandbox; OpenAPI/Swagger 404. Already fine. | probe + properties |
| E6 | Refresh token is HttpOnly; only the access token is in web storage. Accepted by design (strict CSP is the control). | `lib/auth.js` |
| E7 | One `dangerouslySetInnerHTML` (`ArticleProse.jsx`, build-time in-repo Markdown). No ESLint rule stops a second one. | grep, eslint config |
| E8 | The only concatenated SQL (`AdminIntegrationsService`) joins constant fragments; values are bound. No guard stops a future regression. | grep |
| E9 | Rate limiting (`WriteRateLimitFilter`) and a catch-all `GlobalExceptionHandler` with traceId exist. | code |

## Slices (in order)

Size: S < 1h, M half-day, L day+. **Owner** = needs secrets/dashboard access only the owner has.

### Phase 3 first — the only confirmed sandbox exposures

- [x] **SH01 Supabase Data API exposure** — `backend/deploy/sql/supabase-revoke-data-api.sql` (+ turn the
  Data API off). **Owner:** run it per project; done when an anon `GET /rest/v1/users` is refused.
- [x] **SH02 Split DB roles** — built simpler than planned: `postgres` stays the schema owner and is Flyway's
  alone (`FLYWAY_DB_USER`); `backend/deploy/sql/app-runtime-role.sql` creates DML-only `draazy_app` for
  `DB_USER`. Wired in properties, `cloudrun-sandbox.yaml`, `deploy.yml`, `bootstrap-project.sh`, DEPLOY.md §2.1.
  **Owner:** steps in OWNER-CHECKLIST.md — the next deploy fails without `SANDBOX_FLYWAY_DB_USER`.
- [x] **SH03 Boot-time privilege check** — `DatabasePrivilegeCheck` refuses sandbox/prod boot as an
  over-privileged role.
- [x] **SH04 SQL construction guard** — `SqlConstructionGuardTest`; `LikePatterns` escapes `%`/`_` in
  five services, with `escape '\\'` on every JPQL/Criteria `like` (Hibernate renders `escape ''` otherwise).
- [x] **SH05 Hostile-character round trip** — `HostileTextRoundTripTest` (ticket + lead note, NUL in body and
  `?q=`). Found and fixed: NUL answered 409 → now 400 (SQLState 22021 in `GlobalExceptionHandler`).

### Phase 2 — API

- [x] **SH06 Error-leak baseline** — `ErrorLeakTest` drives every handler branch; no stack, SQL or class
  names in any body.
- [x] **SH07 Authorization coverage gate** — `AuthorizationCoverageTest`: every route pinned public or 401
  anonymous, admin routes 403 for a consumer, and every paged GET probed with hostile `page`/`sort`.
  Found and fixed: ~45 routes 500'd on `page=MAX_INT` (`PageBoundsConfig`, cap 10,000) and 6 on an unknown
  sort (`Pageables.allowSort`/`unsorted`).
- [x] **SH08 Horizontal ownership** — `CrossUserOwnershipTest`, `CrossUserFlatmateOwnershipTest`: no gaps.
- [x] **SH09 Mass-assignment** — `MassAssignmentTest`. Found and fixed: a customer could set ticket
  `priority` (now back-office only).
- [x] **SH10 Boundary validation** — `BoundaryValidationTest` (65 cases).
- [x] **SH11 Logic-flow gaps** — `TokenTamperingTest`, `CredentialExpiryTest`, `ContactQuotaRaceTest`.
  Found and fixed: parallel contact reveals overshot the quota and duplicates 500'd (now a per-viewer
  `CONTACT_REQUEST` advisory lock).

### Phase 1 — UI

- [x] **SH12 Header assertion in CI** — `deploy.yml` smoke step checks CSP, HSTS, framing, referrer and CORS on
  the shell and Function-served pages. **Owner:** confirm in the next deploy log (E1).
- [x] **SH13 Static UI guard** — ESLint `react/no-danger`, `no-script-url`, `no-eval`, `no-implied-eval`,
  `no-new-func`.
- [x] **SH14 User-supplied URL schemes** — audited, no API-fed sink; closed as no-op.
- [x] **SH15 Output-encoding e2e** — `e2e/tests/platform/security/output-encoding.spec.js` (ticket on the
  customer and desk views; `?q=` on three search pages).
- [x] **SH16 Session-state e2e** — `e2e/tests/platform/security/session-state.spec.js` (tampered cached role,
  corrupt cache). Logout/cookie lifecycle is already `platform/auth/signin-otp-session`.
- [x] **SH17 Flatmate room photos** — `FlatmateSupplyService` runs `ListingPhotoSources.requireUploaded` on
  create and edit: new photos must be the caller's own uploads (`FlatmateRoomPhotoSourcesTest`).
- [x] **SH18 Migrations out of the serving container** — `--migrate-only` Cloud Run Job
  (`cloudrun-migrate-sandbox.yaml`, SA `draazy-migrator-sandbox`) runs before `services replace`; deployed
  profiles set `spring.flyway.enabled=false`; runtime SA secrets granted one by one (the owner drops the old
  project-wide grant after the first deploy)
  (`MigrateOnlyModeTest`, `SandboxDeploymentManifestTest`). DEPLOY.md §2.1.
- [x] **LIKE escapes** — eight private copies now call `LikePatterns.escape`.
## Not doing (and why)

- `DB_USER:postgres` default in `application.properties`, `pg_stat_statements` / `log_min_error_statement`
  on the e2e DB — local environment only.
- Moving the access token out of web storage — refresh is HttpOnly already (E6); the CSP is the control.
- Actuator / OpenAPI lock-down, rate limiting — already in place on sandbox (E5, E9).
- Schemathesis or another fuzzer — SH10 covers it with the existing JUnit suite.

## Verification per slice

Backend slices: targeted test class, then the full backend suite before commit. UI slices:
`npm run lint`, `e2e\run-fast.ps1 -Files <spec>`, then `-Full` before commit. Owner slices: evidence from
the CI deploy log or the Supabase dashboard, never from this machine (E1).
