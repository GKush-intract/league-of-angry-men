# Routine: refresh WC 2026 results (runs every 12h)

You are updating **only match results** in `data.json`. All scoring and standings
are derived in the browser from these results — never hand-tally points, never edit
scoring logic, never precompute tables into `data.json`.

## Steps

1. **Snapshot ranks first.** Compute the current standings and write each player's
   current rank into `previousRanks` ({ "<name>": <rank> }) BEFORE changing any
   results. This drives the ▲▼ movement arrows for the next cycle. You can get the
   ranks with:

   ```bash
   node --input-type=module -e "
   import { readFileSync, writeFileSync } from 'node:fs';
   import { computeAllTables, projectedQualifiers, buildStandings } from './compute.js';
   const d = JSON.parse(readFileSync('data.json','utf8'));
   const st = buildStandings(d.players, projectedQualifiers(computeAllTables(d.groups, d.results)), {});
   d.previousRanks = Object.fromEntries(st.map(p => [p.name, p.rank]));
   writeFileSync('data.json', JSON.stringify(d, null, 2) + '\n');
   "
   ```

2. **Fetch the latest scores.** Web-search current FIFA World Cup 2026 group-stage
   results and live matches. For each played or in-play match set
   `results["<GroupLetter><MatchNo 1-6>"]`:
   - finished: `[homeGoals, awayGoals]`
   - in-play: `[homeGoals, awayGoals, "LIVE", minute]`
   - not started: leave the key absent (delete it if present).

   Match order per group (T1..T4 = the order in `groups[L]`):
   `1:T1vT2  2:T3vT4  3:T1vT3  4:T2vT4  5:T1vT4  6:T2vT3`.
   The Fixtures tab is generated from this mapping, so make sure each result lands on
   the right match number. If the official fixture order/teams differ from
   `groups[L]`, fix the team order in `groups[L]` (keep each `[code,name,flag]` intact)
   so the mapping stays correct.

3. **Stamp the time.** Set `meta.lastUpdated` to the current ISO timestamp.

4. **Verify.** Run the checks and fix anything that fails:

   ```bash
   node --test
   node scripts/validate-data.mjs
   ```

5. **Commit & push.**

   ```bash
   git add data.json
   git commit -m "chore: update results $(date -u +%Y-%m-%d)"
   git push
   ```

   GitHub Pages redeploys automatically within a minute or two.

## Never

- Don't edit `players[].picks`, `q1`, `q2`, `q3`, or `b` — those are organizer-owned
  (`b` is set by hand only when the tournament's winner / golden boot / golden glove
  are decided).
- Don't precompute `q`, `g`, `total`, group tables, or qualifiers into `data.json`.
- Don't touch `index.html`, `app.js`, or `compute.js`.
