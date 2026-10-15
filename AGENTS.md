## Workflow

**Attachments.** An attached image is the source of truth: if the code contradicts it, the code is wrong; say so. Inspect it first and state what you see and what you'll change. Referenced but missing → say so and stop.

**Skills, on demand.** Default: none (answers, explanations, mechanical edits). Otherwise at most two per turn (tie → the one matching the artifact asked for, else the lower row):

| Trigger | Skill |
|---|---|
| Frontend code: conventions, file map, auth guards, Playwright harness | `draazy-frontend` |
| Backend code: Spring Boot + PostgreSQL, data model, Flyway, JWT/role guards, contact gate, provider seams, frontend `http` wiring | `draazy-backend` |
| Listing/search/filter/map/wizard/contact-gate/alert **behaviour**; property-page SEO | `real-estate-expert` |
| Scope, priority, tradeoffs, success metrics for a new feature | `senior-product-manager-realestate` |
| Mobile/touch UI: phone viewport, bottom sheet, carousel, tap/scroll, safe areas, PWA | `mobile-native` |
| New UI surface or visual redesign | `ui-ux-pro-max`, then `frontend-design` |
| Render/data/bundle performance | `react-performance` |
| A skill named by the user | that skill |
| New code beyond a one-line fix (outside the two-skill cap) | `ponytail` |

Conflicts: `draazy-*` wins on implementation, `real-estate-expert` on domain, `senior-product-manager-realestate` on scope, `mobile-native` on touch/viewport (`ui-ux-pro-max` owns layout, density, colour). Skills live in `.agents/skills/`; edit them there, never in `~/.copilot` or `~/.claude`. A named skill missing there → report it.

**Simplicity.** No change > existing code > stdlib/native > one-line addition > new dependency > new abstraction. YAGNI: no speculative abstractions, config or flexibility. `ponytail-review` for an over-engineering audit.

**Mobile-first UI.** Phone viewport first. Critical info (price, BHK, locality, primary CTA) up front, the rest behind a tap. Hints and help text: one short line at most.

**Check-ins.** Bug fix / scoped task → proceed autonomously. New feature / architectural change → plan and confirm with the user first. Ambiguous scope → ask one question. Ask via the ask-user tool with options and a recommended default, keep executing whatever the answer can't invalidate, never end a turn on a prose question. Spawning a subagent is not a check-in.

**Execution**
- Session start: read only `tasks/NOW.md`. Open `tasks/todo.md`, `tasks/lessons.md`, `tasks/DECISIONS-NEEDED.md` only when it points there, and grep them rather than reading whole.
- Session end: run `/now` before context fills (not ECC's `/save-session`, which other sessions can't see).
- Plans go in `tasks/todo.md` as checkboxes; a finished slice gets one index line, since git is the archive.
- Record every user correction as one line in `tasks/lessons.md`. This file beats a conflicting lesson: quote both, follow this file.
- Subagents only for >150 new lines, >3 files, or independent parallel workstreams. One responsibility each; on failure stop and report, never apply partial output (mark PARTIAL in `tasks/todo.md`).
- **Subagent model: always `claude-sonnet-5.5`.** Custom agents pin it in `~/.copilot/agents/*.agent.md`; for built-ins (`explore`, `task`, `general-purpose`, `rubber-duck`, `code-review`) pass `model: claude-sonnet-5.5`.
- Fix root causes, no temporary hacks, touch only what's necessary.

## Comments: the default is NONE

Write one only for a non-obvious WHY (workaround, ordering constraint, library quirk, deliberate deviation), a coupling invisible from here, or a required marker (`TODO`, `eslint-disable`/`@ts-expect-error` with the reason, docblocks a script greps). Never restate the code, write section banners, narrate your edit ("now uses", "previously", dates, ticket ids), docblock a self-evident function, or leave commented-out code. Budget 1–2 lines, above the code. Applies to config, SQL and YAML too.

`node scripts/check-comments.mjs --staged` must exit 0 before every commit, amend or history rewrite. Before handing back unpushed work also run `node scripts/check-comments.mjs origin/<branch>..HEAD`.

## File-Touch Hygiene: every file in your diff

1. Hold existing comments to the rule above and delete changelog prose. **Do not touch:** an applied Flyway migration (`db/migration/<yy>.<mm>.<seq>__*.sql`, checksummed, so any edit breaks the next boot); security rationale protected by `docs/system/code-quality.md`; docblocks a script greps by path (grep the file's name before deleting).
2. Remove provably behaviour-preserving redundancy: reinvented stdlib, dead flexibility, predicates duplicated across a seam, unreachable branches, one-caller wrappers. Anything bigger → a note in `tasks/todo.md`.

Shrinking a Java service with a `ServiceSizeGuardTest` `BASELINE` entry to at-or-under the limit → delete its entry in the same commit, or `baselineStaysHonest` fails.

## Finding code

`graphify-out/` graphs `backend`, `frontend` and the migrations. To locate code from a symptom, screenshot or concept, query it first; fall back to grep only if it returns nothing useful. Run from the repo root:

```powershell
.\scripts\graphify.ps1 query "mobile bottom navigation bar" --budget 700
.\scripts\graphify.ps1 path "BottomNav" "AuthContext"
.\scripts\graphify.ps1 explain "ConsumerLayout"
.\scripts\graphify.ps1 update    # after adds/renames/deletes
.\scripts\graphify.ps1 rebuild   # large refactors only
```

Stale if `git rev-parse HEAD` ≠ the commit in `graphify-out/GRAPH_REPORT.md` → `update` first. Never commit `graphify-out/`; never run `graphify extract` (loses paths and ~300 nodes).

Files over ~400 lines: grep the symbol, read a narrow range. Grep only, never read whole: `frontend/src/data/societies-rera.js` (182 KB minified), `frontend/src/styles/index.css` (~3,570 lines; section map in `draazy-frontend`), `e2e/COVERAGE.md`, `e2e/helpers/app.js`. `e2e` is not in the graph; find specs by filename or a COVERAGE.md row.

## Verification

**Per fix**
1. `e2e\run-fast.ps1` (the specs the change reaches; `-Files <paths>` if the tree holds another session's work, `-Failed` to rerun). Green before moving on; fix root causes, not tests. A failure not in `tasks/todo.md` → flag as possibly pre-existing; record confirmed ones there.
2. Feature or behaviour change → new or updated `e2e/*.spec.js` plus an `e2e/COVERAGE.md` row. No coverage → note it in `tasks/todo.md` as PENDING VERIFICATION.
3. File added/renamed/deleted under `backend/`, `frontend/src` or the migrations → `.\scripts\graphify.ps1 update`.

**Before each commit** (once, over the staged diff; never after individual fixes)
1. Review: `react-reviewer` (`.jsx`) → `code-reviewer` → `security-reviewer` only for auth or user-data changes (PII, credentials, session tokens, contact gate, per-user data). Unavailable → review manually, mark PENDING AGENT REVIEW in `tasks/todo.md`.
2. Simplify: File-Touch Hygiene done and `check-comments.mjs --staged` passes, then `ponytail-review` + `code-simplifier`, strictly no behaviour change; apply the cuts before committing.
3. `e2e\run-fast.ps1 -Full` green.

**Clean up** (last): remove only what this task created and list it: `backend\target-<name>`, scratch DBs (`DROP DATABASE IF EXISTS draazy_test_<name> WITH (FORCE)`, same for `draazy_e2e_<name>`), logs (`$env:TEMP\draazy-*.log`, `backend\*.txt`, `e2e\*.txt`, `*.log`), `tmp-*.spec.js`, servers/JVMs you started (`Stop-Process -Id`). Never touch what isn't yours or is still in use (`pg_stat_activity`, a process holding the dir). Always keep `backend\target`, `target-cli`, `target-shard`, `e2e\.shards` and DBs `draazy`, `draazy_test`, `draazy_e2e`, `draazy_e2e_sh1`–`sh8`.