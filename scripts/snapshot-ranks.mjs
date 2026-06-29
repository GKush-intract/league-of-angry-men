// snapshot-ranks.mjs — capture each player's CURRENT rank into data.json's
// previousRanks BEFORE this update cycle's knockout results are fetched, so the ▲▼
// movement arrows reflect the change over the cycle. Run before fetch-knockout-results.
// Ranks by TOTAL (Phase 1 + live Phase-2 from koResults) — matching the site's default
// view — so movement tracks knockout-result changes (Phase-1 ranks are now frozen).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolveTables, projectedQualifiers, buildStandings } from '../compute.js';

const d = JSON.parse(readFileSync('data.json', 'utf8'));
const st = buildStandings(
  d.players,
  projectedQualifiers(resolveTables(d.groups, d.results || {}, d.tables), d.bestThirds || null),
  {},
  'total',
  d.koResults || null,
);
d.previousRanks = Object.fromEntries(st.map(p => [p.name, p.rank]));
writeFileSync('data.json', JSON.stringify(d, null, 2) + '\n');
console.log(`snapshot: previousRanks set for ${st.length} players`);
