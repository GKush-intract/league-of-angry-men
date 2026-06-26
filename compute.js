// compute.js — pure derivation (ES module; runs in the browser and under node:test)
// All scoring/standings derive from raw results + stored picks. Nothing is stored.

export const FIX = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]]; // i -> [homeIdx, awayIdx]; matchNo = i+1
export const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

// teams: array of [code,name,flag] (T1..T4). results: {"A1":[h,a,status?,min?], ...}
export function computeGroupTable(letter, teams, results) {
  const st = teams.map(t => ({ code: t[0], name: t[1], flag: t[2], p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }));
  FIX.forEach((pair, i) => {
    const r = results[letter + (i + 1)];
    if (!r) return;
    const hg = r[0], ag = r[1];
    const H = st[pair[0]], A = st[pair[1]];
    H.p++; A.p++; H.gf += hg; H.ga += ag; A.gf += ag; A.ga += hg;
    if (hg > ag) { H.w++; A.l++; H.pts += 3; }
    else if (hg < ag) { A.w++; H.l++; A.pts += 3; }
    else { H.d++; A.d++; H.pts++; A.pts++; }
  });
  st.forEach(s => s.gd = s.gf - s.ga);
  st.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
  return st;
}

export function computeAllTables(groups, results) {
  const out = {};
  for (const L of GROUP_LETTERS) out[L] = computeGroupTable(L, groups[L], results);
  return out;
}

// Per group, prefer the OFFICIAL standings table when supplied (it already bakes in
// FIFA's deep tiebreakers — head-to-head, card conduct, world ranking — that we can't
// recompute), otherwise fall back to computing the table from raw results.
// officialTables: { L: [ {code,p,w,d,l,gf,ga,gd,pts}, ... in official order ] }
export function resolveTables(groups, results, officialTables) {
  const out = {};
  for (const L of GROUP_LETTERS) {
    const off = officialTables && officialTables[L];
    if (off && off.length) {
      const meta = {};
      for (const t of (groups[L] || [])) meta[t[0]] = { name: t[1], flag: t[2] };
      out[L] = off.map(r => ({
        code: r.code, name: meta[r.code]?.name || r.code, flag: meta[r.code]?.flag || '',
        p: r.p || 0, w: r.w || 0, d: r.d || 0, l: r.l || 0, gf: r.gf || 0, ga: r.ga || 0,
        gd: (r.gd != null ? r.gd : (r.gf || 0) - (r.ga || 0)), pts: r.pts || 0,
      }));
    } else {
      out[L] = computeGroupTable(L, groups[L], results || {});
    }
  }
  return out;
}

// Projected qualifiers: top-2 of each group + the 8 best 3rd-placed teams.
// If `bestThirds` (an array of team codes from the official "ranking of third-placed
// teams" table) is supplied, use it verbatim; otherwise rank thirds by Pts→GD→GF→name.
export function projectedQualifiers(tables, bestThirds = null) {
  const top2 = {}, started = {}, groupQ = {};
  for (const L of GROUP_LETTERS) {
    const t = tables[L] || [];
    top2[L] = [t[0]?.code, t[1]?.code];
    started[L] = t.some(s => s.p > 0);
  }
  let best8;
  if (bestThirds && bestThirds.length) {
    const set = new Set(bestThirds);
    best8 = new Set(GROUP_LETTERS.filter(L => tables[L]?.[2] && set.has(tables[L][2].code)));
  } else {
    const thirds = GROUP_LETTERS
      .map(L => ({ L, team: tables[L]?.[2] }))
      .filter(x => x.team);
    thirds.sort((a, b) =>
      b.team.pts - a.team.pts || b.team.gd - a.team.gd ||
      b.team.gf - a.team.gf || a.team.name.localeCompare(b.team.name));
    best8 = new Set(thirds.slice(0, 8).map(x => x.L));
  }
  const qualified = new Set();
  for (const L of GROUP_LETTERS) {
    const codes = [top2[L][0], top2[L][1]].filter(Boolean);
    if (best8.has(L) && tables[L]?.[2]) codes.push(tables[L][2].code);
    groupQ[L] = codes;
    codes.forEach(c => qualified.add(c));
  }
  return { qualified, top2, started, groupQ, best8 };
}

// Groups where a player's picks EXACTLY equal that group's projected qualifiers
// (the 2/2 or 3/3 group bonus). Returns a Set of group letters, each worth +2.
export function bonusGroups(player, proj) {
  const out = new Set();
  for (const L of GROUP_LETTERS) {
    const picks = (player.picks && player.picks[L]) || [];
    const actual = proj.groupQ[L] || [];
    if (picks.length > 0 && picks.length === actual.length &&
        picks.every(c => actual.includes(c))) out.add(L);
  }
  return out;
}

// Score one player's Phase 1. picks: {A:[codes],...}. proj from projectedQualifiers.
export function scorePlayer(player, proj) {
  let q = 0;
  for (const L of GROUP_LETTERS) {
    const picks = (player.picks && player.picks[L]) || [];
    for (const c of picks) if (proj.qualified.has(c)) q++;
  }
  const g = bonusGroups(player, proj).size * 2;
  const b = player.b || 0;
  return { q, g, b, total: q + g + b };
}

export function buildStandings(players, proj, previousRanks = {}, mode = 'p1') {
  const scored = players.map(p => {
    const s = scorePlayer(p, proj);          // {q, g, b, total: q+g+b}
    const p1 = s.total, p2 = p.p2 || 0;
    return { ...p, ...s, p1, p2, total: p1 + p2 };
  });
  // mode: 'p1' (default) | 'p2' | 'total'; any other value ranks by p1
  const valOf = (p) => mode === 'p2' ? p.p2 : mode === 'total' ? p.total : p.p1;
  scored.sort((a, b) => valOf(b) - valOf(a) || b.total - a.total || b.q - a.q || a.name.localeCompare(b.name));
  return scored.map((p, i) => {
    const rank = i + 1, prev = previousRanks[p.name];
    return { ...p, rank, mv: (prev == null ? 0 : prev - rank) };
  });
}

// Qualified-32 seed: [12 group winners, 12 runners-up, 8 best-3rd teams].
// proj.best8 is a Set of group letters whose 3rd-placed team qualifies.
export function seedTeams(tables, proj) {
  const winners = [], seconds = [], thirds = [];
  for (const L of GROUP_LETTERS) {
    const st = tables[L] || [];
    if (st[0]) winners.push(st[0]);
    if (st[1]) seconds.push(st[1]);
    if (proj.best8.has(L) && st[2]) thirds.push(st[2]);
  }
  return [...winners, ...seconds, ...thirds].slice(0, 32);
}

export function seedIndex(seed) {
  const idx = {};
  seed.forEach((t, i) => { idx[t.code] = i; });
  return idx;
}

// R32 match i (0-15) = (seed[i], seed[31-i]). Always returns length 16 because
// regions() hard-references match ids 0-15. Expects a complete 32-element seed;
// callers (e.g. the Build tab) must gate on a fully-resolved table — on a short
// seed the tail pairings will have b === undefined.
export function r32Pairings(seed) {
  const out = [];
  for (let i = 0; i < 16; i++) out.push({ id: i, a: seed[i], b: seed[31 - i] });
  return out;
}

// Region j (0-7) feeds from R32 matches 2j and 2j+1.
export function regions() {
  const out = [];
  for (let j = 0; j < 8; j++) out.push({ id: j, m: [2 * j, 2 * j + 1] });
  return out;
}

// The 4 R32 participants of a region (the only valid finalist codes for its R16).
export function regionTeams(reg, r32) {
  return [r32[reg.m[0]].a, r32[reg.m[0]].b, r32[reg.m[1]].a, r32[reg.m[1]].b];
}

// Aggregate stored player brackets. players: [{name, bracket:{r32:{mid:code}, r16:{rid:code}}}]
export function aggregateBrackets(players, r32, regs) {
  const out = { r32: {}, r16: {} };
  for (const m of r32) out.r32[m.id] = {};
  for (const reg of regs) out.r16[reg.id] = {};
  for (const p of players) {
    const b = p.bracket; if (!b) continue;
    for (const m of r32) {
      const code = b.r32 && b.r32[m.id]; if (!code) continue;
      (out.r32[m.id][code] ||= { count: 0, backers: [] });
      out.r32[m.id][code].count++; out.r32[m.id][code].backers.push(p.name);
    }
    for (const reg of regs) {
      const code = b.r16 && b.r16[reg.id]; if (!code) continue;
      (out.r16[reg.id][code] ||= { count: 0, backers: [] });
      out.r16[reg.id][code].count++; out.r16[reg.id][code].backers.push(p.name);
    }
  }
  return out;
}
