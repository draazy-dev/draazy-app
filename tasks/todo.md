# Worklog

> Open dev work only, one line each. Delete the line when it ships; git is the archive, so nothing else goes here.
> Manual and smoke testing lives in [Draazy-Tester-Checklist.xlsx](../docs/Draazy-Tester-Checklist.xlsx): every row whose
> Status is not Pass. Decisions: [DECISIONS-NEEDED.md](DECISIONS-NEEDED.md). Owner-only: [OWNER-CHECKLIST.md](OWNER-CHECKLIST.md).
> Rules: [lessons.md](lessons.md).

## Open

- [ ] **ONE-KEY** single-staff approvals (#330), migrations 26.10.34–36; dashboard shows identity pending/verified. e2e green on a private lane (117/118: identity, property moderation, registration-check, service-desk, plans-checkout, kyc-growth-levers). `docs/Draazy-Tester-Checklist.xlsx` rows 92, 132, 309–311 still describe held drafts.
- [ ] **E2E-METER** possibly pre-existing: `ops/verification-thread` "a duplicate meter files a staff-only note" fails, since `POST /me/listings` stores no `electricity_meter_key` for `electricityMeterNo`, so `ListingDuplicateProbe` never fires.
- [ ] **PAY-TTL** sandbox checkout 500 (TTL 15 = Cashfree floor) fixed: TTL 20, floor 16; `plans-checkout` e2e green. PENDING VERIFICATION: redeploy sandbox, buy Contact Pack.
- [ ] **QA-E2E-2** e2e reds left: seed ageing (community:178/246, QA-SEED-1) and flatmate-moderation:330. Maps reds closed: shard 1 serves on `:3322` (the key's only allowed origin) and `e2e/maps-specs.js` pins Maps specs to it; all 43 Maps files are green there. Watch for: my-rental:42 is data-dependent (owner nav reads "Requests 2"); land-minimum:102 and edit-prefill:312/352 hit a one-off wizard "This page stopped working" that passed on rerun.
- [ ] **UI-STD** App-wide standardisation: one size scale (`--control-h` 44 · `--dz-icon-btn` 36 · `--dz-chip-h` 32 · `--dz-tag-h` 24 · `--dz-count-h` 20, `components/chips.css`, `<Button>`) and one mobile overlay shape (floating glass card, as `.filter-panel`). Done: `/listings` scale, filter card + `ScrollRail`. One group per slice, in order; each = edits → 412px screenshots → related e2e → spec + COVERAGE row:
  - [x] **G0 Guard** `scripts/check-ui-std.mjs`: counts hand-rolled chips/tags, raw `className="btn`, ad-hoc `fixed inset-0` overlays per file against a baseline that may only shrink; the plan is done when it reads 0.
  - [x] **G1 Overlay shell** `--dz-float-*` tokens in `index.css :root`; `.filter-panel`, `<Modal>`, `.dz-modal`, `.sf-modal`, dropdown/action cards, `.dz-cal`, `.dz-mdp` on them. Picker (`--picker`) stays full-height for the keyboard. `mobile/flatmates-filter-sheet` "Clear resets it" flaked once on mobile-small (budget debounce vs Clear), passed on rerun.
  - [x] **G2 Rogue overlays → shell**: overlay count 0. `.dz-modal-backdrop` raised to z 1500. Admin societies merge dialog is unverified in e2e: every `POST /societies` mint answers 422 in this env.
  - [x] **G3 Shared chrome**: Navbar, BottomNav, Footer, CityChrome, CookieConsent, InstallPrompt, toasts, AssistantWidget chips, FilterGroup, flatmates FAB count.
  - [x] **G4 Discovery**: Home, RentBuyLanding, listings filter-sheet chips + map, Compare/CompareNobroker, Societies/Society, Locality, Reels.
  - [x] **G5 Property**: Property (31 files), PropertyPassport, ScheduleVisit, ViewDocuments, Owner + owner-hub.
  - [x] **G6 Flatmates**: Flatmates, FlatmateLanding, FlatmateDetail, flatmates/ (36), TenantProfile.
  - [x] **G7 Account**: Dashboard (31), Saved, Notifications, Messages, Refer, VerifyIdentity, Signin/Signup/StaffLogin/StaffInvite.
  - [x] **G8 Post & pay**: ListProperty wizard (21), Plans, Checkout.
  - [x] **G9 Services & tools**: Services + services/ (31), tools/ (6), EmiCalculator, PayRentComingSoon.
  - [x] **G10 Content**: help/, support/, Support, Contact, blog/, TrustPage, Privacy/Terms/Disclaimer/RefundPolicy, Stub.
  - [x] **G11 Admin** (21 pages + ~40 parts) and **G12 Ops** (6 + ~30): desktop-first, so tokens/classes only; mobile layout untouched.
  - [x] **Buttons + calendars** (re-audit): ~95 padded buttons → `h-btn*` (`--btn-h*`), wizard `Pill`s, dashboard tab bar `h-14`; HRA month inputs → month `Select`; guard adds `cta` + `nativePicker`. Left by design: hero eyebrow badges (38px), content-height rows/cards.
  - [x] **Round 2 fixes**: `h-btn*` moved to `index.css` utilities (dev server never reloaded the Tailwind config); Flatmates tile count; wizard Back/Next bar = bottom-nav height (16px corners kept); `.gradient-text` stroke 0 in light theme; dashboard/help sticky bars dock under the hiding nav; Maps down → `PinMapBox` one-line note + SocietySelect offers `GET /societies?mapped=true` (Google-picked rows only). Skipped: ops "approximate pin" flag (needs a column).
  - [x] **Home FAQ + explore**: FAQ questions 80px → 48px rows; locality guides and blog redesigned as two icon-headed cards (wrapping `.dz-chip` guides, blog rows with topic icon + chevron).
- [ ] **QA-SEED-1** Seed dates are absolute (`R__zz_DML_dev_demo_data.sql`, e.g. CHATTER 9708919481 visit created 2026-08-05), so the 30-day free-contact window closes as the calendar moves and property-integration-community gets `contact_quota_exhausted` on `POST /visits`. Make seed timestamps relative to `now()`.
- [ ] **QA-FLAKE-1** `SavedSearchAlertTest.offMeansOff` fails only in the full backend run (order-dependent shared state); its comments still say thirty minutes (the job is hourly).
- [ ] **J02-OPEN** Jobs, unproven: needs-info rolls back a 200-row page on one failure; identity-pending-expiry sends WhatsApp inside the transaction; the digest is uncapped; retention deletes lack indexes on `error_event.first_seen`, `notifications.created_at`, `identity_conflicts.created_at`.
- [ ] **FMQA-STAFF2** The flatmate self-moderation 403 sees only the signed-in account; a staffer's second, unlinked consumer account can still be checked by them. Accepted residual risk until accounts are linked by mobile/KYC.
- [ ] **FMQA-DEVICE** Flatmates pre-prod pass ran on Playwright emulation only: real Android/iPhone (map pan, sheets, photo/HEIC upload, OTP autofill), real SMS/OTP delivery and Maps quota exhaustion are untested.
- [x] **FMQA** Flatmates pre-prod maker-checker pass: FM-01..42 fixed (self/party 403s, terminal reviews, reversible ladder with notes, stale-write locks, archived authors hidden, erasure both ways, consent/unsplit races, one accepted group, full room refuses asks, desk Remove on expired, profile gender set-once gates women/men-only asks); OpenAPI lists the new 400/403/409s. Backend 4102 green; flatmate e2e 245/245.
- [x] **RENT-E2E** Rent tracking end to end: validated tenant mobile (26.10.19), tenant view `GET /me/tracked-rent` linked by mobile with receipts since `tenant_since` (26.10.20), owner WhatsApp invite, notifications on tracking/receipt, daily `tracked-rent-reminders` job, erasure scrubs both sides. Not done: `managed_properties` ↔ `tenancies` link (deal-closed tenancies stay a separate surface).
- [ ] **QA-DB-1** Shared `draazy_test` is stale (history stops at 26.10.14; 26.10.05 checksum differs after the squash), so every Spring test fails on Flyway validate. Run with `TEST_DB_URL` pointing at a fresh DB until it is rebuilt.
- [ ] **RC-FIX** RC sign-off defects (77, NO-GO 2026-10-16); WhatsApp + Cashfree stay mocked locally:
  - [x] **S1 Blockers** MC-01/02/03 (+MC-04, review MEDIUM): `Property.isMadeBy` guards admin edit, ownership badge and duplicate merge/dismiss; merge 404s an unknown keeper; `/status` without `expectedStatus` only decides a pending listing. Backend 4019 green; targeted e2e (10 files) 45/55 — the 10 reds (`required-fields`, `seam-write`) all fail in `pickGoogleSociety` ("Pick the building, not an area") from the other session's uncommitted `SocietySelect`/society work, not RC-FIX; rerun those two once it lands.
  - [x] **S2–S5** all 73 remaining defects fixed in code by 5 parallel workers + review-fix pass (opus code + security review: 0 Critical/High; 7 Medium fixed). Backend 4067 green. Migrations 26.10.30 (bhk/rent-only cleanup), 26.10.31 (`recheck_changes`). PC-09: Co-working added to the wizard (owner decision).
  - [x] **S6** full e2e once (1869/1918); triaged the 48 reds: 7 spec drifts from RC-FIX fixed (queue-slim start call, sale drops rent answers, rejected `other` needs a note, coarse-pointer 44px pill, Share+badge row, RERA check before approve), XC-10 Fullscreen name restored (label-in-name). Rest = QA-E2E-2 Maps/seed reds + other-session Modal/FAQ/`check:i18n`. Backend 4072 green.
  - [x] **S7** Comment + ponytail pass over all uncommitted code (549 files): ~350 banner/id/narration comments cut, orphaned `Sparkline.jsx`/`qualityLabel`/`countPostedSince` and 11 unused imports deleted. Already-dead-in-HEAD exports (`Menu.jsx`, `quietHours.js`, `lib/data/finances.js` getters, `useValidation`/`useAutosave`) left for a separate cut.
  - [ ] PENDING VERIFICATION, no e2e spec yet: W2 notification/audit texts (MOD-20/21/22, MC-09, PC-05, XC-03/04) are covered only by `ModerationRecordTest`/`ReviewReasonParityTest`. Untestable locally: PC-08 (Maps key), PC-16 (no OffscreenCanvas-less browser), MOD-17 4G timing. `liveSociety.js:81` cleanup rejects with a bare `other` (no note), so it silently fails.
  - [ ] Notes: public `qualityScore` reveals the ownership-doc band on sale listings; the list-property draft key isn't per-user (shared device); a rejected listing's tracker step reads `submitted`.

## Waiting by design

- SSE hub is single-instance; multi-node needs LISTEN/NOTIFY.
- Owner-deferred: city selector (then move `ACTIVE_CITY`/Pune bounds in `LocalityPlaceService`/`SocietyPlaceRules` onto `cities`), SMS, 1.5/2.5 BHK.
- Accepted race: vault pick while a camera file is still compressing.
- Zoho/Meta delivery webhooks for the provider call log.
- Staff photo takedown notifies in-app only (no WhatsApp template).
