# Design: WC 2026 Predictor — Phase 2 Bracket Input + People's Bracket

**Date:** 2026-06-26
**Status:** Approved (brainstorming) — pending plan
**Supersedes/extends:** the shipped 5-tab vanilla app (`app.js`, `compute.js`, `data.json`, `index.html`) and the design handoff in `design/` (`README.md`, `Angry Men Predictor.dc.html`).

## Goal

Let the 20 players submit their **Phase 2 picks** (Round of 32 + Round of 16 brackets, plus bonus Q4/Q5) before the knockout stage begins, and surface everyone's picks back as an aggregate "People's Bracket." This is the time-sensitive piece: the group stage is finishing, so the Round of 32 is imminent.

The full handoff redesign (6 tabs) is built in this effort because the views are interlinked, but the **Build tab (input) + submission path is the priority** — aggregate views render honest empty/provisional states until real picks arrive.

## Non-goals

- No login / auth / accounts. Identity is self-selected from the 20 names.
- No React rewrite. Stay vanilla JS, no build step.
- Phase 3 (QF→Final) stays a locked placeholder.
- Phase 2 *scoring* against real knockout results is out of scope for this effort (the data model supports it; scoring lands when knockout results exist).

## Decisions

1. **Stack: vanilla JS, no build step.** The existing app already implements this exact design system (tokens, header, nav, overlay, scoring helpers). GitHub Pages + the Actions auto-updater keep working unchanged. React would mean a build pipeline, porting 5 working tabs, and reworking how `data.json` is consumed — churn with no payoff for a 20-person app.
2. **6 tabs**, per handoff: 🏆 Table (`standings`) · 🗺️ Bracket (`bracket`) · ✏️ Build (`build`) · 👤 Squad (`players`) · 📅 Matches (`matches`) · 📖 Rules (`rules`).
3. **Submission is automated end-to-end.** Build tab POSTs to a Google Apps Script Web App → Google Sheet; a sync script pulls the Sheet (published CSV) back into `data.json`. The organizer does not hand-copy picks.
4. **Build everything in the handoff now**, not just the Build tab, since the views depend on the same derived bracket and stored picks.

## Architecture

Light modularization — a single `app.js` would otherwise exceed ~1,100 lines (the prototype's size).

| File | Status | Role |
|---|---|---|
| `compute.js` | extend | Pure derivation (browser + `node:test`). Add `seedTeams`, `r32Pairings`, `regions`, `aggregateBrackets`, and Phase-2 scoring helpers. |
| `app.js` | rework | Shell + nav (6 tabs) + display tabs: Standings, Squad, Matches (Fixtures/Tables/Knockout sub-tabs), Rules, People's Bracket. |
| `build.js` | new | The interactive Build tab: pick state, lifecycle states, payload + submission. The only stateful/interactive module — isolated so it can be reasoned about and tested independently. |
| `config.js` | new | `SHEET_ENDPOINT` constant (`''` = preview mode). Single obvious place to paste the Apps Script `/exec` URL. |
| `scripts/fetch-picks.mjs` | new | Pulls the Sheet's published CSV, merges latest picks into `data.json`. |
| `scripts/validate-data.mjs` | extend | Validate new `bracket`/`q4`/`q5`/`meta.phase2Deadline` fields. |
| `test/compute.test.mjs` | extend | Cover seed/pairings/regions/aggregate. |
| `.github/workflows/update-standings.yml` | extend | Run `fetch-picks.mjs` alongside the standings refresh. |

### Module boundaries

- `compute.js` — input: `groups`, `tables`/`results`, `bestThirds`, `players`. Output: standings, projected qualifiers, seed, R32 pairings, regions, bracket aggregates. No DOM, no globals.
- `build.js` — owns Build-tab UI state (`picks`, `builderName`, `q4`, `q5`, `locked`, `submitState`). Depends on `compute.js` (for seed/pairings/regions) and `config.js` (endpoint). Exposes a `renderBuild()` + event wiring; communicates results only via the POST + on-screen JSON.
- `app.js` — owns global app state (`tab`, `selected`, `standMode`, `matchSub`, `zoom`) and the display tabs. Delegates the Build tab to `build.js`.

## Data model (`data.json`)

Additions (existing fields unchanged):

```jsonc
{
  "meta": {
    "phase": 2,
    "phase2Deadline": "2026-06-28T15:00:00Z"   // picks lock at/after this instant
  },
  "players": [
    {
      "name": "Artet",
      // ...existing Phase 1 fields (q1,q2,q3,b,picks)...
      "p2": 0,                                   // Phase 2 points (stored/0 until scored)
      "q4": "BRA",                               // Phase 2 bonus: most goals (R32+R16)
      "q5": "KOR",                               // Phase 2 bonus: most conceded (R32+R16)
      "bracket": {
        "r32": { "0": "BRA", "1": "FRA" },       // matchId(0-15) -> winning team code
        "r16": { "0": "BRA" }                    // regionId(0-7)  -> team advanced to QF
      }
    }
  ]
}
```

`bracket`, `q4`, `q5` are **absent/empty until synced** from the Sheet. Aggregate views treat missing picks as "not submitted yet."

## Bracket derivation (ported from the handoff's `renderVals`)

- `seed = [12 group winners, 12 runners-up, 8 best-3rd teams]`. Winners = `tables[L][0]`, runners-up = `tables[L][1]` across A–L; best thirds from `proj.best8` (already computed). Group order A→L within each tier.
- R32 match `i` (0–15) = `(seed[i], seed[31-i])` — classic 1-v-32 seeding.
- Region `j` (0–7) feeds from R32 matches `2j` and `2j+1`.
- All derived from **live** standings → shown as **provisional** until the group stage completes.

## Build tab (✏️) — input screen

User picks **16 R32 winners (2 pts each)** + **8 R16 winners (4 pts each)** = 24 picks, plus Q4 and Q5, after self-selecting their name.

Lifecycle states (all built and testable):
1. **Empty** — no picks; "Bracket open"; R16 nodes show "Pick both R32 winners first ↑".
2. **Partial** — some R32 picked, losers dimmed (opacity .4), some R16 nodes waiting; counter `{k}/24`.
3. **Complete** — all 24 + Q4 + Q5 + name set; submit enabled; "Ready to submit".
4. **Locked** — `Date.now() >= Date.parse(meta.phase2Deadline)`. All buttons/selects read-only (no handlers fire), deadline banner, submit replaced by "🔒 LOCKED".

Interaction rules:
- Tap a team in an R32 match → it's the winner (highlight + ✓), the other dims.
- R16 node auto-populates with the two picked R32 winners; tap to choose who reaches the QF.
- Changing an R32 pick that invalidates an existing R16 pick clears that R16 pick.
- Region status label: "TAP A TEAM" → "IN PROGRESS" → "PICK R16" → "✓ DONE".
- Submit enabled only when name + all 24 + Q4 + Q5 set and not locked; hint text says what's missing.

The dev-only **PREVIEW STATE** switcher (Empty/In progress/Complete/Locked) is kept behind a debug flag for QA; production state is derived from pick count + lock flag.

## Submission flow (the one backend integration)

```js
const payload = {
  player, nick, phase: 2, submittedAt: ISO8601,
  r32: [{ tie: 1..16, matchup: "BRA v KOR", pick: "BRA"|null }, ...], // 16
  r16: [{ region: 1..8, pick: "BRA"|null }, ...],                     // 8
  q4, q5
};
fetch(SHEET_ENDPOINT, {
  method: 'POST', mode: 'no-cors',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify(payload)
});
```

- `mode:'no-cors'` + `text/plain` is intentional — avoids the CORS preflight Apps Script Web Apps don't answer. The response is opaque → treat as fire-and-forget, optimistically show success, then render the JSON + "Copy JSON".
- `SHEET_ENDPOINT === ''` → **preview mode**: skip the POST, just show the JSON for the player to copy/send.
- Apps Script side (provided as part of delivery): `doPost(e){ JSON.parse(e.postData.contents) → appendRow }`. Setup steps documented for the organizer; organizer pastes the `/exec` URL into `config.js`.

## Sheet → `data.json` sync

`scripts/fetch-picks.mjs`:
1. Fetch the Sheet's "Publish to web" CSV URL.
2. Parse rows; for each player, keep the **latest** `submittedAt` (re-submits overwrite).
3. Map rows → `players[].bracket.{r32,r16}`, `players[].q4`, `players[].q5`.
4. Write `data.json`; leave players without a submission untouched/empty.

Runnable manually now; wired into `update-standings.yml` so picks refresh on the existing cron. `validate-data.mjs` gains checks for bracket shape and bonus codes.

## Aggregate views

All derived from `players[].bracket` (honest empty states until picks land):
- **Bracket tab (People's Bracket)** — 8 region cards; per-team support counts on R32 matches; R16 podium ranked by how many advanced each team; supporter overlay (R32 tie / R16 region) with name chips. Zoom control.
- **Squad overlay** — phase tiles (P1/P2/P3-locked), Phase-2 mini-bracket grid (8 region cells), Q4/Q5.

## Standings changes

- Add `PHASE 1 | PHASE 2 | TOTAL` segmented control (`standMode`, default `p1`); re-ranks + re-tags. `maxForMode`: p1=71, p2=72, total=200.
- `p1 = q+g+b` (existing). `p2` stored/0 until knockout scoring exists. `total = p1 + p2`.

## Matches changes

Merge into sub-tabs (`matchSub`, default `fixtures`): **Fixtures · Tables · Knockout**. Knockout = provisional R32→Final bracket (later rounds `TBD`), editable `koDate`/`koTime` arrays, schedule list below.

## Error handling

- Submit with empty endpoint → preview mode, never errors.
- Opaque/failed POST → still show success + JSON (fire-and-forget); player always has the copyable JSON as a fallback path to the organizer.
- Sync script: tolerate malformed/partial rows (skip with a warning), never crash the Action; unknown player names skipped.
- Locked state hard-stops all input handlers.

## Testing & verification

- Extend `test/compute.test.mjs`: `seedTeams` order, `r32Pairings` (1-v-32), `regions` feeders, `aggregateBrackets` counts.
- Extend `test/validate.test.mjs` + `validate-data.mjs` for `bracket`/`q4`/`q5`/`phase2Deadline`.
- All `node:test` green and `validate-data.mjs` clean before any commit.
- Manual: Playwright pass over all 4 Build lifecycle states + a preview-mode submit.

## Organizer inputs required (not blocking the build — preview mode works meanwhile)

1. **Google Sheet + Apps Script Web App URL** — created with provided code + steps; pasted into `config.js`. Until then the app runs in preview mode.
2. **Phase 2 deadline** timestamp for `meta.phase2Deadline` (just before the first R32 kickoff).
3. Optional: player nicknames.

## Risks

- **Identity spoofing** (no auth): anyone can submit as anyone. Acceptable for 20 friends; mitigated by append-only Sheet (organizer can audit) and latest-wins sync.
- **Provisional bracket churn**: R32 pairings shift until groups finish. Mitigated by clear "provisional" labeling; ideally collect picks once groups are final.
- **Apps Script quirks**: `no-cors` opaque response means no delivery confirmation — the copyable JSON is the fallback.
