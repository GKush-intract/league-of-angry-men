// snapshot-ranks.mjs — capture each player's CURRENT rank into data.json's
// previousRanks BEFORE new official tables are fetched, so the ▲▼ movement arrows
// reflect the change over this update cycle. Run before fetch-official.py.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolveTables, projectedQualifiers, buildStandings } from '../compute.js';

const d = JSON.parse(readFileSync('data.json', 'utf8'));
const st = buildStandings(
  d.players,
  projectedQualifiers(resolveTables(d.groups, d.results || {}, d.tables), d.bestThirds || null),
  {},
);
d.previousRanks = Object.fromEntries(st.map(p => [p.name, p.rank]));
writeFileSync('data.json', JSON.stringify(d, null, 2) + '\n');
console.log(`snapshot: previousRanks set for ${st.length} players`);
