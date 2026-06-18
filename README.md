# The League of Angry Men — WC 2026 Predictor

Static, no-build scoreboard for a 20-player FIFA World Cup 2026 prediction league.
Edit only `data.json`; the browser derives group tables, projected qualifiers, and
Phase-1 points. Hosted on GitHub Pages.

## Run locally

    python3 -m http.server 8000   # then open http://localhost:8000

## Update standings

Group tables and qualifiers come from the **official FIFA standings** (Wikipedia),
stored in `data.json` as `tables` (per-group standings in official order) and
`bestThirds` (qualifying third-placed team codes). These bake in FIFA's deep
tiebreakers (head-to-head, card conduct, world ranking) that can't be recomputed
from scores. Refresh them with:

    node scripts/snapshot-ranks.mjs   # movement arrows
    python3 scripts/fetch-official.py # official tables + best thirds (needs pandas, lxml)

Commit & push — Pages redeploys automatically. The 12-hour routine does this for
you (see `routine/UPDATE.md`).

## Test

    node --test
    node scripts/validate-data.mjs

## Deploy to GitHub Pages (when ready)

    gh repo create league-of-angry-men --public --source=. --remote=origin --push
    gh api -X POST repos/GKush-intract/league-of-angry-men/pages -f "source[branch]=main" -f "source[path]=/"

Live at `https://GKush-intract.github.io/league-of-angry-men/` within a minute or two.

## Auto-update (GitHub Actions)

A scheduled GitHub Action (`.github/workflows/update-standings.yml`) refreshes the
official tables every 12h — free, and on GitHub's runners which (unlike the
egress-restricted Claude cloud agent) have internet access to reach Wikipedia. It
runs the same scripts, then commits and pushes.

Run it on demand anytime: repo **Actions** tab → *Update standings* → *Run workflow*
(or `gh workflow run update-standings.yml`).

> `routine/UPDATE.md` documents the equivalent Claude-routine flow; that routine is
> disabled in favour of the Action (the cloud sandbox blocks outbound network).

## How scoring works

- **q** — 1 pt per picked team currently projected to reach the Round of 32.
- **g** — +2 per group where a player's picks exactly equal that group's projected qualifiers.
- **b** — Q1–Q3 bonus (winner / golden boot / golden glove), entered manually at tournament end.
- Projected qualifiers = top 2 of each group + the 8 best 3rd-placed teams, taken from the
  official tables / third-place ranking. Provisional & live.
