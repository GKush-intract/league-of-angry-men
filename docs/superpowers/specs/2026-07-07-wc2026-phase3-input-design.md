# Design: WC 2026 Predictor — Phase 3 Input (QF → Final)

**Date:** 2026-07-07
**Status:** Approved (brainstorming)
**Extends:** `2026-06-26-wc2026-phase2-input-design.md` (Phase 2 builder shipped, picks closed).

## Goal

Reopen the ✏️ Build tab as the **Phase 3 builder**: 4 Quarterfinal winners (6 pts each) +
2 Semifinal winners (8 pts each) + the champion (10 pts) + **Q6** (number of games going
past 90 minutes across QF/SF/3rd-place/Final, 7 pts). Max 57 — already stated on the
Rules tab. This effort is **input only**; sync, scoring, standings, People's Bracket
phase tabs land in a second effort once picks are in.

## Non-goals (deferred to the sync/scoring effort)

- `fetch-picks` merge of Phase 3 rows (`PICKS3_CSV_URL`), `players[].bracket3/q6/p3`.
- `scorePhase3`, standings PHASE 3 segment, Squad overlay P3 tile.
- Bracket tab inner PHASE 2 / PHASE 3 sub-tabs (needs picks to show).

## Decisions

1. **QF pairings are derived, not hardcoded.** `compute.js` gains `qfTeams(koResults,
   koMatches, guesses)`: `koResults.r16` is the 16 R32 winners in tie order, so region
   `j`'s R16 tie is `(r16[2j], r16[2j+1])`; its winner is looked up in `koMatches`.
   Unresolved slots (regions 6/7: ARG v EGY, SUI v COL at time of writing) fall back to
   `meta.qfGuess` (`{"6":"ARG","7":"COL"}`) and are flagged so the UI can say
   "provisional". When the results scraper commits the real winners, the bracket
   self-corrects — no manual edit.
2. **`build.js` dispatches on `meta.phase`.** `renderBuild`/`handleBuildEvent` keep their
   names; with `meta.phase >= 3` they route to the Phase 3 builder, else the Phase 2 one
   (kept intact). `app.js` changes stay minimal: re-add the Build nav entry, new state
   fields (`p3`, `q6`), `data-q6` change wiring.
3. **Reused UI vocabulary:** same team buttons, status banner (`k/7` counter), name
   select, lifecycle states (empty/partial/complete/locked), preview-mode submit +
   copyable JSON. Layout: two SEMIFINAL cards (2 QF ties → SF node) + a FINAL card
   (the 2 SF picks → champion node). Cascade clears invalidated downstream picks.
4. **New endpoint, placeholder for now.** Phase 2's Apps Script `doPost` has hardcoded
   r32/r16 columns, so Phase 3 needs a new sheet + deployment. `config.js` gains
   `SHEET_ENDPOINT_P3 = ''` (preview mode until the organizer deploys).
   `docs/apps-script-setup.md` gains the Phase 3 section (columns
   `submittedAt,player,nick,qf_1..4,sf_1..2,f,q6`; secret `PICKS3_CSV_URL` reserved for
   the sync effort).
5. **Deadline:** `meta.phase3Deadline = 2026-07-10T00:00:00+05:30` — midnight IST before
   the first QF (1:30 AM IST, 10 July), same pattern as Phase 2. `meta.phase = 3`.

## Payload

```json
{ "player": "...", "nick": "...", "phase": 3, "submittedAt": "ISO",
  "qf": [{ "tie": 1, "matchup": "FRA v MAR", "pick": "FRA" }, ...4],
  "sf": [{ "tie": 1, "pick": "FRA" }, ...2],
  "final": { "pick": "FRA" }, "q6": 3 }
```

`q6` is an integer 0–8 (4 QF + 2 SF + 3rd place + Final). `q6 === 0` is a valid answer —
completeness checks use `!== ''`, not truthiness.

## Validation & tests

- `validate-data.mjs`: `meta.phase3Deadline` parses as a date; `meta.qfGuess` keys are
  region ids 0–7 and values valid team codes.
- `test/`: `qfTeams` derivation (real winners, guess fallback, guessed-slot flags),
  QF→SF→champion cascade clearing, Phase 3 payload shape, pick counting.

## Risks

- Best-guess slots could mislead early submitters → provisional note in the builder;
  both R16 games finish ~36h before the deadline, and re-submits are latest-wins.
- Empty endpoint at launch → preview mode (copy JSON) until the organizer pastes the
  `/exec` URL; same fallback story as Phase 2.
