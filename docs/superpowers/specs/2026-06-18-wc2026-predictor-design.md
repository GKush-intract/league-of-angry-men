# Spec — "The League of Angry Men" · WC 2026 Predictor

**Date:** 2026-06-18
**Status:** Approved design → ready for implementation plan

## 1. Overview

A mobile-first, **information-only** web app for a 20-player FIFA World Cup 2026
prediction league. No login, no auth, no backend writes — a read-only public
scoreboard. It shows live standings, each player's predictions, the match
schedule with results, auto-computed group tables, and the full rules + prize
pool. The league runs in 3 prediction phases; this ships the **Phase 1 (group
stage) live** state. Phases 2 & 3 appear as locked tiles for now.

The UI is recreated **pixel-faithfully** from the provided hi-fi handoff
(`design_handoff_wc_predictor/`): 5 bottom-nav tabs (Table, Players, Fixtures,
Groups, Rules) + a player-detail bottom sheet. All design tokens (colors, fonts,
radii, spacing) come from that handoff and are authoritative.

## 2. Approved decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Build/host | **Single static HTML + JSON, no build step.** Plain `index.html` + `app.js` reading `data.json`; GitHub Pages serves the folder directly. |
| 2 | Phase 1 scoring | **Auto-derived** from results + stored picks. Browser computes `q` and `g`; `b` (Q1–Q3) is manual. |
| 3 | Data source | A scheduled cloud routine **fetches live WC 2026 results from the web** every 12h. |
| 4 | Live scoring | **Provisional, recomputed every update** (projected qualifiers as they currently stand), labeled provisional. |
| 5 | Pick format | **Per-group lists of teams** each player predicts to reach R32 (2–3 per group). |
| 6 | Picks ingestion | Transcribe from the submitted grid screenshots, then **validate & surface anomalies** for the organizer to confirm. |

## 3. Architecture & files

```
/                       (repo root = GitHub Pages site root)
  index.html            markup + inline styles (recreates handoff), loads fonts + app.js
  app.js                vanilla JS: load data.json, derive everything, render 5 tabs + overlay
  data.json             SINGLE source of truth — the only file the routine edits
  routine/
    UPDATE.md           instructions the scheduled agent follows each run
  docs/superpowers/specs/...   this spec
```

No bundler, no framework, no CI build. The routine commits `data.json`; Pages
redeploys automatically.

### Key principle (from handoff)
**Group tables and "qualified" highlights are COMPUTED from match results,
never stored.** We extend this: **player `q`/`g` points are also computed**
client-side from results + each player's stored picks. The routine only ever
writes raw match scores (plus a rank snapshot for movement arrows).

## 4. `data.json` schema

```jsonc
{
  "meta": { "lastUpdated": "2026-06-18T00:00:00Z", "phase": 1, "entryFee": 1000 },

  // Real 2026 draw. Each team = [code, fullName, flagEmoji], in T1..T4 order.
  "groups": {
    "A": [["MEX","Mexico","🇲🇽"], ...],
    ...
    "L": [...]
  },

  // key = groupLetter + matchNumber(1-6). value = [homeGoals, awayGoals, status?, minute?]
  //   omit status -> FT;  "LIVE" + minute -> in progress;  delete key -> upcoming
  //   match order per group:  1:T1vT2  2:T3vT4  3:T1vT3  4:T2vT4  5:T1vT4  6:T2vT3
  "results": { "A1":[2,1], "C3":[1,0,"LIVE",57], ... },

  "players": [
    {
      "name": "Artet", "nick": "...",
      "picks": { "A":["MEX","KOR","RSA"], "B":["SUI","QAT"], ... },  // 2-3 codes/group
      "q1": "POR", "q2": "Erling Haaland", "q3": "Emiliano Martínez", // bonus answers
      "b": 0                                                          // Q1-Q3 pts, manual
    }
    // ... 20 players
  ],

  // snapshot of ranks BEFORE the last routine run -> drives ▲▼ movement
  "previousRanks": { "Artet": 4, ... }
}
```

Notes:
- `nick` is not in the source data; we'll generate light, on-theme nicknames (or
  leave blank — display tolerates empty).
- `q1` stores a **team code** (mapped to flag+name for display); `q2`/`q3` are
  free text (player/keeper names).

## 5. Derived in the browser (never stored)

1. **Group tables** — P/W/D/L/GF/GA/GD/Pts per team, via the handoff algorithm
   (`FIX = [[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]]`; W=3/D=1; sort Pts→GD→GF→name).
   LIVE matches count exactly like FT.
2. **Projected qualifiers** (the 32 into R32):
   - Top 2 of every group → 24 teams.
   - Rank all 12 third-placed teams by Pts→GD→GF (FIFA order) → best 8 → +8.
   - A group is "started" if any of its matches are played.
3. **Per-player Phase 1 points:**
   - `q` = count of that player's picked teams currently in the projected 32 (1 pt each).
   - `g` = +2 per group where the player's picks for that group **exactly equal**
     that group's projected qualifiers (set equality; 2/2 or 3/3).
   - `total` = q + g + b. All provisional, labeled as such until the group stage completes.
4. **Standings** — players sorted by total desc, then q desc; rank = index+1.
5. **Movement** — current rank vs `previousRanks[name]` → ▲/▼/–.
6. **Trash-talk tags, leader card, progress bars, chip status colors** — exactly
   per handoff, using the computed standings/qualifiers.

### Groups tab highlight refinement
Handoff colors 3rd place gold as "best-3rd race." We make it meaningful: **green
= top-2, gold = 3rd place currently inside the best-8, dim = 3rd place outside
the best-8.** 4th place stays dim.

## 6. Real WC 2026 draw (replaces prototype placeholder)

| Grp | T1 | T2 | T3 | T4 |
|-----|----|----|----|----|
| A | Mexico (MEX) | South Korea (KOR) | Czechia (CZE) | South Africa (RSA) |
| B | Switzerland (SUI) | Canada (CAN) | Qatar (QAT) | Bosnia & Herzegovina (BIH) |
| C | Brazil (BRA) | Morocco (MAR) | Scotland (SCO) | Haiti (HAI) |
| D | United States (USA) | Turkey (TUR) | Australia (AUS) | Paraguay (PAR) |
| E | Germany (GER) | Ecuador (ECU) | Ivory Coast (CIV) | Curaçao (CUW) |
| F | Netherlands (NED) | Japan (JPN) | Sweden (SWE) | Tunisia (TUN) |
| G | Belgium (BEL) | Iran (IRN) | Egypt (EGY) | New Zealand (NZL) |
| H | Spain (ESP) | Uruguay (URU) | Saudi Arabia (KSA) | Cape Verde (CPV) |
| I | France (FRA) | Senegal (SEN) | Norway (NOR) | Iraq (IRQ) |
| J | Argentina (ARG) | Austria (AUT) | Algeria (ALG) | Jordan (JOR) |
| K | Portugal (POR) | Colombia (COL) | Congo DR (COD) | Uzbekistan (UZB) |
| L | England (ENG) | Croatia (CRO) | Panama (PAN) | Ghana (GHA) |

The T1..T4 order within each group is provisional (from the submission grid
column order); the **real fixture order/schedule** will be confirmed when fetched
and the team ordering aligned to the official fixtures.

## 7. Players (20) & bonus answers

Artet, Banmanlang, Banshan, Dale shylla, Garrick Shanpru, Krishna, Kushagra,
Luke Shanpru, Manav, Mohit Agarwal, Mohit Ghune, Omargh Lanong, Prasoon
Chaturvedi, Pynk, Saket, Sangam, Sanjog, Shivam Datta, Vaibhav Gupta, Zac.

Bonus answers (Winner / Golden Boot / Golden Glove) are taken from the submitted
sheet. Winner is stored as a team code; boot/glove as free text. `b` stays 0 for
everyone until the tournament resolves these.

## 8. Data entry & validation (R32 picks)

The 20×48 prediction grid is transcribed from the 4 submitted screenshots. A
one-off validation step checks each player:
- total picks across all groups (expected 32);
- 2–3 picks per group;
- every picked code belongs to that group.

Any player who doesn't reconcile to a clean 32 is **surfaced to the organizer**
with their parsed picks for confirmation/correction before launch. We do not
silently "fix" human entries.

## 9. The 12-hour routine

A scheduled cloud agent (cron) runs against the repo every 12 hours following
`routine/UPDATE.md`:
1. Web-search current WC 2026 group-stage scores & match states.
2. Snapshot current computed ranks into `previousRanks` (so ▲▼ reflects the last cycle).
3. Update `results` (and `groups` only if the official draw/order needs correcting).
4. Set `meta.lastUpdated`, commit & push.

The routine contains **no scoring logic** — all derivation happens in the
browser. This keeps the routine minimal and hard to break.

## 10. Hosting / deployment

- Repo initialized locally; organizer creates an empty GitHub repo; we push.
- Enable **GitHub Pages** (root of default branch).
- Wire the scheduled routine to the repo.
- Site is a static folder — works offline-first from a file too.

## 11. Out of scope (now)

- Phases 2 & 3 scoring/brackets — shown as locked tiles; data model leaves room.
- Q1–Q3 bonus auto-resolution (`b` is manual at tournament end).
- Any write/admin UI — edits happen via `data.json` in git.
- Loading/error/empty states (static data).
```
