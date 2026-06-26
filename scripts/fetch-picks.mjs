// scripts/fetch-picks.mjs — merge the league Google Sheet (published CSV) into data.json.
import { readFileSync, writeFileSync } from 'node:fs';

export function parseCsv(text) {
  // minimal CSV: no embedded commas/newlines in our controlled columns
  const lines = text.trim().split(/\r?\n/);
  const head = lines.shift().split(',');
  return lines.filter(Boolean).map(l => {
    const cells = l.split(','); const o = {};
    head.forEach((h, i) => { o[h] = (cells[i] ?? '').trim(); });
    return o;
  });
}

export function parsePicksCsv(text, validCodes) {
  const rows = parseCsv(text);
  const latest = {};
  for (const r of rows) {
    const name = r.player; if (!name) continue;
    if (latest[name] && Date.parse(r.submittedAt) <= Date.parse(latest[name]._ts)) continue;
    const r32 = {}, r16 = {};
    for (let i = 0; i < 16; i++) { const c = r[`r32_${i+1}`]; if (c && validCodes.has(c)) r32[i] = c; }
    for (let j = 0; j < 8; j++) { const c = r[`r16_${j+1}`]; if (c && validCodes.has(c)) r16[j] = c; }
    const rec = { bracket: { r32, r16 }, _ts: r.submittedAt };
    if (validCodes.has(r.q4)) rec.q4 = r.q4;
    if (validCodes.has(r.q5)) rec.q5 = r.q5;
    latest[name] = rec;
  }
  for (const k of Object.keys(latest)) delete latest[k]._ts;
  return latest;
}

function main() {
  const url = process.env.PICKS_CSV_URL;
  if (!url) { console.warn('no PICKS_CSV_URL, skipping'); process.exit(0); }
  const data = JSON.parse(readFileSync('data.json', 'utf8'));
  const validCodes = new Set();
  for (const L of Object.keys(data.groups)) for (const t of data.groups[L]) validCodes.add(t[0]);
  fetch(url).then(r => r.text()).then(text => {
    const picks = parsePicksCsv(text, validCodes);
    let n = 0;
    for (const p of data.players) {
      const got = picks[p.name]; if (!got) continue;
      p.bracket = got.bracket; if (got.q4) p.q4 = got.q4; if (got.q5) p.q5 = got.q5; n++;
    }
    writeFileSync('data.json', JSON.stringify(data, null, 2) + '\n');
    console.log(`merged brackets for ${n} player(s)`);
  }).catch(e => { console.warn('fetch-picks failed (non-fatal):', e.message); process.exit(0); });
}
if (import.meta.url === `file://${process.argv[1]}`) main();
