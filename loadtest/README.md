# Load test

`smoke.yml` (Artillery) is the launch sanity check from `tasks/PROD-LAUNCH.md` §5.3. It answers one question: can one
sandbox instance with a 5-connection DB pool handle a launch spike? It ramps up over 2 minutes, holds about 50
concurrent browsers for 5 minutes, then spikes to about 150 for 2 minutes.

**Sandbox only.** `processor.js` refuses a `draazy.com`/`draazy.in` URL.

## 1. Prepare the sandbox (temporary env vars in the DO app)

| Env var | Value | Why |
| --- | --- | --- |
| `WHATSAPP_ENABLED` | `false` | OTP sends go to the mock sender, so no paid messages go out |
| `DRAAZY_SECURITY_RATE_LIMIT_PROPERTY_READS_PER_WINDOW` | `100000` | The default 600/min per IP would turn the test into a 429 test |
| `DRAAZY_OTP_MAX_SENDS_PER_IP_PER_WINDOW` | `100000` | The default is 20 per hour per IP (only needed with `OTP=1`) |
| `DRAAZY_OTP_MAX_PLATFORM_SENDS_PER_WINDOW` | `100000` | The default is 500 per hour (only needed with `OTP=1`) |
| `TURNSTILE_SECRET_KEY` | `1x0000000000000000000000000000000AA` | Cloudflare's always-pass test secret (only needed with `OTP=1`) |

If Cloudflare sits in front of the sandbox, add a WAF skip rule for your IP for the test window, or point
`BASE_URL` at the `*.ondigitalocean.app` origin.

**Revert every row once the test is done.**

## 2. Run

Needs Node 22.18 or newer. From the repo root:

```powershell
cd loadtest
npm install
$env:ARTILLERY_DISABLE_TELEMETRY = 'true'
$env:BASE_URL = 'https://<sandbox-host>/api'
npm run sandbox             # about 9 minutes
$env:OTP = '1'; npm run sandbox   # also sends about one OTP per 20 new users
```

Local dry run (1 user/s for 60 s, against `backend\run-local.ps1`):

```powershell
$env:BASE_URL = 'http://localhost:8080/api'; npm run local
```

## 3. Read the result

Artillery prints a `Checks:` block at the end and exits with code 1 if any check fails:

- p95 for search or the property page at or above 800 ms;
- p95 for bootstrap at or above 500 ms;
- 1% or more of responses with an unexpected status (`draazy.bad_status`);
- 1% or more of responses rate-limited with 429 (`draazy.throttled`).

Per-endpoint timings are under `plugins.metrics-by-endpoint.*`. While it runs, watch CPU, memory and restarts on the DO
app dashboard, and connections on the DB. If p95 climbs while CPU stays low, the 5-connection Hikari pool is the
bottleneck, not the instance.
