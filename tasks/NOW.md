# Now

> **Read this file first and nothing else.** It is the whole orientation a new session needs. Hard
> cap: 60 lines. It holds *state*, never narrative — every line is either a standing rule, a pointer,
> or a number with the date it was taken. Rewrite it at the end of a session; do not append to it.
> Last written: **2026-10-15** against `62d4db0de` (QA close-out + tasks cleanup).

## Lane

| | |
|---|---|
| Branch | `feature/e2e-testing` — QA fixes lane |
| Commit policy | **Never commit or push — the user commits and pushes manually.** |
| Working tree | Dirty by design and shared with another session; commit only your own paths |

## The queue

QA passes 2026-10-14/15 are fixed in code + e2e and UNCOMMITTED. Next: user reviews and commits; the tester
re-runs every checklist row whose Status is not Pass (Not tested = retest, Blocked = SB-09 Maps quota or
SB-11 real devices). Dev work left is the four lines in `todo.md`.
Dev/e2e staff creds live in `db/seed-staff` (local + e2e only): admin `9000000000`, manager `9000000001`.

## Open work — pointers, not restatements

| What | Where | Size |
|---|---|---|
| Manual / smoke test plan | [docs/Draazy-Tester-Checklist.xlsx](../docs/Draazy-Tester-Checklist.xlsx) | 307 rows on 2026-10-15 |
| Open dev work, waiting-by-design | [tasks/todo.md](todo.md) | 21 lines on 2026-10-15 |
| Standing rulings (none open) | [tasks/DECISIONS-NEEDED.md](DECISIONS-NEEDED.md) | 51 lines on 2026-10-15 |
| Durable rules and house style | [tasks/lessons.md](lessons.md) | 202 lines on 2026-10-15 — grep |
| Owner-only actions | [tasks/OWNER-CHECKLIST.md](OWNER-CHECKLIST.md) | 37 lines on 2026-10-15 |
| Backend tech debt | [docs/system/tech-debt.md](../docs/system/tech-debt.md) | highest **D264** on 2026-10-10 |

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
| Next free Flyway slot | **`26.10.19__…`** (no `V`; `<yy>.<mm>.<seq>`, sequence restarts at 01 each month — `26.11.01` in November). Chain squashed to 14 files on 2026-10-13: every DB must be rebuilt from empty | 2026-10-15 |
| e2e spec files | 387 under `e2e` | 2026-10-10 |
| Backend suite (full) | 2,766 run, 0 failed (361 classes, ~4 min) | 2026-10-10 |
| Full e2e sweep | ~40 red in `-Full` (Vite reloads from concurrent edits); all 115 green on targeted rerun | 2026-10-10 |
