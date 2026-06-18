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

// Projected qualifiers: top-2 of each group + the 8 best 3rd-placed teams.
export function projectedQualifiers(tables) {
  const top2 = {}, started = {}, groupQ = {};
  const thirds = [];
  for (const L of GROUP_LETTERS) {
    const t = tables[L];
    top2[L] = [t[0].code, t[1].code];
    started[L] = t.some(s => s.p > 0);
    thirds.push({ L, team: t[2] });
  }
  thirds.sort((a, b) =>
    b.team.pts - a.team.pts || b.team.gd - a.team.gd ||
    b.team.gf - a.team.gf || a.team.name.localeCompare(b.team.name));
  const best8 = new Set(thirds.slice(0, 8).map(x => x.L));
  const qualified = new Set();
  for (const L of GROUP_LETTERS) {
    const codes = [...top2[L]];
    if (best8.has(L)) codes.push(tables[L][2].code);
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

export function buildStandings(players, proj, previousRanks = {}) {
  const scored = players.map(p => ({ ...p, ...scorePlayer(p, proj) }));
  scored.sort((a, b) => b.total - a.total || b.q - a.q || a.name.localeCompare(b.name));
  return scored.map((p, i) => {
    const rank = i + 1;
    const prev = previousRanks[p.name];
    return { ...p, rank, mv: (prev == null ? 0 : prev - rank) };
  });
}
