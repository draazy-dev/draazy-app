# Worklog

> Open dev work only, one line each. Delete the line when it ships; git is the archive, so nothing else goes here.
> Manual and smoke testing lives in [Draazy-Tester-Checklist.xlsx](../docs/Draazy-Tester-Checklist.xlsx): every row whose
> Status is not Pass. Decisions: [DECISIONS-NEEDED.md](DECISIONS-NEEDED.md). Owner-only: [OWNER-CHECKLIST.md](OWNER-CHECKLIST.md).
> Rules: [lessons.md](lessons.md).

## Open

- [ ] **QA-E2E-2** e2e reds left: Google Maps Demo Key quota (~17: locality-select, map-panel-contact, map-popup, trust-disclosure, required-fields:183, rent-receipts, managed-properties:67, locality-intel:8, pull-to-refresh:201, edit-prefill:268/290, property-integration:194), seed ageing (community:178/246, QA-SEED-1) and flatmate-moderation:330. Recheck with a Maps key that has quota (SB-09).
- [ ] **QA-SEED-1** Seed dates are absolute (`R__zz_DML_dev_demo_data.sql`, e.g. CHATTER 9708919481 visit created 2026-08-05), so the 30-day free-contact window closes as the calendar moves and property-integration-community gets `contact_quota_exhausted` on `POST /visits`. Make seed timestamps relative to `now()`.
- [ ] **QA-FLAKE-1** `SavedSearchAlertTest.offMeansOff` fails only in the full backend run (order-dependent shared state); its comments still say thirty minutes (the job is hourly).
- [ ] **J02-OPEN** Jobs, unproven: needs-info rolls back a 200-row page on one failure; identity-pending-expiry sends WhatsApp inside the transaction; the digest is uncapped; retention deletes lack indexes on `error_event.first_seen`, `notifications.created_at`, `identity_conflicts.created_at`.

## Waiting by design

- SSE hub is single-instance; multi-node needs LISTEN/NOTIFY.
- Owner-deferred: city selector (then move `ACTIVE_CITY`/Pune bounds in `LocalityPlaceService`/`SocietyPlaceRules` onto `cities`), SMS, 1.5/2.5 BHK.
- Accepted race: vault pick while a camera file is still compressing.
- Zoho/Meta delivery webhooks for the provider call log.
- Staff photo takedown notifies in-app only (no WhatsApp template).
