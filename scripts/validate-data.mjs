// validate-data.mjs — integrity checks + per-player pick audit for data.json
import { readFileSync } from 'node:fs';

const LETTERS = 'ABCDEFGHIJKL'.split('');
const CODE = /^[A-Z]{3}$/;

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
  if (data.matches) {
    for (const m of data.matches) {
      const g = codeByGroup[m.g];
      if (!g) { errors.push(`match in unknown group ${m.g}`); continue; }
      if (!g.has(m.h)) errors.push(`match ${m.g}: home ${m.h} not in group`);
      if (!g.has(m.a)) errors.push(`match ${m.g}: away ${m.a} not in group`);
    }
  }

  // Optional explicit R32 bracket override (the real FIFA draw): 16 [a,b] code pairs.
  if (data.bracketR32 !== undefined) {
    const all = new Set(Object.values(codeByGroup).flatMap(s => [...s]));
    if (!Array.isArray(data.bracketR32) || data.bracketR32.length !== 16) {
      errors.push(`bracketR32 must be an array of 16 [a,b] pairs`);
    } else {
      data.bracketR32.forEach((pair, i) => {
        if (!Array.isArray(pair) || pair.length !== 2) {
          errors.push(`bracketR32[${i}] must be a [a,b] pair`); return;
        }
        for (const c of pair)
          if (typeof c !== 'string' || !all.has(c))
            errors.push(`bracketR32[${i}]: ${c} is not a valid team code`);
      });
    }
  }

  // Optional actual knockout results that drive Phase-2 scoring.
  if (data.koResults !== undefined) {
    const all = new Set(Object.values(codeByGroup).flatMap(s => [...s]));
    const ko = data.koResults;
    if (typeof ko !== 'object' || ko === null || Array.isArray(ko)) {
      errors.push('koResults must be an object');
    } else {
      for (const round of ['r16', 'qf']) {
        if (ko[round] === undefined) continue;
        if (!Array.isArray(ko[round])) { errors.push(`koResults.${round} must be an array`); continue; }
        for (const c of ko[round])
          if (typeof c !== 'string' || !all.has(c)) errors.push(`koResults.${round}: ${c} is not a valid team code`);
      }
      // q4/q5: a single code or an array of codes (all teams tied on the top count)
      for (const f of ['q4', 'q5']) {
        if (ko[f] === undefined) continue;
        for (const c of [].concat(ko[f]))
          if (typeof c !== 'string' || !all.has(c))
            errors.push(`koResults.${f}: ${c} is not a valid team code`);
      }
    }
  }

  // Phase-2 / Phase-3 meta deadlines
  for (const f of ['phase2Deadline', 'phase3Deadline'])
    if (data.meta?.[f] !== undefined && Number.isNaN(Date.parse(data.meta[f])))
      errors.push(`meta.${f} must be an ISO date string`);

  // Phase-3 best-guess QF slots: {regionId 0-7: team code}, used only until the
  // real R16 winner is known for that region.
  if (data.meta?.qfGuess !== undefined) {
    const g = data.meta.qfGuess;
    const all = new Set(Object.values(codeByGroup).flatMap(s => [...s]));
    if (typeof g !== 'object' || g === null || Array.isArray(g)) {
      errors.push('meta.qfGuess must be an object');
    } else {
      for (const [k, v] of Object.entries(g)) {
        if (!/^[0-7]$/.test(k)) errors.push(`meta.qfGuess: ${k} is not a region id (0-7)`);
        if (typeof v !== 'string' || !all.has(v)) errors.push(`meta.qfGuess[${k}]: ${v} is not a valid team code`);
      }
    }
  }

  const rows = [];
  for (const p of (data.players || [])) {
    // Phase-2 optional fields
    if (p.bracket !== undefined) {
      if (typeof p.bracket !== 'object' || p.bracket === null || Array.isArray(p.bracket)) {
        errors.push(`${p.name}: bracket must be an object`);
      } else {
        for (const round of ['r32', 'r16']) {
          const r = p.bracket[round];
          if (r === undefined) continue;
          if (typeof r !== 'object' || r === null || Array.isArray(r)) {
            errors.push(`${p.name}: bracket.${round} must be an object`);
            continue;
          }
          for (const [k, v] of Object.entries(r)) {
            if (typeof v !== 'string' || !CODE.test(v))
              errors.push(`${p.name}: bracket.${round}[${k}] must be a 3-letter code`);
          }
        }
      }
    }
    for (const f of ['q4', 'q5']) {
      if (p[f] !== undefined && (typeof p[f] !== 'string' || !CODE.test(p[f])))
        errors.push(`${p.name}: ${f} must be a 3-letter code`);
    }
    if (p.p2 !== undefined && (typeof p.p2 !== 'number' || Number.isNaN(p.p2)))
      errors.push(`${p.name}: p2 must be a number`);
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
