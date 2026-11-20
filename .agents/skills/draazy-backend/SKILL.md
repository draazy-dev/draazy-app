---
name: draazy-backend
description: >-
    Project skill for the Draazy (formerly PuneNest) BACKEND — a Spring Boot 4 + PostgreSQL REST API
    behind the
    already-built React frontend (Pune-first real-estate marketplace competing with NoBroker /
    MagicBricks). Use whenever doing backend or system-design work on Draazy: designing the
    system/architecture, modeling the PostgreSQL database, writing Flyway migrations, implementing
    or reviewing REST endpoints, auth/JWT, role guards, contact-gate logic, soft-delete/archive,
    caching, external-provider seams (Google Routes, OTP/SMS, payments, storage), or wiring the
    frontend http service provider to the live API. Also use for API-contract questions, entity
    and DTO design, pagination, and error-shape conventions. This is the backend counterpart to the
    draazy-frontend skill — reach for it any time the work is server-side, database, or
    system-architecture rather than UI.
user-invocable: true
---

# PuneNest backend

PuneNest is a Pune-first real-estate marketplace. The **React frontend is complete** and talks to a
service-abstraction layer (`src/services/*Service.js`) that resolves every domain to the live REST
API (`src/services/providers/http/{domain}Provider.js`, globbed by `src/services/config.js`).
There is no mock provider and no per-domain switch.

**Your job is to implement the server side of that `http` provider** as a Spring Boot 4 + PostgreSQL
application whose request/response shapes match the OpenAPI spec
(`backend/src/main/resources/static/openapi/punenest-api.yaml`) exactly, so components never change.

This skill lives at `.agents/skills/draazy-backend/`; paths below are relative to the repo root
(Windows, PowerShell). Backend: `backend/` (Spring Boot 4.1, Java 25, Maven, groupId
`com.punenest`, root package `com.punenest.api`). The **auth/identity slice**
(`com.punenest.api.identity` + `com.punenest.api.security`) is the reference implementation: study it
as the canonical house style before writing new code.

## When to use this skill

- **System design / architecture** (current priority): contract → ERD, schema, cross-cutting foundations, build order.
- **Database work**: PostgreSQL schema, Flyway migrations, indexes, JSONB, soft-delete columns.
- **API implementation**: controllers, services, repositories, entities, DTOs for any OpenAPI domain.
- **Cross-cutting concerns**: JWT auth, role guards, the contact/Aadhaar gate, pagination,
  error handling, CORS, OpenAPI, config profiles, external-provider seams, caching.
- **Wiring**: connecting the frontend `http` provider to the live API.

## Always-on companions

Keep consulting: `real-estate-expert` (domain model — source of truth for what listings/deals/gates *mean*),
`senior-product-manager-realestate` (scope & priority), `ponytail` (shortest correct diff, reuse before you build).
For frontend/contract questions, cross-reference `draazy-frontend`.

## Golden rules

1. **The contract is law.** The OpenAPI spec
   (`backend/src/main/resources/static/openapi/punenest-api.yaml`) is the single source of truth for
   every path, verb, auth level (`x-roles`/`security`), query param, and JSON shape; standing
   conventions are in `docs/system/api-standards.md`. Never invent a divergent shape; if the spec is
   wrong or missing something, fix the spec first (and flag it), then implement. When in doubt, match the mock provider output.
2. **Contract-first, vertical slices.** One domain at a time as a full slice
   (entity -> repository -> service -> controller -> DTO mapping -> test), not layer-by-layer across
   the app. A shipped, contract-accurate `/properties` beats forty half-wired controllers.
3. **Match the house style.** Mirror the auth/identity slice: package **by feature**
   under `com.punenest.api` (`identity`, `catalog`, `deals`, `finance`, `provider`, …), constructor
   injection (no field `@Autowired`), **Java `record`s for DTOs**, Javadoc that explains *why* (the
   cost/design reason), and `// ponytail:` comments for a deliberate pragmatic shortcut.
   See `references/architecture.md`.
4. **Soft-delete, never hard-delete.** Removals go through
   `archive`/`restore` (properties, users, content). Archived rows are excluded from public queries
   by default and included in admin views via `?archived=true`. Platform-wide policy.
5. **Respect the trust & gating model.** Owner contact details stay hidden until a contact request is
   approved (mask as `98XXXXX210`). The contact gate requires Aadhaar verification — return
   `403 { "error": "aadhaar_required" }` when missing. Editing a listing *foundation* field
   (price, bhk, type, locality) reverts its status to `pending`. Enforce these server-side, not just in the UI.
6. **Isolate the outside world behind a seam.** Every external dependency (OTP/SMS, payment gateway,
   file storage, Google Routes) sits behind an interface in `com.punenest.api.provider` with a
   deterministic **mock/dev impl** and a real impl marked `@Primary` for prod. The app must run and be
   demoable with zero paid keys.
7. **Windows / PowerShell.** No `&&` / `||`; chain with `;` and gate with `if ($?) { ... }`. Use
   backslash paths. The build targets Java 25, so pin the JDK first:
   `$env:JAVA_HOME='C:\Program Files\Zulu\zulu-25'; cd backend; cmd /c "mvnw.cmd -o -f pom.xml spring-boot:run"`
   (PowerShell mangles raw maven output — redirect through `cmd`).

## Stack & standing conventions

| Concern | Convention |
|---|---|
| Framework | Spring Boot 4.1, Java 25, Maven, groupId `com.punenest`, root package `com.punenest.api` |
| Base URL | `/api` (nominal dev `http://localhost:8080/api`; 8080 is often occupied — run on 8081) |
| Auth | Stateless JWT, `Authorization: Bearer <token>`; roles `buyer` / `owner` / `admin` / `staff` (staff has `team`/`teams`) |
| Login | OTP-verified mobile (`/auth/login`); internal `/auth/staff-login` — **no passwords** |
| Pagination | `?page=0&size=20` (zero-indexed), wrapper `{content,page,size,totalElements,totalPages,sort}` (wire field is `content`, NOT `items`) |
| Sort | `?sort=field,direction` e.g. `sort=createdAt,desc` |
| Dates | ISO-8601 (`2026-07-03T10:30:00Z`) |
| IDs | String; UUID in prod (mock uses `PR{ts}` etc.) |
| Errors | `{ "error": "code", "message": "...", "status": 400 }` |
| DB | PostgreSQL, `snake_case` columns, Flyway migrations, JSONB for flexible/array fields |
| Caching | Cache-at-write for fixed, expensive facts; key on stable inputs |

## System-design workflow (start here)

The immediate goal is a **strong foundation before coding**. Work through the phases in
`references/system-design.md` in order; do not skip to controllers:

0. **Freeze the contract** — confirm the OpenAPI spec (`…/static/openapi/punenest-api.yaml`) covers the domains you will build; patch gaps first.
1. **Data model** — turn the contract Data Model Reference into an ERD + Flyway `V1` schema
   (`references/data-model.md`).
2. **Cross-cutting foundation** — JWT + role guards, error handling, pagination, CORS, OpenAPI,
   config profiles (dev-mock / prod), and the provider seams.
3. **Vertical slices by priority** — auth+users -> properties+search -> contacts/gate -> deals/offers/
   visits -> finance/rent -> services/tickets -> admin/analytics -> content/CMS.
4. **Wire the frontend** — add `providers/http/{domain}Provider.js` and reconcile any shape drift against the spec.

## Working procedure

1. Read the relevant paths in the OpenAPI spec and the auth/identity slice before writing code.
2. Pick one vertical slice; design entity + migration first, then repository/service/controller/DTOs.
3. Keep shapes byte-compatible with the spec (and the mock provider); add tests that assert them.
4. Build & run from `backend/` with JDK 25 pinned:
   `$env:JAVA_HOME='C:\Program Files\Zulu\zulu-25'; cmd /c "mvnw.cmd -o -f pom.xml verify"`. Keep the
   app runnable with mock providers only.
5. Review per the repo Code-Review policy: use `java-reviewer`, then `code-reviewer`, and
   `security-reviewer` for any auth/user-data change.

## References (read when relevant)

- [references/architecture.md](./references/architecture.md) — layering, package-by-feature layout, DTO/record style,
  constructor injection, JWT & role guards, contact-gate filter, error handling, pagination,
  provider seams, caching, config profiles, build/run/test commands.
- [references/data-model.md](./references/data-model.md) — PostgreSQL schema by domain, Flyway conventions,
  PK/FK/index/JSONB/soft-delete rules, entity-mapping guidance.
- [references/system-design.md](./references/system-design.md) — phased roadmap from contract to a live,
  frontend-wired API, with module build order and per-slice checklist.
