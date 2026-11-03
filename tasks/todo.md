# Worklog

> Open dev work only, one line each. Delete the line when it ships; git is the archive, so nothing else goes here.
> Manual and smoke testing lives in [Draazy-Tester-Checklist.xlsx](../docs/Draazy-Tester-Checklist.xlsx): every row whose
> Status is not Pass. Decisions: [DECISIONS-NEEDED.md](DECISIONS-NEEDED.md). Owner-only: [OWNER-CHECKLIST.md](OWNER-CHECKLIST.md).
> Rules: [lessons.md](lessons.md).

## Open: features not built yet

- [ ] Flaky under full-run load, green on rerun (2026-11-03): `flatmates/owner-notice.spec.js:44` (locality menu left outside the viewport after the page scrolled to the footer), `services/rent-agreement-view-filed.spec.js:207` (one checkout 409 right after the docs upload), `services/rent-agreement.spec.js:201`, `rent-agreement-validation.spec.js:376/542`, the locality picker stuck on "Searching…" (`list-property/photo-ux.spec.js:98`, `managed-properties.spec.js:84`), `flatmates/group-join-vetting.spec.js:44` (host missed the seeker's SSE reply for 15s), `flatmates/interest-doors.spec.js:227` (`goto` ERR_ABORTED), `upload-policy.spec.js:72` (Vite reload mid-`evaluate`).

## Open: follow-ups on shipped work

- [ ] Owner (GitHub settings, needs admin): enable Dependabot alerts, secret scanning and push protection.
- [ ] Owner (Google Cloud): restrict the Maps browser key by HTTP referrer and to the APIs in use; an old copy sits in git history (`frontend/dist-perf`).
- [ ] Owner (deploy): confirm prod/sandbox set `JWT_SECRET`, `REFERRAL_SIGNAL_SALT`, `IDENTITY_HASH_SECRET`, `IDENTITY_ENCRYPTION_KEY`, `IDENTITY_ENCRYPTION_KEY_ID`, `STAFF_TOTP_KEY`; they no longer have a fallback, so a missing one fails boot.
- [ ] 19 moderate/low npm advisories remain in dev tooling only (prod deps: 0); revisit when Dependabot opens majors.


## Waiting by design

- SSE hub is single-instance; multi-node needs LISTEN/NOTIFY.
- Owner-deferred (356): city selector (then move `ACTIVE_CITY`/Pune bounds in `LocalityPlaceService`/`SocietyPlaceRules` onto `cities`), SMS, 1.5/2.5 BHK.
- Accepted race: vault pick while a camera file is still compressing.
- Staff photo takedown notifies in-app only (no WhatsApp template).
