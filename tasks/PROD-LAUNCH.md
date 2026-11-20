# Production launch plan

Written 2026-11-19 from a production audit (score ~45/100, **blocked**) and two security reviews
(no findings at confidence >= 7/10). Work top to bottom (phases are dependency-ordered). Tick a box
when its "Done when" is true; delete a phase once all its boxes are ticked.

**Who does what.** `[AGENT]` = code, config, docs or tests an AI agent can do in this repo.
`[OWNER]` = needs a dashboard, login, money or human decision (GitHub admin, DigitalOcean,
Cloudflare, Meta, Cashfree, Google Cloud, lawyer). An agent must **not** attempt `[OWNER]` steps; list
them back to the owner. Where a task is both, the agent does its part and stops.

## 0. Rules for the agent doing this work

- Read `AGENTS.md`, `tasks/NOW.md`, then this file. `AGENTS.md` wins on conflict.
- Branch is `feature/e2e-testing`. **Commit only when the user asks. Never push.** Never revert,
  stash or reset files you did not change (147 dirty paths on 2026-11-19).
- New feature or architectural change: show the plan and wait for approval before coding.
- Per fix: `e2e\run-fast.ps1` on the specs it reaches. Before a commit: reviewers, then
  `node scripts/check-comments.mjs --staged`, then `e2e\run-fast.ps1 -Full`.
- Never `mvnw clean`; never `DROP DATABASE` on `draazy`, `draazy_test`, `draazy_e2e*`.
- Never edit an applied Flyway migration. The next free slot is in `tasks/NOW.md`.
- The 26.11 squash (17 domain files) swaps old Flyway history on first migrate. On the first sandbox
  deploy after it, check the `migrate` job logs `Swapped 84 pre-consolidation history rows`; a
  pre-squash image cannot migrate the swapped database, so roll back past it only from a backup.
- Never put a real secret in the repo, a log or a chat message. The owner generates secrets; they
  live only in GitHub environment secrets.
- Background reading: `docs/DEPLOY.md` (topology, env vars, §7 known blockers, §9 manual checks),
  `tasks/OWNER-CHECKLIST.md`, `backend/src/main/resources/application-prod.properties`,
  `backend/deploy/do-app-sandbox.yaml`, `.github/workflows/deploy.yml`.

## Current state (2026-11-19)

| Area | State |
|---|---|
| Sandbox | Live at `sandbox.draazy.com`; DO app `draazy-api-sandbox` (region `blr`), Cloudflare Pages, R2 |
| Production | **Does not exist.** No prod workflow, no prod app spec, no prod database |
| Deploy workflow | `.github/workflows/deploy.yml` is sandbox-only (`confirm == 'sandbox'`, `environment: sandbox`, `SANDBOX_*` secrets); jobs: gate, backend, frontend-build, frontend-publish, lighthouse |
| Prod Spring profile | `application-prod.properties` is complete and fail-fast (no secret defaults); `ProdProfileContractTest` and `SandboxProfileContractTest` guard it |
| Database | Sandbox uses a 512 MB DO **dev** database (`production: false`), no reliable backups, one DB user for both roles |
| Branch | `feature/e2e-testing` is 193 commits ahead of `main`; REFER-KYC and REFER-FRIENDS uncommitted |
| Security | Two reviews 2026-11-19: auth, JWT, OTP, staff TOTP, contact gate, webhooks, uploads, KYC crypto, DPDP export/erasure, IDOR, admin SQL, CORS all sound |

### Checked from outside on 2026-11-20 (read-only)

| Check | Result | Action |
|---|---|---|
| Dev machine | macOS now; `pwsh` not installed, so `run-fast.ps1` and `graphify.ps1` cannot run | **0.1 [OWNER]** `brew install powershell` before any Phase 1 gate |
| `draazy.com` | 302 → `sandbox.draazy.com` (dashboard rule); NS on Cloudflare; `api.draazy.com` has no record | Expected until 3.4's last bullet |
| Sandbox edge | HSTS, CSP, `X-Frame-Options: DENY` present; direct DO origin returns 403 | OK |
| GitHub environments | `sandbox`, `sandbox-web` only; no `production` | 3.1 |
| `doctl` | Token returns 403 on `/v2/account` (expired or wrong scope) | **0.2 [OWNER]** `doctl auth init` with a read+write token |
| Mail DNS | MX and SPF are Zoho Mail; DKIM `zmail._domainkey` present; DMARC `p=quarantine` with `rua` at `onsecureserver.net` (a GoDaddy leftover) | 3.9: verify ZeptoMail's bounce CNAME, point `rua` to an inbox you read |
| Branch | `feature/e2e-testing` is 220 commits ahead of `main` (last `main` commit 2026-10-14) | 1.4 |
| Cloudflare dashboard (R2, WAF, rate limits, Pages) | **Not verified**: Chrome extension not connected | 3.4: owner confirms each item, or runs `scripts/sandbox-preflight.sh` with a read-only `CF_API_TOKEN` exported in the shell |

---

### Owner rulings, 2026-11-20

- Sizing: **1 API instance + a single-node Managed DB** (no standby). Record both as risks in
  `DEPLOY.md` §7. This makes the 2.4 `pg_dump` to private R2 **mandatory**, not optional.
- Workflow: a **separate `deploy-prod.yml`**; `deploy.yml` stays sandbox-only.
- R2: the owner has created a **prod public + private bucket pair**, separate from sandbox.

- Cost: **MVP, minimum spend, free tier wherever it works.** Re-check every paid line in Phase 2 and 3 against this.
- GitHub: **stay on the Free org plan and go private.** Free ignores environment secrets and protection rules on
  private repos, so every secret is a repository secret (`SANDBOX_*`, `PROD_*`). Branch `feature/prod-setup`
  already drops `environment:` from `deploy.yml`, skips SonarQube Cloud while private, and moves Dependabot to monthly
  (2,000 free Actions minutes/month; one CI run is ~10 billable minutes).

## Phase 0: Go private and hand the agent CLI access

Order matters: secrets first, workflow change second, flip last, or the sandbox deploy breaks in between.

- [ ] **0.1 [OWNER]** `brew install powershell` (needed by `run-fast.ps1` and `graphify.ps1`).
- [ ] **0.2 [OWNER] CLI tokens, kept out of chat.** Store each in the macOS Keychain and export it from `~/.zshrc`
  so the agent's shell sees it:
  `security add-generic-password -a "$USER" -s <name> -w` (it prompts for the value), then
  `export VAR="$(security find-generic-password -s <name> -w 2>/dev/null)"`.
  - GitHub: on the org, make `yatishpatil101` **admin** of `draazy-app` (it is `write`; secrets, visibility and
    packages need admin), then `gh auth refresh -s read:packages,write:packages`.
  - DigitalOcean: token `claude-cli`, 90-day expiry, custom scopes app + database + monitoring + project
    (create/read/update, **no delete**); `doctl auth init --context draazy` and `doctl auth switch --context draazy`.
  - Cloudflare: API token `claude-cli`, 90-day expiry, zone `draazy.com` only. Zone: DNS, Zone Settings,
    Firewall Services, Cache Rules **Read**. Account: Cloudflare Pages **Edit**, Workers R2 Storage **Read**,
    Turnstile **Read**. Keychain name `draazy-cf-token`; export as both `CLOUDFLARE_API_TOKEN` and `CF_API_TOKEN`.
    Widen a scope only when a step needs it.
- [ ] **0.3 [OWNER] Copy the deploy secrets to repository level.** Values can't be read back. Re-enter the ones you
  have, re-copy third-party keys from their dashboards, regenerate the random ones (`openssl rand -base64 48`;
  identity encryption key `openssl rand -base64 32`). A new sandbox identity key makes sandbox KYC test data
  unreadable, which is fine. Run in your own terminal: `pbpaste | gh secret set NAME -R draazy-dev/draazy-app`.
  - The 22 `sandbox` env secrets: `DIGITALOCEAN_ACCESS_TOKEN` and the 21 `SANDBOX_*`; plus `CLOUDFLARE_API_TOKEN`
    from `sandbox-web`. **[AGENT]** copies the 6 variables (they are readable) once 0.2 is done.
- [ ] **0.4 [AGENT]** Verify every name `deploy.yml` reads exists at repo level, then commit `feature/prod-setup`
  (on the user's OK) and open the PR to `main`.
- [ ] **0.5 [OWNER]** Merge the PR, then ask `rohny1` to delete the public fork `rohny1/draazy-app`. Forks of a
  public repo **stay public** after the parent goes private, with the full history.
- [ ] **0.6 [OWNER]** Settings → Danger Zone → Change visibility → Private.
- [ ] **0.7 [AGENT]** Make the `draazy-api` GHCR package private (a public image ships the decompilable backend),
  add DO `registry_credentials` (a `read:packages` token) to the app spec, run a sandbox deploy, and confirm it is green.
- [ ] **0.8 [AGENT]** Delete the now-ignored `sandbox` and `sandbox-web` environments once 0.7 is green.

## Phase 1: Make the code releasable

- [ ] **1.1 [AGENT] Finish REFER-KYC and REFER-FRIENDS.** Follow their entries in `tasks/todo.md`:
  run the reviewers (`react-reviewer` for `.jsx`, `code-reviewer`, `security-reviewer`: referrals touch
  user data), apply the fixes, then `check-comments.mjs --staged` and one shared `e2e\run-fast.ps1 -Full`.
  **Done when:** `-Full` is green and the user has approved the commit.
- [ ] **1.2 [AGENT] i18n route check**, the third open item in `tasks/todo.md`. **Done when:** it is ticked there.
- [ ] **1.3 [AGENT] Backend full suite green.** Run it once (command and shared-DB rules in the
  `draazy-backend` skill). **Done when:** 0 reds, or each red is fixed or recorded in `tasks/todo.md` as pre-existing.
- [ ] **1.4 [OWNER] Merge to `main` and tag a release** (e.g. `v1.0.0`). Prod deploys only from a tag
  or `main`, never a feature branch. An agent may prepare the PR description if asked.

## Phase 2: Production infrastructure in the repo

Ask the user to approve the design of 2.1 to 2.3 before writing them; this is architecture.

- [x] **2.1 [AGENT] `backend/deploy/do-app-prod.yaml`.** Done; checked by `DeploymentManifestTest`. Copy the structure of `do-app-sandbox.yaml`
  (189 lines) and change it for prod:
  - `name: draazy-api-prod`, the same region as the prod database (`blr`).
  - `databases:` must point at a **Managed Database cluster** (`production: true`, `cluster_name`),
    not a dev database.
  - `SPRING_PROFILES_ACTIVE=prod` (never `sandbox`: the sandbox profile re-seeds 38 fake listings and
    78 fake users; see `docs/DEPLOY.md` §2).
  - Split DB credentials: the `migrate` job gets `FLYWAY_DB_*` (schema owner), the service gets only
    `DB_*` (runtime role from `backend/deploy/sql/app-runtime-role.sql`). The service must never carry
    `FLYWAY_DB_PASSWORD`.
  - Every secret in `application-prod.properties` is wired from a `PROD_*` GitHub secret (list in 3.1).
  - WhatsApp template names: only templates that show **Active** in Meta WhatsApp Manager.
  - Alerts as in the sandbox spec, with an owner email destination.
  - Prefer at least 2 instances, or record the single-instance risk in §7 of `docs/DEPLOY.md`.
  **Done when:** a `ProdDeploymentManifestTest` (mirror `SandboxDeploymentManifestTest`) passes,
  asserting the profile is `prod`, the DB is `production: true`, no `FLYWAY_DB_PASSWORD` on the
  service, and every `${...}` in `application-prod.properties` is supplied.
- [x] **2.2 [AGENT] Production deploy workflow.** Done as `deploy-prod.yml` (`DEPLOY.md` §5.2), without
  `environment:` because GitHub Free ignores it on a private repo. Either `.github/workflows/deploy-prod.yml` or a
  parameterised `deploy.yml`. Requirements:
  - `workflow_dispatch` only; the confirm input must equal `production`.
  - `environment: production`, so the owner can add required reviewers in GitHub.
  - Builds only from `main` or a `v*` tag; fails if `github.ref` is anything else.
  - `concurrency: deploy-production`; never cancel in progress.
  - Uses `PROD_*` secrets and `vars`, prod `SITE_URL` (`https://draazy.com`), and the prod Pages project.
  - Keeps the gate checks (Turnstile key present, security-header smoke, foreign-Origin CORS check,
    direct-origin route expects 403).
  - Runs a **pre-deploy DB backup** step before `migrate` (see 2.4).
  **Done when:** `actionlint` (or a YAML lint) passes, a dry run with a bad confirm input fails fast,
  and the sandbox workflow still works unchanged.
- [ ] **2.3 [AGENT] Pin GitHub Actions to commit SHAs** in both workflows (`DEPLOY.md` §7 lists this as
  open). Keep the version as a trailing `# vX.Y.Z` marker. **Done when:** no `uses:` line uses a bare tag.
- [ ] **2.4 [AGENT] Backups and restore runbook.**
  - Add a scheduled logical dump job (`pg_dump` to a private R2 bucket, retention 30 days) or document
    reliance on Managed DB daily backups plus point-in-time recovery. Do both if cheap.
  - Write `docs/DEPLOY.md` §10 "Restore": restore a dump into a fresh DB and repoint the app, with exact commands.
  **Done when:** the doc exists, and 6.3 (restore drill) has a runbook to follow.
- [ ] **2.5 [AGENT] Migration rollback policy.** Add to `docs/DEPLOY.md` §7 (Rollback): migrations are
  forward-only; a bad migration is undone by a new expand/contract migration; snapshot the DB before
  each prod deploy; code rollback = redeploy the previous tag plus a Pages rollback. **Done when:** written.
- [ ] **2.6 [AGENT] `/help/feedback` hardening** (security pass 2, below the reporting bar): reject slugs
  that are not known help articles, and add a retention job like the `/page-views` one. TDD: failing
  test first. **Done when:** backend tests plus the related e2e are green.
- [ ] **2.7 [AGENT] Startup guard for `identity-hash-secret` length** (>= 32 bytes, like the
  origin secret). TDD. **Done when:** boot fails on a short value and the tests are green.
- [ ] **2.8 [AGENT] Prod `docs/DEPLOY.md` sections.** Update §1 topology, §3 env vars and §6 first-time
  setup to cover prod next to sandbox. Delete sandbox-only wording that is now wrong. **Done when:** a
  reader can stand up prod from the doc alone.

## Phase 3: Accounts, secrets and dashboards (owner)

The agent prepares the lists; the owner does the clicks.

- [ ] **3.1 [OWNER] GitHub repository secrets and variables** (`PROD_*`; pushed with
  `scripts/push-repo-secrets.py PROD`).
  **Generate every value fresh; never reuse a sandbox value.** For random secrets use
  `openssl rand -base64 48` (identity encryption key: exactly 32 bytes, base64).
  - `PROD_JWT_SECRET`, `PROD_REFERRAL_SIGNAL_SALT`, `PROD_IDENTITY_HASH_SECRET`,
    `PROD_IDENTITY_ENCRYPTION_KEY`, `PROD_STAFF_TOTP_KEY` (the key id `p1` is in the spec)
  - `PROD_DB_APP_PASSWORD` (the `draazy_app` role); variables `PROD_DB_CLUSTER_NAME`, `PROD_CASHFREE_ENABLED`
  - `PROD_ORIGIN_SHARED_SECRET` (>= 32 chars; the same value goes into the prod Pages `ORIGIN_SHARED_SECRET`)
  - `PROD_CASHFREE_APP_ID`, `PROD_CASHFREE_SECRET_KEY` (**live** keys); `CASHFREE_WEBHOOK_SECRET`
    gets the same value as the secret key
  - `PROD_WHATSAPP_ACCESS_TOKEN` (**System User** token for Meta app `draazy-prod`),
    `PROD_WHATSAPP_APP_SECRET`, `PROD_WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Both apps share one WABA, so the
    phone number ID and template names are copied from the sandbox spec
  - `PROD_ZEPTOMAIL_*`, including the webhook key
  - `PROD_BOOTSTRAP_ADMIN_EMAIL`, `PROD_BOOTSTRAP_ADMIN_MOBILE`
  - `PROD_GOOGLE_PLACES_SERVER_KEY`, R2 credentials
  - `WEB_ORIGINS` = `https://draazy.com` **only** (security pass 2: do not include sandbox)
  - Variable `PROD_INTERNAL_PROXIES` (`DEPLOY.md` §4; **not** `none`, or every visitor shares one rate-limit bucket)
  - Frontend build: secrets `PROD_VITE_GOOGLE_MAPS_API_KEY` (referrer `draazy.com/*`), `PROD_VITE_GA_ID`;
    variables `PROD_VITE_TURNSTILE_SITE_KEY`, `PROD_VITE_VAPID_PUBLIC_KEY`, `PROD_VITE_CASHFREE_MODE=production`,
    `PROD_VITE_PMF_MODE`, `PROD_VITE_POSTHOG_KEY` and `PROD_VITE_POSTHOG_APP_URL` (PostHog project `draazy-prod`);
    shared `VITE_GOOGLE_MAPS_MAP_ID`. Backend `TURNSTILE_ENABLED=true`
- [ ] **3.2 [OWNER] DigitalOcean:** a Managed PostgreSQL 17 cluster in `blr` with a standby node,
  daily backups and PITR, trusted sources = the prod app only, a schema-owner user plus the runtime
  role (`app-runtime-role.sql`). Create the prod app from `do-app-prod.yaml`. Add the alert policies and
  the free Uptime check (`DEPLOY.md` §8).
- [ ] **3.3 [OWNER] DigitalOcean sandbox cleanup:** re-tick Trusted Sources on the sandbox DB (it was
  opened to all IPs on 2026-11-03).
- [ ] **3.4 [OWNER] Cloudflare:**
  - Pages projects `draazy-prod` (on `draazy.com`) and `draazy-sandbox` (on `sandbox.draazy.com`, replacing
    `draazy`), each with its own `API_ORIGIN` and `ORIGIN_SHARED_SECRET`.
  - WAF managed rules and an `/api/auth/*` rate-limit rule (Bot Fight Mode off).
  - Cache Rule for extensionless photo originals.
  - A prod R2 bucket with the `Access-Control-Allow-Origin` header (`DEPLOY.md` §3.2).
  - At launch, remove the `draazy.com` 302 dashboard rule.
- [ ] **3.5 [OWNER] Meta / WhatsApp:**
  - Add a **spend cap** on the billing account **before** enabling WhatsApp on prod (`DEPLOY.md` §7).
  - Make sure the OTP, agreement-invite and referral-invite templates are Active.
  - In app `draazy-prod`, set the callback `https://draazy.com/api/webhooks/whatsapp` with
    `PROD_WHATSAPP_WEBHOOK_VERIFY_TOKEN` and subscribe `messages` (Verify fails while `draazy.com` still
    redirects to sandbox). Every app subscribed to the WABA gets its own copy, so sandbox keeps its webhook.
- [ ] **3.6 [OWNER] Cashfree:**
  - Activate the live account and rename the merchant from "testMerchantName".
  - Set the live webhook to the prod URL with failed and user-dropped events.
- [ ] **3.7 [OWNER] Google Cloud:**
  - Restrict the prod Maps browser key by HTTP referrer and API.
  - Enable Maps Embed, Street View Static and the district boundary layer on the Map ID.
  - Set quotas and budget alerts. Rotate the key whose old copy is in git history (`frontend/dist-perf`).
- [ ] **3.8 [OWNER] GitHub repo settings:** Dependabot alerts, secret scanning, push protection; rotate
  `backend/.env.local` secrets.
- [ ] **3.9 [OWNER] ZeptoMail:** prod domain verified (SPF, DKIM, DMARC), staff alert emails. Mail agent
  `draazy-prod` exists (API key in `PROD_ZEPTOMAIL_API_KEY`; its authentication key is already set to
  `PROD_ZEPTOMAIL_WEBHOOK_KEY`). Once `draazy.com/api` answers (the 302 rule is gone), add its webhook
  `https://draazy.com/api/webhooks/zeptomail` (soft + hard bounces, feedback loop): Verify fails while the URL
  redirects to sandbox. The sandbox agent is `draazy-sandbox`.
  (`ZEPTOMAIL_ENABLED=true` and an email on each staff account).

## Phase 4: Legal, content and ops (owner, agent assists)

- [ ] **4.1 [OWNER] Lawyer review** of Terms §7, Refund §2.2 and §6, Privacy §1.3, §4 and §7. Confirm or
  delete the Privacy §5 claims (TLS 1.3, AES-256, pen-testing, SOC 2 Type II). Make sure DPDP consent,
  the grievance officer and data-retention wording match what the platform does.
- [ ] **4.2 [AGENT] Draft corrections** for whatever 4.1 rejects. The owner approves the wording.
- [ ] **4.3 [OWNER] Set the real grievance officer** in Admin > Settings.
- [ ] **4.4 [OWNER] Fact-check** the 12 blog posts and 12 locality guides (Metro Line 3, Hinjawadi PCMC merger).
- [ ] **4.5 [AGENT] Prepare the prod FAQ seed:** the 4 corrected FAQs from the Help audit plus the
  referral FAQ from `db/seed/R__zz_DML_dev_demo_data.sql`. Deliver them as text or a staff-console import,
  **not** as a demo seed migration. The owner pastes them into prod after go-live.
- [ ] **4.6 [OWNER] Ops sign-off:** rent-agreement SLA targets; a support inbox and owner; a manual refund
  process (plan refunds are not built, D63; see 5.1).

## Phase 5: Launch-risk features (decide, then build or accept)

Ask the user for each one: build before launch, or accept the risk in writing in `tasks/DECISIONS-NEEDED.md`.

- [ ] **5.1 Plan refunds (D63).** Today a Cashfree-dashboard refund leaves the subscription active and
  finance overstates revenue (`DEPLOY.md` §9.7). Recommended: build before taking real money at scale.
- [ ] **5.2 Error and uptime alerting.** Confirm that Admin › Error log and the DO alerts reach a human
  within minutes. Recommended: verify only, no new code.
- [ ] **5.3 Load sanity check.** Run `loadtest/smoke.yml` with Artillery (`npm run sandbox` in `loadtest/`) against the sandbox only, with owner approval.
  It covers search, the property page and, with `OTP=1`, OTP send, to confirm the 1 vCPU / 1 GB instance and
  `maximum-pool-size=5` hold a launch spike. Sandbox env setup and how to read the result: `loadtest/README.md`.

## Phase 6: Pre-launch verification

- [ ] **6.1 [AGENT] Re-derive the manual test plan** `docs/Draazy-Tester-Checklist.xlsx` (stale since
  2026-10-15) from `e2e/COVERAGE.md` and the current routes.
- [ ] **6.2 [OWNER] Sandbox full regression**, `DEPLOY.md` §9.4, on the release tag.
- [ ] **6.3 [OWNER] Restore drill:** restore the latest prod (or sandbox) backup into a scratch DB using
  the 2.4 runbook; record how long it took.
- [ ] **6.4 [OWNER] Real devices:** the "Real phones" section of `tasks/OWNER-CHECKLIST.md` (iOS Safari,
  Android, OTP autofill, liveness, uploads).
- [ ] **6.5 [OWNER] Lighthouse and the security-header check** pass in the deploy log (this office network
  strips headers, so only CI can tell).

## Phase 7: Launch day

1. [OWNER] Freeze: no merges to `main` during launch.
2. [OWNER] Take a DB snapshot (or let 2.2 do it).
3. [OWNER] Run the prod workflow with `production`, half `both`. The `migrate` job runs first; a
   failure aborts and nothing changes.
4. [OWNER] `curl` a direct non-health route on the `*.ondigitalocean.app` URL and expect 403.
5. [OWNER] Production smoke, `DEPLOY.md` §9.5: OTP arrives on WhatsApp; staff sign-in with TOTP (save
   the recovery codes); browse anonymously; the test owner's listing reaches the queue and staff
   **rejects** it; the contact gate shows, **do not unlock**; a support ticket round-trip.
6. [OWNER] One real payment on the cheapest plan with the test owner; **keep it** (no refund path);
   record it in the finance sheet (`DEPLOY.md` §9.7).
7. [OWNER] Logs, `DEPLOY.md` §9.6: no new `ERROR`, no `Refund or reconcile`, Cashfree webhooks all 200,
   WhatsApp messages delivered.
8. [OWNER] Seed the prod FAQs (4.5); re-scrape share previews in Meta's Sharing Debugger.
9. [OWNER] Watch for 24 h: DO memory <= ~80%, the error log, WhatsApp quality rating, Meta spend, PostHog
   `$web_vitals` events arriving.

**Rollback:** redeploy the previous tag and roll back Pages from the dashboard. If a migration is the
cause, ship a fix-forward migration; restore from the snapshot only for data corruption.

## Phase 8: After launch (first two weeks)

- [ ] [OWNER] Postgres `sslmode=verify-full`: bake the DO CA into the image and add `sslrootcert` to
  both `DB_URL` and `FLYWAY_DB_URL` (`DEPLOY.md` §7). An agent can do the code half.
- [ ] [AGENT] Production test-account marker, hidden internal plan, ₹1 internal price
  (`DEPLOY.md` §9.8): only if the owner reverses ruling 316 ("Don't build; test on sandbox").
- [ ] [OWNER] Remove `https://draazy.com` from the **sandbox** `WEB_ORIGINS`.
- [ ] [OWNER] Add OpenTelemetry once there is more than one instance.
