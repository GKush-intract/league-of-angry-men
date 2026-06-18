// validate-data.mjs — integrity checks + per-player pick audit for data.json
import { readFileSync } from 'node:fs';

const LETTERS = 'ABCDEFGHIJKL'.split('');

export function validate(data) {
  const errors = [], warnings = [];
  const gKeys = Object.keys(data.groups || {});
  if (gKeys.length !== 12) errors.push(`expected 12 groups, got ${gKeys.length}`);
  const codeByGroup = {};
  for (const L of LETTERS) {
    const g = data.groups?.[L];
    if (!g || g.length !== 4) { errors.push(`group ${L} must have 4 teams`); continue; }
    codeByGroup[L] = new Set(g.map(t => t[0]));
  }
  if (!Array.isArray(data.players) || data.players.length !== 20)
    errors.push(`expected 20 players, got ${data.players?.length}`);

  for (const [k, v] of Object.entries(data.results || {})) {
    if (!Array.isArray(v) || typeof v[0] !== 'number' || typeof v[1] !== 'number')
      errors.push(`result ${k} malformed`);
  }

  // optional official tables + bestThirds
  if (data.tables) {
    for (const L of LETTERS) {
      const tb = data.tables[L];
      if (!tb) continue;
      if (tb.length !== 4) warnings.push(`tables ${L}: ${tb.length} rows (expected 4)`);
      for (const r of tb)
        if (codeByGroup[L] && !codeByGroup[L].has(r.code))
          errors.push(`tables ${L}: code ${r.code} not in group`);
    }
  }
  if (data.bestThirds) {
    const all = new Set(Object.values(codeByGroup).flatMap(s => [...s]));
    if (data.bestThirds.length > 8) warnings.push(`bestThirds has ${data.bestThirds.length} (max 8)`);
    for (const c of data.bestThirds)
      if (!all.has(c)) errors.push(`bestThirds: unknown code ${c}`);
  }

  const rows = [];
  for (const p of (data.players || [])) {
    let total = 0; const counts = {};
    for (const L of LETTERS) {
      const picks = p.picks?.[L] || [];
      counts[L] = picks.length; total += picks.length;
      for (const c of picks)
        if (codeByGroup[L] && !codeByGroup[L].has(c))
          errors.push(`${p.name}: pick ${c} not in group ${L}`);
      if (picks.length > 3) warnings.push(`${p.name}: group ${L} has ${picks.length} picks (>3)`);
    }
    if (total !== 32) warnings.push(`${p.name}: total picks = ${total} (expected 32)`);
    rows.push({ name: p.name, total, counts });
  }
  return { errors, warnings, rows };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const data = JSON.parse(readFileSync('data.json', 'utf8'));
  const { errors, warnings, rows } = validate(data);
  console.log('Player'.padEnd(20), 'Tot', LETTERS.join(' '));
  for (const r of rows)
    console.log(r.name.padEnd(20), String(r.total).padStart(3), LETTERS.map(L => r.counts[L]).join(' '));
  warnings.forEach(w => console.log('WARN ', w));
  errors.forEach(e => console.log('ERROR', e));
  console.log(errors.length ? `\n${errors.length} error(s)` : '\nStructurally valid.');
  process.exit(errors.length ? 1 : 0);
}
