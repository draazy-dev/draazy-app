# Worklog

> Open dev work only, one line each. Delete the line when it ships; git is the archive, so nothing else goes here.
> Manual and smoke testing lives in [Draazy-Tester-Checklist.xlsx](../docs/Draazy-Tester-Checklist.xlsx): every row whose
> Status is not Pass. Decisions: [DECISIONS-NEEDED.md](DECISIONS-NEEDED.md). Owner-only: [OWNER-CHECKLIST.md](OWNER-CHECKLIST.md).
> Rules: [lessons.md](lessons.md).

## Open: features not built yet

- [ ] **FM-TRUST** Flatmate moderation + verification on the property machinery (rulings 331-335). Two badges only, **ID verified** and **Verified property**; posting never needs either (ADR-019).
  - [ ] FM-TRUST-3 Publication parity: rooms + flat-holding groups need the 3 property ticks before Publish; seeker + hunting groups stay live-first with post-hoc review; reason codes; Needs info keeps the post pending; Hide/Remove kept; same desk tabs + popup.
  - [ ] FM-TRUST-4 "Messages from Draazy Support" thread for flatmate posts on the existing `review_messages` model; Needs info posts into it; unread counts.
  - [ ] FM-TRUST-5 Dashboard: every flatmate kind uses the property status card (status, progress, Share, Get verified where eligible, Support messages); Documents tab one Get-verified card per kind.
  - [ ] FM-TRUST-6 Public cards/detail: simple badge copy; `verifiedOnly` filter = Verified property.
  - [ ] FM-TRUST-7 Migration of existing tiers/reviews and base64 agreement docs; e2e + COVERAGE rows; flow docs.
- [ ] **FLATMATE-BOARD-3** (339) "Shared vibes" on cards (top 2 shared answers, e.g. "Both night owls · Both veg"; needs per-item answers from the feed). Home: 3 tiles, one per case, with live counts.
- [ ] **FM-MUST-HAVES** (340) A seeker "See matching rooms" link via the room feed's furn/gated/bath filters; parking on room listings; stay length and room amenities (Wi-Fi, AC, washing machine, lift, power backup).
- [ ] **OWNER-VIEWS hardening** (user decision) Count live listings only; one view per viewer per day (user id, or a hashed IP for anonymous viewers); backfill distinct viewer-days in a new migration. `properties.enquiries` also has no writer (shown on PropertyHeader, My Listings, admin queue).
- [ ] **PROVIDER-WEBHOOKS** (357) Zoho/Meta delivery webhooks feed the provider call log.

## Open: follow-ups on shipped work

- [ ] **i18n gaps** hi/mr strings for the Requests panel; hardcoded English in flatmates `FlatmateLanding.jsx`, `helpers.js`, `alertCriteria.js`, `model.js` room types.
- [ ] **REQ-HOME** (351) Full ARIA tabs (arrow keys) on Received | Sent. BLOCKED: `RequestsPanel.jsx` has another session's uncommitted work; build after it lands.
- [ ] **UNCOMMITTED slices: PENDING AGENT REVIEW + full e2e sweep** LEAD-NOTIF-BADGE (request notifications → request inbox, Messages badge), HOME-ATTN-SUMMARY (Home "Needs your attention" rows), LEAD-CHAT-REQUESTS (visit/offer request threads), CASE-QUICK-REPLIES (chat chips), SMALL-FIXES (owner-ID gate on the property badge, per-user wizard draft, Edit & resubmit on fixable rejections, share icon, bottom-nav CSS, Quality Score privacy, staff name pattern, job and index hardening; security-reviewer for the first three), FULL-TEAM, TEAM-TAB, ROOMS-ONLY, SAVED-SORT.
- [ ] **LEAD-CHAT** (343, 344) An offers row on Home "Needs your attention"; the dashboard Visits-tab confirm opens the chat. `requests-inbox` "a reminder unlocks a day after…" may be flaky.
- [x] **R2 + WHATSAPP HARDENING** (uncommitted; reviews applied; targeted specs green, full e2e not run) Photo quota + 7-day sweep (failed deletes kept) + restored drafts drop photos failing twice online; owner notices capped (advisory-locked), STOP/START webhook, OTP 503 + `Retry-After`, Turnstile boot guard, WhatsApp notice on OTP screens, optional `WHATSAPP_OWNER_NOTICE_PHONE_NUMBER_ID`, Ops badge desk shows the consent-number account. Deliberate: non-OTP WhatsApp stays default-on; OTP send stays in-transaction; the 30/hour owner-notice cap can be drained by throwaway accounts (WARN only).
- [ ] **BACKEND-REDS** Fail on the shared tree, not from recent slices: `SqlConstructionGuardTest` (AdminFlatmateAnalyticsService), `NightlyJobsQaTest.notificationsExpireAfterNinetyDays`, `ErasureCoverageTest` (flatmate_reviews), `SuspendedOwnerListingsTest`, `FlatmateModerationSlimTest`, `SocietyListingAlertsAfterCommitTest`.
- [ ] **FM-AGREEMENT-DOC** Room/group create and edit store the client's raw `agreementDoc` map (`FlatmateSupplyService.claimOf`); rebuild it from the same whitelist the badge-request path uses (security review, low). BLOCKED: `FlatmateSupplyService.java` has another session's uncommitted work; build after it lands.
- [ ] **STAFF-ALERTS** (348) KYC reminders ignore `identity_verifications.claimed_by` (send to the claimer while the claim is live); `properties` has no partial index on `status = 'pending'`; resolved items do not clear their alert (`Notifier.markRead`); no staff help article yet.
- [ ] **LISTING-PURGE** (349) Check chats/deals/saved/invoices render a purged listing sensibly (no photos, no address). Retry failed R2 deletes nightly from a pending-deletes table.
- [ ] **RENT-E2E** (350) Link `managed_properties` ↔ `tenancies`: a closed rental on a listing published from a managed property (`published_listing_id`) fills its tenant, rent and start date.
- [ ] **RC-FIX notes** W2 notification/audit texts (MOD-20/21/22, MC-09, PC-05, XC-03/04) are covered only by `ModerationRecordTest`/`ReviewReasonParityTest`, no e2e.
- [ ] **ONE-KEY** `docs/Draazy-Tester-Checklist.xlsx` rows 92, 132, 309–311 still describe held drafts.
- [ ] **FULL-TEAM** (341, 342) Fully-taken rooms leave the board like full groups, "Room taken" notice by link; seats freed by members leaving may pass the cap. `FlatmateStaleWriteTest` 4 errors (locality 422 on a fresh DB, maybe pre-existing); new strings are en-only.
- [ ] **TEAM-TAB** (358) Migrate tenant groups that already have a flat into rooms (one-off migration), then refuse new ones in the API (~70 backend fixtures need updating). `owner_lists_rooms` copy is en-only.
- [ ] **ROOMS-ONLY** Rooms lists rooms only, Teams only hunting teams; a settled group is off-board but readable by link (closes the board side of TEAM-TAB). Demo groups converted to hunting teams, Aundh room added, consent row moved to the villa; the redundant "Looking for a flat" chip is gone from team cards and detail. Pre-existing reds: `FlatmateModerationSlimTest.reviewRowIsACard`, 4 `FlatmateStaleWriteTest`; `discovery` split-budget test flaked once.
- [ ] **SAVED-SORT** Saved drops its sort dropdown; All is one newest-saved-first list, merged on the `savedAt` both saved APIs now return.

## Open: test infrastructure

- [ ] **QA-SEED-1** Seed dates are absolute (`R__zz_DML_dev_demo_data.sql`, ~330 literals, e.g. CHATTER 9708919481 visit 2026-08-05), so time-window rules (30-day free contacts, 90-day histories) drift as the calendar moves. Make seed timestamps relative to `now()`.
- [ ] **QA-FLAKE-1** `SavedSearchAlertTest.offMeansOff` fails only in the full backend run (order-dependent shared state); green alone.
- [ ] **E2E-BUILD** `run-fast.ps1 -Build` ran `-Full -Shards 6` in 79 min vs ~3.4 h. Not the gate until its build-only reds are fixed: `goto(…, { waitUntil: 'networkidle' })` on signed-in pages never idles once `/api/messages/stream` opens (112 uses in 39 files, 59 in the rent-agreement specs, which also time out under 6-shard load on dev). Fix: replace `networkidle` with a readiness wait, then make `-Build` the default.
- [ ] **QA-E2E-2** (355) Maps specs are pinned to shard 1 (`:1122`, the key's allowed origin) by `e2e/maps-specs.js`; Google latency makes `list-property/geocode` and wizard Places steps flaky under load. Stub Places/Geocode with recorded responses; keep one real-Maps smoke spec.

## Needs a deploy or a real device

- [ ] **PAY-TTL** Sandbox checkout TTL 20 / floor 16 (Cashfree floor is 15): redeploy sandbox, buy a Contact Pack.
- [ ] **JVM-MEM** 50% heap, metaspace 192 MB, code cache 128 MB, Tomcat 50 threads: redeploy sandbox and check DO memory settles at or below ~80%.
- [ ] **CF-SANDBOX** Cashfree dashboard: merchant name still "testMerchantName"; confirm the webhook subscribes to failed/user-dropped payment events. Untested: RA payment (corporate proxy blocks uploads), UPI collect (sandbox offers no VPA entry).
- [ ] **WA-WEBHOOK** (owner, at deploy; needs repo admin). Template `draazy_owner_room_notice` approved + wired and Meta app published 2026-10-27. Set both secrets or neither, or boot fails.
  - [ ] Generate the verify token: `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 32 | % {[char]$_}) | Set-Clipboard`
  - [ ] GitHub ▸ Settings ▸ Environments ▸ `sandbox`: add `SANDBOX_WHATSAPP_WEBHOOK_VERIFY_TOKEN` (that token) and `SANDBOX_WHATSAPP_APP_SECRET` (Meta App ▸ App settings ▸ Basic ▸ App secret ▸ Show).
  - [ ] Commit and deploy; confirm `https://sandbox.draazy.com/api/actuator/health` is up.
  - [ ] Meta App ▸ Use cases ▸ Connect on WhatsApp ▸ Configuration: callback `https://sandbox.draazy.com/api/webhooks/whatsapp`, same token, "Verify and save", then subscribe the `messages` field.
  - [ ] Smoke: post a flatmate room for a consent number and check the owner gets the WhatsApp notice; reply STOP from that phone and check notices stop.
- [ ] **STREET-VIEW** Enable the Street View Static API (OWNER-CHECKLIST).
- [ ] **FMQA-DEVICE** Flatmates ran on Playwright emulation only: real Android/iPhone (map pan, sheets, photo/HEIC upload, OTP autofill), real SMS/OTP delivery and Maps quota exhaustion are untested.

## Waiting by design

- SSE hub is single-instance; multi-node needs LISTEN/NOTIFY.
- Owner-deferred (356): city selector (then move `ACTIVE_CITY`/Pune bounds in `LocalityPlaceService`/`SocietyPlaceRules` onto `cities`), SMS, 1.5/2.5 BHK.
- Accepted race: vault pick while a camera file is still compressing.
- Staff photo takedown notifies in-app only (no WhatsApp template).
