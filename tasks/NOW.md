# Now

> **Read this file first and nothing else.** It is the whole orientation a new session needs. Hard
> cap: 60 lines. It holds *state*, never narrative — every line is either a standing rule, a pointer,
> or a number with the date it was taken. Rewrite it at the end of a session; do not append to it.
> Last written: **2026-10-27** against `ff84bb8ec` (SMALL-FIXES + R2/WhatsApp hardening built, uncommitted).

## Lane

| | |
|---|---|
| Branch | `feature/e2e-testing` — QA fixes lane |
| Commit policy | **Never commit or push — the user commits and pushes manually.** |
| Working tree | 301 dirty paths on 2026-10-27; shared with another session; do not stage unrelated work |

## The queue

User reviews uncommitted work; open feature and verification work is indexed in [todo.md](todo.md).
Every todo item has a ruling (through 358, 2026-10-27); built rulings are deleted, not kept.
Uncommitted slices awaiting reviewers + `-Full`: one line in todo.md (`UNCOMMITTED slices`).
Blocked on the other session's dirty files: `FM-AGREEMENT-DOC` (FlatmateSupplyService), `REQ-HOME` (RequestsPanel).
Meta done 2026-10-27 (owner-notice template approved + wired, app published); last step is owner-only: todo.md `WA-WEBHOOK`.
Next: FM-TRUST-3..7, then FLATMATE-BOARD-3, FM-MUST-HAVES, STAFF-ALERTS, LISTING-PURGE (all decided). Other sessions own ongoing flatmate/admin work. Do not reset their databases, tests or worktree.

## Open work — pointers, not restatements

| What | Where | Size |
|---|---|---|
| Manual / smoke test plan | [docs/Draazy-Tester-Checklist.xlsx](../docs/Draazy-Tester-Checklist.xlsx) | 307 rows on 2026-10-15; stale, re-derive |
| Open dev work and verification | [tasks/todo.md](todo.md) | 61 lines on 2026-10-27; grep slice IDs |
| Standing rulings | [tasks/DECISIONS-NEEDED.md](DECISIONS-NEEDED.md) | 72 lines on 2026-10-27 |
| Durable rules and house style | [tasks/lessons.md](lessons.md) | 240 lines on 2026-10-27; grep |
| Owner-only actions | [tasks/OWNER-CHECKLIST.md](OWNER-CHECKLIST.md) | 37 lines on 2026-10-15; stale, re-derive |
| Backend tech debt | [docs/system/tech-debt.md](../docs/system/tech-debt.md) | highest **D264** on 2026-10-27 |

## Standing constraints

- **A second Copilot session shares this repo and its databases.** Never `mvnw clean`, never `DROP DATABASE`.
- **It also keeps files staged in the shared index** — commit through a private `GIT_INDEX_FILE` (recipe in lessons.md, last entry).
- **Never edit `frontend/src/**` while an e2e run is in flight** — Vite HMR poisons the run.
- **Restart a lane JVM before blaming a spec** — it serves the code it was built from, and a stale one fails as assertion errors that read as product defects. Search lane: `backend/run-lane-search.ps1` (:8097) + `e2e/run-live-search.ps1` (:5192, resets `draazy_e2e_sr2`).
- **Playwright spec filters are regexes matched against Windows paths**: pass bare fragments (`my-listings`), never `a/b/c`, and never comma-joined — both match nothing and report "No tests found".
- `DRAAZY_DEV_MACHINE` must be set for the `dev` profile to start.
- **e2e: `e2e\run-fast.ps1` after each fix** (related specs only; `-Failed` reruns last reds), **`e2e\run-fast.ps1 -Full` before a commit** (4 isolated shards, fails on any red or missing test). See e2e/README.md "Fast runs".
- **A new table needs seed rows or a WAIVED entry** in `e2e/scripts/check-seed-coverage.mjs`, and any new seed file must also be listed in `e2e/global-setup.live.js` `SEEDS` — else every shard dies in global setup and all tests report MISSING.
- `tasks/HANDOFF.md` was deleted 2026-08-20 and **must not be recreated**.
- Cashfree sandbox-verify has no possible e2e coverage — do not chase it.

## Verified facts, with the date taken

| Fact | Value | Taken |
|---|---|---|
| Next free Flyway slot | `26.10.65__…` (no `V`; recheck before using in the shared tree) | 2026-10-27 |
| e2e spec files | 448 under `e2e/tests` | 2026-10-27 |
| SMALL-FIXES | Backend 8 focused classes green; e2e 21 specs 134/134 (layout-and-chrome flaked once on a Vite import) | 2026-10-27 |
| R2/WhatsApp hardening | 7 targeted specs 51/51 (signin-otp-session:457 passed on rerun); backend targeted green bar ModerationSlim `reviewRowIsACard` | 2026-10-27 |
| Scratch DB | `draazy_test_hardening`; drop when no session uses it | 2026-10-27 |
| Earlier slices (saved, room badge, KYC-FIRST, FM-TRUST-1/2) | Targeted backend + e2e green; only known ModerationSlim reds | 2026-10-23 |
| Backend suite (full) | 2,766 run, 0 failed (361 classes); stale, re-derive | 2026-10-10 |
| Full e2e sweep | Not run for any uncommitted slice; required before committing | 2026-10-27 |
