# Profiles

Four tiers, in the order a change travels from a keyboard to a stranger's phone.

| # | Activated as | What it is | Data | Secrets |
|---|---|---|---|---|
| 1 | `local` | a developer's machine | `draazy`, schema + demo seed | `.env.local`, git-ignored |
| 2 | `local,e2e` | the Playwright suite | `draazy_e2e`, schema + seed, wiped freely | none needed |
| 3 | `sandbox` | the shared test environment | DigitalOcean dev database, schema + demo seed | GitHub `SANDBOX_*` repository secrets |
| 4 | `prod` | real users | DigitalOcean Managed PostgreSQL, schema only | GitHub `PROD_*` repository secrets |

Each tier has a file: `application-local.properties`, `application-e2e.properties`,
`application-sandbox.properties`, `application-prod.properties`. All four layer on
`application.properties`, which holds every value that is the same everywhere.

Every deployed tier names **exactly one** profile, and its file is self-contained: its own
datasource, secret lookups, cookie flags, throttles and proxy CIDR. Sandbox and production read the
same variable *names* and completely different *values* — separate databases, separately prefixed secrets
and Cashfree credentials.

## The rule that makes the rest make sense

**Profiles are not mutually exclusive, and the last one wins.** `SPRING_PROFILES_ACTIVE` is a list,
not a choice; when two profile files define the same key, the profile named *later* wins.

- `local,e2e` — `e2e` is a *delta* on `local`. It keeps the demo seed and overrides only what a test
  run needs differently: its own database, a fixed OTP code, rate limits raised out of the way.
  Running `e2e` alone gets the production stubs, which throw.
- `prod,local` — the dangerous one. It resolves `local`'s insecure-cookie setting *over* `prod`'s,
  producing a deployment that thinks it is production and ships session cookies without `Secure`.
  `LocalProfileGuard` refuses to finish booting on that combination.

Deployments do not use deltas. Sandbox is standalone (it used to be `prod,sandbox`, which ran the
profile named `prod` against fabricated listings and made the order of two words load-bearing).

Standalone means `application-sandbox.properties` is a near-copy of the prod file, so a hardening
line added to one and not the other would make sandbox a less faithful rehearsal.
`SandboxProfileContractTest` closes that: the two files must be identical except for an explicitly
declared list of divergences, today one entry (`spring.flyway.locations`). Adding a setting to prod
fails that test until it is copied across or the difference is written down.

## Vendor flags are not the profile

Each vendor seam is wired by a `draazy.providers.<vendor>.enabled` flag, never by `@Profile("prod")`.
"Which environment is this" and "do we hold vendor credentials" are independent: coupling them
would stop production running on mocks during an outage or soft launch, and stop a developer with
real sandbox keys exercising the real client. It matters most for WhatsApp, whose *only* sandbox is
a free test number on a real app — same host, same code path.

The default is **off**: a missing value must land on the behaviour that cannot cost money or message
a stranger's phone.

With a flag off the real client bean does not exist, which is stronger than a runtime `if`: no code
path reaches a vendor. So the flag must not be read to decide behaviour either —
`@ConditionalOnProperty` compares the raw string to `"true"`, while a bound `boolean` also accepts
`on`, `yes` and `1`, so an `if (props.enabled())` would eventually contradict the wiring. Depend on
which bean exists.

Credentials are environment-supplied with **no committed default** (the webhook secret is the one
exception, and it refuses to stay itself outside `local`). A blank key produces confusing vendor
401s, so `CashfreeClient` refuses to construct when the flag is on and a key is missing — boot
fails, not the first user's checkout.

Vendor property records override `toString()` to redact tokens, because the default would leak them
in places nobody writes deliberately (a stray `log.debug("{}", props)`, an exception message,
Spring's binding-failure diagnostics); a bearer token in a log must be rotated.

**API versions are pinned explicitly and per call site.** Cashfree versions its products separately
(Payment Gateway `2025-01-01`, Secure ID `2024-12-01`), so a shared constant would send the wrong
version for one; each caller declares what it was written against. Meta deprecates Graph API
versions on a rolling ~2-year clock, so `apiVersion` is a greppable value, not an implicit "latest".

**Timeouts are set explicitly.** Most HTTP clients default to "wait forever", which turns a vendor
slowdown into exhausted request threads.

**Vendor error strings never reach a user.** They can quote the request back (an account number, a
mobile) and name our merchant configuration. `CashfreeException` is deliberately outside the
`ApiException` hierarchy: those carry a status because they describe something the caller did, and a
vendor outage is not the caller's mistake. Falling through to a generic 500 is honest.

**Templates.** Meta will not carry free-form business-initiated text outside a 24-hour service
window, so both the OTP and the identity decision go out as approved templates, named with language
*and* locale (`en_US` does not answer to `en`). The OTP template is required — a login cannot fall
back — while a blank identity template name means "skip the WhatsApp leg" (the in-app notification
row is the record; this is only the nudge). The access token must be a **System User** token; the
one the App Dashboard offers on the WhatsApp setup page expires in 24 hours ("logins stopped working
overnight"). `phoneNumberId` is the numeric ID of the sending number, not the number: test and
production are two IDs against the same code.

**Email (ZeptoMail).** `draazy.providers.zeptomail.enabled` swaps `LoggingEmailSender` for
`ZeptoMailEmailSender`. Email is best-effort everywhere: the send runs after commit, a vendor failure
is logged as Zoho's error codes only (its messages can echo the recipient) and swallowed, because
every email duplicates something the user can already reach. Neither sender logs the body — it can be
a staff invite link, which is a credential.

## 1. `local`

```powershell
cd backend; .\run-local.ps1
```

Turns on three things that are holes anywhere else: an OTP sender that prints the code to the log, a
file store that writes identity captures to local disk, and `POST /me/verification/identity/simulate`,
which grants the Verified badge on request. All three are `@LocalOnly` — opted *into* by `local`
rather than merely excluded from `prod` (D147), so a run that names no profile gets the production
counterparts, which exist only to throw.

Naming the profile is not sufficient. `LocalProfileGuard` also requires `DRAAZY_DEV_MACHINE` in the
process environment, because a profile name is a string in a file and files get copied. Set it once
per machine; nothing in the repository sets it. See [docs/LOCAL_DEV.md](../LOCAL_DEV.md).

`spring.flyway.locations` adds `classpath:db/seed`, so Flyway builds the demo data on boot and the
database is reproducible: drop it, start the app, get the same 38 listings back. `local` and `e2e`
also add `classpath:db/seed-staff`, which gives every back-office account the email
`<mobile>@staff.draazy.test`, password `Draazy-dev-pass1` and an enrolled authenticator. Sandbox must
never list it: those credentials are in the repository.

### The dev object store

`DevObjectStore` stands in for an object store's signed-URL endpoint so a document the API returns
carries a `url` that actually opens. Production storage does not know it exists, and no authorisation
check is relaxed to make the preview work.

**The URL opens without a session because that is what a signed URL is.** A browser opening a
document in a new tab, or rendering it in an `<img>`, sends no `Authorization` header; R2's signed
URLs work because the signature in the query string *is* the credential. Here the URL is minted only
by a server that already answered a document read, HMAC-signed with a secret generated fresh each
boot (a restart invalidates every outstanding URL; it can never become a fixed secret in a
properties file), and expires after 30 minutes. A guessed key cannot be fetched; a leaked URL stops
working.

**A separate `SecurityFilterChain`, not a line in `SecurityConfig`.** That allowlist is production's,
and a profile-conditional entry would mean the file documenting what is public no longer says what is
public. A chain that exists only under `local`, in the same file as the thing it fronts, cannot be
inherited by accident: `@LocalOnly` keeps the bean out of every other profile, `LocalProfileGuard`
refuses to boot if `local` is named on something deployment-shaped, and the controller is absent
there too. `securityMatcher` scopes the chain to the storage path and it authenticates nobody.

**Public objects are served unsigned; the canonical path is the whole authorisation rule.** Anything
under `public/` was written to the stand-in public bucket and has no credential to present;
everything else must carry the signature and deadline. The check is a canonical-path check, never a
textual prefix, so `public/../documents/...` cannot turn a private document into an unsigned one. One
mapping serves both, so there is no pattern-precedence question. A bad signature is a 404 like a
missing file, so the endpoint is not an oracle for which keys exist; the signature comparison does
not return early on the first differing byte. `Content-Disposition: inline` so the browser previews
rather than downloads; `Cache-Control: no-store` on the private half, because the URL is a
credential and a shared cache holding the response is an unauthorised copy of the document. The
public half is cacheable, as a CDN object is.

**Both URLs are relative.** Each is loaded as an `<img>` (a listing photo, a KYC document), and two
gates apply. The page CSP is `img-src 'self' data: blob: https:`, which refuses a plain-http
`localhost:8081` absolute URL; and the create-listing wizard hashes each photo by drawing it to a
canvas, which taints on a cross-origin image without `Access-Control-Allow-Origin`. A relative URL
goes through the Vite proxy and is same-origin, so both gates fall away. The public URL is also
permanent, because a listing photo URL is persisted on the listing row. The cost: production's public
URL is R2's own and cross-origin, so that bucket *does* need to send `Access-Control-Allow-Origin` —
deployment configuration this repository cannot assert, recorded on `FileStorage.storePublic`.

**Content type rides in a sidecar file.** The on-disk key is a UUID with no extension, so
`Files.probeContentType` has nothing to work from and `application/octet-stream` would make the
browser download. A real object store keeps it as metadata; a directory does not, so it gets a second
file.

## 2. `local,e2e`

```powershell
cd backend; .\run-e2e-backend.ps1        # :8081, plus the lane scripts for parallel suites
```

A delta on `local` for the Playwright suite, and **only ever on a developer machine**. The backend
refuses to boot `e2e` without `local` or alongside `prod`/`sandbox`, and both Playwright configs
refuse `CI` and any non-localhost `BASE_URL`. What it changes:

- **Its own database** (`draazy_e2e`). The suite creates and deletes freely; `draazy` would lose the
  demo data, and `draazy_test` would fight the Java suite's exact row-count assertions.
- **A fixed OTP code.** Otherwise every login scrapes the backend log, forcing `workers: 1`.
- **Rate limits raised to 100000.** The real budgets exist to stop humans; hitting them produces
  failures that look like product bugs.

### Keeping a persistent database honest

Rows commit here and survive restarts (a user registered by a spec must still log in after the
backend is bounced), but a database that never rolls back drifts, so:

1. **Reset the baseline at run START, not teardown.** `globalSetup` re-applies the idempotent seed,
   repairing whatever a previous run mutated without deleting independently-registered users.
2. **Assert against fixture invariants, never global counts.** *"Meera owns 4 listings"* survives a
   hundred runs; *"there are 38 listings"* does not. Global counts belong to `draazy_test`, which
   `TestDatabaseIsolationTest` keeps empty so they can be exact there.
3. **Mutating specs mint their own uniquely-named data** (a unique mobile or slug per run) and assert
   on that, so repeat and parallel lane runs never collide.

For a hard reset after a schema or seed change, drop and recreate the database and re-migrate — the
only time persistent users are intentionally cleared.

## 3. `sandbox`

```
SPRING_PROFILES_ACTIVE=sandbox
```

The shared test environment on DigitalOcean App Platform, at `sandbox.draazy.com`. Production
configuration — env-only secrets, `Secure` cookies, real TLS, real rate limits — with demo inventory.
It uses its own DigitalOcean database through its own `SANDBOX_*` GitHub repository secrets, and its
own Cashfree account; no value is shared with production.

Because it no longer names `prod`, it is named explicitly in `LocalProfileGuard.DEPLOYMENT_PROFILES`.
That list tells the guard an instance is a real deployment rather than a laptop; sandbox used to
satisfy it for free by carrying the word `prod`. Sandbox sets `trusted-proxies=none`, so the
load-balancer signal does not fire there either — without the entry, a public environment holding
real credentials would have been treated as local.

The seed is a *repeatable* Flyway migration (`R__zz_DML_dev_demo_data.sql`) and re-runs whenever its
checksum changes. **A database that has been seeded can never be promoted to production.** Sandbox
and production are separate databases for that reason, and nothing copies one to the other.

Back-office access starts through the single-admin bootstrap variables in `DEPLOY.md`
(`BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_MOBILE`, optional name, optional recovery nonce), not by
manually writing a password hash into the database.

Deploy contract, variables and secrets: [docs/DEPLOY.md](../DEPLOY.md).

## 4. `prod`

```
SPRING_PROFILES_ACTIVE=prod          # baked into backend/Dockerfile
```

Real users. Migrations only — `spring.flyway.locations` is re-pinned to `classpath:db/migration`
alone, so no arrangement of profiles can drag the seed into a live catalogue.

Every secret is a bare `${ENV}` lookup with **no `:default`**, so a missing value fails the boot
rather than falling back to a committed placeholder. `ProdProfileContractTest` pins that: it reads
`application-prod.properties` and asserts each required variable is undefaulted. **Adding a new
`${ENV}` to that file means adding it to `REQUIRED_DEPLOY_VARIABLES` in the same commit**, or the
test fails — and `SandboxProfileContractTest` separately fails until the same lookup exists in the
sandbox file.

The image bakes `SPRING_PROFILES_ACTIVE=prod` rather than leaving it to the platform, so a container
started with no profile cannot boot on the base file's development-friendly defaults and report
itself healthy.

## Where each tier is named

| Place | Value |
|---|---|
| `backend/run-local.ps1` | `local` |
| `.vscode/tasks.json` | `local` |
| `backend/run-e2e-backend.ps1`, `run-lane-*.ps1` | `local,e2e` |
| `backend/src/test/resources/application.properties` | `local` (the Java suite) |
| `backend/Dockerfile` | `prod` |
| `backend/deploy/do-app-sandbox.yaml` | `sandbox` |

The Java suite runs under `local` because that wires the keyless providers its ~880 tests assert
against. It is exempt from the `DRAAZY_DEV_MACHINE` check, keyed on `spring-boot-test` being on the
classpath — a `test`-scoped dependency not in the packaged application, which no file, flag or
variable can switch on.

## Local only

Rationale relocated from `LocalOnly` Javadoc.

`@LocalOnly` marks a bean that exists only to make the product demoable without vendor keys and
would be a security hole anywhere real users are: the mock OTP sender ("any code works"), the
local-disk file store, the self-service Verified badge grant.

**Why an annotation rather than `@Profile("!prod")` repeated three times.** A negative profile
expression is a denylist: it registers the bean in every profile that is not the exact string
`prod`, including the no-profile `default` that a laptop and a mis-provisioned container are equally
likely to run under. Absence from production then depends on a positive deploy action
(`SPRING_PROFILES_ACTIVE=prod`) matching an unverified magic string, so a container whose profile is
`production`, or whose variable never got set, boots green while handing every caller a login that
accepts any six digits and an endpoint that grants its own identity badge. Nothing in the logs says
so; the app looks healthy.

Composed onto `@Profile("local")`, the default reverses: mock beans appear only where `local` is
*named*, and every unrecognised, mistyped or missing profile falls through to the production
implementation. A wrong profile then costs a missing mock (noisy) rather than a present one (silent).

Naming the profile is necessary but not sufficient: `LocalProfileGuard` additionally requires
`DRAAZY_DEV_MACHINE` in the process environment — a variable that exists in no committed file —
before it lets a `local` boot finish. The beans are still registered by the profile alone; the guard
stops the application serving traffic with them present.

The annotation is also the handle `LocalProfileGuard` uses to find these beans at startup and
`SpecCoverageTest` uses to exclude their routes from the published contract, neither of which can be
done reliably by pattern-matching a profile string.

## Local profile guard

Rationale relocated from `LocalProfileGuard` Javadoc.

**What is left after the allowlist.** `@LocalOnly` closes the case where a deploy forgets to say
`prod`. It does not close the opposite case, where a deploy *says* `local` — an environment file
copied from a developer's machine, a staging box stood up "the same way we run it locally", or a
`SPRING_PROFILES_ACTIVE=local,prod` added to get readable logs back. Each is a positive statement, so
the allowlist honours it and hands a real, internet-reachable deployment a login that accepts any six
digits, uploads that land on the container's ephemeral disk, and
`POST /me/verification/identity/simulate` — any account can award itself the Verified badge owners
use to decide who may contact them. The symptom is not an error; it is a platform whose trust signals
quietly mean nothing.

Two independent checks run at startup, catching different mistakes.

**1. Has this machine attested to being a developer's?** `local` on its own is a string in a file,
and files get copied, so the `DRAAZY_DEV_MACHINE` environment variable must be present as well. It
appears in no committed file (not the `.env` template, a Dockerfile, or `application*.properties`)
and is read with `System.getenv` rather than `Environment.getProperty`, so that adding it to a
properties file cannot satisfy it: Spring's relaxed binding would resolve `DRAAZY_DEV_MACHINE` from a
`draazy.dev-machine` entry, putting the attestation back into what a copied file can carry. It has to
be exported by a human on the machine it describes — the one action a mis-provisioned deploy cannot
perform by accident. Inferring the same thing from the `prod` profile or a configured load balancer
was not enough alone: a container that terminates its own TLS and receives
`SPRING_PROFILES_ACTIVE=local` from a copied environment file matches neither marker, and boots
silently with every stub live.

**2. Does this instance look like a deployment regardless?** The inference is kept, because it
catches the opposite error: someone who *has* exported the variable (a developer's own shell profile,
an image built from it) and then runs the result behind a load balancer. Two statements prove this
instance is not a laptop: the `prod` profile is active (so `local` beside it is a contradiction), or
`draazy.security.trusted-proxies` names a load balancer (a developer's machine has nothing in front of
it and leaves that at `none`).

Both run as `SmartInitializingSingleton`s, after every bean exists but before the connector accepts
traffic: the process dies during boot rather than serving one request with a mock verifier behind it.

**Deployment profiles are defined once.** `sandbox` is in the list because it became standalone
rather than `prod,sandbox`: these checks key on the profile *name*, so once sandbox stopped saying
`prod` it stopped looking like a deployment, and a sandbox that also named `local` would have booted
with the mock OTP sender and badge-granting endpoint live. The list is public and read by
`OtpService.rejectFixedCodeInProduction` too, because a definition held in two places fails open when
only one is updated — which is how splitting the sandbox profile disarmed the fixed-OTP-code guard,
which held its own copy of the string `prod`.

**The refresh-cookie check.** `application-prod.properties` sets `secure=true` and
`application-local.properties` sets `false`, which looks settled and is not: Spring resolves a
property from the *last* profile that defines it, so `prod,local` yields `false` and `local,prod`
yields `true`, from two lists that read as the same list. Nobody writes `prod,local` on purpose, but a
deploy that appends a profile to an existing variable produces it. Without `Secure` the browser sends
a thirty-day credential over any plain-HTTP request to the site (a stylesheet, a typed redirect, a
captive portal's interception) with no symptom, and the cookie loses its `__Host-` prefix, dropping
host-binding. The guard therefore reads the *resolved* value, reusing `deploymentEvidence` so "is this
a deployment?" is answered in one place and an instance that never activates `prod` but sits behind a
load balancer is caught too. `REFRESH_COOKIE_SECURE=false` is refused as well: a TLS-terminating proxy
still speaks HTTPS to the browser, the only party the attribute concerns.

**The automated-test exemption.** The suite activates `local` for all tests because that profile wires
the keyless, deterministic providers they assert against. Requiring the variable there would mean
every developer and CI job exports it before `mvn verify` (omission shows up as a wall of unrelated
context-load failures) or the value is committed somewhere — the exact channel this control closes.
The exemption is keyed on a marker class from `spring-boot-test`, a `test`-scoped dependency: it is on
the classpath Surefire and the IDE test runner assemble, not in the packaged application
(`spring-boot:run` does not use the test classpath either), and it cannot be turned on from
configuration — no file, environment variable or command-line flag reaches it. The residual case,
someone packaging a test-scoped dependency into a deployable artefact, is still covered by
`deploymentEvidence`.
