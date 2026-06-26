# Resume — WC 2026 Phase 2 Bracket Input

**Last updated:** 2026-06-26
**Branch:** `feat/phase2-bracket-input` (NOT main — stay on it)
**Plan:** `docs/superpowers/plans/2026-06-26-wc2026-phase2-input.md`
**Spec:** `docs/superpowers/specs/2026-06-26-wc2026-phase2-input-design.md`
**Task state:** `docs/superpowers/plans/2026-06-26-wc2026-phase2-input.md.tasks.json`

## Progress

- [x] **Task 0** — Config + data fields + validation — DONE (commit `d4e96e2`), spec + code review passed.
- [ ] **Task 1** — Bracket derivation in compute.js (NEXT; unblocked)
- [ ] Task 2 — Bracket aggregation (blocked by 1)
- [ ] Task 3 — Standings phase modes (unblocked; depends on Task 0 only)
- [ ] Task 4 — App shell 6-tab nav + standings control (blocked by 3)
- [ ] Task 5 — Build tab interactive bracket (blocked by 1, 4)
- [ ] Task 6 — Build submission/preview/confirm (blocked by 5)
- [ ] Task 7 — People's Bracket + overlay (blocked by 2, 4)
- [ ] Task 8 — Squad overlay upgrades (blocked by 4, 1)
- [ ] Task 9 — Matches tab sub-tabs (blocked by 4, 1)
- [ ] Task 10 — Sheet sync + Apps Script + Action (blocked by 0, 6)
- [ ] Task 11 — Full verification pass (blocked by all)

Next available to start: **Task 1** and **Task 3** (both unblocked).

## How to resume in a new session

Execution mode chosen: **subagent-driven, in the same session**. To continue:

1. Open a session in `/Users/ogkush/FifaWCPredictionGame` (already on branch `feat/phase2-bracket-input`).
2. Invoke the skill: `superpowers-extended-cc:subagent-driven-development` and tell it to continue the plan at `docs/superpowers/plans/2026-06-26-wc2026-phase2-input.md`, starting at Task 1 (Task 0 is complete).
   - Alternatively use `/superpowers-extended-cc:executing-plans docs/superpowers/plans/2026-06-26-wc2026-phase2-input.md` for batch execution — it reads the `.tasks.json` and skips completed tasks.

## Gotchas for the next session (important)

- **The Read tool is intercepted by a memory hook that truncates files to line 1.** Read source files with `cat -n` / `sed -n` via Bash, not the Read tool.
- **Run tests with `node --test test/*.test.mjs`** — NOT `node --test test/` (the directory form errors with `ERR_UNSUPPORTED_DIR_IMPORT` on this Node version).
- Validate data with `node scripts/validate-data.mjs` (exit 0 = clean).
- Run all commands from the repo root; do not `cd` into subdirs (a stray `cd design` broke a git command earlier).
- The design reference (markup + logic source of truth) is committed at `design/Angry Men Predictor.dc.html` + `design/README.md`. The plan cites specific line ranges of the prototype per task.

## Still needed from the organizer (not blocking the build — preview mode works)

1. Real **Phase 2 deadline** for `data.json` → `meta.phase2Deadline` (currently placeholder `2026-06-28T15:00:00Z`).
2. **Google Apps Script `/exec` URL** → paste into `config.js` `SHEET_ENDPOINT`; plus the published-CSV URL → GitHub Actions secret `PICKS_CSV_URL`. Task 10 will create `docs/apps-script-setup.md` with click-by-click steps.
