# Now

> **Read this file first and nothing else.** It is the whole orientation a new session needs. Hard
> cap: 60 lines. It holds *state*, never narrative — every line is either a standing rule, a pointer,
> or a number with the date it was taken. Rewrite it at the end of a session; do not append to it.
> Last written: **2026-10-23** against `665db30d0` (FM-TRUST-1+2 + KYC-FIRST built, uncommitted).

## Lane

| | |
|---|---|
| Branch | `feature/e2e-testing` — QA fixes lane |
| Commit policy | **Never commit or push — the user commits and pushes manually.** |
| Working tree | 411 dirty paths on 2026-10-23; shared with another session; do not stage unrelated work |

## The queue

User reviews uncommitted work; open feature and verification work is indexed in [todo.md](todo.md).
Saved/verification slices: `SAVED-*`, `ROOM-DASH-BADGE`, `DASH-VERIFICATION-BUTTONS`, `FM-TRUST-1/2`, `KYC-FIRST` (flatmate posts in Property docs dropdown, agreement period, ID submitted before any verification request); uncommitted.
Next: FM-TRUST-3..7 in todo.md (rulings 331-335); 3+4 = publish checklist, Needs info, Support thread.
Other sessions own ongoing flatmate/admin work. Do not reset their databases, tests or worktree.

## Open work — pointers, not restatements

| What | Where | Size |
|---|---|---|
| Manual / smoke test plan | [docs/Draazy-Tester-Checklist.xlsx](../docs/Draazy-Tester-Checklist.xlsx) | 307 rows on 2026-10-15; stale, re-derive |
| Open dev work and verification | [tasks/todo.md](todo.md) | 193 lines on 2026-10-23; grep slice IDs |
| Standing rulings | [tasks/DECISIONS-NEEDED.md](DECISIONS-NEEDED.md) | 52 lines on 2026-10-23 |
| Durable rules and house style | [tasks/lessons.md](lessons.md) | 227 lines on 2026-10-23; grep |
| Owner-only actions | [tasks/OWNER-CHECKLIST.md](OWNER-CHECKLIST.md) | 37 lines on 2026-10-15; stale, re-derive |
| Backend tech debt | [docs/system/tech-debt.md](../docs/system/tech-debt.md) | highest **D264** on 2026-10-23 |

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
| Next free Flyway slot | `26.10.51__…` (no `V`; recheck before using in the shared tree) | 2026-10-23 |
| e2e spec files | 445 under `e2e/tests` | 2026-10-23 |
| Saved/flatmate/mobile targeted run | 20 passed, zero failed/flaky/skipped; dropdown width ratio and confirmed badge updates included | 2026-10-23 |
| Room dashboard/Documents verification | 19 browser scenarios green after focused reruns; final backend 29/29, React/JS/Java/code/security reviewed | 2026-10-23 |
| Dashboard status/action panels | Final 10/10 targeted tests green: pending room Share + full tenant badge label side by side at 390/1280px, share URL, room badge lifecycle; lint + React/JS/code review clean | 2026-10-23 |
| KYC-FIRST | Backend flatmate/ownership/identity targeted green (only known ModerationSlim reds); e2e 104 targeted, 100 green, 4 admin/properties-console reds from the other session's on-behalf deposit rule | 2026-10-23 |
| FM-TRUST-1/2 | Backend 79 targeted (only known ModerationSlim mobile-key reds); e2e 44+34+15 targeted green; badge review split into `FlatmateBadgeReviewService` | 2026-10-23 |
| Backend suite (full) | 2,766 run, 0 failed (361 classes); stale, re-derive | 2026-10-10 |
| Full e2e sweep | Previous sweep stale; not run for saved/room-badge slices; required before committing | 2026-10-23 |
