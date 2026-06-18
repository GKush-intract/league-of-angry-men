# Routine: refresh official standings (runs every 12h)

The scoreboard derives all group tables, qualifiers, and Phase-1 points from the
**official FIFA standings** stored in `data.json` as `tables` (per-group standings
in official order) and `bestThirds` (the team codes of the qualifying third-placed
teams). These official tables already encode FIFA's deep tiebreakers (head-to-head,
card conduct, world ranking) which cannot be recomputed from scores alone — so we
fetch them rather than calculate our own.

Your job each run is to refresh those two fields from Wikipedia. Two committed
scripts do the work deterministically; just run them in order.

## Steps

1. Make sure deps are present (first run only):

   ```bash
   pip install pandas lxml >/dev/null 2>&1 || pip3 install pandas lxml >/dev/null 2>&1 || true
   ```

2. Snapshot current ranks (for the ▲▼ movement arrows) BEFORE fetching new data:

   ```bash
   node scripts/snapshot-ranks.mjs
   ```

3. Fetch the official group standings + third-placed ranking from
   `https://en.wikipedia.org/wiki/2026_FIFA_World_Cup` and write `tables` +
   `bestThirds` + `meta.lastUpdated`:

   ```bash
   python3 scripts/fetch-official.py
   ```

   If it exits with `UNMAPPED TEAM NAME`, add that name to the `ALIAS` map at the
   top of `scripts/fetch-official.py` (mapping it to our 3-letter code) and re-run.
   The script validates that every group's four teams match our known draw, so a
   mismatch means the parse or the alias map needs fixing — do not force it.

4. Verify, then commit & push:

   ```bash
   node --test
   node scripts/validate-data.mjs
   git add data.json scripts/fetch-official.py
   git commit -m "chore: update official tables $(date -u +%Y-%m-%d)"
   git push
   ```

   GitHub Pages redeploys automatically.

## Never

- Don't edit `players[].picks` / `q1` / `q2` / `q3` / `b` (organizer-owned; `b` is
  set by hand only when the winner / golden boot / golden glove are decided).
- Don't touch `index.html`, `app.js`, or `compute.js`.
- Don't hand-write `tables`, `bestThirds`, group standings, or player points —
  always let `fetch-official.py` produce them.

## Note on per-match fixtures

`results` (individual match scores) is intentionally empty: our synthetic match
numbering can't represent the real fixture order, so the Fixtures tab shows the
schedule without scores. Standings come from the official `tables`. Wiring a real
fixtures feed is a separate enhancement.
