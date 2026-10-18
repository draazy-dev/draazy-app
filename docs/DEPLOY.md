# Deploying Draazy

The local counterpart is [`LOCAL_DEV.md`](./LOCAL_DEV.md). The *shape* of the deployment — DigitalOcean
App Platform in `blr`, a dev Postgres, Cloudflare Pages and R2 — is decided in
[`system/platform-architecture.md`](./system/platform-architecture.md) §6 and ADR-007/ADR-013/ADR-021.
This file is the single deployment document: the contract (what to set and which mistakes are silent),
the order for a fresh environment (§6) and the checks after a deploy (§9).

> **Source of truth for the variable list is `ProdProfileContractTest`**, not this page. That test
> loads the real `application-prod.properties` and fails if a `${ENV}` lookup appears without being
> added to its checklist. If this page and that test disagree, the test is right.

Commands are given for macOS and Windows PowerShell where they differ; run them from the repository root
unless stated otherwise. The repository is `draazy-dev/draazy-app`.

| § | Covers |
|---|---|
| 1 | Topology and the same-site cookie rule |
| 2 | Database (DigitalOcean dev database), roles and migrations |
| 3 | Environment variables, OTP, storage, identity, email, push |
| 4 | `INTERNAL_PROXIES`, the origin gate, Cloudflare edge controls |
| 5 | DigitalOcean App Platform, the GitHub deploy pipeline, scheduled jobs |
| 6 | First-time setup of a fresh environment, in order |
| 7 | Known blockers |
| 8 | Logs, errors and alerts |
| 9 | Manual verification |

---

## 1. Topology and the same-site/cookie rule

```
              https://sandbox.draazy.com
                         │
               ┌─────────┴─────────┐
               │  Cloudflare Pages │
               └─────────┬─────────┘
          /api/*  │                 │  everything else
                  ▼                 ▼
    functions/api/[[path]].js    the built SPA (dist/)
                  │
                  │  fetch(API_ORIGIN + /api/...)
                  ▼
   https://draazy-api-sandbox-466hx.ondigitalocean.app   (DigitalOcean App Platform, blr)
```

**The SPA and `/api` must be same-*site*.** The refresh token rides a `SameSite=Lax`, `__Host-`
prefixed cookie, so a browser only returns it when the page and the API share a registrable domain.
Two arrangements satisfy that:

| Shape | `WEB_ORIGINS` | `API_PUBLIC_ORIGIN` |
|---|---|---|
| **Path proxy** (chosen) — one origin, `/api/*` proxied to the backend | `https://sandbox.draazy.com,https://draazy.com` (both hosts serve the same Pages deployment) | `https://sandbox.draazy.com` |
| Sibling subdomains — cross-origin but same-site | `https://www.draazy.com` | `https://api.draazy.com` |

A UI served from its own registrable domain — `*.netlify.app`, `*.pages.dev`, `*.vercel.app`, all
Public Suffix List entries — is **fatal**, and fatal in the worst way: the browser withholds the
cookie *silently*, so every session dies fifteen minutes after login and the server log is
indistinguishable from a visitor who was never signed in. `CookieDeliveryCheck` refuses to boot on
that shape, which is the only reason it is caught at all — no test can reach it, because dev and e2e
go through the Vite proxy where everything is same-origin by construction.

Consequences, all easy to get wrong:

- **Never test login on the `*.pages.dev` URL.** Every Pages deployment gets one and it is cross-site
  with `/api`. Browsing works there; sessions do not. The custom domain has to be attached before
  anyone can stay signed in.
- **Do not create `api.draazy.com`.** Pointing a subdomain at the backend is the *other* shape and needs
  different `WEB_ORIGINS` / `API_PUBLIC_ORIGIN` values. Mixing the two gives a service that boots and
  cannot hold a session. The browser never learns the DigitalOcean URL: it is the Pages variable
  `API_ORIGIN`, read server-side at request time, with no DNS record.
- **`VITE_API_BASE` stays unset (`/api`).** Relative, by design: an absolute value is the cross-origin
  topology, and the CSP ships `connect-src 'self'`.

The path proxy was chosen because it is the only shape that can also deliver the readable
`__Host-draazy_session` marker, without which the Safari/ITP session recovery is inert.

### How the proxy is implemented

`frontend/functions/api/[[path]].js` — a Cloudflare Pages Function, not a `_redirects` rule.
**Cloudflare Pages does not proxy `_redirects` to an external origin**; it redirects to it, which
lands the browser on the backend's origin and loses the cookie exactly as described above.

Pages resolves Functions before static assets and before `_redirects`, so the SPA rewrites cannot
shadow `/api`. `_redirects` is generated at build time by `frontend/scripts/vite-plugin-spa-fallback.mjs`:
one rewrite per `App.jsx` route to the shell (prerendered pages rewrite to themselves first), which
ships as `dist/404.html` so unknown paths answer a real 404. A `/*` rewrite cannot be used: Pages
ignores `/* /index.html`, and any other `/*` target would be matched before the asset lookup and serve
`/assets/*.js` as HTML. Security headers and the CSP live in `frontend/public/_headers`.

The `/api` prefix is forwarded verbatim because the backend runs with `server.servlet.context-path=/api`.
The Function reads two Pages settings:

| Setting | Value |
|---|---|
| `API_ORIGIN` | Scheme + host of the backend, no path, no trailing slash: the App Platform default ingress |
| `ORIGIN_SHARED_SECRET` | Pages **secret**; same value as the backend's (§4) |

Unset, either answers 502 rather than falling through — a fall-through would return the HTML shell with
a 200, which `http.js` reads as success and renders as an affirmative "no results" on every catalogue.
The Function also sets `X-Forwarded-For` from `CF-Connecting-IP`, overwriting anything the client sent,
and refuses to forward at all when that header is absent.

---

## 2. Database — DigitalOcean dev database

The sandbox database is the dev database declared in the app spec (`databases: db`, PostgreSQL 17,
`production: false`): 512 MB RAM, about 1 GB of storage, a single user, in the app's region (it cannot be
moved to another region). It carries no credentials in GitHub: the spec binds `${db.HOSTNAME}`,
`${db.PORT}`, `${db.DATABASE}`, `${db.USERNAME}` and `${db.PASSWORD}`, and DigitalOcean fills them at deploy.

- **Direct connection, no pooler.** `DB_URL` and `FLYWAY_DB_URL` are the same JDBC URL
  (`...?sslmode=require`), so Flyway's session-scoped `pg_advisory_lock` works and prepared statements
  are not an issue. `application-sandbox.properties` still pins `prepareThreshold=0`, which is harmless
  here. It also pins `sslmode=require` as a floor, since pgjdbc's default `prefer` falls back to plaintext
  silently, and a small, drainable Hikari pool (`maximum-pool-size=5`, `minimum-idle=0`).
- **When it outgrows 512 MB, or needs a standby,** upgrade the dev database to a DigitalOcean Managed
  Database from the app's database settings. Then split the roles as in §2.1.

**The sandbox carries the demo seed, and it takes a named profile to get it.**
`spring.flyway.locations` is migration-only under `prod`, deliberately — `R__zz_DML_dev_demo_data.sql`
is *repeatable*, so it would re-seed 38 fabricated listings and 78 fabricated users on every deploy whose
checksum moved, indistinguishable from real inventory to a buyer. `application-sandbox.properties` is a
standalone profile activated as `SPRING_PROFILES_ACTIVE=sandbox` — a self-contained copy of the prod
configuration whose one declared difference is that it adds the seed location back. A seeded database can
never be promoted to production: point production at its own database.

Sandbox and production read the same variable *names* and entirely different *values* — separate
databases, separate GitHub environment secrets, separate Cashfree credentials.
`SandboxProfileContractTest` asserts the two files stay identical apart from the declared divergence, so
hardening prod without hardening sandbox fails the build. All four tiers are in
[`system/profiles.md`](./system/profiles.md).

### 2.1 Database roles and migrations

**Flyway runs only in the `migrate` PRE_DEPLOY job.** The job runs the same image with
`java -jar /app/app.jar --migrate-only`, which boots Flyway alone and exits
(`backend/src/main/java/com/draazy/api/DraazyApiApplication.java`). The serving app sets
`spring.flyway.enabled=false` and `ddl-auto=validate`, so a boot that completes has also proved the
entities match the schema. A failed `migrate` aborts the deploy and the old version keeps serving.
Migrations apply while that version is still serving, so each one must stay compatible with the code
before it (expand/contract).

Two credential pairs exist, and Spring Boot's dedicated Flyway DataSource does not inherit credentials
from `spring.datasource` when `spring.flyway.url` is set, so both are bound explicitly:

| Variable | Read by | Role |
|---|---|---|
| `FLYWAY_DB_URL` / `FLYWAY_DB_USER` / `FLYWAY_DB_PASSWORD` | the `migrate` job | schema owner |
| `DB_URL` / `DB_USER` / `DB_PASSWORD` | the serving app | runtime role |
| `FLYWAY_DB_USER` | the serving app, for `DatabasePrivilegeCheck` only | — |

The service must never carry `FLYWAY_DB_PASSWORD`; `SandboxDeploymentManifestTest` asserts it.

**On the dev database both pairs are the same user**, so `DatabasePrivilegeCheck`
(`backend/src/main/java/com/draazy/api/common/persistence/DatabasePrivilegeCheck.java`) only logs a
warning that the runtime role is not DML-only. That also means code execution in the app reaches the
owner role; the split below removes that.

**On a managed database with a separate DML-only role** the check refuses to boot if the runtime role is
a superuser, can `CREATE` in `public`, or owns tables. [`backend/deploy/sql/app-runtime-role.sql`](../backend/deploy/sql/app-runtime-role.sql)
creates `draazy_app` (rows only, 60 s statement timeout, no access to `flyway_schema_history`) with
default privileges for tables that later migrations create as the schema owner, `doadmin`. In order, and
each step deploys green on its own:

1. Make sure the `migrate` job connects as `doadmin` (`FLYWAY_DB_*`), and deploy.
2. Run the SQL as `doadmin`, set the password with `\password draazy_app`, and check the verify output:
   every flag false, `can_create` false, `owned_tables` 0.
3. Point the service's `DB_USER` / `DB_PASSWORD` at `draazy_app` (as app-spec secrets), keep the job on
   `doadmin`, and deploy.

Rollback for step 3: point `DB_USER` / `DB_PASSWORD` back at `doadmin` and redeploy.

Run migrations locally with `java -jar app.jar --migrate-only` and the three `FLYWAY_*` variables set.

---

## 3. Environment variables

Every variable below is declared with **no default**, so a deploy that omits one fails to start
rather than inheriting the developer values in `application.properties` (local Postgres credentials,
a committed JWT secret, `trusted-proxies=none`). That is the design, not an inconvenience.

Secrets live in the GitHub `sandbox` environment (§5.1). The deploy workflow substitutes them into
`backend/deploy/do-app-sandbox.yaml`, and DigitalOcean stores the `type: SECRET` entries encrypted. There
is no separate secret store.

| Variable | Notes |
|---|---|
| `SPRING_PROFILES_ACTIVE` | `sandbox`, **alone**. The Dockerfile bakes `prod` because Spring does not complain about an absent profile — a deploy that forgot it would boot on the developer defaults and report itself healthy. Left at `prod`, or `prod,sandbox`, the boot fails on the sandbox OTP key (§3.1) |
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | rendered from the `${db.*}` bindables (§2) |
| `FLYWAY_DB_URL`, `FLYWAY_DB_USER`, `FLYWAY_DB_PASSWORD` | the `migrate` job; the service reads only `FLYWAY_DB_USER` (§2.1) |
| `JWT_SECRET` | HS256, ≥ 32 bytes, generated per environment. Rotating it invalidates every issued token |
| `REFERRAL_SIGNAL_SALT` | any long random string; **never** shared with dev. An unsalted or publicly-salted digest of an IPv4 address is reversed by enumerating 2^32 values. Rotating it is safe — stored digests simply stop matching, and they are discarded after 180 days anyway |
| `IDENTITY_HASH_SECRET` | any long random string; **never** shared with dev. Keys the one-way digest of verified ID-document numbers used for "one document = one badge". Set-once: a new value turns every existing badge holder into a stranger the uniqueness check has never seen, so rotate only with a re-verification plan |
| `IDENTITY_ENCRYPTION_KEY` / `IDENTITY_ENCRYPTION_KEY_ID` | base64 of 32 random bytes and a short id (`[a-z0-9-]`; the spec carries `s1`); **never** shared with dev. AES-256-GCM for PAN/Aadhaar in `service_request_identities` (D283). To rotate, issue a new key and id, and set `IDENTITY_RETIRED_KEYS=oldId:oldKey` so existing rows still decrypt. Losing a key makes its rows unreadable |
| `STAFF_TOTP_KEY` | base64 of 32 random bytes; **never** shared with dev. AES-256-GCM for staff and admin authenticator (TOTP) secrets in `staff_credentials`. There is no retired-key list: rotating it makes every enrolled authenticator unreadable, so each account must be reset (admin **Reset 2FA**) and re-enrol |
| `CASHFREE_ENABLED` / `CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY` | payments and KYC. Sandbox holds the real `TEST_` / `cfsk_` values: a placeholder is non-blank, so the service boots normally and every order creation 401s |
| `CASHFREE_WEBHOOK_SECRET` | Cashfree signs callbacks with `x-client-secret` and issues no separate webhook secret, so this **is** `CASHFREE_SECRET_KEY`; the spec points both at one value so they cannot drift when one is rotated. A drifted-but-non-blank value passes every startup check and rejects every callback; a blank one makes every forged signature valid. That one credential therefore also carries order-creation and refund authority |
| `CASHFREE_NOTIFY_URL` | `https://sandbox.draazy.com/api/webhooks/cashfree/payment`. Blank falls back to the endpoint registered in the Cashfree dashboard, which holds one address across every environment, so each deployment sets its own |
| `WEB_ORIGINS`, `API_PUBLIC_ORIGIN` | see §1; public literals in the spec |
| `APP_BASE_URL` | the SPA origin, or the logged bootstrap link points at `draazy.com` |
| `INTERNAL_PROXIES`, `ORIGIN_SHARED_SECRET` | see §4; the secret is ≥ 32 characters and the **same** value as the Pages secret. `none` turns the gate off, which is right only for an instance nothing proxies |
| `ZEPTOMAIL_*`, `WHATSAPP_*`, `TURNSTILE_*`, `PUSH_VAPID_*` | §3.1 and §3.3 |
| `STORAGE_ENABLED`, `R2_ENDPOINT`, `R2_BUCKET_PRIVATE`, `R2_BUCKET_PUBLIC`, `R2_PUBLIC_BASE_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | photo and document upload. Without them `R2FileStorage` is not wired and uploads throw. With `STORAGE_ENABLED=true` all six `R2_*` must be non-blank (the workflow checks), because a blank one makes `R2FileStorage`'s all-six constructor check refuse to boot |
| `GOOGLE_PLACES_SERVER_KEY` | server-side Places lookups; must have no IP-address application restriction (App Platform has no fixed egress IP) |

Generate random values once, per environment:

| macOS | Windows PowerShell |
|---|---|
| `openssl rand -base64 48` | `$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)` |

Use 32 bytes instead of 48 for the AES keys (`IDENTITY_ENCRYPTION_KEY`, `STAFF_TOTP_KEY`).

Optional first-admin bootstrap variables:

| Variable | Notes |
|---|---|
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_MOBILE` | When no live admin exists, startup creates that admin and logs a one-hour `/staff-invite#...` link |
| `BOOTSTRAP_ADMIN_NAME` | Defaults to `Administrator` |
| `BOOTSTRAP_ADMIN_RECOVER` | Break-glass nonce. Set a fresh random value and redeploy to reset the configured admin's 2FA, revoke sessions and log a fresh one-hour invite. If no admin holds the email, it adopts the live admin with the configured mobile and **no** email — how the seeded sandbox admin (`9000000000`) gets one |

The deploy reads them from the `sandbox` GitHub environment: **secrets** `SANDBOX_BOOTSTRAP_ADMIN_EMAIL`
and `SANDBOX_BOOTSTRAP_ADMIN_MOBILE` (variables would print in the public run log), and **variable**
`SANDBOX_BOOTSTRAP_ADMIN_RECOVER`; blank = off. Set them there: the spec is rendered from them on every deploy,
so a value added by hand in the DigitalOcean console is overwritten.

First deploy: set the email and mobile, deploy, open the `[ADMIN BOOTSTRAP]` link from the `api` runtime
logs within 1 hour and set the password, then sign in at `/staff-login`, scan the QR code and save the
recovery codes. Break glass: change `SANDBOX_BOOTSTRAP_ADMIN_RECOVER` to a new random value, redeploy and
open the new logged link within 1 hour.

Staff/manager invites need no SMS or email sender. The Team screen returns the one-time link to the
creator, who shares it privately; manager-created staff invites also notify the administrator in-app.

### 3.1 Sandbox OTP — real WhatsApp codes

Sandbox sends real, random OTPs through WhatsApp exactly like prod: `do-app-sandbox.yaml` sets
`WHATSAPP_ENABLED=true`, the business number's `WHATSAPP_PHONE_NUMBER_ID` and the approved
`draazy_login_otp` / `draazy_identity_decision` templates, and the deploy workflow passes the System User
token from the GitHub `sandbox` environment secret **`SANDBOX_WHATSAPP_ACCESS_TOKEN`** (the deploy fails
fast while it is empty). Every send is billed to the Meta prepaid balance and only reaches mobiles
registered on WhatsApp, so seeded demo mobiles cannot sign in — use your own number.

`draazy.otp.sandbox-code` is pinned empty, as in prod. It remains a break-glass only: setting
`DRAAZY_OTP_SANDBOX_CODE` on the app pins every code to that value for anyone who knows a mobile, so set
it only for a disposable database and remove it afterwards. It is a key of its own rather than a reuse of
`DRAAZY_OTP_FIXED_CODE` on purpose: that one is refused on *every* deployment profile by
`OtpService.rejectFixedCodeInProduction`, and sandbox counts as one, so reusing it would disarm the guard
that also covers prod. `OtpService.rejectSandboxCodeOutsideSandbox` is the matching lock: the boot fails
unless `sandbox` is the *only* deployment profile active, so neither a copied properties file nor a
`prod,sandbox` activation can carry it into production. `application-prod.properties` also pins the key
empty.

Sandbox also enforces Turnstile on the code send and both waitlists (`TURNSTILE_ENABLED=true`). Create a
widget in Cloudflare → Turnstile for the sandbox hostname, then add its secret key as the `sandbox`
environment secret **`SANDBOX_TURNSTILE_SECRET_KEY`** and its site key as the repository variable
**`VITE_TURNSTILE_SITE_KEY`**. The deploy stops before anything ships while either is empty, because the
API would refuse every sign-in from a bundle without the widget. Sign in once by hand after the first
rollout: the health check cannot catch a mismatched key pair or a widget missing the sandbox hostname.

### 3.2 The public photo bucket must send `Access-Control-Allow-Origin`

A listing photo is not only rendered. The create-listing wizard draws each one to a `<canvas>` to
compute a perceptual hash, which the duplicate probe compares across owners, and reading pixels back
from a canvas that has drawn a cross-origin image throws unless that image arrived with CORS headers.

The failure is silent by construction: the client degrades to no hashes, the listing posts normally,
and the only symptom is that duplicate listings sharing photographs stop being flagged. Nothing in
the repository can assert it — the URL is R2's, the header is bucket configuration, and the dev
stand-in is same-origin (`DevObjectStore.publicUrl`), so no test will ever go red if the rule is
missing. The CORS policy is in §6.2.

The same bucket should sit behind a **proxied custom domain**, not `r2.dev`, which Cloudflare does
not cache. On that domain the `.w480.jpg`/`.w960.jpg` card copies are edge-cached by default, but
originals have no file extension, so add one free Cache Rule (Caching → Cache Rules): hostname equals
the photo domain and URI path starts with `/photos/` → *Eligible for cache*, edge TTL *Use cache-control
header*. Every object already carries `Cache-Control: public, max-age=31536000, immutable`.

### 3.3 Identity verification

Identity verification is a reviewed trust badge, not a synchronous unlock. Applicant endpoints live in
`backend/src/main/java/com/draazy/api/identity/verification/IdentityVerificationController.java`;
the browser flow is `frontend/src/pages/consumer/VerifyIdentity.jsx`.

| Area | Deployment requirement | Missing / wrong symptom |
|---|---|---|
| Camera | HTTPS origin; `Permissions-Policy: camera=(self)` in `frontend/public/_headers` | `getUserMedia` is absent or throws `NotAllowedError` / `SecurityError`; the screen shows the camera failure copy |
| iOS camera | `playsInline` on the `<video>` and camera start behind the user pressing the start button (`VerifyIdentityScreens.jsx`, `VerifyIdentity.jsx`) | Safari opens native fullscreen video or refuses playback/capture until another gesture |
| Face WASM | CSP `script-src 'wasm-unsafe-eval'` in both `frontend/public/_headers` and `frontend/index.html` | MediaPipe WASM compile fails; the selfie step loses its liveness guidance |
| Self-hosted assets | `/models/*` immutable cache rule in `_headers` | First visit is slower; repeat visits may re-fetch the model instead of using the pinned copy |

**Face model supply chain.**

| Asset | Source in repo | Package / license |
|---|---|---|
| MediaPipe Face Landmarker | `frontend/src/lib/identity-verification/face.js` loads `/models/face_landmarker.task`; file at `frontend/public/models/face_landmarker.task` | `@mediapipe/tasks-vision` `1.0.1`, Apache-2.0 in `frontend/node_modules/@mediapipe/tasks-vision/package.json`; model card publishes Apache-2.0, verify against the model card at release |

Face checks run in the browser. Only the captured front/back/selfie images are uploaded,
to the private R2 bucket (`SANDBOX_R2_BUCKET_PRIVATE`, §5.1). The identity badge stores document
number HMACs and last-4 values only (`IdentityHasher.java`, `IdentityVerificationService.java`);
the raw document number is not stored by this badge flow.

Consent is stored with a notice version (`IdentityVerificationService.CONSENT_NOTICE_VERSION`,
currently `2026-09`) and the notice language (`en`, `hi`, `mr`). Treat this as DPDP Act 2023
notice/consent evidence, not a legal-compliance claim.

**Image retention and purge.**

| Case | Rule |
|---|---|
| Approved / rejected / revoked | Images purge after `draazy.identity.image-retention-days` from `decidedAt`; default `7` days |
| Pending too long | The `identity-pending-expiry` job (10:00 IST) rejects pending cases older than `draazy.identity.pending-ttl`; default `P14D`; it purges images immediately and sends the ordinary rejected decision |
| Resubmission / withdrawal / erasure | Existing identity files are queued and purged immediately in the transaction path |
| Storage delete failure | `identity_storage_deletes` keeps the key; the nightly `identity-delete-retry` job tries each due key once, up to 2,000 a night, least-tried first so a stuck key never blocks newer ones |

These are `JobRunner` jobs (see Scheduled jobs in §5).

**WhatsApp identity decision template.**

The template sender is
`backend/src/main/java/com/draazy/api/provider/whatsapp/WhatsAppDecisionMessenger.java`; the property
binding is `WhatsAppProperties.java`.

| Setting | Value |
|---|---|
| Meta category | `UTILITY` |
| Template body | One body component parameter: `{{1}}` text, carrying the full decision line |
| Suggested body text | `{{1}}` |
| Language | `WHATSAPP_IDENTITY_TEMPLATE_LANG`, default `en_US` |
| Template name | `WHATSAPP_IDENTITY_TEMPLATE_NAME`; blank means in-app only |
| Shared WhatsApp credentials | `WHATSAPP_ENABLED`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BASE_URL`, `WHATSAPP_API_VERSION` |

Lines the backend sends:

| Decision | `{{1}}` value |
|---|---|
| Rejected by a reviewer / stale pending | `Your Draazy identity verification could not be completed. Open the app to see the reason and retake your photos.` |
| Revoked | `Your Draazy verified badge was withdrawn. Open the app to see the reason and submit again.` |

Approvals and the automatic check's rejects send no WhatsApp (in-app only). If `WHATSAPP_ENABLED=false`,
`LoggingDecisionMessenger` logs a mock send. If WhatsApp is enabled but the identity template name or
language is blank, `WhatsAppDecisionMessenger` logs and skips only the WhatsApp leg. Vendor failures are
logged and swallowed; the decision is already committed and visible in-app. Meta business verification
and approved templates remain the gate before useful WhatsApp delivery; see §7.

**WhatsApp waiting-on-you digest template.** Sent by the `waiting-digest` job (10:00 IST, daily) through
the same `WhatsAppDecisionMessenger`. Rules are in
[`notifications.md`](./system/notifications.md#waiting-on-you-digest--utility-template).

| Setting | Value |
|---|---|
| Meta category | `UTILITY`; **needs Meta approval before the name is set** |
| Suggested body text | `You have {{1}} waiting for your reply on Draazy. Open the app to respond.` with `{{1}}` = `1 request` / `N requests` |
| Template name | `WHATSAPP_DIGEST_TEMPLATE_NAME`; blank means no digest is sent |
| Language | `WHATSAPP_DIGEST_TEMPLATE_LANG`, default `en_US` |
| Off switch | `draazy.jobs.waiting-digest.enabled=false` |

**Web push (VAPID).** `WebPushSender` is wired when `PUSH_VAPID_PRIVATE_KEY` is set; without it
`LoggingPushSender` only logs. Generate a pair once with `npx web-push generate-vapid-keys` (base64url).

| Setting | Value |
|---|---|
| `PUSH_VAPID_PRIVATE_KEY` | Secret (`SANDBOX_PUSH_VAPID_PRIVATE_KEY`). Boot fails if it is set without the public key or is not a P-256 key |
| `PUSH_VAPID_PUBLIC_KEY` | The matching public key (`SANDBOX_PUSH_VAPID_PUBLIC_KEY`) |
| `PUSH_VAPID_SUBJECT` | Contact the push services may use; `mailto:` or https. Default `mailto:noreply@draazy.com` |
| `VITE_VAPID_PUBLIC_KEY` | Repository variable consumed by the frontend build, carrying the **same public key**, so browsers subscribe to it |

Rotating the pair invalidates every stored subscription: they are removed as the push service answers
404/410 or they re-subscribe.

**Email (Zoho ZeptoMail via CPaaS).** Sender: `provider/zeptomail/ZeptoMailEmailSender.java`. It only
emails staff invite and password-reset links (`StaffInviteMailer`) to the account's own address; the
admin's copy-link dialog is unchanged and stays the fallback.

| Setting | Value |
|---|---|
| `ZEPTOMAIL_ENABLED` | `true` to send; off logs `[MOCK EMAIL]` with recipient domain + subject |
| `ZEPTOMAIL_API_KEY` | The agent's **Send Mail token** (CPaaS → Agents → agent → SMTP/API). Secret (`SANDBOX_ZEPTOMAIL_API_KEY`); with or without the `Zoho-enczapikey ` prefix |
| `ZEPTOMAIL_FROM_ADDRESS` | Default `noreply@draazy.com`; must be on a domain whose DKIM **and** CNAME show Verified |
| `ZEPTOMAIL_FROM_NAME` | Default `Draazy`; the spec sets `Draazy Sandbox` |
| `ZEPTOMAIL_BASE_URL` | Default `https://cpaas.zoho.in` (India DC; the account lives on `cpaas.zoho.in`) |

The boot fails if the flag is on and the key or from-address is blank. Send failures log
`ZeptoMail send to ***@domain failed: <status> code=TM_xxxx SERR_xxx`; `SERR_157` is a bad token.

**Provider call log (`/admin/integrations`, admin only).** Every ZeptoMail, WhatsApp and Cashfree
call, and every Cashfree webhook, writes one `provider_call` row (`provider/ProviderCalls.java`):
outcome, masked recipient, order id or subject, an error code and the latency. Message bodies, OTPs,
links and keys are never stored. The page shows 24h/7d health per provider and a log searchable by
full email, mobile or order id. Rows are written off the request thread and purged after 30 days;
nothing to configure. Delivery and bounce receipts still live in each vendor's console.

**Server-chosen selfie pose.** `POST /me/verification/identity/challenge` issues a signed 15-minute
challenge with pose `left`, `right` or `smile` (`LivenessCheck.java`). If a challenge token is
submitted, the review queue exposes `livenessChallenge`, and `IdentityReviewService` refuses approval
until staff confirms the selfie shows that pose. The browser's local face verdict remains advisory.

Hardware checks live in
[`flows/consumer/contact-gate-leads.md`](./flows/consumer/contact-gate-leads.md#9-identity-verification-hardware-checklist).

**Post-deploy checks.**

| Check | Expected result |
|---|---|
| Submit one real identity verification using the R2 private bucket | `POST /me/verification/identity` returns `202`; review queue loads front/back/selfie images via signed URLs |
| Approve the case | User gains the verified badge; owner listings receive the verified owner stamp |
| Purge path | Files disappear under the retention rules above; failed deletes remain in `identity_storage_deletes` until retried |
| Reject the case (reviewer) | The decision message arrives with the exact line in the table above; an approval sends none |

---

## 4. `INTERNAL_PROXIES` and the origin gate

`WriteRateLimitFilter` keys anonymous callers on the client address, and `POST /page-views` is
`permitAll` and fires on ordinary browsing — so the 120-writes-per-60s budget is consumed by
*traffic*, not by attackers. Get this wrong in either direction and it is an outage:

- **Too narrow / `none`** behind a proxy: every visitor arrives as the proxy's address, the whole
  internet lands in one bucket, and the limiter becomes the outage it was added to prevent.
- **Too permissive**: the backend is still directly reachable at its own host, so anyone matching the
  regex picks their own bucket by sending an `X-Forwarded-For` of their choosing. An in-app limiter
  that can be spoofed is worse than none, because it reads as protection.

It must be a **Java regex** matching the actual egress of whatever sits in front of the app, or the
literal `none` for a directly-exposed instance. `TrustedProxyConfig` validates it at boot and names
the property when it is wrong.

On the Cloudflare Pages → App Platform shape there are at least two hops.
`frontend/functions/api/[[path]].js` sets `X-Forwarded-For` from `CF-Connecting-IP`, overwriting
anything the client sent; then App Platform's ingress appends the caller's address before Tomcat sees
the request.

**Adding Cloudflare's egress ranges alone makes the value spoofable**, because those addresses are
shared with every other Cloudflare account: anyone who learns the `*.ondigitalocean.app` URL can deploy
their own free Worker, `fetch` the origin directly with a forged `X-Forwarded-For`, and have
`RemoteIpValve` pop the Cloudflare hop and adopt the attacker's chosen address. That buys unlimited
rotation of the anonymous write budget, satisfies `BotDefenceFilter.verify` for arbitrary addresses and —
run the other way — lets one address be pinned to a victim's IP to 429 them off the platform. Leaving
Cloudflare out instead collapses all anonymous traffic into the single Cloudflare-egress bucket. Neither
is safe on its own, so the origin must be able to tell *this* proxy apart from any other Cloudflare
tenant. A shared secret does that for free.

### How the gate works

The Function sends `X-Proxy-Auth: <ORIGIN_SHARED_SECRET>`, overwriting anything the client sent.
`OriginGateFilter` runs ahead of the JWT filter, the rate limiter and bot defence, and answers **403**
to any request whose header does not match (constant-time compare). The only exemptions are `GET`/`HEAD`
on the three health paths, `/api/actuator/health`, `/health/liveness` and `/health/readiness`, because
App Platform's health check and the deploy smoke test reach the container directly. Writes to those
paths are gated too: they would otherwise reach the write rate limiter without the secret, charged to
whatever address the caller put in `X-Forwarded-For`.

A leaked `*.ondigitalocean.app` URL is therefore harmless: every other route answers 403 without the
secret. Both halves must hold the same value:

| Where | How |
|---|---|
| Backend | GitHub `sandbox` environment secret `SANDBOX_ORIGIN_SHARED_SECRET`, rendered into the spec as `ORIGIN_SHARED_SECRET` |
| Pages Function | `npx wrangler pages secret put ORIGIN_SHARED_SECRET --project-name=draazy` |

Generate it once (§3). The backend refuses to boot on a blank value or on one shorter than 32
characters; the Function answers 502 `api_proxy_misconfigured` when its copy is unset. A **mismatch**
fails differently: every `/api` call 403s while `/api/actuator/health` stays green, so the frontend
job's health smoke test passes. Check a real route after changing either side.

**Rotation** has a short outage window: update the GitHub secret and the Pages secret, then run the
deploy with `target: both`. Calls 403 between the backend going live and the Pages publish.

### `INTERNAL_PROXIES`, now that the gate is on

`none` is still the committed value, so all anonymous traffic shares one bucket. With the gate on, the
chain Tomcat sees is `<client>, <Cloudflare egress>` plus whatever App Platform's ingress adds, and only
the Function can have written the left-most entry of any request that reaches an address-sensitive filter
(the ungated health reads are never counted). So a pattern matching every hop — `.*` — would resolve the
real client and cannot be forged. **Never set it while `ORIGIN_SHARED_SECRET` is `none`**: without the
gate that same value lets any caller choose their own address.

Set it **last**, after confirming the gate is live (a direct `curl` of the `*.ondigitalocean.app` URL for
any non-health route must answer 403) and checking the `X-Forwarded-For` a real proxied request produces.
The check in §9.4 — two devices on different networks showing different client IPs — is the proof.

### Free Cloudflare edge controls

These only protect traffic that goes through Cloudflare, which is why the gate had to come first. On
the `draazy.com` zone, free plan:

- **Managed WAF ruleset** (free tier) — on.
- **One rate-limiting rule** — e.g. `/api/auth/*` POST, per IP, to back up the OTP counters.
- **Custom WAF rules** (5 on the free plan) — e.g. block `/api/docs*` and `/api/swagger-ui*` on sandbox.
- **Turnstile** is wired (`TurnstileBotDefence`) and on in sandbox (§3.1).
- **Bot Fight Mode: leave off.** On the free plan it cannot be skipped per path, so it can challenge
  the Cashfree webhook at `/api/webhooks/cashfree/payment` and payments stop confirming without an error.

---

## 5. DigitalOcean App Platform

The app is defined by `backend/deploy/do-app-sandbox.yaml`, rendered through `envsubst` by the deploy
job and submitted with `doctl apps create|update --spec`. The `${…}` tokens are the only per-environment
inputs and everything else is a deliberate literal, reviewable here rather than guessed at deploy time.
The spec is the whole truth: anything a console click added out of band is removed on the next deploy.
The `${db.*}` tokens are DigitalOcean bindables and must survive `envsubst`, which is why the workflow
passes it an explicit variable list.

| Item | Value |
|---|---|
| App / URL | `draazy-api-sandbox`, id `e1837855-3a21-4c51-a08e-99fd4f33d594`, `https://draazy-api-sandbox-466hx.ondigitalocean.app` |
| Region / project | `blr` (Bangalore, BLR1); DigitalOcean project `draazy-sandbox` |
| Service `api` | GHCR image `ghcr.io/<owner>/draazy-api:<commit SHA>`, port 8080, 1 instance, `apps-s-1vcpu-1gb-fixed` |
| Job `migrate` | `PRE_DEPLOY`, same image and size, `run_command: java -jar /app/app.jar --migrate-only` (§2.1) |
| Database `db` | dev PostgreSQL 17 (§2) |
| Ingress | one rule, prefix `/` → `api` |
| Readiness | `GET /api/actuator/health/readiness`, 30 s initial delay, every 10 s, 18 failures allowed |
| Alerts | `DEPLOYMENT_FAILED`, `DOMAIN_FAILED`; service CPU > 85 % and memory > 90 % for 10 min; more than 2 restarts in 5 min |

Settings that encode consequences invisible from the console:

- **1 GB, not 512 MB.** The Dockerfile sets `-XX:MaxRAMPercentage=70.0` and `-XX:+ExitOnOutOfMemoryError`,
  so 1 GB is a ~717 MB heap with ~300 MB for metaspace, code cache and thread stacks. Measured: 40
  concurrent requests peak at ~650 MB resident and steady state sits near 800 MB RSS. At 512 MB the
  non-heap no longer fits and the container is OOM-killed during startup. The migration job uses the same
  size.
- **Single container, always on.** `instance_count: 1` and no autoscaling: the $10 fixed size includes
  100 GB of outbound bandwidth. There is no scale-to-zero, so the JVM boot cost is paid on deploys only.
- **The probe path carries `/api`** because `server.servlet.context-path` moves the actuator too, and it
  uses the `readiness` group. A probe on `/actuator/health` returns 404 and fails every deployment while
  the application underneath is healthy.
- **`SPRING_PROFILES_ACTIVE=sandbox`** is set on both components, overriding the `prod` baked into the
  image. `application-sandbox.properties` is standalone rather than a delta — its own datasource, secrets,
  cookie flags, OTP throttle and proxy CIDR — and `SandboxProfileContractTest` asserts it agrees with prod
  on every security-critical key. `CookieDeliveryCheck` refuses to boot if `WEB_ORIGINS` and
  `API_PUBLIC_ORIGIN` describe a cross-site shape.
- **Secrets** (`type: SECRET`) are encrypted by DigitalOcean after the workflow renders them; the rendered
  spec exists only in the runner's temp directory and is deleted at the end of the job. A secret rotation
  reaches the service on the next deploy, and a redeployed old image still picks up today's secrets:
  redeploying a known commit is a rollback for **code**, not for **secrets** (yesterday's image with
  today's `JWT_SECRET` invalidates every issued token).
- **The GHCR package `draazy-api` must be public**, because the spec carries no registry credentials. A new
  package is created private, so the first deploy fails once at the image pull until it is made public
  (§6.4).

**Cost.** About **$17/month** plus 18 % GST, billed in USD on the 1st:

| Item | $/month |
|---|---|
| App Platform service, 1 vCPU / 1 GB | 10 (plus a few cents per `migrate` run) |
| Dev database | 7 |
| GHCR (public package) | 0 |

Set a billing alert in Billing → Billing alerts.

### 5.1 GitHub deploy pipeline

`.github/workflows/deploy.yml` — **manual only.** Actions → Deploy (sandbox) → Run workflow, pick any
branch or tag in "Use workflow from", type `sandbox`, choose `both` / `backend` / `frontend`. Nothing
deploys on a push. One concurrency group serialises runs, so a second dispatch's frontend cannot overtake
the first's backend.

| Job | What it does |
|---|---|
| `gate` | Rejects a mistyped confirmation; decides which halves run; requires `VITE_TURNSTILE_SITE_KEY` |
| `backend` (env `sandbox`) | Builds `backend/Dockerfile` on an amd64 runner and pushes it to GHCR tagged with the commit SHA; fails if any required secret is empty; renders the spec with `envsubst`; `doctl apps create --spec … --wait` (or `update <id>` when an app named `draazy-api-sandbox` exists); requires the latest deployment to be `ACTIVE`; smoke-tests `/api/actuator/health` on the default ingress (12 attempts); deletes the rendered spec |
| `frontend-build` | `npm ci` and `npm run build` with the `VITE_*` inputs below; verifies `dist/index.html`, `404.html`, `_redirects`, `_headers`, `functions/api/[[path]].js` and the face model exist; uploads `dist/` and `functions/` as a one-day artifact |
| `frontend-publish` (env `sandbox-web`) | `wrangler pages deploy dist --project-name draazy --branch main`, tagged with the same SHA; then a smoke test through `sandbox.draazy.com` (deep links, security headers, no CORS grant, `/api/actuator/health` returns JSON `UP`) |

The deploy **ships both halves from one commit, backend first**; the frontend runs unless the backend
job failed or was cancelled. API changes are additive (expand/contract), so an old UI always works against
a new backend, and a new UI does not work against an old one. During the backend deploy the `migrate`
PRE_DEPLOY job runs first; if it fails, the deployment fails and the previous version keeps serving.

**The frontend is two jobs, and the split is a security boundary.** `frontend-build` runs dependency and
project scripts and holds no deploy credential and no environment. `frontend-publish` checks out nothing,
so `npx wrangler` cannot be redirected by an `.npmrc` or a shadowing `node_modules/wrangler` planted
during the build, and its separate environment, `sandbox-web`, holds only the Cloudflare credentials — it
can reach neither the DigitalOcean token nor any app secret.

**Two build-time hazards live in the frontend half.** Every `VITE_*` value is inlined by Vite at build
time and every read in `src/` has a fallback, so a missing one produces a bundle that boots and is quietly
broken in one feature; the build fails closed on `VITE_GOOGLE_MAPS_API_KEY` for that reason. And
`wrangler pages deploy` finds `functions/` by convention beside the working directory, so run anywhere else
it uploads the static assets alone, succeeds, and ships a site whose `/api` calls fall through to the SPA
rule and return `index.html` with a **200**, which `http.js` reads as a successful empty response. The final
smoke test asserts the *content type* of `/api/actuator/health` precisely because the status code cannot
tell those apart.

**Inputs.** The deploy reads these:

| Scope | Secrets | Variables |
|---|---|---|
| `sandbox` environment | `DIGITALOCEAN_ACCESS_TOKEN`, `SANDBOX_JWT_SECRET`, `SANDBOX_ORIGIN_SHARED_SECRET`, `SANDBOX_REFERRAL_SIGNAL_SALT`, `SANDBOX_IDENTITY_HASH_SECRET`, `SANDBOX_STAFF_TOTP_KEY`, `SANDBOX_IDENTITY_ENCRYPTION_KEY`, `SANDBOX_CASHFREE_APP_ID`, `SANDBOX_CASHFREE_SECRET_KEY`, `SANDBOX_ZEPTOMAIL_API_KEY`, `SANDBOX_WHATSAPP_ACCESS_TOKEN`, `SANDBOX_TURNSTILE_SECRET_KEY`, `SANDBOX_R2_ACCESS_KEY_ID`, `SANDBOX_R2_SECRET_ACCESS_KEY`, `SANDBOX_GOOGLE_PLACES_SERVER_KEY`, `SANDBOX_PUSH_VAPID_PRIVATE_KEY`, `SANDBOX_PUSH_VAPID_PUBLIC_KEY`, `SANDBOX_BOOTSTRAP_ADMIN_EMAIL`, `SANDBOX_BOOTSTRAP_ADMIN_MOBILE` | `SANDBOX_R2_ENDPOINT`, `SANDBOX_R2_BUCKET_PRIVATE`, `SANDBOX_R2_BUCKET_PUBLIC`, `SANDBOX_R2_PUBLIC_BASE_URL`, `SANDBOX_BOOTSTRAP_ADMIN_RECOVER` (blank = off) |
| `sandbox-web` environment | `CLOUDFLARE_API_TOKEN` (Account → Cloudflare Pages → Edit, nothing else) | `CLOUDFLARE_ACCOUNT_ID` |
| repository (frontend build) | `VITE_GOOGLE_MAPS_API_KEY`, `VITE_GA_ID` | `VITE_GOOGLE_MAPS_MAP_ID`, `VITE_CASHFREE_MODE`, `VITE_PMF_MODE`, `VITE_VAPID_PUBLIC_KEY`, `VITE_TURNSTILE_SITE_KEY`, `VITE_POSTHOG_KEY` (US-cloud project key; blank = off), `VITE_POSTHOG_APP_URL` |

The workflow fails fast when any `sandbox` value except the three bootstrap ones is empty. The four R2
values and `SANDBOX_BOOTSTRAP_ADMIN_RECOVER` are variables because they are identifiers; the R2 key pair
that opens the bucket is a secret. Everything sensitive is an environment secret, never a repository
variable, because the repository is public and a variable would print in the run log.
`DIGITALOCEAN_ACCESS_TOKEN` needs custom scopes **app: create, read, update** and nothing else.

**Decide the deployment branch policy on the `sandbox` and `sandbox-web` environments.**
`workflow_dispatch` accepts any ref, and the workflow's confirmation input checks the environment name
rather than `github.ref` — so under "All branches", anyone with write access can deploy an unreviewed
branch, including one that edits `do-app-sandbox.yaml` or `frontend-publish` to exfiltrate a credential.
Restricting the policy to `main` closes that and costs the ability to deploy a feature branch, which is the
reason the trigger is manual in the first place. Sandbox keeps "All branches" deliberately; a production
environment must not. The environment setting is the right place for the decision, because it cannot be
changed by the same pull request that would abuse it.

**The deploy is manual, and that moves the boundary.** There is no push or `workflow_run` trigger, so no
event an outsider can cause starts a job holding these credentials (`workflow_run` hands the triggered
workflow secrets and a write token even when the triggering run had neither — "Preventing pwn requests",
GitHub Security Lab). It also removes every automatic gate: **the workflow ships the ref you point it at
and does not read its CI result**, because a feature branch has no CI run to read, and nothing checks that
the commit is the head of anything. Dispatching an old ref deploys old code against a schema that only
moves forward. Read the checks on the commit before dispatching.

**Pages does not rebuild on a push.** The project is a direct-upload project; if a git integration is
connected (Pages → Settings → Builds & deployments), disconnect it, because it would quietly replace what
you deployed on purpose with the head of whatever branch was pushed.

### Scheduled jobs

`com.draazy.api.jobs.JobRunner` runs every background job in four cron groups, all in IST. Each job
runs in its own try, so one failure is logged and the rest of the group carries on; the group's
advisory lock (`JobRunScheduler`) keeps it on one instance, so more than one instance is safe and no
ShedLock is needed.

| Group | Cron property (default) | Jobs |
|---|---|---|
| Frequent | `draazy.jobs.frequent.cron` (`0 */15 * * * *`) | `abandoned-checkouts`, `pass-refunds`, `listing-duplicates` |
| Hourly | `draazy.jobs.hourly.cron` (`0 5 * * * *`) | `subscription-expiry`, `saved-search-counts`, `page-view-rollup`, `flatmate-post-expiry` (public reads don't check `active_until`, so a lapsed post shows until it runs) |
| Nightly, 00:00 | `draazy.jobs.nightly.cron` (`0 0 0 * * *`) | silent cleanup: `refresh-tokens`, `referral-signal-retention`, `co-fill-invite-retention`, `service-request-identity-retention`, `notification-retention`, `page-view-retention`, `error-event-retention`, `audit-log-retention`, `provider-call-retention`, `identity-image-purge`, `identity-delete-retry`, `identity-conflict-retention` |
| Daytime, 10:00 | `draazy.jobs.daytime.cron` (`0 0 10 * * *`) | anything that messages a user: `identity-pending-expiry`, `contact-returns`, `referral-holds`, `needs-info`, `flatmate-owner-tier`, `flatmate-agreement-expiry`, `flatmate-draazy-agreements`, `flatmate-post-reminders`, `renewal-reminders`, `tracked-rent-reminders`, `waiting-digest` |

The app is always on, so the `@Scheduled` cron runs in-process at the times above with no external
trigger. Switches: `draazy.jobs.enabled=false` turns off all of them (the test suite does), and
`draazy.jobs.<name>.enabled=false` (env `DRAAZY_JOBS_<NAME>_ENABLED`) turns off one. Daily jobs that read a
capped page (200–500 rows) repeat until a page comes back empty, up to ten pages a run.

`spring.task.scheduling.pool.size=2` is a connection budget, not a throughput setting. A group run holds
one connection for its lock transaction and the work checks out a second. With
`spring.datasource.hikari.maximum-pool-size=5`, two concurrent runs take four and leave one for HTTP. More
threads let a long nightly run overlap the 15-minute and hourly ticks and starve requests. Raise both
together. A run that finds both threads busy starts late; it isn't skipped.

---

## 6. Order of operations — first-time setup of a fresh environment

Only needed once per environment. Everything after is a workflow dispatch (§5.1). Accounts that cannot be
created from a terminal: **DigitalOcean** (card attached), **Cloudflare** (free plan), **GoDaddy** (holding
`draazy.com`), **GitHub** access to `draazy-dev/draazy-app`, plus the vendor accounts in §3 (Meta
WhatsApp, Cashfree, ZeptoMail, and the Google Maps/Places API keys).

Tools (`wrangler` runs through `npx`; no install):

| | macOS | Windows |
|---|---|---|
| GitHub CLI | `brew install gh` | `winget install --id GitHub.cli -e` |
| `doctl` | `brew install doctl` | `winget install --id DigitalOcean.Doctl -e` |
| Node 20+ | `brew install node` | `winget install --id OpenJS.NodeJS.LTS -e` |

### 6.1 DNS: GoDaddy → Cloudflare

> **This does not move the domain off GoDaddy.** GoDaddy stays the *registrar*; what moves is *DNS
> hosting*. Cloudflare DNS is free, and registrar-at-GoDaddy / DNS-at-Cloudflare is an ordinary
> arrangement, reversible in minutes by pasting GoDaddy's original nameservers back.

Do the full nameserver move even though a lone subdomain could keep GoDaddy DNS:

1. `draazy.com` at the apex — wanted for production — **requires** the zone to be on Cloudflare. Pages
   cannot attach an apex domain otherwise, and GoDaddy does not support CNAME flattening.
2. ADR-015 chose Cloudflare edge WAF / rate-limit / Turnstile as the abuse strategy instead of Redis.
   Those are *zone* features.
3. The free edge controls in §4 assume the same.

Steps:

1. **Screenshot the GoDaddy DNS panel first.** Cloudflare's import is best-effort, and the records you
   will miss are the ones nothing on the website depends on — MX, SPF/DKIM `TXT`, an `autodiscover`
   CNAME.
2. Cloudflare dashboard → **Add a site** → `draazy.com` → **Free**. Compare the imported records against
   the screenshot.
3. Cloudflare shows two nameservers, e.g. `xxx.ns.cloudflare.com`.
4. GoDaddy → **My Products** → `draazy.com` → **DNS** → **Nameservers** → **Change** → **I'll use my own
   nameservers** → paste both → save. If GoDaddy refuses, it is **Domain Protection** — disable it, change
   nameservers, re-enable.

Three GoDaddy features break on the move because they run on GoDaddy's own infrastructure; none applies to
a domain that has only served a website:

| Feature | After the move | Replacement |
|---|---|---|
| GoDaddy **email forwarding** | stops | Cloudflare Email Routing (free) |
| GoDaddy **domain / website forwarding** | stops | a Cloudflare Redirect Rule |
| **Microsoft 365 mail bought via GoDaddy** | survives *only* if MX, the `autodiscover` CNAME and the SPF/DKIM `TXT` records are all copied | copy them, then send yourself a test mail |

Propagation is usually under an hour. Check:

| macOS | Windows |
|---|---|
| `dig NS draazy.com +short` | `Resolve-DnsName draazy.com -Type NS` |

**Checkpoint:** the answer names `*.ns.cloudflare.com`. You create no DNS record by hand; Pages creates the
`sandbox` record itself in §6.5.

### 6.2 Cloudflare R2

The deploy workflow requires all four `SANDBOX_R2_*` variables and both key secrets to be non-empty, so this comes before the first deploy.

R2 → **Create bucket**, twice — ADR-013 splits them because the access rules differ:

| Bucket | Holds | Public? |
|---|---|---|
| `draazy-sandbox-public` | listing photos | yes — attach a proxied custom domain (§3.2) |
| `draazy-sandbox-private` | KYC and ownership documents | **no** — served only through pre-signed URLs |

Then R2 → **Manage API tokens** → **Create API token**, permission **Object Read & Write**, scoped to those
two buckets. It shows an **Access Key ID** and a **Secret Access Key** once; record both (they become
`SANDBOX_R2_ACCESS_KEY_ID` / `SANDBOX_R2_SECRET_ACCESS_KEY`). The **S3 API endpoint**,
`https://<account-id>.r2.cloudflarestorage.com`, is `SANDBOX_R2_ENDPOINT` and is not the public base URL
(`SANDBOX_R2_PUBLIC_BASE_URL`), which is the custom domain of the *public* bucket only.

**R2 must send its own CORS headers.** It is cross-origin from the SPA by design and does not inherit the
API's CORS config. On the public bucket → **Settings** → **CORS policy**:

```json
[{ "AllowedOrigins": ["https://sandbox.draazy.com"],
   "AllowedMethods": ["GET", "PUT"],
   "AllowedHeaders": ["*"],
   "MaxAgeSeconds": 3600 }]
```

Without it the browser-side perceptual hashing fails at the canvas read (§3.2) and nothing surfaces as a
CORS error, so it reads as a flaky uploader. **Checkpoint:** after §6.4, upload a listing photo and reload
the listing; it must render from the public bucket URL.

### 6.3 DigitalOcean account and GitHub environments

1. cloud.digitalocean.com → enable 2FA, add a billing alert, and create the project `draazy-sandbox`
   (Environment: Development).
2. API → Tokens → **Generate new token**: name `github-deploy-sandbox`, custom scopes **app: create, read,
   update**. Store it as `DIGITALOCEAN_ACCESS_TOKEN` below.
3. Create the environments and set every `sandbox` value from §5.1. Pipe secrets in so they never reach shell
   history as arguments:

   ```bash
   # macOS
   gh api --method PUT repos/draazy-dev/draazy-app/environments/sandbox
   gh api --method PUT repos/draazy-dev/draazy-app/environments/sandbox-web
   printf '%s' "$VALUE" | gh secret set SANDBOX_JWT_SECRET --env sandbox -R draazy-dev/draazy-app
   gh variable set SANDBOX_R2_BUCKET_PUBLIC --env sandbox -R draazy-dev/draazy-app --body 'draazy-sandbox-public'
   ```

   ```powershell
   # Windows
   gh api --method PUT repos/draazy-dev/draazy-app/environments/sandbox
   gh api --method PUT repos/draazy-dev/draazy-app/environments/sandbox-web
   $env:VALUE | gh secret set SANDBOX_JWT_SECRET --env sandbox -R draazy-dev/draazy-app
   gh variable set SANDBOX_R2_BUCKET_PUBLIC --env sandbox -R draazy-dev/draazy-app --body 'draazy-sandbox-public'
   ```

4. `sandbox-web`: secret `CLOUDFLARE_API_TOKEN` and variable `CLOUDFLARE_ACCOUNT_ID`. Repository: the
   `VITE_*` secrets and variables. Then decide the branch policy (§5.1).
5. Set `SANDBOX_ORIGIN_SHARED_SECRET` once and reuse the same value for the Pages secret in §6.5.
6. Cloudflare → Turnstile: create the sandbox widget and set `SANDBOX_TURNSTILE_SECRET_KEY` /
   `VITE_TURNSTILE_SITE_KEY` (§3.1).

### 6.4 First backend deploy

Actions → Deploy (sandbox) → Run workflow → branch, `sandbox`, target **backend**.

- **Expect one failure at the image pull.** The image push succeeds, but a new GHCR package is private. Make
  it public (github.com/orgs/draazy-dev/packages → `draazy-api` → Package settings → Change visibility →
  Public), then re-run the workflow or run `doctl apps create-deployment <app-id> --wait`.
- In the DigitalOcean console, move the app into the `draazy-sandbox` project (Projects → Move resources).
- If the deploy fails at `migrate`, read the job's deploy logs; a migration error aborts the rollout and
  leaves nothing serving on a first deploy.

Check it:

```bash
id=$(doctl apps list --output json | jq -r '.[] | select(.spec.name=="draazy-api-sandbox") | .id')
doctl apps list-deployments "$id" --format ID,Phase,Created | head -3        # latest ACTIVE
doctl apps logs "$id" migrate --type deploy | tail -30                        # Flyway summary
URL=$(doctl apps get "$id" --output json | jq -r '.[0].default_ingress'); echo "$URL"
curl -fsS "$URL/api/actuator/health"                                          # {"status":"UP"}
curl -s -o /dev/null -w '%{http_code}\n' "$URL/api/properties"               # 403: the origin gate
```

Note the `/api` prefix on every path: `/actuator/health` is a 404 on a healthy service. The commands need `jq`
(`brew install jq` / `winget install --id jqlang.jq -e`). If the service never becomes ready, in order of likelihood: a memory limit below 1 GB (OOM during startup, §5), a missing or empty
environment value (`Could not resolve placeholder 'X'` — the fail-fast working), or schema drift
(`Schema-validation: missing table/column`).

Then follow the first-admin steps in §3.

### 6.5 Cloudflare Pages and the custom domain

The CI publishes by `wrangler` direct upload, so create a **direct-upload** project (the dashboard's
drag-and-drop upload is not supported with Functions and silently omits `api/[[path]].js`):

```bash
cd frontend
npx wrangler login
npx wrangler pages project create draazy --production-branch=main
npx wrangler pages secret put API_ORIGIN --project-name=draazy
# paste https://draazy-api-sandbox-466hx.ondigitalocean.app — scheme + host, no path, no trailing slash
npx wrangler pages secret put ORIGIN_SHARED_SECRET --project-name=draazy
# paste the value of SANDBOX_ORIGIN_SHARED_SECRET (§4)
```

`API_ORIGIN` and `ORIGIN_SHARED_SECRET` are runtime values on the Pages **project**, not build input: direct
uploads do not touch them, so they survive every deploy. `VITE_*` values are the opposite — they are inlined
at build time, so set them as GitHub variables and secrets (§5.1), not in the Pages dashboard.
`VITE_GOOGLE_MAPS_API_KEY` is in the bundle by necessity; it is not a secret, so restrict it by HTTP
referrer and set a quota cap. Leave `VITE_PMF_MODE` unset unless it is deliberately on.

Dispatch the workflow with target **frontend**, then attach the domain — order matters:

1. Pages project → **Custom domains** → **Set up a domain** → `sandbox.draazy.com`. Because the zone is on
   Cloudflare (§6.1), the CNAME is created for you; confirm it.
2. Creating the DNS record before registering the domain on the Pages project produces a **522** that looks
   like an origin outage.

**Manual Pages deploy (fallback)**, when CI is unavailable. Build locally with the same `VITE_*` names as the
build step of `deploy.yml`, then, **from `frontend/`** (wrangler looks for `functions/` beside the working
directory; from the repository root it uploads a Function-less site):

```bash
VITE_DEPLOY_ENV=sandbox VITE_GOOGLE_MAPS_API_KEY='<key>' VITE_TURNSTILE_SITE_KEY='<site key>' npm run build
npx wrangler pages deploy dist --project-name=draazy --branch=main --commit-dirty=true
```

```powershell
$env:VITE_DEPLOY_ENV='sandbox'; $env:VITE_GOOGLE_MAPS_API_KEY='<key>'; $env:VITE_TURNSTILE_SITE_KEY='<site key>'
npm run build
npx wrangler pages deploy dist --project-name=draazy --branch=main --commit-dirty=true
```

`--branch=main` matches the production branch, which is what the custom domain serves; any other value
creates a preview deployment nobody points at. `curl -fsS https://<project>.pages.dev/api/actuator/health`:
`UP` means the Function shipped and `API_ORIGIN` is right; **404** means it was deployed from the wrong
directory; **502** means `API_ORIGIN` or `ORIGIN_SHARED_SECRET` is unset or malformed.

### 6.6 Verification

Run §9.3 against `https://sandbox.draazy.com`, then the cookie test in §9.3 and one sign-in by hand
(§3.1). Add the monitoring in §8.

---

## 7. Known blockers

- **Nobody can log in on `prod` until WhatsApp is configured.** `UnconfiguredOtpSender` — selected on
  every profile except `local` and `sandbox` while `draazy.providers.whatsapp.enabled` is false —
  throws on every send. (Sandbox already sends through WhatsApp, §3.1.) Set the flag plus the `WHATSAPP_*`
  credentials (ADR-020: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_OTP_TEMPLATE_NAME`,
  `WHATSAPP_OTP_TEMPLATE_LANG`) before the first useful deploy. The token must be a **System User** token;
  the one the App Dashboard offers expires in 24 hours. **Before turning the flag on, add a spend cap on the
  Meta billing account**: `OtpService` throttles per *recipient*, so walking thousands of valid-looking
  numbers gets a fresh budget for each one. On WhatsApp that is worse than a bill — sends to non-WhatsApp
  numbers drag the sending number's quality rating down, which cuts the daily messaging limit and takes
  sign-in itself offline days later.
- **Backups.** The dev database is a lightweight, single-node database; do not rely on it for recovery. A
  scheduled logical dump to R2 is the stopgap until the database is upgraded to a Managed Database.
- **The anonymous rate limiter is bypassable until `INTERNAL_PROXIES` is set (§4).** Not a boot failure and
  not visible in any log — it simply does not do what it looks like it does.
- **Postgres TLS is `require`, not `verify-full`.** `application-sandbox.properties` pins `sslmode` so pgjdbc's
  default `prefer` cannot silently fall back to plaintext, but `require` does not authenticate the server, so
  an active MITM is still possible. Raising it means baking the database CA into the image and adding
  `sslrootcert`; `FLYWAY_DB_URL` needs the same in the URL itself, because Flyway builds its own DataSource
  and the Hikari property does not reach it.
- **The `*.ondigitalocean.app` URL stays public.** It is safe only while `ORIGIN_SHARED_SECRET` is set (§4).
- **Rollback.** Redeploying an earlier ref restores earlier code (secrets are not versioned, §5); Pages keeps
  prior deployments and rolls back from the dashboard. Neither reverses a Flyway migration — the database
  only moves forward.
- **GitHub Actions are tag-pinned, not SHA-pinned.**

---

## 8. Logs, errors and alerts on DigitalOcean — $0

Nothing here costs money; non-critical logs are not worth paying to keep.

| Signal | Where it lives | Retention |
|---|---|---|
| Runtime logs (ECS JSON on stdout, every line carries `traceId`) | App Platform → Runtime Logs, `doctl apps logs <app> --type run --follow` | live only — DO keeps none |
| Build / deploy logs | App Platform → Activity | 90 days (DO) |
| Every backend `ERROR` and every sandbox/prod UI crash, deduplicated, PII-scrubbed | `error_event` → Admin ▸ Error log | 30 days after first seen |
| Outbound provider calls (ZeptoMail, WhatsApp, Cashfree), with `trace_id` | `provider_call` → Admin ▸ Settings call log | 30 days |
| Critical/high privileged actions | `audit_log` → Admin ▸ Audit trail | 365 days (CERT-In 180 d, DPDP Rule 6 one year) |

**Finding a bug.** A user quotes the reference on the error screen, or an API error body carries
`traceId`. Search it in Admin ▸ Error log; the same id is on the runtime-log lines and on
`provider_call.trace_id`. Scheduled-job errors carry `job-<Class.method>-<id>`.

**Do not enable log forwarding.** OpenSearch and Datadog are paid; Better Stack's free plan keeps
3 days, which adds nothing the error table does not already hold for 30.

**Free alert policies** are in the app spec (§5): `DEPLOYMENT_FAILED`, `DOMAIN_FAILED`, CPU > 85 % and
memory > 90 % over 10 minutes, and more than 2 restarts in 5 minutes. They only reach someone once an email
destination is set: App Platform → Insights → alerts.

**One free Uptime check** (DO credits one per month): Monitoring → Uptime, HTTPS
`GET https://sandbox.draazy.com/api/actuator/health`, alerts on downtime and SSL expiry to the owner's
email. A second check is $1/month — not needed.

---

## 9. Manual verification

How to prove a deployed environment works. The Playwright suite already proves the app's logic
against mocks; this section covers only what it cannot reach:

- **Real vendors** — WhatsApp OTP, Cashfree payments and webhooks, R2 storage, Google Maps,
  Cashfree Secure ID, Turnstile.
- **Deployed wiring** — the Pages proxy, `ORIGIN_SHARED_SECRET`, cookies, CORS on R2.
- **Real devices** — camera capture, touch, Android back, iOS Safari.

| Environment | What to run | When |
|---|---|---|
| local | `e2e\run-fast.ps1 -Full` green | Before any deploy. A red suite does not go to sandbox. |
| sandbox | §9.3 + §9.4 (full regression) | Before every production release |
| prod | §9.3 + §9.5 (smoke) | After every production deploy, ~20 minutes |
| both | §9.6 (logs) | After every run |

### 9.1 Ground rules

- **Every login is a real WhatsApp OTP.** The fixed OTP code, the "any code works" sender and the
  self-grant Verified badge are `@LocalOnly` and do not exist outside `local`
  ([`system/profiles.md`](./system/profiles.md#local-only)). There is no shortcut, and adding one to
  a deployed environment would be a login bypass.
- **Maker-checker needs two operators.** Rent-agreement refund approval refuses the same person on
  both sides, so each environment needs a second back-office account with the relevant permission,
  not a second administrator.
- **Production never-do list** — these touch real people:
  - Never **approve** a test listing. It goes public, into search, sitemaps and alerts.
  - Never **unlock a real owner's contact** from a test account. That discloses a real person's
    number for no purpose (DPDP).
  - Never **message, offer on, or book a visit** to a real user's listing.
  - Never create a **deal or tenancy** against a real user.

### 9.2 Test accounts

Mobile numbers live in the team password manager, never in this repo.

| Actor | Role | Sandbox | Prod |
|---|---|---|---|
| Buyer, free tier | `buyer` | team member's number | company SIM |
| Buyer, paid plan | `buyer` | team member's number | company SIM (see §9.7) |
| Tenant | `buyer` holding a tenancy | team member's number | sandbox only — a tenancy needs a counterparty |
| Owner, free tier | `owner` | team member's number | company SIM |
| Owner, paid plan | `owner` | team member's number | company SIM (see §9.7) |
| Staff, one per team in use | `staff` | team member's number | company SIM |
| Admin × 2 | `admin` | team members' numbers | company SIMs |

Keep free-tier accounts even once paid ones exist: an unlimited account never hits a gate, so it
cannot tell you the gate works.

### 9.3 Wiring — both environments, no login

Set `HOST` to `https://sandbox.draazy.com` or the production origin, and `API_URL` to the App Platform
default ingress of that environment.

```bash
curl -fsS "$HOST/api/actuator/health"                                      # {"status":"UP"}
curl -fsS "$HOST/" | grep -c '<div id="root"'                              # 1
curl -fsS -D - -o /dev/null "$HOST/api/properties" | grep -i content-type  # application/json
curl -s -o /dev/null -w '%{http_code}\n' "$HOST/api/me"                    # 401, not 500
curl -s -o /dev/null -w '%{http_code}\n' "$API_URL/api/properties"         # 403
```

Health alone proves nothing: a mismatched `ORIGIN_SHARED_SECRET` keeps health green while every real
`/api` call answers 403. The third line is the real check — an HTML content type means the SPA shell
answered instead of the API. Reading the results:

| Result | Meaning |
|---|---|
| `/api/properties` is 200 with an empty list where the seed should be 38 listings | The request never reached the backend: `API_ORIGIN` is wrong and something answers with the SPA shell |
| 502 | `API_ORIGIN` or `ORIGIN_SHARED_SECRET` is unset on Pages |
| 403 through `$HOST` | The two copies of `ORIGIN_SHARED_SECRET` differ |
| 200 from `$API_URL/api/properties` | The origin gate is off: anyone with the URL is served |

Then in a browser: the catalogue renders cards, a listing detail page opens, and the map appears. A blank
map with a console error is `VITE_GOOGLE_MAPS_API_KEY` — missing from the build or referrer-restricted to
the wrong hostname.

**Cookie topology — the only test that proves it** (§1; Playwright structurally cannot perform it): sign
in at `$HOST`, wait past the 15-minute access-token expiry without refreshing or navigating, then make one
authenticated request. If it survives, the refresh cookie is being delivered *and* the edge forwards
`Cookie` to the proxy target. If the session dies, the cookie is being withheld silently — check that
nothing points a second hostname at the backend.

### 9.4 Sandbox — full regression

Test **journeys across roles**, not pages: most production bugs sit at the hand-off between two
actors. Each journey links the flow doc that defines the expected behaviour. Run the ones marked 📱 on
one Android phone (Chrome) and one iPhone (Safari) as well as desktop.

**A. Sign-in** 📱 — [auth](./flows/consumer/auth.md)
- [ ] Consumer signs up by mobile; the OTP arrives on WhatsApp within a minute
- [ ] Wrong OTP is refused with a clear message; resend works
- [ ] Session survives a refresh; sign-out ends it
- [ ] Staff and admin sign in at `/staff-login` and land in their own console, not the consumer app
- [ ] Two devices on different networks show two different client IPs in the back-office audit/rate-limit
      views (proves `X-Forwarded-For` survives the proxy chain; relevant before widening `INTERNAL_PROXIES`)

**B. Owner lists a property** 📱 — [list-property-wizard](./flows/consumer/list-property-wizard.md)
- [ ] Free owner completes the wizard with photos taken on the phone
- [ ] Photos load back from R2 (a broken image here is R2 CORS)
- [ ] Map pin and locality are right
- [ ] Listing lands as pending; a second listing is refused at the free-tier limit

**C. Verification** — [property-verification](./flows/admin/property-verification.md)
- [ ] Staff sees the listing in the queue; approve stays disabled until every check is ticked
- [ ] Approve publishes it; the owner is notified
- [ ] Reject on a second listing: the owner sees the reason

**D. Discovery** 📱 — [search-listings](./flows/consumer/search-listings.md), [property-detail](./flows/consumer/property-detail.md), [societies](./flows/consumer/societies.md), [saved-alerts](./flows/consumer/saved-alerts.md)
- [ ] The listing from C appears in search, with filters and on the map
- [ ] Property page, society page and locality page render
- [ ] Save the property and a search; a matching new listing raises an alert

**E. Contact gate** 📱 — [contact-gate-leads](./flows/consumer/contact-gate-leads.md)
- [ ] Free buyer reveals contacts up to the free allowance, then hits the gate
- [ ] The owner sees the enquiry in their inbox

**F. Payments** 📱 — [plans-billing-refer](./flows/consumer/plans-billing-refer.md)
- [ ] Buy a plan with a Cashfree sandbox test card; the plan activates **from the webhook**, not
      from the browser redirect (close the tab before returning and it must still activate)
- [ ] The buyer from E is no longer gated; `/me/entitlements` agrees
- [ ] An abandoned checkout grants nothing; a second checkout while one is unpaid names the first
- [ ] The payment appears in admin finance

**G. Visit → offer → deal** — [schedule-visit](./flows/consumer/schedule-visit.md), [deals-offers-finalization](./flows/consumer/deals-offers-finalization.md)
- [ ] Buyer books a visit; owner confirms and completes it
- [ ] Buyer offers, owner counters, buyer accepts
- [ ] Buyer requests finalization, owner accepts; the deal closes (and a rental creates a tenancy)

**H. Tenancy** — [rent-tenancy](./flows/consumer/rent-tenancy.md)
- [ ] The tenant sees the tenancy; the owner's rent ledger records a payment

**I. Identity verification** 📱 — [contact-gate-leads §9](./flows/consumer/contact-gate-leads.md#9-identity-verification-hardware-checklist), [users-kyc](./flows/admin/users-kyc.md)
- [ ] Capture front, back and selfie on a real phone camera
- [ ] Staff sees all three images; approval requires confirming the server-chosen pose
- [ ] The badge appears on the user and on their listings; the WhatsApp decision message arrives

**J. Rent agreement** — [rent-agreement](./flows/consumer/rent-agreement.md), [service-queues](./flows/ops/service-queues.md)
- [ ] Pay for an agreement; it reaches the drafting desk
- [ ] Draft is shared, the customer accepts, the final document is delivered
- [ ] Refund: one operator requests, a different one approves; the refund shows in Cashfree

**K. Everything else**
- [ ] Flatmates: post a room and a seeker post; ops moderates them — [flatmates](./flows/consumer/flatmates.md), [flatmate-moderation](./flows/ops/flatmate-moderation.md)
- [ ] Support ticket raised, answered by ops, closed — [support-tickets](./flows/consumer/support-tickets.md)
- [ ] Report a listing; it reaches trust & safety — [trust-safety-reports](./flows/admin/trust-safety-reports.md)
- [ ] Referral link signs up a new user and credits the referrer — [plans-billing-refer](./flows/consumer/plans-billing-refer.md), [referrals-fraud](./flows/ops/referrals-fraud.md)
- [ ] Calculators and services hub — [services-calculators](./flows/consumer/services-calculators.md)
- [ ] Admin analytics, finance and enquiries reflect A–J — [analytics](./flows/admin/analytics.md), [finance](./flows/admin/finance.md), [enquiries-funnel](./flows/admin/enquiries-funnel.md)
- [ ] Notifications and chat live updates (SSE) keep flowing for 2+ minutes
- [ ] Scheduled jobs log their runs in the runtime logs, with no repeating errors

### 9.5 Production — smoke

Short, mostly read-only, and restricted to test accounts. Respect the never-do list in §9.1.

- [ ] §9.3 wiring, against the production origin
- [ ] Consumer sign-in: OTP arrives on WhatsApp
- [ ] Staff sign-in at `/staff-login`: password, then an authenticator code (first time: scan the QR, save the recovery codes); the right console loads
- [ ] Browse without signing in: search with a filter, the map, one property page, one society page, `/plans`
- [ ] Test owner submits a listing with a photo → it reaches the verification queue → staff **rejects** it
- [ ] Test buyer opens a real listing and sees the contact gate — **stop there, do not unlock**
- [ ] Test buyer raises a support ticket; staff answers and closes it
- [ ] Payment — only when payment code changed since the last check; see §9.7

### 9.6 After every run — logs

- [ ] Admin ▸ Error log (§8): no new `ERROR` since the deploy started (runtime logs keep nothing, so use
      `doctl apps logs <app> --type run` only for a live look)
- [ ] Admin ▸ Error log: no `Refund or reconcile` entry — it means money was taken and nothing was
      granted (subscription, service-request and amendment settlement each log it)
- [ ] Cashfree dashboard → webhooks: every delivery in the window answered 200
- [ ] WhatsApp Manager: OTP messages delivered, not failed on template or token
- [ ] DigitalOcean → app → Insights: the spec's alerts exist and have an email destination

### 9.7 Production payments today

Plan purchases have **no refund path** in the platform: admin finance reports refunds as a literal
zero ([finance §5.11](./flows/admin/finance.md), D63). So a real purchase followed by a Cashfree-dashboard
refund leaves the subscription active and finance overstating revenue by that amount.

Until §9.8 lands: buy the cheapest real plan on the test owner once, when payment code first ships to
production and again whenever it changes, and **keep it** rather than refunding. That account then
doubles as the paid test owner. Record each purchase in the team finance sheet so it can be excluded
from reported revenue.

### 9.8 Not built yet

Each of these moves a production check from "avoid" to "safe to run every deploy":

- **Hidden internal plan** — unlimited contacts and listings, never listed on `/plans`, granted only
  by an admin with an audit row. Entitlements already derive from the subscribed plan
  (`EntitlementService`), so this needs no bypass flag.
- **Test-account marker** — listings, leads, payments and page views from marked accounts excluded
  from public search, sitemaps, alerts, analytics and finance. Unblocks approving a test listing and
  the full contact-gate journey in production.
- **₹1 internal price** — a server-side price override for marked accounts only, never taken from
  the client, so a live payment can be checked on every deploy.
- **Plan refunds (D63)** — so a test purchase can be returned without leaving the ledger wrong.
