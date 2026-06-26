// scripts/fetch-picks.mjs — merge the league Google Sheet (published CSV) into data.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Split one CSV line into fields, honoring RFC-4180 double-quoted fields
// ("" is an escaped quote). Assumption: no embedded newlines inside quotes —
// Google Sheets single-row submissions satisfy this.
function splitCsvLine(line) {
  const out = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }   // escaped quote
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(field); field = '';
    } else field += ch;
  }
  out.push(field);
  return out;
}

export function parseCsv(text) {
  text = text.replace(/^﻿/, '');                      // strip leading UTF-8 BOM
  const lines = text.trim().split(/\r?\n/);
  const head = splitCsvLine(lines.shift()).map(h => h.trim());
  return lines.filter(Boolean).map(l => {
    const cells = splitCsvLine(l); const o = {};
    head.forEach((h, i) => { o[h] = (cells[i] ?? '').trim(); });
    return o;
  });
}

export function parsePicksCsv(text, validCodes) {
  const rows = parseCsv(text);
  const latest = Object.create(null);                      // prototype-safe accumulator
  for (const r of rows) {
    const name = r.player; if (!name) continue;
    const parsed = Date.parse(r.submittedAt);
    const tsNum = Number.isNaN(parsed) ? -Infinity : parsed; // unparseable = oldest, never overwrites a valid newer row
    if (latest[name] && tsNum <= latest[name]._tsNum) continue;
    const r32 = {}, r16 = {};
    for (let i = 0; i < 16; i++) { const c = r[`r32_${i+1}`]; if (c && validCodes.has(c)) r32[i] = c; }
    for (let j = 0; j < 8; j++) { const c = r[`r16_${j+1}`]; if (c && validCodes.has(c)) r16[j] = c; }
    const rec = { bracket: { r32, r16 }, _tsNum: tsNum };
    if (validCodes.has(r.q4)) rec.q4 = r.q4;
    if (validCodes.has(r.q5)) rec.q5 = r.q5;
    latest[name] = rec;
  }
  for (const k of Object.keys(latest)) delete latest[k]._tsNum;
  return latest;
}

async function main() {
  const url = process.env.PICKS_CSV_URL;
  if (!url) { console.warn('no PICKS_CSV_URL, skipping'); process.exit(0); }
  let text;
  try {
    const res = await fetch(url);                          // ONLY network failure is non-fatal
    text = await res.text();
  } catch (e) {
    console.warn('fetch-picks failed (non-fatal):', e.message);
    process.exit(0);
  }
  // Parse / merge / write run OUTSIDE the try: a genuine parse/write error should fail CI.
  const data = JSON.parse(readFileSync('data.json', 'utf8'));
  const validCodes = new Set();
  for (const L of Object.keys(data.groups)) for (const t of data.groups[L]) validCodes.add(t[0]);
  const picks = parsePicksCsv(text, validCodes);
  let n = 0;
  for (const p of data.players) {
    const got = picks[p.name]; if (!got) continue;
    p.bracket = got.bracket; if (got.q4) p.q4 = got.q4; if (got.q5) p.q5 = got.q5; n++;
  }
  writeFileSync('data.json', JSON.stringify(data, null, 2) + '\n');
  console.log(`merged brackets for ${n} player(s)`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
