# Sandbox migration runbook — new GitHub organization + DigitalOcean

One file, top to bottom. Every step is tagged:

- **🧑 YOU** — manual: browser/console clicks, logins, approvals, pushes you want to own.
- **🤖 AGENT** — the AI agent on the MacBook runs it (shell, code edits, tests).

Order (do not reorder): **0** push to old repo → **1** transfer repo → **2** set up the Mac →
**3** repoint every component (CI, Sonar, Cloudflare, docs) → **4–6** move backend + DB to DigitalOcean →
**7** decommission GCP/Supabase.

Hard rules for the agent:

- Never print a secret value. Pipe secrets straight from `gcloud` into `gh secret set`; never `echo` them,
  never write them to a tracked file.
- Follow `AGENTS.md` in the repo. Run `node scripts/check-comments.mjs --staged` before every commit.
- Stop and report at any ⛔ STOP marker or any command that fails in a way this file does not describe.

## Placeholders — 🧑 YOU fill these in before starting

| Placeholder | Meaning | Value |
|---|---|---|
| `<OLD_OWNER>` | current owner | `yatishpatil101` |
| `<NEW_USER>` | your new **personal** GitHub account (you log in with this) | |
| `<NEW_OWNER>` | the new **organization** that owns the repo (exact case) | |
| `<new_owner>` | same org name, **all lowercase** (GHCR needs it) | |
| `<GCP_PROJECT_ID>` | GCP project that hosts Cloud Run sandbox | |
| `<SUPABASE_REF>` | Supabase sandbox project ref | |
| `<RUN_APP_URL>` | current Cloud Run URL (`https://draazy-api-sandbox-…run.app`) | |
| `<DO_APP_URL>` | filled in at step 5.3 (`https://draazy-api-sandbox-xxxx.ondigitalocean.app`) | |

## Account shape (decided)

- A **free GitHub organization** `<NEW_OWNER>` owns the repo; your personal account `<NEW_USER>` is its
  owner. No paid plan, no "professional" account needed.
- The repo **stays public**. On the free plan a private repo silently ignores environment secrets
  (`sandbox`, `sandbox-web`) — the deploy workflow would break — and SonarQube Cloud's free tier caps
  private code at 50k lines. Going private later means GitHub Team (~$4/user/month) plus a Sonar plan.
- Public means: never commit secrets, keep using environment secrets (never repo variables) for
  anything sensitive, as today.

## What stays the same (why staff logins are not affected)

Every secret value is **copied unchanged** from GCP Secret Manager to DigitalOcean (via GitHub):
`JWT_SECRET`, `STAFF_TOTP_KEY`, `IDENTITY_ENCRYPTION_KEY` (+ key id `s1`), `IDENTITY_HASH_SECRET`,
`REFERRAL_SIGNAL_SALT`, `ORIGIN_SHARED_SECRET`, Cashfree, ZeptoMail, R2, Places, VAPID.
The staff rows (password hash, encrypted authenticator secret, recovery codes, permissions, live refresh
tokens) are copied from Supabase into the new DB with the **same user ids**. Result: same password, same
authenticator app, no re-enrolment, and sessions in progress keep working.

The database is otherwise **fresh**: the migration chain was squashed to `26.10.xx`, so the Supabase
schema cannot be restored into the new code. Consumer/demo data comes from the seed files.

Unchanged: `sandbox.draazy.com` DNS, Cloudflare Pages project `draazy`, R2 buckets + CORS, Cashfree
webhook URL (`https://sandbox.draazy.com/api/webhooks/cashfree/payment`), ZeptoMail, Pages secret
`ORIGIN_SHARED_SECRET`. The **only** Cloudflare change at cutover is the Pages variable `API_ORIGIN`.

---

## Phase 0 — Push everything to the old repo (Windows) — 🧑 YOU

1. On the Windows machine commit your work (the tree is shared with another session — commit only your
   files, using the private-index recipe in `tasks/lessons.md`).
2. `node scripts/check-comments.mjs --staged` → must exit 0.
3. Push every branch and tag:
   ```powershell
   git push origin --all
   git push origin --tags
   git --no-pager status -sb        # must not say "ahead"
   ```
4. Record (screenshot is fine) from GitHub → `<OLD_OWNER>/Learning` → **Settings**:
   - Environments `sandbox` and `sandbox-web`: names of every secret and variable.
   - Repository secrets/variables: names.
   - Branch protection / rulesets, collaborators, webhooks, deploy keys, Pages, Actions permissions.
5. Record from Cloudflare → Workers & Pages → `draazy` → Settings → Variables and Secrets
   (**Production**): the current `API_ORIGIN` value = `<RUN_APP_URL>`.
6. Do **not** run any deploy from now until Phase 5.

## Phase 1 — Create the organization and transfer the repo — 🧑 YOU

1. Log in as `<NEW_USER>` (create it if needed) and turn on 2FA.
2. github.com → **+** → **New organization** → **Free** plan → name `<NEW_OWNER>` (e.g. `draazy`) →
   "My personal account" → finish.
3. Org settings (github.com/organizations/`<NEW_OWNER>`/settings):
   - **Authentication security** → require 2FA for members.
   - **Member privileges** → Base permissions: **Read**; Repository creation: owners only.
   - **Actions → General** → Allow all actions; Workflow permissions: **Read repository contents**
     (the deploy job asks for `packages: write` itself).
   - **Packages** → Package creation: allow **Public**.
4. Let the old account transfer in: org → **People** → **Invite member** → `<OLD_OWNER>` → role
   **Owner**. Log in as `<OLD_OWNER>` and accept the invite. (Transferring into an org needs
   permission to create repos there.)
5. As `<OLD_OWNER>`: `<OLD_OWNER>/Learning` → Settings → General → Danger Zone →
   **Transfer ownership** → choose organization `<NEW_OWNER>` → type `<OLD_OWNER>/Learning` → confirm.
   It moves immediately.
6. Verify on `<NEW_OWNER>/Learning` → Settings:
   - Visibility still **Public**.
   - Environments `sandbox`, `sandbox-web` still exist with all their secrets/vars (names match Phase 0).
   - Re-add collaborators (invites do not move). Re-create branch protection if it was missing.
7. Org → People → change `<OLD_OWNER>` to **Member** or remove it once you no longer need it.
8. Never create a new repo called `Learning` under `<OLD_OWNER>` — it would break GitHub's redirect.
9. Windows clone:
   ```powershell
   git remote set-url origin https://github.com/<NEW_OWNER>/Learning.git
   git fetch origin; git --no-pager status -sb
   ```

## Phase 2 — Prepare the MacBook

### 2.1 🤖 AGENT — install tools

```bash
command -v brew || echo "⛔ STOP: ask YOU to install Homebrew from https://brew.sh"
brew install git gh jq doctl libpq node
brew install --cask gcloud-cli || brew install --cask google-cloud-sdk
brew install --cask temurin@25
echo 'export PATH="$(brew --prefix libpq)/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
psql --version; doctl version; gh --version; gcloud --version; java -version; node -v
```

### 2.2 🧑 YOU — logins (browser prompts)

```bash
gh auth login            # GitHub.com → HTTPS → log in as <NEW_USER> (owner of org <NEW_OWNER>)
gcloud auth login        # Google account that owns <GCP_PROJECT_ID>
gcloud config set project <GCP_PROJECT_ID>
```

### 2.3 🤖 AGENT — clone and baseline

```bash
gh repo clone <NEW_OWNER>/Learning ~/code/Learning && cd ~/code/Learning
git checkout feature/backend-integration
gh api repos/<NEW_OWNER>/Learning/environments --jq '.environments[].name'   # sandbox, sandbox-web
gh secret list --env sandbox;  gh variable list --env sandbox
gh secret list --env sandbox-web; gh variable list --env sandbox-web
gh secret list;  gh variable list
cd backend && ./mvnw -q -DskipTests package && cd ..
```
Report the lists to YOU and compare with Phase 0. ⛔ STOP if anything is missing.

---

## Phase 3 — Repoint every component to the new organization

### 3.1 🤖 AGENT — owner references in the repo

Replace `<OLD_OWNER>` with `<NEW_OWNER>` in:
- `sonar-project.properties` — `sonar.organization` and `sonar.projectKey` (only after YOU finish 3.2).
- `docs/DEPLOY_WALKTHROUGH.md` (repo URLs).
- `backend/deploy/bootstrap-project.sh` line 12 — leave as is; the file is deleted in Phase 7.

Then `grep -rn "<OLD_OWNER>" --exclude-dir=node_modules --exclude-dir=.git .` and report the rest.

### 3.2 🧑 YOU — SonarCloud

1. sonarcloud.io → log in with GitHub as `<NEW_USER>` → **+ → Create new organization** → import the
   GitHub org `<NEW_OWNER>` (approve the SonarQube Cloud app for that org) → **Free** plan (public repo).
2. Analyze new project → `Learning` → "With GitHub Actions" (turn **off** Automatic Analysis).
3. Copy the org key and project key → give to the agent for 3.1.
4. My Account → Security → generate token → GitHub → repo Settings → Secrets → Actions → update
   repository secret `SONAR_TOKEN`.

### 3.3 🧑 YOU — Cloudflare (nothing breaks, just verify)

- Pages `draazy` is a Direct Upload project (deployed by `wrangler` from Actions), so it has **no GitHub
  link to move**. Confirm: Workers & Pages → `draazy` → Settings → Build → "Git repository: none".
  If it shows a git connection to `<OLD_OWNER>/Learning`, disconnect it.
- The API token in env `sandbox-web` (`CLOUDFLARE_API_TOKEN`) and var `CLOUDFLARE_ACCOUNT_ID` moved with
  the repo — nothing to do.
- If the Cloudflare GitHub App was installed on `<OLD_OWNER>`, uninstall it there (github.com →
  Settings → Applications).
- DNS, R2 buckets, R2 CORS, WAF rules: unchanged.

### 3.4 🧑 YOU — other GitHub-linked services

- GCP Workload Identity trusts only `<OLD_OWNER>/Learning` → after the transfer the old Cloud Run deploy
  job **cannot** run. That is intended: Cloud Run keeps serving as the rollback target until Phase 7.
- Anything else using a GitHub OAuth app/webhook on the old account (none known) → re-link.

### 3.5 🤖 AGENT — commit, then verify CI

```bash
node scripts/check-comments.mjs --staged
git commit -m "chore: point repo references at <NEW_OWNER>" -m ""
git push
gh run watch "$(gh run list --branch feature/backend-integration --workflow ci.yml -L1 --json databaseId -q '.[0].databaseId')"
```
CI (including Sonar) must be green.

### 3.6 🧑 YOU — prove the frontend deploy path still works

Actions → **Deploy (sandbox)** → Run workflow → branch `feature/backend-integration` → confirm
`sandbox` → target **frontend**. It still talks to Cloud Run, so the site keeps working. Open
`https://sandbox.draazy.com` and sign in once.

---

## Phase 4 — DigitalOcean account and secrets

### 4.1 🧑 YOU — account

1. Sign up at cloud.digitalocean.com (Google login is fine), add a card, enable 2FA.
2. Billing → **Billing alerts** → $25.
3. Projects → **New project** `draazy-sandbox` (Environment: Development).
4. API → Tokens → **Generate new token**: name `github-deploy-sandbox`, expiry 1 year,
   **Custom scopes → app: create, read, update**. Copy it.
5. GitHub → `<NEW_OWNER>/Learning` → Settings → Environments → `sandbox` → **Add environment secret**
   `DIGITALOCEAN_ACCESS_TOKEN` = the token.
6. Give the agent the same token for local `doctl`:
   ```bash
   doctl auth init --context draazy     # paste the token when prompted
   ```

### 4.2 🤖 AGENT — copy every Cloud Run secret unchanged into GitHub env `sandbox`

```bash
cd ~/code/Learning
copy() { gcloud secrets versions access latest --secret="$1" --project <GCP_PROJECT_ID> \
          | gh secret set "$2" --env sandbox -R <NEW_OWNER>/Learning; }
copy draazy-sandbox-origin-shared-secret     SANDBOX_ORIGIN_SHARED_SECRET
copy draazy-sandbox-jwt-secret               SANDBOX_JWT_SECRET
copy draazy-sandbox-referral-signal-salt     SANDBOX_REFERRAL_SIGNAL_SALT
copy draazy-sandbox-identity-hash-secret     SANDBOX_IDENTITY_HASH_SECRET
copy draazy-sandbox-staff-totp-key           SANDBOX_STAFF_TOTP_KEY
copy draazy-sandbox-identity-encryption-key  SANDBOX_IDENTITY_ENCRYPTION_KEY
copy draazy-sandbox-cashfree-app-id          SANDBOX_CASHFREE_APP_ID
copy draazy-sandbox-cashfree-secret-key      SANDBOX_CASHFREE_SECRET_KEY
copy draazy-sandbox-zeptomail-api-key        SANDBOX_ZEPTOMAIL_API_KEY
copy draazy-sandbox-r2-access-key-id         SANDBOX_R2_ACCESS_KEY_ID
copy draazy-sandbox-r2-secret-access-key     SANDBOX_R2_SECRET_ACCESS_KEY
copy draazy-sandbox-google-places-server-key SANDBOX_GOOGLE_PLACES_SERVER_KEY
copy draazy-sandbox-push-vapid-private-key   SANDBOX_PUSH_VAPID_PRIVATE_KEY
copy draazy-sandbox-push-vapid-public-key    SANDBOX_PUSH_VAPID_PUBLIC_KEY
gh secret list --env sandbox
```
Not copied: `draazy-sandbox-db-password` / `-flyway-db-password` (DO creates the DB user) — but keep
`draazy-sandbox-flyway-db-password` readable, Phase 6 uses it to read Supabase.

Already in env `sandbox` and reused as-is: secrets `SANDBOX_BOOTSTRAP_ADMIN_EMAIL`,
`SANDBOX_BOOTSTRAP_ADMIN_MOBILE`; vars `SANDBOX_R2_ENDPOINT`, `SANDBOX_R2_BUCKET_PRIVATE`,
`SANDBOX_R2_BUCKET_PUBLIC`, `SANDBOX_R2_PUBLIC_BASE_URL`.

### 4.3 🧑 YOU — switch off admin recovery before the first DO boot

GitHub → env `sandbox` → Variables → `SANDBOX_BOOTSTRAP_ADMIN_RECOVER` → set to **empty**.
Why: on the fresh DB the old nonce is not recorded yet, so a non-empty value would fire again on boot,
reset the admin's authenticator and open an invite that blocks admin login. (Phase 6 copies the old
nonce over; you can put the value back afterwards if you like — it will then be a no-op.)

### 4.4 🧑 YOU — Google Places key restriction check

GCP Console → APIs & Services → Credentials → the server key behind
`draazy-sandbox-google-places-server-key` → Application restrictions must be **None** (API
restrictions are fine). If it is "IP addresses", tell the agent — DO has no fixed egress IP on this plan.

---

## Phase 5 — Code changes for DigitalOcean — 🤖 AGENT

Branch: `git checkout -b chore/sandbox-digitalocean` from `feature/backend-integration`.

### 5.1 New app spec `backend/deploy/do-app-sandbox.yaml`

Target shape: region `blr`, one service (1 vCPU / 1 GiB — 512 MiB OOMs at boot), one PRE_DEPLOY
migration job, one dev database. `${db.*}` are DO bindables and must survive `envsubst`; every other
`${…}` is filled by the workflow. Port every env var from `backend/deploy/cloudrun-sandbox.yaml` —
diff the two files' variable names when done; only `DB_*`/`FLYWAY_*` sources may differ.

```yaml
name: draazy-api-sandbox
region: blr
alerts:
  - rule: DEPLOYMENT_FAILED
  - rule: DOMAIN_FAILED
ingress:
  rules:
    - component:
        name: api
      match:
        path:
          prefix: /
databases:
  - name: db
    engine: PG
    production: false
services:
  - name: api
    image:
      registry_type: GHCR
      registry: ${GHCR_OWNER}
      repository: draazy-api
      tag: ${DEPLOY_SHA}
    instance_size_slug: apps-s-1vcpu-1gb
    instance_count: 1
    http_port: 8080
    health_check:
      http_path: /api/actuator/health/readiness
      initial_delay_seconds: 30
      period_seconds: 10
      timeout_seconds: 5
      failure_threshold: 18
    alerts:
      - rule: CPU_UTILIZATION
        operator: GREATER_THAN
        value: 85
        window: TEN_MINUTES
      - rule: MEM_UTILIZATION
        operator: GREATER_THAN
        value: 90
        window: TEN_MINUTES
      - rule: RESTART_COUNT
        operator: GREATER_THAN
        value: 2
        window: FIVE_MINUTES
    envs:
      - key: SPRING_PROFILES_ACTIVE
        value: sandbox
      - key: WEB_ORIGINS
        value: https://sandbox.draazy.com,https://draazy.com
      - key: API_PUBLIC_ORIGIN
        value: https://sandbox.draazy.com
      - key: APP_BASE_URL
        value: https://sandbox.draazy.com
      - key: INTERNAL_PROXIES
        value: none
      - key: BOOTSTRAP_ADMIN_EMAIL
        type: SECRET
        value: "${BOOTSTRAP_ADMIN_EMAIL}"
      - key: BOOTSTRAP_ADMIN_MOBILE
        type: SECRET
        value: "${BOOTSTRAP_ADMIN_MOBILE}"
      - key: BOOTSTRAP_ADMIN_RECOVER
        value: "${BOOTSTRAP_ADMIN_RECOVER}"
      - key: DB_URL
        value: jdbc:postgresql://${db.HOSTNAME}:${db.PORT}/${db.DATABASE}?sslmode=require
      - key: DB_USER
        value: ${db.USERNAME}
      - key: DB_PASSWORD
        value: ${db.PASSWORD}
      - key: FLYWAY_DB_USER
        value: ${db.USERNAME}
      - key: ORIGIN_SHARED_SECRET
        type: SECRET
        value: "${ORIGIN_SHARED_SECRET}"
      - key: JWT_SECRET
        type: SECRET
        value: "${JWT_SECRET}"
      - key: REFERRAL_SIGNAL_SALT
        type: SECRET
        value: "${REFERRAL_SIGNAL_SALT}"
      - key: IDENTITY_HASH_SECRET
        type: SECRET
        value: "${IDENTITY_HASH_SECRET}"
      - key: STAFF_TOTP_KEY
        type: SECRET
        value: "${STAFF_TOTP_KEY}"
      - key: IDENTITY_ENCRYPTION_KEY
        type: SECRET
        value: "${IDENTITY_ENCRYPTION_KEY}"
      - key: IDENTITY_ENCRYPTION_KEY_ID
        value: s1
      - key: CASHFREE_ENABLED
        value: "true"
      - key: CASHFREE_APP_ID
        type: SECRET
        value: "${CASHFREE_APP_ID}"
      - key: CASHFREE_SECRET_KEY
        type: SECRET
        value: "${CASHFREE_SECRET_KEY}"
      - key: CASHFREE_WEBHOOK_SECRET
        type: SECRET
        value: "${CASHFREE_SECRET_KEY}"
      - key: CASHFREE_NOTIFY_URL
        value: https://sandbox.draazy.com/api/webhooks/cashfree/payment
      - key: ZEPTOMAIL_ENABLED
        value: "true"
      - key: ZEPTOMAIL_FROM_NAME
        value: Draazy Sandbox
      - key: ZEPTOMAIL_API_KEY
        type: SECRET
        value: "${ZEPTOMAIL_API_KEY}"
      - key: STORAGE_ENABLED
        value: "true"
      - key: R2_ENDPOINT
        value: "${R2_ENDPOINT}"
      - key: R2_BUCKET_PRIVATE
        value: "${R2_BUCKET_PRIVATE}"
      - key: R2_BUCKET_PUBLIC
        value: "${R2_BUCKET_PUBLIC}"
      - key: R2_PUBLIC_BASE_URL
        value: "${R2_PUBLIC_BASE_URL}"
      - key: R2_ACCESS_KEY_ID
        type: SECRET
        value: "${R2_ACCESS_KEY_ID}"
      - key: R2_SECRET_ACCESS_KEY
        type: SECRET
        value: "${R2_SECRET_ACCESS_KEY}"
      - key: GOOGLE_PLACES_SERVER_KEY
        type: SECRET
        value: "${GOOGLE_PLACES_SERVER_KEY}"
      - key: PUSH_VAPID_PRIVATE_KEY
        type: SECRET
        value: "${PUSH_VAPID_PRIVATE_KEY}"
      - key: PUSH_VAPID_PUBLIC_KEY
        type: SECRET
        value: "${PUSH_VAPID_PUBLIC_KEY}"
jobs:
  - name: migrate
    kind: PRE_DEPLOY
    image:
      registry_type: GHCR
      registry: ${GHCR_OWNER}
      repository: draazy-api
      tag: ${DEPLOY_SHA}
    instance_size_slug: apps-s-1vcpu-1gb
    instance_count: 1
    # Full command on purpose: DO may replace the ENTRYPOINT or append to it; --migrate-only works either way.
    run_command: java -jar /app/app.jar --migrate-only
    envs:
      - key: SPRING_PROFILES_ACTIVE
        value: sandbox
      - key: FLYWAY_DB_URL
        value: jdbc:postgresql://${db.HOSTNAME}:${db.PORT}/${db.DATABASE}?sslmode=require
      - key: FLYWAY_DB_USER
        value: ${db.USERNAME}
      - key: FLYWAY_DB_PASSWORD
        value: ${db.PASSWORD}
```

Check every key above against `cloudrun-sandbox.yaml` / `cloudrun-migrate-sandbox.yaml` and against
the DO App Spec reference (docs.digitalocean.com/products/app-platform/reference/app-spec/). Fix
anything the reference rejects; `doctl apps spec validate` (5.6) is the final word.

### 5.2 Replace the `backend` job in `.github/workflows/deploy.yml`

Keep `gate`, `frontend-build`, `frontend-publish` and `concurrency` as they are. Remove `REGION`,
`AR_REPOSITORY` from top-level `env` (keep `SERVICE` only if still used). New job:

```yaml
  backend:
    name: Build image and deploy to DigitalOcean
    runs-on: ubuntu-latest
    timeout-minutes: 40
    needs: gate
    if: needs.gate.outputs.backend == 'true'
    environment: sandbox
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ env.DEPLOY_SHA }}
          persist-credentials: false

      # GHCR rejects upper-case owners.
      - id: owner
        env:
          OWNER: ${{ github.repository_owner }}
        run: echo "lower=${OWNER,,}" >> "$GITHUB_OUTPUT"

      - uses: docker/login-action@vX        # use the current major
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/setup-buildx-action@v4

      - name: Build and push image
        uses: docker/build-push-action@v7
        with:
          context: backend
          file: backend/Dockerfile
          push: true
          tags: ghcr.io/${{ steps.owner.outputs.lower }}/draazy-api:${{ env.DEPLOY_SHA }}
          labels: org.opencontainers.image.source=https://github.com/${{ github.repository }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Render app spec
        env:
          GHCR_OWNER: ${{ steps.owner.outputs.lower }}
          BOOTSTRAP_ADMIN_EMAIL: ${{ secrets.SANDBOX_BOOTSTRAP_ADMIN_EMAIL }}
          BOOTSTRAP_ADMIN_MOBILE: ${{ secrets.SANDBOX_BOOTSTRAP_ADMIN_MOBILE }}
          BOOTSTRAP_ADMIN_RECOVER: ${{ vars.SANDBOX_BOOTSTRAP_ADMIN_RECOVER }}
          ORIGIN_SHARED_SECRET: ${{ secrets.SANDBOX_ORIGIN_SHARED_SECRET }}
          JWT_SECRET: ${{ secrets.SANDBOX_JWT_SECRET }}
          REFERRAL_SIGNAL_SALT: ${{ secrets.SANDBOX_REFERRAL_SIGNAL_SALT }}
          IDENTITY_HASH_SECRET: ${{ secrets.SANDBOX_IDENTITY_HASH_SECRET }}
          STAFF_TOTP_KEY: ${{ secrets.SANDBOX_STAFF_TOTP_KEY }}
          IDENTITY_ENCRYPTION_KEY: ${{ secrets.SANDBOX_IDENTITY_ENCRYPTION_KEY }}
          CASHFREE_APP_ID: ${{ secrets.SANDBOX_CASHFREE_APP_ID }}
          CASHFREE_SECRET_KEY: ${{ secrets.SANDBOX_CASHFREE_SECRET_KEY }}
          ZEPTOMAIL_API_KEY: ${{ secrets.SANDBOX_ZEPTOMAIL_API_KEY }}
          R2_ENDPOINT: ${{ vars.SANDBOX_R2_ENDPOINT }}
          R2_BUCKET_PRIVATE: ${{ vars.SANDBOX_R2_BUCKET_PRIVATE }}
          R2_BUCKET_PUBLIC: ${{ vars.SANDBOX_R2_BUCKET_PUBLIC }}
          R2_PUBLIC_BASE_URL: ${{ vars.SANDBOX_R2_PUBLIC_BASE_URL }}
          R2_ACCESS_KEY_ID: ${{ secrets.SANDBOX_R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.SANDBOX_R2_SECRET_ACCESS_KEY }}
          GOOGLE_PLACES_SERVER_KEY: ${{ secrets.SANDBOX_GOOGLE_PLACES_SERVER_KEY }}
          PUSH_VAPID_PRIVATE_KEY: ${{ secrets.SANDBOX_PUSH_VAPID_PRIVATE_KEY }}
          PUSH_VAPID_PUBLIC_KEY: ${{ secrets.SANDBOX_PUSH_VAPID_PUBLIC_KEY }}
        run: |
          set -euo pipefail
          required="GHCR_OWNER DEPLOY_SHA ORIGIN_SHARED_SECRET JWT_SECRET REFERRAL_SIGNAL_SALT IDENTITY_HASH_SECRET
            STAFF_TOTP_KEY IDENTITY_ENCRYPTION_KEY CASHFREE_APP_ID CASHFREE_SECRET_KEY ZEPTOMAIL_API_KEY
            R2_ENDPOINT R2_BUCKET_PRIVATE R2_BUCKET_PUBLIC R2_PUBLIC_BASE_URL R2_ACCESS_KEY_ID
            R2_SECRET_ACCESS_KEY GOOGLE_PLACES_SERVER_KEY PUSH_VAPID_PRIVATE_KEY PUSH_VAPID_PUBLIC_KEY"
          for name in $required; do
            [ -n "${!name}" ] || { echo "::error::$name is empty." >&2; exit 1; }
          done
          # Explicit list: DO's own ${db.*} bindables must reach DigitalOcean untouched.
          vars=$(printf '${%s} ' $required BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_MOBILE BOOTSTRAP_ADMIN_RECOVER)
          envsubst "$vars" < backend/deploy/do-app-sandbox.yaml > "$RUNNER_TEMP/app.yaml"

      - uses: digitalocean/action-doctl@v2
        with:
          token: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}

      - id: deploy
        name: Create or update the app
        run: |
          set -euo pipefail
          id=$(doctl apps list --output json | jq -r '.[] | select(.spec.name=="draazy-api-sandbox") | .id')
          if [ -z "$id" ]; then
            doctl apps create --spec "$RUNNER_TEMP/app.yaml" --wait --output json > "$RUNNER_TEMP/app.json"
            id=$(jq -r '.[0].id' "$RUNNER_TEMP/app.json")
          else
            doctl apps update "$id" --spec "$RUNNER_TEMP/app.yaml" --wait --output json > "$RUNNER_TEMP/app.json"
          fi
          phase=$(doctl apps list-deployments "$id" --output json | jq -r '.[0].phase')
          [ "$phase" = "ACTIVE" ] || { echo "::error::Latest deployment is $phase, not ACTIVE." >&2; exit 1; }
          echo "url=$(doctl apps get "$id" --output json | jq -r '.[0].default_ingress')" >> "$GITHUB_OUTPUT"

      - name: Smoke test
        env:
          URL: ${{ steps.deploy.outputs.url }}
        run: |
          set -euo pipefail
          for attempt in $(seq 1 12); do
            curl -fsS --max-time 15 "$URL/api/actuator/health" && exit 0
            sleep 5
          done
          echo "::error::Health check failed on $URL" >&2
          exit 1

      - name: Remove rendered spec
        if: always()
        run: rm -f "$RUNNER_TEMP/app.yaml" "$RUNNER_TEMP/app.json"
```

Also in `deploy.yml`: fix comments that mention Cloud Run / `gcloud run services replace` (gate step,
frontend-publish error text near "Cloud Run"). Keep the comment rules in `AGENTS.md`.

### 5.3 Repoint `SandboxDeploymentManifestTest`

`backend/src/test/java/com/draazy/api/foundation/SandboxDeploymentManifestTest.java` reads
`deploy/cloudrun-sandbox.yaml`. Switch it to `deploy/do-app-sandbox.yaml` and the DO shape
(`- key: X` followed by `value: Y`). Keep its three guarantees:
1. `CASHFREE_NOTIFY_URL` is https and its path equals `"/api" + Routes.Webhooks.CASHFREE_PAYMENT`.
2. `CASHFREE_WEBHOOK_SECRET` has exactly the same value entry as `CASHFREE_SECRET_KEY`.
3. The **`services:` block** (not the whole file — the `jobs:` block legitimately has it) never
   contains `FLYWAY_DB_PASSWORD`.

### 5.4 Wording/docs (no behaviour change)

- `frontend/functions/api/[[path]].js` (~line 106) and
  `backend/src/main/java/com/draazy/api/security/OriginGateFilter.java` (~line 77): "Cloud Run" →
  "the origin" in comments only.
- `docs/DEPLOY.md`, `docs/system/platform-architecture.md` (§4.3 / ADR-021), `docs/system/profiles.md`,
  `backend/.dockerignore` comment: describe DO App Platform + GHCR + dev DB; `API_ORIGIN` is the DO
  default ingress.
- Leave `cloudrun-*.yaml` and `bootstrap-project.sh` in place (deleted in Phase 7).

### 5.5 Verify locally

```bash
cd backend
./mvnw -q test -Dtest='SandboxDeploymentManifestTest,SandboxProfileContractTest,ProdProfileContractTest'
cd ..
node scripts/check-comments.mjs --staged
```

### 5.6 Validate the spec against DigitalOcean (no deploy)

```bash
sed -e 's/${GHCR_OWNER}/<new_owner>/' -e 's/${DEPLOY_SHA}/test/' backend/deploy/do-app-sandbox.yaml \
  | doctl apps spec validate - --schema-only
```
Must print the spec back with no error.

### 5.7 Commit — 🤖 AGENT, push — 🧑 YOU (or allow the agent)

```bash
git add -A backend/deploy/do-app-sandbox.yaml .github/workflows/deploy.yml backend/src/test docs frontend/functions backend/src/main backend/.dockerignore
node scripts/check-comments.mjs --staged
git commit -m "feat: deploy sandbox backend to DigitalOcean App Platform" -m ""
git push -u origin chore/sandbox-digitalocean
```
Wait for CI green.

---

## Phase 6 — First deploy, staff carry-over, cutover

### 6.1 🧑 YOU — first backend deploy (expected to fail once)

Actions → Deploy (sandbox) → branch `chore/sandbox-digitalocean` → `sandbox` → target **backend**.
The image push succeeds; the DO deploy fails because new GHCR packages are **private**.
Then: github.com/orgs/`<NEW_OWNER>`/packages → `draazy-api` → Package settings → **Change visibility →
Public**. Then either re-run the workflow, or tell the agent:
```bash
id=$(doctl apps list --output json | jq -r '.[] | select(.spec.name=="draazy-api-sandbox") | .id')
doctl apps create-deployment "$id" --wait
```
In the DO console: move the app into project `draazy-sandbox` (Projects → Move resources).

### 6.2 🤖 AGENT — check the deploy

```bash
id=$(doctl apps list --output json | jq -r '.[] | select(.spec.name=="draazy-api-sandbox") | .id')
doctl apps list-deployments "$id" --format ID,Phase,Created | head -3   # ACTIVE
doctl apps logs "$id" migrate --type deploy | grep -E "Successfully applied|26\.10\.01|ERROR" | head   # or --type run
doctl apps logs "$id" api --type run | tail -50
URL=$(doctl apps get "$id" --output json | jq -r '.[0].default_ingress'); echo "$URL"
curl -s "$URL/api/actuator/health"                         # {"status":"UP"...}
curl -s -o /dev/null -w '%{http_code}\n' "$URL/api/listings"   # 403 = origin gate works
```
Write `$URL` into the placeholder table as `<DO_APP_URL>`.
⛔ STOP if migration logs show `permission denied to create extension` (pgcrypto/pg_trgm in
`26.10.01`). Fix: upgrade the dev DB to a Managed Postgres cluster (6.3 option B) and redeploy.

### 6.3 Staff carry-over (Supabase → DO DB)

**🧑 YOU — connection strings**
- Supabase → project `<SUPABASE_REF>` → **Connect** → **Session pooler** URI (port 5432). Password =
  GCP secret `draazy-sandbox-flyway-db-password` (agent can read it).
- DO → app → **Settings** → component `db` → **Connection details** → copy the `postgresql://…` URI.
  If there is a **Trusted sources** section, add the Mac's public IP for now.

**🤖 AGENT — export from Supabase** (files contain hashes + ciphertext: keep in a temp dir, delete after)

```bash
umask 077; W=$(mktemp -d); cd "$W"
export SUPA="postgresql://postgres.<SUPABASE_REF>:$(gcloud secrets versions access latest --secret=draazy-sandbox-flyway-db-password --project <GCP_PROJECT_ID>)@<pooler-host>:5432/postgres?sslmode=require"
STAFF="SELECT id FROM users WHERE role IN ('admin','manager','staff') AND password_hash IS NOT NULL"
psql "$SUPA" -c "\d staff_credentials" -c "\d back_office_permissions" -c "\d refresh_tokens"
psql "$SUPA" -c "\copy (SELECT id,name,mobile,email,password_hash,role,team,status,mobile_verified,archived,sessions_revoked_at FROM users WHERE id IN ($STAFF)) TO 'users.csv' CSV HEADER"
psql "$SUPA" -c "\copy (SELECT user_id,totp_secret,totp_confirmed_at,totp_last_step,recovery_code_hashes,failed_attempts,locked_until,created_at FROM staff_credentials WHERE user_id IN ($STAFF)) TO 'creds.csv' CSV HEADER"
psql "$SUPA" -c "\copy (SELECT user_id,permissions,updated_at FROM back_office_permissions WHERE user_id IN ($STAFF)) TO 'perms.csv' CSV HEADER"
psql "$SUPA" -c "\copy (SELECT id,user_id,token_hash,revoked,graced_count,expires_at,created_at FROM refresh_tokens WHERE user_id IN ($STAFF) AND NOT revoked AND expires_at > now()) TO 'tokens.csv' CSV HEADER"
psql "$SUPA" -c "\copy (SELECT nonce,ran_at FROM admin_bootstrap_runs) TO 'runs.csv' CSV HEADER"
wc -l *.csv
```
If a column is missing in Supabase (older schema), drop it from that SELECT and from the matching
import column list; the new defaults fill it. Report the row counts to YOU.

**🤖 AGENT — import into DO (one transaction)**

```bash
export DODB='<DO connection URI from YOU>'
psql "$DODB" -c "select count(*) from flyway_schema_history" || echo "⛔ STOP: cannot reach DO DB — see options below"
psql "$DODB" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
CREATE TEMP TABLE s_users  (id uuid, name text, mobile text, email text, password_hash text, role text,
                            team text, status text, mobile_verified boolean, archived boolean,
                            sessions_revoked_at timestamptz);
CREATE TEMP TABLE s_creds  (user_id uuid, totp_secret text, totp_confirmed_at timestamptz, totp_last_step bigint,
                            recovery_code_hashes jsonb, failed_attempts int, locked_until timestamptz,
                            created_at timestamptz);
CREATE TEMP TABLE s_perms  (user_id uuid, permissions jsonb, updated_at timestamptz);
CREATE TEMP TABLE s_tokens (id uuid, user_id uuid, token_hash text, revoked boolean, graced_count int,
                            expires_at timestamptz, created_at timestamptz);
CREATE TEMP TABLE s_runs   (nonce text, ran_at timestamptz);
\copy s_users  FROM 'users.csv'  CSV HEADER
\copy s_creds  FROM 'creds.csv'  CSV HEADER
\copy s_perms  FROM 'perms.csv'  CSV HEADER
\copy s_tokens FROM 'tokens.csv' CSV HEADER
\copy s_runs   FROM 'runs.csv'   CSV HEADER

-- Abort if a carried mobile already belongs to a different seeded account.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM users u JOIN s_users s ON s.mobile = u.mobile AND s.id <> u.id) THEN
    RAISE EXCEPTION 'mobile collision between carried staff and seeded users';
  END IF;
END $$;

INSERT INTO users (id,name,mobile,email,password_hash,role,team,status,mobile_verified,archived,sessions_revoked_at)
SELECT id,name,mobile,email,password_hash,role,team,status,mobile_verified,archived,sessions_revoked_at FROM s_users
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email, password_hash=EXCLUDED.password_hash,
  role=EXCLUDED.role, team=EXCLUDED.team, status=EXCLUDED.status, mobile_verified=EXCLUDED.mobile_verified,
  archived=EXCLUDED.archived, sessions_revoked_at=EXCLUDED.sessions_revoked_at;

INSERT INTO staff_credentials (user_id,totp_secret,totp_confirmed_at,totp_last_step,recovery_code_hashes,failed_attempts,locked_until,created_at)
SELECT user_id,totp_secret,totp_confirmed_at,totp_last_step,recovery_code_hashes,failed_attempts,locked_until,created_at FROM s_creds
ON CONFLICT (user_id) DO UPDATE SET totp_secret=EXCLUDED.totp_secret, totp_confirmed_at=EXCLUDED.totp_confirmed_at,
  totp_last_step=EXCLUDED.totp_last_step, recovery_code_hashes=EXCLUDED.recovery_code_hashes,
  failed_attempts=0, locked_until=NULL;

INSERT INTO back_office_permissions (user_id,permissions,updated_at)
SELECT user_id,permissions,updated_at FROM s_perms
ON CONFLICT (user_id) DO UPDATE SET permissions=EXCLUDED.permissions, updated_at=EXCLUDED.updated_at;

DELETE FROM staff_invites WHERE redeemed_at IS NULL AND user_id IN (SELECT id FROM s_users);

INSERT INTO refresh_tokens (id,user_id,token_hash,revoked,graced_count,expires_at,created_at)
SELECT id,user_id,token_hash,revoked,graced_count,expires_at,created_at FROM s_tokens
ON CONFLICT DO NOTHING;

INSERT INTO admin_bootstrap_runs (nonce,ran_at) SELECT nonce,ran_at FROM s_runs ON CONFLICT DO NOTHING;

SELECT u.role, count(*) AS staff, count(c.user_id) AS with_2fa
FROM users u LEFT JOIN staff_credentials c ON c.user_id=u.id
WHERE u.id IN (SELECT id FROM s_users) GROUP BY u.role;
COMMIT;
SQL
cd ~ && rm -rf "$W"; unset SUPA DODB
```
Remove the Mac IP from DO trusted sources if you added it.

**If the DO dev DB cannot be reached from the Mac** (connection refused/timeout) — 🧑 YOU choose:
- **Option A (recommended if staff continuity matters):** DO → Databases → create **PostgreSQL,
  `blr1`, Basic 1 GB (~$15/mo)**, add the Mac IP + the app as trusted sources. Agent changes the spec
  `databases:` entry to `cluster_name: <cluster>`, `production: true`, `db_name`/`db_user` per the DO
  docs, redeploys (6.1), then re-runs 6.3.
- **Option B (stay at $7):** skip the carry-over. Set `SANDBOX_BOOTSTRAP_ADMIN_RECOVER` to a new random
  value, redeploy, open the `[ADMIN BOOTSTRAP] … /staff-invite#…` link from the `api` runtime logs
  within 1 hour, set the admin password + authenticator, then re-invite other staff from the admin UI.

### 6.4 🧑 YOU — cutover (the only Cloudflare change)

Cloudflare → Workers & Pages → `draazy` → Settings → Variables and Secrets → **Production**:
- `API_ORIGIN` = `<DO_APP_URL>` (scheme + host only, no path, no trailing slash).
- `ORIGIN_SHARED_SECRET`: **leave as is** (same value DO now has).

Then Actions → Deploy (sandbox) → branch `chore/sandbox-digitalocean` → target **frontend** (Pages
Functions pick up variable changes on the next deployment).

### 6.5 Verify end to end

🤖 AGENT:
```bash
curl -s https://sandbox.draazy.com/api/actuator/health
curl -s -o /dev/null -w '%{http_code}\n' "https://sandbox.draazy.com/api/listings?size=1"   # 200
```
🧑 YOU, in a browser on `https://sandbox.draazy.com`:
- [ ] Staff/admin login with the **existing password + existing authenticator app** (no re-enrol).
- [ ] Staff already signed in before the cutover are still signed in (refresh tokens carried).
- [ ] Consumer login with OTP `000000`; stay idle > 15 min, then click around (refresh works).
- [ ] Listing photo upload (R2), view it.
- [ ] Cashfree TEST payment → webhook marks it paid.
- [ ] Notifications/chat live updates (SSE) keep flowing for 2+ minutes.
- [ ] Two devices on different networks: back-office audit/rate-limit shows two different client IPs
      (proves `X-Forwarded-For` survives DO's edge). If both show the same IP → ⛔ tell the agent.
- [ ] DO → app → Runtime logs: scheduled jobs log runs; no repeating errors.

### 6.6 🧑 YOU — monitoring

- DO → app → Insights → alerts from the spec exist; set email destination.
- Uptime check (DO → Monitoring → Uptime, free tier): `https://sandbox.draazy.com/api/actuator/health`.
- Merge `chore/sandbox-digitalocean` into `feature/backend-integration` (PR or fast-forward).

### Rollback (any time before Phase 7)

Cloudflare Pages Production → `API_ORIGIN` = `<RUN_APP_URL>` → redeploy frontend. Same
`ORIGIN_SHARED_SECRET`, so nothing else changes. Cloud Run + Supabase are still running the old code.
Data written on DO after cutover does not go back.

---

## Phase 7 — Decommission (after one quiet week)

🧑 YOU:
- GCP: delete Cloud Run service `draazy-api-sandbox`, job `draazy-migrate-sandbox`, Artifact Registry
  repo `draazy`, Workload Identity pool/provider, deployer + runtime service accounts, all
  `draazy-sandbox-*` secrets. **Keep the GCP project** (Maps/Places API keys live there).
- Supabase: download a final backup if wanted → pause/delete project `<SUPABASE_REF>`.
- GitHub env `sandbox`: delete `SANDBOX_DB_URL`, `SANDBOX_FLYWAY_DB_URL`, `SANDBOX_DB_USER`,
  `SANDBOX_FLYWAY_DB_USER`, vars `GCP_WIF_PROVIDER`, `GCP_DEPLOYER_SA`, `GCP_PROJECT_ID`.

🤖 AGENT:
- Delete `backend/deploy/cloudrun-sandbox.yaml`, `cloudrun-migrate-sandbox.yaml`,
  `bootstrap-project.sh`; keep `backend/deploy/sql/`.
- Remove remaining Cloud Run/Supabase mentions from `docs/` and `tasks/todo.md` (one index line).
- Commit (check-comments first).

## Cost (sandbox)

| Item | $/month |
|---|---|
| App Platform service 1 vCPU / 1 GiB | 10 (+ a few cents per migrate job run) |
| Dev database | 7 (Option A Managed PG instead: 15) |
| GHCR (public package) | 0 |
| **Total** | **~17** (or ~25 with Option A) |
