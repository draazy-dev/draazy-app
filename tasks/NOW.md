# Now

> **Read this file first and nothing else.** It is the whole orientation a new session needs. Hard
> cap: 60 lines. It holds *state*, never narrative — every line is either a standing rule, a pointer,
> or a number with the date it was taken. Rewrite it at the end of a session; do not append to it.
> Last written: **2026-11-07** on `feature/e2e-testing`; 10 commits on top of `dd565f017` plus one closing the remaining items (userMessage, invite-queued, toast hold, tracker guard); not pushed.

## Lane

| | |
|---|---|
| Branch | `feature/e2e-testing`, QA fixes lane; not pushed |
| Commit policy | Commit only when the user asks; never push |
| Working tree | 528 dirty paths on 2026-11-06, several sessions' uncommitted work; never revert, stash or reset what is not yours |

## The queue

Open feature and verification work is indexed in [todo.md](todo.md); every item has a ruling (through 367). Built rulings are deleted, not kept.
UGC reels (Google Flow, separate lane): read `ugc-flow\00-HANDOFF-state.txt` then `ugc-flow\reels\00-CONTINUITY-RULES.txt`; next = reel 5; ask the user before every Generate.
Social media: start at `social\README.md`; `ig-*` skills write to `social\instagram\`.
Owner-only: OWNER-CHECKLIST (WhatsApp/ZeptoMail webhooks, referral template, deploy, smoke, prod secrets and FAQs).
REFER-SIMPLE built, reviewed and committed; its `-Full` run is below.

## Open work — pointers, not restatements

| What | Where | Size |
|---|---|---|
| Manual / smoke test plan | [docs/Draazy-Tester-Checklist.xlsx](../docs/Draazy-Tester-Checklist.xlsx) | 307 rows on 2026-10-15; stale, re-derive |
| Open dev work and verification | [tasks/todo.md](todo.md) | nothing open on 2026-11-07 |
| Standing rulings | [tasks/DECISIONS-NEEDED.md](DECISIONS-NEEDED.md) | 81 lines on 2026-11-07 |
| Durable rules and house style | [tasks/lessons.md](lessons.md) | 273 lines on 2026-11-07; grep |
| Owner-only actions | [tasks/OWNER-CHECKLIST.md](OWNER-CHECKLIST.md) | 60 lines on 2026-11-07 |
| Backend tech debt | [docs/system/tech-debt.md](../docs/system/tech-debt.md) | highest **D264** on 2026-10-29 |

## Standing constraints

- Never `mvnw clean`, never `DROP DATABASE` on the shared DBs; if a second session reappears, commit through a private `GIT_INDEX_FILE` (lessons.md).
- **Never edit `frontend/src/**` while an e2e run is in flight** — Vite HMR poisons the run.
- **Restart a lane JVM before blaming a spec** — it serves the code it was built from, and a stale one fails as assertion errors that read as product defects. Search lane: `backend/run-lane-search.ps1` (:8097) + `e2e/run-live-search.ps1` (:5192, resets `draazy_e2e_sr2`).
- **Playwright spec filters are regexes matched against Windows paths**: pass bare fragments (`my-listings`), never `a/b/c`, and never comma-joined — both match nothing and report "No tests found".
- `DRAAZY_DEV_MACHINE` must be set for the `dev` profile to start.
- **e2e: `e2e\run-fast.ps1` after each fix** (related specs only; `-Failed` reruns last reds), **`e2e\run-fast.ps1 -Full` before a commit** (4 isolated shards, fails on any red or missing test). See e2e/README.md "Fast runs".
- **A new table needs seed rows or a WAIVED entry** in `e2e/scripts/check-seed-coverage.mjs`, and any new seed file must also be listed in `e2e/global-setup.live.js` `SEEDS` — else every shard dies in global setup and all tests report MISSING.
- **e2e shard DBs (`draazy_e2e_sh1`-`sh4`) persist across runs**: if another session edits an applied migration, shards fail to boot on a checksum mismatch; repair the stored checksum (PGPASSWORD=postgres), never drop the DB.
- `tasks/HANDOFF.md` was deleted 2026-08-20 and **must not be recreated**.
- Cashfree sandbox-verify has no possible e2e coverage — do not chase it.

## Verified facts, with the date taken

| Fact | Value | Taken |
|---|---|---|
| Next free Flyway slot | `26.11.44__?` (no `V`) | 2026-11-07 |
| e2e spec files | 474 under `e2e/tests` | 2026-11-06 |
| Targeted e2e after the userMessage sweep | 154/154 green over 20 spec files | 2026-11-07 |
| Full e2e (`-Full`, 4 shards + nobackend) | 31 red: stale specs, flakes, a rent-ledger bug and a public-cache race; all fixed, every red green on rerun | 2026-11-07 |
| Backend suite (full) | 4,577 tests; 139 reds were Postgres connection exhaustion plus one migration guard, all green on rerun | 2026-11-03 |
