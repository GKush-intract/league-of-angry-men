# The League of Angry Men — WC 2026 Predictor

Static, no-build scoreboard for a 20-player FIFA World Cup 2026 prediction league.
Edit only `data.json`; the browser derives group tables, projected qualifiers, and
Phase-1 points. Hosted on GitHub Pages.

## Run locally

    python3 -m http.server 8000   # then open http://localhost:8000

## Update results

Edit `results` in `data.json`:
- key = group letter + match number 1–6 (e.g. `"A3"`)
- value = `[homeGoals, awayGoals]`; add `"LIVE", minute` for in-play; delete the key for upcoming
- match order per group: `1:T1vT2  2:T3vT4  3:T1vT3  4:T2vT4  5:T1vT4  6:T2vT3`

Commit & push — Pages redeploys automatically. The 12-hour routine does this for you
(see `routine/UPDATE.md`).

## Test

    node --test
    node scripts/validate-data.mjs

## Deploy to GitHub Pages (when ready)

    gh repo create league-of-angry-men --public --source=. --remote=origin --push
    gh api -X POST repos/GKush-intract/league-of-angry-men/pages -f "source[branch]=main" -f "source[path]=/"

Live at `https://GKush-intract.github.io/league-of-angry-men/` within a minute or two.

## Schedule the 12-hour auto-update (after deploy)

The updater is a scheduled cloud agent that follows `routine/UPDATE.md`. It is
user-triggered (you run it in a Claude Code session, it is billed to you):

    /schedule create a routine every 12 hours that follows routine/UPDATE.md in
    this repo: fetch the latest WC 2026 group results, update data.json, commit and push.

## How scoring works

- **q** — 1 pt per picked team currently projected to reach the Round of 32.
- **g** — +2 per group where a player's picks exactly equal that group's projected qualifiers.
- **b** — Q1–Q3 bonus (winner / golden boot / golden glove), entered manually at tournament end.
- Projected qualifiers = top 2 of each group + the 8 best 3rd-placed teams. Provisional & live.
