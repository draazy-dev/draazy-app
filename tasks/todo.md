# Worklog

> Open dev work only, one line each. Delete the line when it ships; git is the archive.
> Manual and smoke testing: [Draazy-Tester-Checklist.xlsx](../docs/Draazy-Tester-Checklist.xlsx), every row whose
> Status is not Pass. Decisions: [DECISIONS-NEEDED.md](DECISIONS-NEEDED.md). Owner-only: [OWNER-CHECKLIST.md](OWNER-CHECKLIST.md).
> Rules: [lessons.md](lessons.md).

## Open

- REFER-KYC (2026-11-08, uncommitted): referral caps 3/month and 10/year (migration 26.11.44); the referrer's 50% credit is locked until both sides have KYC. Backend and 58 referral e2e tests green. All five uncommitted slices here were reviewed on 2026-11-19 (react, code, security reviewers) and both findings are fixed (erasure now deletes invites *to* the erased number; the startup purge no longer aborts boot on failure). Only the shared `-Full` run remains before commit.
  - Below-bar review notes, not yet fixed:
    - `DataExportScope` (around line 1150): the rationale for withholding `referred_mobile` is stale now that the friends list shows it unmasked; the export should probably also cover `referral_invites` and `referral_redeem_failures`.
    - The privacy notice should say that redeeming a code shows the redeemer's mobile and KYC status to the referrer.
    - The vault blocklist matches free text exactly, so variants like "Aadhar" get through; an allow-list would close this.
    - `TurnstileBotDefence` doesn't check `hostname`/`action` in the siteverify response.
- REFER-FRIENDS (2026-11-08, uncommitted, on top of REFER-KYC): "Your friends" list on /refer (`GET /me/referrals` → `friends`, `ReferralFriends.java`, `refer/FriendList.jsx`, mobiles unmasked by user choice). Backend and 28 targeted e2e tests green; reviewed with REFER-KYC.
- KYC-VAULT-RETIRE (2026-11-08, done, uncommitted): Personal vault no longer takes Aadhaar/PAN/photo/ownership proof (400 + startup purge); rent-agreement Index II lives in the request property's vault (bound pick, else `?listing=`). Backend tests + e2e (rent-agreement*, doc-info, doc-viewer-scheme, services-request-budget) green.
  - [ ] `run-fast.ps1 -Full` before commit
  - `services-request-budget.spec.js:36` failed once under 4-shard load (duplicate `GET /service-requests?type=rent-agreement`), green alone; possibly pre-existing flake
  - Follow-up (uncommitted): vault Personal tab removed (its HRA form duplicated `/tools/rent-receipt-generator`, now linked from the Rent Wallet HRA card); `lib/data/rentReceiptGen.js` deleted; empty-state line for users with no listing/room/tenancy. doc-info, tenant-finances, property-integration, date-time-fields green.
  - Follow-up (uncommitted): owner vault shows only categories relevant to the selected listing's type/deal/stage (`ownerDocCategories`), loan checklist only for sales, Rent Agreement only for rentals; "My portfolio" fallback removed. Backend still accepts any owner category (frontend-only filter).
- PAY-POPUP (2026-11-09, uncommitted): Cashfree's bank popup no longer loads the RA page (`lib/paymentReturn.js` guard in `main.jsx`, RA `RETURN_PATH` gains `?order_id=`); RA/RevisedTerms decline or close reads "Payment not completed". Backend + 32 e2e green.
  - [ ] PENDING VERIFICATION: manual Cashfree sandbox failure and success runs for RA and plan checkout (does the popup close itself, does the original tab show the result)
  - [ ] `run-fast.ps1 -Full` before commit
- TURNSTILE-LOGIN (2026-11-18, uncommitted): intermittent "We couldn't sign you in. Reload the page…" on Send OTP was a missing/expired/spent Turnstile token. Send now waits ≤15 s for a fresh token (`components/security/turnstileToken.js`), the widget stays mounted for Resend and recovers a failed script, `bot_check_failed` 403 replaces `forbidden` (one client auto-retry, own copy), siteverify retries once on 5xx/transport under one `idempotency_key`. Backend Turnstile/BotDefence tests + 40 targeted e2e green.
  - Local real-widget check 2026-11-19 (Cloudflare test keys). Pass: token sent, login 200, Resend after 60 s got a fresh token. Fail (always-fail secret): two 403 `bot_check_failed` (automatic retry fired), then "Security check didn't finish" copy.
  - [ ] PENDING VERIFICATION: interactive site key `3x00000000000000000000FF`; on sandbox, Send after idling more than 5 minutes, and Resend
  - [ ] `run-fast.ps1 -Full` before commit
