# Worklog

> Open dev work only, one line each. Delete the line when it ships; git is the archive, so nothing else goes here.
> Manual and smoke testing lives in [Draazy-Tester-Checklist.xlsx](../docs/Draazy-Tester-Checklist.xlsx): every row whose
> Status is not Pass. Decisions: [DECISIONS-NEEDED.md](DECISIONS-NEEDED.md). Owner-only: [OWNER-CHECKLIST.md](OWNER-CHECKLIST.md).
> Rules: [lessons.md](lessons.md).

## Open

- [ ] **QA-E2E-2** e2e reds left: seed ageing (community:178/246, QA-SEED-1) and flatmate-moderation:330. Maps reds closed: shard 1 serves on `:3322` (the key's only allowed origin) and `e2e/maps-specs.js` pins Maps specs to it; all 43 Maps files are green there. Watch for: my-rental:42 is data-dependent (owner nav reads "Requests 2"); land-minimum:102 and edit-prefill:312/352 hit a one-off wizard "This page stopped working" that passed on rerun.
- [ ] **QA-SEED-1** Seed dates are absolute (`R__zz_DML_dev_demo_data.sql`, e.g. CHATTER 9708919481 visit created 2026-08-05), so the 30-day free-contact window closes as the calendar moves and property-integration-community gets `contact_quota_exhausted` on `POST /visits`. Make seed timestamps relative to `now()`.
- [ ] **QA-FLAKE-1** `SavedSearchAlertTest.offMeansOff` fails only in the full backend run (order-dependent shared state); its comments still say thirty minutes (the job is hourly).
- [ ] **J02-OPEN** Jobs, unproven: needs-info rolls back a 200-row page on one failure; identity-pending-expiry sends WhatsApp inside the transaction; the digest is uncapped; retention deletes lack indexes on `error_event.first_seen`, `notifications.created_at`, `identity_conflicts.created_at`.
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
