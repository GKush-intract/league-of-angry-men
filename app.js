// app.js — load data.json, derive via compute.js, render 5 tabs + player overlay
import { resolveTables, projectedQualifiers, buildStandings, bonusGroups, GROUP_LETTERS, aggregateBrackets, regionTeams } from './compute.js';
import { renderBuild, handleBuildEvent, renderBuildP3, handleBuildEventP3, bracketModel } from './build.js';

const state = { tab:'standings', selected:null, openMatch:null, standMode:'total', matchSub:'fixtures', zoom:1, picks:{r32:{},r16:{}}, builderName:null, q4:'', q5:'', p3:{qf:{},sf:{},t:'',f:''}, submitState:'idle', lastPayload:'', copied:false }; /* p3 = Phase 3 builder state (QF/SF picks + t = 3rd-place winner + f = champion) */
let DATA, TABLES, PROJ, STAND, TEAM, POT, M, AGG;

// Value-for-mode for standings/squad display (NOT the ranking authority — that's
// the separate valOf inside buildStandings in compute.js, which takes mode as a param).
const valOf = (p) => state.standMode === 'p2' ? p.p2 : state.standMode === 'total' ? p.total : p.p1;

const $view = () => document.getElementById('view');
const $overlay = () => document.getElementById('overlay');
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Build tab reopened for Phase 3 (QF→Final picks). The Build route dispatches on
// meta.phase: >= 3 renders the Phase 3 builder, else the (retired) Phase 2 one.
const NAV = [['standings','Table','🏆'],['bracket','Bracket','🗺️'],['build','Build','✏️'],['players','Squad','👤'],['matches','Matches','📅'],['rules','Rules','📖']];
const medal = (r) => r === 1 ? ['#ffce3a', '#1a1400'] : r === 2 ? ['#cfd8d4', '#10201a'] : r === 3 ? ['#d98b46', '#160d04'] : ['#15301f', '#7fd0a0'];
function tagFor(rank, n) {
  if (rank === 1) return ['👑 TOP OF THE TABLE', '#ffce3a'];
  if (rank <= 3) return ['BREATHING DOWN NECKS', '#b6ff3a'];
  if (rank <= 8) return ['IN THE MIX', '#7fd0a0'];
  if (rank <= 13) return ['BANG AVERAGE', '#9fb3a6'];
  if (rank < n) return ['RELEGATION ZONE', '#ff7a6a'];
  return ['🥄 WOODEN SPOON', '#ff5a5a'];
}

async function boot() {
  DATA = await (await fetch('data.json', { cache: 'no-store' })).json();
  TEAM = {};
  for (const L of GROUP_LETTERS) for (const t of DATA.groups[L]) TEAM[t[0]] = { name: t[1], flag: t[2], group: L };
  POT = '₹' + (DATA.players.length * (DATA.meta?.entryFee ?? 1000)).toLocaleString('en-IN');
  recompute();
  render();
}
function recompute() {
  // Prefer official standings tables + published best-thirds; fall back to computing
  // from raw results when those aren't present in data.json.
  TABLES = resolveTables(DATA.groups, DATA.results || {}, DATA.tables);
  PROJ = projectedQualifiers(TABLES, DATA.bestThirds || null);
  M = bracketModel(TABLES, PROJ, DATA.bracketR32, TEAM);
  AGG = aggregateBrackets(DATA.players, M.r32, M.regions);
  STAND = buildStandings(DATA.players, PROJ, DATA.previousRanks || {}, state.standMode, DATA.koResults || null);
}

function renderNav() {
  document.querySelector('#nav > div').innerHTML = NAV.map(([id, label, icon]) => {
    const active = state.tab === id;
    return `<button data-tab="${id}" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 2px calc(8px + env(safe-area-inset-bottom,0px));background:transparent;border:0;border-top:2px solid ${active ? '#b6ff3a' : 'transparent'};cursor:pointer;color:${active ? '#b6ff3a' : '#5f7567'};">
      <span style="font-size:18px;line-height:1;filter:${active ? 'none' : 'grayscale(.5) opacity(.75)'};">${icon}</span>
      <span style="font-family:'Barlow Condensed';font-weight:700;font-size:11px;letter-spacing:.07em;text-transform:uppercase;">${label}</span>
    </button>`;
  }).join('');
}

function buildCtx() { return { DATA, TABLES, PROJ, TEAM, state, rerender: render }; }
let lastRenderedTab = null;
function render() {
  renderNav();
  const views = { standings: viewStandings, bracket: viewBracket, build: () => (DATA.meta?.phase >= 3 ? renderBuildP3 : renderBuild)(buildCtx()), players: viewPlayers, matches: viewMatches, rules: viewRules };
  $view().innerHTML = (views[state.tab] || viewStandings)();
  // Only jump to top when the tab actually changes; preserve scroll for in-tab
  // re-renders (picking a bracket team, zoom, standings-mode/sub-tab toggles).
  if (state.tab !== lastRenderedTab) { window.scrollTo(0, 0); lastRenderedTab = state.tab; }
  renderOverlay();
}

// ---------- Standings ----------
function statTile(label, val, color) {
  return `<div style="flex:1;padding:11px 12px;background:#0e1d14;border:1px solid #1c3a28;border-radius:12px;">
    <div style="font-size:9px;letter-spacing:.12em;color:#5f7567;font-weight:700;">${label}</div>
    <div style="font-family:'JetBrains Mono';font-weight:800;font-size:19px;color:${color};margin-top:3px;">${val}</div></div>`;
}
function viewStandings() {
  const n = STAND.length, leader = STAND[0];
  const mode = state.standMode;
  const denom = { p1: 71, p2: 72, total: 200 }[mode] || 71;
  const leaderLabel = { p1: 'PHASE 1 LEADER', p2: 'PHASE 2 LEADER', total: 'OVERALL LEADER' }[mode] || 'PHASE 1 LEADER';
  const footnote = mode === 'p2'
    ? 'Phase 2 = R32 + R16 bracket + Q4/Q5. Points are placeholder until results come in.'
    : mode === 'total'
      ? 'Combined Phase 1 + Phase 2. Phase 3 (QF→Final) still to come. Max 200.'
      : 'Phase 1 = R32 qualifiers + group bonus + Q1–Q3. The bar is points out of 71.';
  const modeDef = [['p1', 'PHASE 1'], ['p2', 'PHASE 2'], ['total', 'TOTAL']];
  const seg = `<div style="display:flex;gap:6px;margin:14px 0 6px;padding:4px;background:#0a1813;border:1px solid #1c3a28;border-radius:12px;">
    ${modeDef.map(([k, label]) => `<button data-mode="${k}" style="flex:1;padding:8px 4px;border:0;border-radius:9px;cursor:pointer;font-family:'Barlow Condensed';font-weight:700;font-size:13px;letter-spacing:.06em;background:${mode === k ? '#1a7a43' : 'transparent'};color:${mode === k ? '#eafff0' : '#7fd0a0'};">${label}</button>`).join('')}
  </div>`;
  const rows = STAND.map(p => {
    const [tag, tagColor] = tagFor(p.rank, n);
    const [rb, rf] = medal(p.rank);
    const value = valOf(p);
    const barPct = Math.min(100, Math.round(value / denom * 100));
    const mvText = p.mv > 0 ? ('▲ ' + p.mv) : p.mv < 0 ? ('▼ ' + Math.abs(p.mv)) : '–';
    const mvColor = p.mv > 0 ? '#b6ff3a' : p.mv < 0 ? '#ff5a5a' : '#5f7567';
    return `<button data-player="${esc(p.name)}" style="width:100%;text-align:left;display:flex;align-items:center;gap:12px;padding:11px 12px;margin-bottom:7px;background:#0e1d14;border:1px solid #1c3a28;border-radius:13px;cursor:pointer;color:#eef5ec;">
      <div style="width:30px;height:30px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:8px;font-family:'JetBrains Mono';font-weight:800;font-size:14px;background:${rb};color:${rf};">${p.rank}</div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:7px;">
          <span style="font-family:'Barlow Condensed';font-weight:700;font-size:17px;white-space:nowrap;flex:none;">${esc(p.name)}</span>
          <span style="font-size:11px;color:#5f7567;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;">${esc(p.nick || '')}</span>
        </div>
        <div style="font-family:'Barlow Condensed';font-weight:700;font-size:10px;letter-spacing:.1em;color:${tagColor};margin-top:2px;">${tag}</div>
        <div style="height:4px;border-radius:3px;background:#0a1813;margin-top:7px;overflow:hidden;"><div style="height:100%;width:${barPct}%;background:linear-gradient(90deg,#1a7a43,#b6ff3a);border-radius:3px;"></div></div>
      </div>
      <div style="text-align:right;flex:none;">
        <div style="font-family:'JetBrains Mono';font-weight:800;font-size:22px;color:#b6ff3a;line-height:1;">${value}</div>
        <div style="font-size:10px;color:${mvColor};font-weight:700;margin-top:3px;">${mvText}</div>
      </div></button>`;
  }).join('');
  const hasPicks = DATA.players.some(p => p.bracket);
  const phase2Banner = hasPicks ? `
  <button data-tab="bracket" style="width:100%;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:14px 0 0;padding:14px 16px;border:1px solid #5a4a1c;border-radius:14px;background:linear-gradient(135deg,rgba(255,206,58,.18),rgba(255,206,58,.06));cursor:pointer;color:#ffce3a;">
    <div style="min-width:0;">
      <div style="font-family:'Barlow Condensed';font-weight:800;font-size:18px;letter-spacing:.02em;line-height:1;">🗺️ SEE PHASE 2 PICKS</div>
      <div style="font-size:11px;color:#e9d9a0;margin-top:4px;">Everyone's knockout brackets — the People's Bracket</div>
    </div>
    <span style="flex:none;font-family:'Barlow Condensed';font-weight:800;font-size:14px;background:#ffce3a;color:#1a1400;padding:8px 14px;border-radius:10px;white-space:nowrap;">VIEW →</span>
  </button>` : '';
  return `
  ${phase2Banner}
  <div style="display:flex;gap:8px;margin:14px 0 4px;">
    ${statTile('PRIZE POOL', POT, '#ffce3a')}${statTile('ANGRY MEN', STAND.length, '#eef5ec')}${statTile('MAX PTS', 200, '#eef5ec')}
  </div>
  ${seg}
  <div style="position:relative;margin:10px 0 16px;padding:18px;border-radius:18px;background:linear-gradient(150deg,#15351f 0%,#0c1f14 72%);border:1px solid #2c5a38;overflow:hidden;">
    <div style="position:absolute;right:-18px;top:-26px;font-size:120px;opacity:.06;">🏆</div>
    <div style="font-family:'Barlow Condensed';font-weight:700;font-size:12px;letter-spacing:.18em;color:#ffce3a;">👑 ${leaderLabel}</div>
    <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-top:8px;position:relative;">
      <div style="min-width:0;"><div style="font-family:'Barlow Condensed';font-weight:800;font-size:34px;line-height:.92;">${esc(leader.name)}</div>
      <div style="font-size:13px;color:#9fb3a6;margin-top:4px;">${esc(leader.nick || '')}${leader.nick ? ' · ' : ''}top of the angry men</div></div>
      <div style="text-align:right;flex:none;padding-left:12px;"><div style="font-family:'JetBrains Mono';font-weight:800;font-size:40px;color:#b6ff3a;line-height:1;">${valOf(leader)}</div>
      <div style="font-size:10px;letter-spacing:.14em;color:#5f7567;font-weight:700;">POINTS</div></div>
    </div>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin:4px 4px 10px;">
    <div style="font-family:'Barlow Condensed';font-weight:800;font-size:24px;line-height:1;">LEAGUE TABLE</div>
    <div style="font-size:11px;color:#7fd0a0;">tap a name for the receipts</div>
  </div>
  ${rows}
  <div style="font-size:11px;color:#5f7567;text-align:center;margin-top:10px;line-height:1.5;">${footnote}</div>`;
}

// ---------- Players ----------
function viewPlayers() {
  const cards = STAND.map(p => {
    const [rb, rf] = medal(p.rank);
    const w = TEAM[p.q1] || { flag: '', name: p.q1 };
    return `<button data-player="${esc(p.name)}" style="text-align:left;padding:13px;background:#0e1d14;border:1px solid #1c3a28;border-radius:14px;cursor:pointer;color:#eef5ec;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:7px;font-family:'JetBrains Mono';font-weight:800;font-size:12px;background:${rb};color:${rf};">${p.rank}</span>
        <span style="font-family:'JetBrains Mono';font-weight:800;color:#b6ff3a;font-size:20px;">${valOf(p)}</span></div>
      <div style="font-family:'Barlow Condensed';font-weight:800;font-size:19px;margin-top:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.name)}</div>
      <div style="font-size:11px;color:#5f7567;">${esc(p.nick || '')}&nbsp;</div>
      <div style="margin-top:10px;padding-top:9px;border-top:1px dashed #1c3a28;font-size:9px;letter-spacing:.1em;color:#5f7567;font-weight:700;">PICKED TO LIFT IT</div>
      <div style="font-family:'Barlow Condensed';font-weight:700;font-size:15px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${w.flag} ${esc(w.name || p.q1)}</div></button>`;
  }).join('');
  return `<div style="margin:16px 2px 12px;">
    <div style="font-family:'Barlow Condensed';font-weight:800;font-size:26px;line-height:1;">THE SQUAD</div>
    <div style="font-size:12px;color:#7fd0a0;margin-top:3px;">${STAND.length} angry men. tap a card for the full receipts.</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">${cards}</div>`;
}

// ---------- Fixtures ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d) {
  if (!d) return 'DATE TBC';
  const [y, m, day] = d.split('-');
  return `${+day} ${(MONTHS[+m - 1] || '').toUpperCase()}`;
}
// Matches → FIXTURES sub-view body (reused by viewMatches).
function renderFixtures() {
  const ms = (DATA.matches || []).slice().sort(
    (a, b) => (a.date || '').localeCompare(b.date || '') || a.g.localeCompare(b.g));
  let html = `<div style="margin:16px 2px 6px;">
    <div style="font-family:'Barlow Condensed';font-weight:800;font-size:26px;line-height:1;">FIXTURES &amp; RESULTS</div>
    <div style="font-size:12px;color:#7fd0a0;margin-top:3px;">Group stage · 12 groups · top 2 + 8 best 3rds advance to R32.</div></div>`;
  if (!ms.length) {
    return html + `<div style="font-size:12px;color:#5f7567;text-align:center;margin-top:24px;">Fixtures syncing — check back shortly.</div>`;
  }
  let curDate = null;
  for (const m of ms) {
    if (m.date !== curDate) {
      curDate = m.date;
      html += `<div style="font-family:'Barlow Condensed';font-weight:700;letter-spacing:.14em;color:#7fd0a0;font-size:13px;margin:16px 2px 8px;">${fmtDate(m.date)}</div>`;
    }
    const ht = TEAM[m.h] || { flag: '' }, at = TEAM[m.a] || { flag: '' };
    const score = m.done ? `${m.hs} – ${m.as}` : 'v';
    const scLabel = m.done ? 'FT' : 'UPCOMING';
    const col = m.done ? '#9fb3a6' : '#5f7567';
    html += `<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;margin-bottom:6px;background:#0e1d14;border:1px solid #1c3a28;border-radius:11px;">
      <span style="font-size:10px;font-weight:700;color:#5f7567;width:40px;flex:none;font-family:'Barlow Condensed';letter-spacing:.04em;">GRP ${m.g}</span>
      <div style="flex:1;display:flex;align-items:center;justify-content:flex-end;gap:6px;min-width:0;"><span style="font-size:13px;font-weight:600;white-space:nowrap;">${esc(m.h)}</span><span style="font-size:16px;">${ht.flag}</span></div>
      <span style="font-family:'JetBrains Mono';font-weight:800;font-size:14px;min-width:52px;text-align:center;color:#eef5ec;">${score}</span>
      <div style="flex:1;display:flex;align-items:center;gap:6px;min-width:0;"><span style="font-size:16px;">${at.flag}</span><span style="font-size:13px;font-weight:600;white-space:nowrap;">${esc(m.a)}</span></div>
      <span style="font-size:10px;font-weight:800;width:36px;flex:none;text-align:right;letter-spacing:.04em;color:${col};">${scLabel}</span></div>`;
  }
  html += `<div style="font-size:11px;color:#5f7567;text-align:center;margin-top:14px;">Official fixtures &amp; results, auto-synced ~12h. Standings use the official FIFA tables.</div>`;
  return html;
}

// ---------- Groups ----------
// Matches → TABLES sub-view body (reused by viewMatches).
function renderTables() {
  let html = `<div style="margin:16px 2px 12px;">
    <div style="font-family:'Barlow Condensed';font-weight:800;font-size:26px;line-height:1;">GROUP STAGE</div>
    <div style="font-size:12px;color:#7fd0a0;margin-top:3px;">Live tables. Green = top 2 (in). Gold = 3rd-placed team currently qualifying (best-8).</div></div>`;
  for (const L of GROUP_LETTERS) {
    const st = TABLES[L];
    const thirdIn = PROJ.best8.has(L);
    const rows = st.map((s, i) => {
      const qual3 = i === 2 && thirdIn;
      const rowBg = i < 2 ? 'rgba(182,255,58,.06)' : (qual3 ? 'rgba(255,206,58,.09)' : 'transparent');
      const posColor = i < 2 ? '#b6ff3a' : (i === 2 ? (thirdIn ? '#ffce3a' : '#7a8a7f') : '#5f7567');
      const gd = (s.gd > 0 ? '+' : '') + s.gd;
      const tag = qual3 ? `<span style="font-family:'Barlow Condensed';font-weight:700;font-size:9px;letter-spacing:.06em;color:#ffce3a;background:rgba(255,206,58,.16);border:1px solid #6b5a1e;border-radius:5px;padding:1px 5px;flex:none;">R32</span>` : '';
      return `<div style="display:flex;align-items:center;padding:7px 13px;background:${rowBg};">
        <span style="width:20px;font-family:'JetBrains Mono';font-weight:800;font-size:12px;color:${posColor};">${i + 1}</span>
        <span style="flex:1;display:flex;align-items:center;gap:8px;min-width:0;"><span style="font-size:16px;">${s.flag}</span><span style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(s.name)}</span>${tag}</span>
        <span style="width:22px;text-align:center;font-family:'JetBrains Mono';font-size:12px;color:#9fb3a6;">${s.p}</span>
        <span style="width:32px;text-align:center;font-family:'JetBrains Mono';font-size:12px;color:#9fb3a6;">${gd}</span>
        <span style="width:26px;text-align:center;font-family:'JetBrains Mono';font-weight:800;font-size:13px;color:#eef5ec;">${s.pts}</span></div>`;
    }).join('');
    html += `<div style="margin-bottom:14px;background:#0e1d14;border:1px solid #1c3a28;border-radius:14px;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 13px;background:#0a1813;border-bottom:1px solid #1c3a28;">
        <span style="font-family:'Barlow Condensed';font-weight:800;font-size:16px;letter-spacing:.05em;">GROUP ${L}</span>
        <span style="font-size:10px;color:#5f7567;font-weight:700;letter-spacing:.08em;">TOP 2 ADVANCE</span></div>
      <div style="padding:3px 0 5px;">
        <div style="display:flex;padding:5px 13px;font-size:9px;letter-spacing:.1em;color:#5f7567;font-weight:700;"><span style="width:20px;">#</span><span style="flex:1;">TEAM</span><span style="width:22px;text-align:center;">P</span><span style="width:32px;text-align:center;">GD</span><span style="width:26px;text-align:center;">PTS</span></div>
        ${rows}</div></div>`;
  }
  return html;
}

// ---------- Rules ----------
function viewRules() {
  const row = (desc, per, sub) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid #122a1c;"><span style="flex:1;font-size:13px;color:#cfe0d4;">${desc}</span><span style="font-family:'JetBrains Mono';color:#9fb3a6;font-size:12px;width:34px;text-align:right;">${per}</span><span style="font-family:'JetBrains Mono';font-weight:700;font-size:13px;width:34px;text-align:right;">${sub}</span></div>`;
  const phase = (name, sub, max, rows, note = '') => `<div style="background:#0e1d14;border:1px solid #1c3a28;border-radius:14px;overflow:hidden;margin-bottom:12px;">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 14px;background:#0a1813;border-bottom:1px solid #1c3a28;"><div><div style="font-family:'Barlow Condensed';font-weight:800;font-size:17px;">${name}</div><div style="font-size:10px;color:#5f7567;">${sub}</div></div><div style="font-family:'JetBrains Mono';font-weight:800;color:#b6ff3a;font-size:20px;">${max}</div></div>
    <div style="padding:4px 0;">${rows}</div>${note}</div>`;
  return `<div style="margin:16px 2px 12px;">
    <div style="font-family:'Barlow Condensed';font-weight:800;font-size:26px;line-height:1;">RULES &amp; SCORING</div>
    <div style="font-size:12px;color:#7fd0a0;margin-top:3px;">Read it. No crying in the group chat later.</div></div>
  <div style="padding:15px;background:linear-gradient(150deg,#15351f,#0c1f14);border:1px solid #2c5a38;border-radius:16px;margin-bottom:14px;">
    <div style="font-family:'Barlow Condensed';font-weight:700;font-size:12px;letter-spacing:.16em;color:#ffce3a;">THE PRIZE POOL</div>
    <div style="display:flex;align-items:baseline;gap:10px;margin-top:6px;"><span style="font-family:'JetBrains Mono';font-weight:800;font-size:34px;color:#ffce3a;">${POT}</span><span style="font-size:12px;color:#9fb3a6;">and counting</span></div>
    <div style="font-size:13px;color:#cfe0d4;margin-top:8px;line-height:1.55;">Prize split gets announced once registration closes and the final headcount is locked.</div></div>
  <div style="font-size:13px;color:#cfe0d4;line-height:1.55;padding:0 4px 12px;"><b style="color:#fff;">48 teams · 12 groups of 4.</b> Top 2 from each group plus the 8 best 3rd-placed teams go through to the Round of 32. Predict it across 3 phases, max <b style="color:#b6ff3a;">200 points</b>.</div>
  ${phase('PHASE 1', 'Before group stage', 71,
    row('Correct team into Round of 32 <span style="color:#5f7567;">(position doesn\'t matter)</span>', '1 ea', '32') +
    row('All qualifiers from a group right (2/2 or 3/3)', '2 ea', '24') +
    row('<b style="color:#ffce3a;">Q1</b> · World Cup winner', '5', '5') +
    row('<b style="color:#ffce3a;">Q2</b> · Golden Boot winner', '5', '5') +
    row('<b style="color:#ffce3a;">Q3</b> · Golden Glove winner', '5', '5'))}
  ${phase('PHASE 2', 'Round of 32 &amp; Round of 16', 72,
    row('Correct Round of 32 bracket pick', '2 ea', '32') +
    row('Correct Round of 16 bracket pick', '4 ea', '32') +
    row('<b style="color:#ffce3a;">Q4</b> · Most goals (R32 + R16) *', '4', '4') +
    row('<b style="color:#ffce3a;">Q5</b> · Most goals conceded (R32 + R16) *', '4', '4'),
    '<div style="padding:0 14px 11px;font-size:11px;color:#5f7567;">* All teams tied on the most/fewest count are scored correct.</div>')}
  ${phase('PHASE 3', 'Quarterfinals → Final', 57,
    row('Correct Quarterfinal pick', '6 ea', '24') +
    row('Correct Semifinal pick', '8 ea', '16') +
    row('Correct 3rd place match winner', '7', '7') +
    row('Correct Final / champion', '10', '10'))}`;
}

// ---------- People's Bracket (aggregate view) ----------
function viewBracket() {
  const header = `<div style="margin:16px 2px 10px;">
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:26px;line-height:1;">THE PEOPLE'S BRACKET</div>
    <div style="font-size:12px;color:#7fd0a0;margin-top:3px;">Phase 2 · who backed whom. Pinch the zoom, tap a tie for the full list.</div>
  </div>`;

  // Honest empty state — nobody has stored a bracket yet.
  if (DATA.players.every(p => !p.bracket)) {
    return `${header}<div style="margin:40px 12px;padding:30px 18px;text-align:center;color:#5f7567;background:#0c1710;border:1px solid #1c3a28;border-radius:14px;line-height:1.5;">
      No brackets in yet — be the first on the <b style="color:#7fd0a0;">Build</b> tab.
    </div>`;
  }

  const zoomPct = Math.round(state.zoom * 100) + '%';
  const controlBar = `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;position:sticky;top:62px;z-index:20;padding:8px 10px;margin:0 0 12px;background:rgba(10,24,19,.92);backdrop-filter:blur(8px);border:1px solid #1c3a28;border-radius:12px;">
    <div style="display:flex;align-items:center;gap:8px;">
      <button data-zoom="out" style="width:30px;height:30px;border-radius:8px;background:#15301f;border:1px solid #2c5a38;color:#eef5ec;font-size:18px;cursor:pointer;line-height:1;">−</button>
      <span style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:12px;color:#9fb3a6;width:42px;text-align:center;">${zoomPct}</span>
      <button data-zoom="in" style="width:30px;height:30px;border-radius:8px;background:#15301f;border:1px solid #2c5a38;color:#eef5ec;font-size:18px;cursor:pointer;line-height:1;">+</button>
    </div>
    <div style="display:flex;align-items:center;gap:12px;font-size:10px;font-weight:700;letter-spacing:.04em;">
      <span style="display:inline-flex;align-items:center;gap:5px;color:#b6ff3a;"><span style="width:9px;height:9px;border-radius:2px;background:#b6ff3a;"></span>MOST BACKED</span>
      <span style="display:inline-flex;align-items:center;gap:5px;color:#5f7567;"><span style="width:9px;height:9px;border-radius:2px;background:#27412f;"></span>UNDERDOG</span>
    </div>
  </div>`;

  const pFont = [16, 14, 12.5, 11.5], pFlag = [18, 15, 13, 12], pBarH = [9, 7, 5.5, 4.5];

  const regionsHtml = M.regions.map(reg => {
    // Two R32 match cards.
    const matches = reg.m.map(mid => {
      const m = M.r32[mid];
      const cA = AGG.r32[mid]?.[m.a.code]?.count || 0;
      const cB = AGG.r32[mid]?.[m.b.code]?.count || 0;
      const lead = cA >= cB ? m.a.code : m.b.code;
      const rows = [{ t: m.a, c: cA }, { t: m.b, c: cB }].map(({ t, c }) => {
        const ti = TEAM[t.code] || { flag: t.flag || '' };
        const isLead = t.code === lead && c > 0;
        const rowStyle = `display:flex;align-items:center;gap:7px;padding:8px 9px;${isLead ? 'background:rgba(182,255,58,.08);' : ''}`;
        return `<div style="${rowStyle}">
          <span style="font-size:15px;flex:none;">${ti.flag || ''}</span>
          <span style="flex:1;min-width:0;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${isLead ? '#fff' : '#9fb3a6'};">${esc(t.code)}</span>
          <span style="font-family:'JetBrains Mono',monospace;font-weight:800;font-size:12px;color:${isLead ? '#b6ff3a' : '#5f7567'};">${c}</span>
        </div>`;
      }).join('');
      return `<button data-open="r32:${mid}" style="text-align:left;background:#0a1813;border:1px solid #1c3a28;border-radius:10px;overflow:hidden;cursor:pointer;padding:0;color:#eef5ec;">${rows}</button>`;
    }).join('');

    // R16 podium — the 4 possible teams (the four R32 participants), ranked by R16 support.
    const possible = regionTeams(reg, M.r32);
    const ranked = possible
      .map(t => ({ t, c: AGG.r16[reg.id]?.[t.code]?.count || 0 }))
      .sort((x, y) => y.c - x.c);
    const maxC = Math.max(1, ranked[0].c);
    const qfRows = ranked.map((r, k) => {
      const ti = TEAM[r.t.code] || { flag: r.t.flag || '' };
      const barColor = k === 0 ? 'linear-gradient(90deg,#1a7a43,#b6ff3a)' : k === 1 ? '#3f9c5e' : '#27412f';
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;opacity:${1 - k * 0.15};">
        <span style="font-size:${pFlag[k]}px;flex:none;width:20px;">${ti.flag || ''}</span>
        <span style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:${pFont[k]}px;width:36px;flex:none;color:${k === 0 ? '#fff' : '#cfe0d4'};">${esc(r.t.code)}</span>
        <div style="flex:1;min-width:18px;height:${pBarH[k]}px;border-radius:3px;background:#0a1813;overflow:hidden;"><div style="height:100%;width:${Math.round(r.c / maxC * 100)}%;background:${barColor};"></div></div>
        <span style="font-family:'JetBrains Mono',monospace;font-weight:800;font-size:${pFont[k]}px;width:18px;text-align:right;flex:none;color:${k === 0 ? '#b6ff3a' : '#7f9f86'};">${r.c}</span>
      </div>`;
    }).join('');

    return `<div style="margin-bottom:16px;background:#0c1710;border:1px solid #1c3a28;border-radius:14px;padding:11px;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:.1em;font-size:11px;color:#7fd0a0;margin:0 0 9px 2px;">REGION ${reg.id + 1} · R32 → R16</div>
      <div style="display:flex;align-items:stretch;gap:0;">
        <div style="width:188px;flex:none;display:flex;flex-direction:column;gap:9px;">${matches}</div>
        <div style="width:26px;flex:none;position:relative;">
          <div style="position:absolute;left:0;top:25%;width:13px;height:1px;background:#2c5a38;"></div>
          <div style="position:absolute;left:0;top:75%;width:13px;height:1px;background:#2c5a38;"></div>
          <div style="position:absolute;left:13px;top:25%;height:50%;width:1px;background:#2c5a38;"></div>
          <div style="position:absolute;left:13px;top:50%;width:13px;height:1px;background:#2c5a38;"></div>
        </div>
        <button data-open="r16:${reg.id}" style="flex:1;min-width:154px;text-align:left;background:linear-gradient(150deg,#13301d,#0a1813);border:1px solid #2c5a38;border-radius:10px;padding:11px 11px 8px;cursor:pointer;color:#eef5ec;">
          <div style="font-size:8px;letter-spacing:.12em;color:#5f7567;font-weight:700;margin-bottom:9px;">BACKED TO REACH QF</div>
          ${qfRows}
        </button>
      </div>
    </div>`;
  }).join('');

  const tree = `<div class="scrollx" style="overflow:auto;-webkit-overflow-scrolling:touch;margin:0 -4px;padding:0 4px 8px;">
    <div style="display:flex;flex-direction:column;gap:0;zoom:${state.zoom};min-width:340px;">${regionsHtml}</div>
  </div>`;

  return `${header}${controlBar}${tree}`;
}

// ---------- Matches (Fixtures · Tables · Knockout) ----------
function viewMatches() {
  const sub = state.matchSub || 'fixtures';
  const subDef = [['fixtures', 'FIXTURES'], ['groups', 'TABLES'], ['knockout', 'KNOCKOUT']];
  const seg = `<div style="display:flex;gap:6px;margin:12px 0;padding:4px;background:#0a1813;border:1px solid #1c3a28;border-radius:12px;">
    ${subDef.map(([k, label]) => `<button data-sub="${k}" style="flex:1;padding:8px 4px;border:0;border-radius:9px;cursor:pointer;font-family:'Barlow Condensed';font-weight:700;font-size:13px;letter-spacing:.06em;background:${sub === k ? '#1a7a43' : 'transparent'};color:${sub === k ? '#eafff0' : '#7fd0a0'};">${label}</button>`).join('')}
  </div>`;
  const header = `<div style="margin:16px 2px 10px;">
    <div style="font-family:'Barlow Condensed';font-weight:800;font-size:26px;line-height:1;">MATCHES</div>
    <div style="font-size:12px;color:#7fd0a0;margin-top:3px;">Group stage · 12 groups · top 2 + 8 best 3rds advance to R32.</div></div>`;
  const body = sub === 'groups' ? renderTables() : sub === 'knockout' ? renderKnockout() : renderFixtures();
  return `${header}${seg}${body}`;
}

function renderKnockout() {
  // Live knockout bracket driven by the real draw (M.r32 from bracketR32) + scraped
  // results (DATA.koMatches: per-match IST date/time + score/winner). Later rounds fill
  // in as winners are known. Kickoff times are IST.
  const kom = DATA.koMatches || [];
  const findM = (x, y) => kom.find(m => (m.h === x && m.a === y) || (m.h === y && m.a === x));
  const winnerOf = (x, y) => { const m = findM(x, y); return (m && m.done) ? m.w : null; };

  const rounds = [(M.r32 || []).map(m => ({ a: m.a.code, b: m.b.code }))];
  for (let r = 1; r <= 4; r++) {
    const prev = rounds[r - 1], cur = [];
    for (let i = 0; i < prev.length; i += 2)
      cur.push({ a: winnerOf(prev[i].a, prev[i].b), b: winnerOf(prev[i + 1].a, prev[i + 1].b) });
    rounds.push(cur);
  }

  const COLS = ['ROUND OF 32', 'ROUND OF 16', 'QUARTERFINAL', 'SEMIFINAL', 'FINAL'];
  const fmtWhen = (m) => (m && m.date) ? (fmtDate(m.date) + (m.time ? ' · ' + m.time : '')) : 'DATE TBC';
  const card = (inner) => `<div style="background:#0c1710;border:1px solid #1c3a28;border-radius:9px;overflow:hidden;">${inner}</div>`;
  const sep = `<div style="height:1px;background:#1c3a28;"></div>`;
  const line = (code, score, isWin, isLoss) => {
    const t = code ? (TEAM[code] || { flag: '' }) : null;
    const flag = t ? (t.flag || '⚪') : '⚪';
    const color = isWin ? '#b6ff3a' : isLoss ? '#5f7567' : (code ? '#cfe0d4' : '#5f7567');
    const sc = (score != null) ? `<span style="font-family:'JetBrains Mono';font-weight:800;font-size:12px;color:${color};padding-left:6px;">${score}</span>` : '';
    return `<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;${isLoss ? 'opacity:.5;' : ''}"><span style="font-size:13px;">${flag}</span><span style="flex:1;font-size:12px;font-weight:700;color:${color};">${code ? esc(code) : 'TBD'}</span>${sc}</div>`;
  };
  const matchCard = (slot) => {
    const { a, b } = slot;
    const m = (a && b) ? findM(a, b) : null;
    let aS = null, bS = null, aW = false, bW = false, foot;
    if (m && m.done) {
      const aHome = m.h === a;
      aS = aHome ? m.hs : m.as; bS = aHome ? m.as : m.hs;
      aW = m.w === a; bW = m.w === b;
      foot = 'FT' + (m.date ? ' · ' + fmtDate(m.date) : '');
    } else {
      foot = fmtWhen(m);
    }
    const done = !!(m && m.done);
    return card(line(a, aS, aW, done && !aW) + sep + line(b, bS, bW, done && !bW) +
      `<div style="padding:4px 8px 6px;font-size:8.5px;color:#5f7567;font-weight:600;letter-spacing:.02em;border-top:1px solid #122a1c;">${foot}</div>`);
  };

  const colsHtml = COLS.map((label, ci) => `<div style="flex:1;min-width:150px;display:flex;flex-direction:column;">
      <div style="margin-bottom:9px;"><div style="font-family:'Barlow Condensed';font-weight:800;font-size:12px;letter-spacing:.05em;color:#b6ff3a;">${label}</div></div>
      <div style="flex:1;display:flex;flex-direction:column;justify-content:space-around;gap:8px;">${rounds[ci].map(matchCard).join('')}</div>
    </div>`).join('');

  const bracket = `<div style="font-size:11px;color:#5f7567;margin:2px 2px 12px;line-height:1.5;">The road to the Final — updates live as matches finish. Kickoff times in IST.</div>
    <div class="scrollx" style="overflow:auto;-webkit-overflow-scrolling:touch;margin:0 -4px 18px;padding:0 4px 10px;">
      <div style="display:flex;gap:12px;min-width:820px;align-items:stretch;">${colsHtml}</div>
    </div>`;

  const sched = kom.slice().sort((x, y) => (x.date || '').localeCompare(y.date || '') || (x.time || '').localeCompare(y.time || ''));
  let curDate = null, listRows = '';
  for (const m of sched) {
    if (m.date !== curDate) {
      curDate = m.date;
      listRows += `<div style="font-family:'Barlow Condensed';font-weight:700;letter-spacing:.14em;color:#7fd0a0;font-size:13px;margin:16px 2px 8px;">${fmtDate(m.date)}</div>`;
    }
    const ta = TEAM[m.h] || { flag: '' }, tb = TEAM[m.a] || { flag: '' };
    const mid = m.done ? `${m.hs} – ${m.as}` : 'v';
    const midCol = m.done ? '#b6ff3a' : '#5f7567';
    listRows += `<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;margin-bottom:6px;background:#0e1d14;border:1px solid #1c3a28;border-radius:11px;">
      <span style="font-size:9px;font-weight:700;color:#5f7567;width:62px;flex:none;font-family:'JetBrains Mono';">${m.done ? 'FT' : esc(m.time || 'TBC')}</span>
      <div style="flex:1;display:flex;align-items:center;justify-content:flex-end;gap:6px;min-width:0;"><span style="font-size:13px;font-weight:700;color:${m.done && m.w === m.h ? '#b6ff3a' : '#cfe0d4'};white-space:nowrap;">${esc(m.h)}</span><span style="font-size:15px;">${ta.flag || ''}</span></div>
      <span style="font-family:'JetBrains Mono';font-weight:800;font-size:13px;color:${midCol};min-width:40px;text-align:center;">${mid}</span>
      <div style="flex:1;display:flex;align-items:center;gap:6px;min-width:0;"><span style="font-size:15px;">${tb.flag || ''}</span><span style="font-size:13px;font-weight:700;color:${m.done && m.w === m.a ? '#b6ff3a' : '#cfe0d4'};white-space:nowrap;">${esc(m.a)}</span></div>
    </div>`;
  }
  const list = `<div style="font-family:'Barlow Condensed';font-weight:800;font-size:16px;margin:4px 2px 4px;">KNOCKOUT SCHEDULE <span style="font-size:11px;color:#5f7567;font-weight:600;">· IST</span></div>${listRows || '<div style="font-size:12px;color:#5f7567;text-align:center;margin-top:16px;">Fixtures syncing…</div>'}`;

  return bracket + list;
}


// ---------- Supporter overlay (R32 tie / R16 region) ----------
function renderSupporterOverlay() {
  const o = $overlay();
  const om = state.openMatch;
  const total = DATA.players.length;
  const sideHtml = (flag, name, fans) => {
    const c = fans.length;
    const color = c > 0 ? '#b6ff3a' : '#5f7567';
    const chips = c > 0
      ? fans.map(n => `<span style="padding:4px 10px;border-radius:8px;font-size:12px;font-weight:600;background:#0e1d14;border:1px solid #1c3a28;color:#cfe0d4;">${esc(n)}</span>`).join('')
      : `<span style="font-size:12px;color:#5f7567;font-style:italic;">nobody backed this one 💀</span>`;
    return `<div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:9px;margin-bottom:9px;">
        <span style="font-size:22px;">${flag || ''}</span>
        <span style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:19px;flex:1;min-width:0;">${esc(name)}</span>
        <span style="font-family:'JetBrains Mono',monospace;font-weight:800;font-size:18px;color:${color};">${c}/${total}</span>
      </div>
      <div style="height:6px;border-radius:4px;background:#0e1d14;overflow:hidden;margin-bottom:10px;"><div style="height:100%;width:${total ? Math.round(c / total * 100) : 0}%;background:linear-gradient(90deg,#1a7a43,#b6ff3a);"></div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">${chips}</div>
    </div>`;
  };

  let kicker, title, sub, sides;
  if (om.round === 'r32') {
    const m = M.r32[om.id];
    kicker = 'ROUND OF 32 · TIE ' + (om.id + 1);
    title = `${m.a.name} vs ${m.b.name}`;
    sub = 'Who backed each side to reach the Round of 16.';
    sides = [m.a, m.b].map(t => {
      const ti = TEAM[t.code] || { flag: t.flag || '', name: t.name };
      return sideHtml(ti.flag, ti.name || t.name, AGG.r32[om.id]?.[t.code]?.backers || []);
    }).join('');
  } else {
    const reg = M.regions[om.id];
    const possible = regionTeams(reg, M.r32);
    kicker = 'REGION ' + (om.id + 1) + ' · R16 → QF';
    title = 'Backed to reach the Quarterfinals';
    sub = 'Across both R32 ties in this region.';
    sides = possible
      .map(t => ({ t, backers: AGG.r16[om.id]?.[t.code]?.backers || [] }))
      .sort((a, b) => b.backers.length - a.backers.length)
      .map(({ t, backers }) => {
        const ti = TEAM[t.code] || { flag: t.flag || '', name: t.name };
        return sideHtml(ti.flag, ti.name || t.name, backers);
      }).join('');
  }

  o.innerHTML = `
    <div data-close="1" style="position:fixed;inset:0;z-index:60;background:rgba(3,8,5,.82);backdrop-filter:blur(3px);"></div>
    <div style="position:fixed;z-index:61;left:0;right:0;bottom:0;top:18%;max-width:680px;margin:0 auto;background:#0a1813;border:1px solid #2c5a38;border-radius:22px 22px 0 0;overflow-y:auto;">
      <div style="position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#0a1813;border-bottom:1px solid #1c3a28;z-index:2;">
        <span style="font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:.14em;font-size:12px;color:#7fd0a0;">${kicker}</span>
        <button data-close="1" style="width:30px;height:30px;border-radius:9px;background:#15301f;border:1px solid #2c5a38;color:#eef5ec;font-size:16px;cursor:pointer;line-height:1;">✕</button>
      </div>
      <div style="padding:16px 16px 44px;">
        <div style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:20px;margin-bottom:4px;">${esc(title)}</div>
        <div style="font-size:12px;color:#5f7567;margin-bottom:16px;">${sub}</div>
        ${sides}
      </div>
    </div>`;
}

// ---------- Player detail overlay ----------
function renderOverlay() {
  if (state.openMatch) { renderSupporterOverlay(); return; }
  const o = $overlay();
  if (state.selected == null) { o.innerHTML = ''; return; }
  const p = STAND.find(x => x.name === state.selected);
  if (!p) { o.innerHTML = ''; return; }
  const [rb, rf] = medal(p.rank);
  const w = TEAM[p.q1] || { flag: '', name: p.q1 };
  const bonusSet = bonusGroups(p, PROJ);
  const picksRows = GROUP_LETTERS.map(L => {
    const picks = (p.picks?.[L]) || [];
    const isBonus = bonusSet.has(L);
    const chips = picks.map(code => {
      const t = TEAM[code] || { flag: '', name: code };
      const inQ = PROJ.groupQ[L]?.includes(code);
      const started = PROJ.started[L];
      const color = inQ ? '#b6ff3a' : (started ? '#ff7a6a' : '#5f7567');
      const bg = inQ ? 'rgba(182,255,58,.1)' : (started ? 'rgba(255,122,106,.1)' : 'rgba(255,255,255,.04)');
      return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:8px;font-size:12px;font-weight:600;background:${bg};color:${color};border:1px solid ${color};"><span style="font-size:14px;">${t.flag}</span>${esc(code)}</span>`;
    }).join('');
    const badge = isBonus ? `<span style="font-family:'JetBrains Mono';font-weight:800;font-size:11px;color:#ffce3a;background:rgba(255,206,58,.16);border:1px solid #6b5a1e;border-radius:6px;padding:2px 6px;flex:none;">+2</span>` : '';
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px ${isBonus ? '8px' : '0'};margin:${isBonus ? '0 -2px' : '0'};border-bottom:1px solid #122a1c;${isBonus ? 'background:rgba(255,206,58,.06);border-radius:8px;' : ''}">
      <span style="width:50px;flex:none;font-family:'Barlow Condensed';font-weight:700;font-size:13px;color:${isBonus ? '#ffce3a' : '#7fd0a0'};">GRP ${L}</span>
      <div style="flex:1;display:flex;gap:6px;flex-wrap:wrap;">${chips}</div>${badge}</div>`;
  }).join('');
  // Phase tiles: P1 (neutral), P2 (gold accent), P3 (locked).
  const ptile = (lbl, val, opts = {}) => `<div style="flex:1;padding:10px;background:#0e1d14;border:1px solid ${opts.border || '#1c3a28'};border-radius:11px;text-align:center;"><div style="font-size:9px;letter-spacing:.1em;color:${opts.lblColor || '#5f7567'};font-weight:700;">${lbl}</div><div style="font-family:'JetBrains Mono';font-weight:800;font-size:18px;color:${opts.valColor || '#eef5ec'};margin-top:3px;">${val}</div></div>`;
  const bonus = (q, lbl, ans) => `<div style="display:flex;align-items:center;gap:10px;padding:11px 13px;background:#0e1d14;border:1px solid #1c3a28;border-radius:11px;margin-bottom:7px;"><span style="font-family:'JetBrains Mono';font-weight:800;color:#ffce3a;font-size:13px;width:26px;">${q}</span><span style="flex:1;font-size:11px;color:#5f7567;">${lbl}</span><span style="font-family:'Barlow Condensed';font-weight:700;font-size:15px;">${esc(ans)}</span></div>`;
  // Phase-2 mini-bracket: 8 region cells, each = two R32 picks (advancing one lime) → QF chip.
  const miniBracket = !p.bracket
    ? `<div style="background:#0c1710;border:1px dashed #1c3a28;border-radius:11px;padding:18px;text-align:center;color:#5f7567;font-size:12px;">No Phase 2 bracket yet</div>`
    : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">${M.regions.map(reg => {
        const r16pick = p.bracket.r16?.[reg.id];
        const r32cells = reg.m.map(mid => {
          const c = p.bracket.r32?.[mid];
          const t = TEAM[c] || { flag: '', name: c };
          const wins = !!c && r16pick === c;
          return `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 6px;border-radius:6px;font-size:10.5px;font-weight:600;white-space:nowrap;background:${wins ? 'rgba(182,255,58,.1)' : 'rgba(255,255,255,.04)'};color:${wins ? '#b6ff3a' : '#9fb3a6'};"><span style="font-size:12px;">${t.flag || ''}</span>${esc(c || '—')}</span>`;
        }).join('');
        const qf = TEAM[r16pick] || { flag: '', name: r16pick };
        return `<div style="background:#0c1710;border:1px solid #1c3a28;border-radius:11px;padding:9px;">
          <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;letter-spacing:.08em;color:#7fd0a0;margin-bottom:7px;">R${reg.id + 1}</div>
          <div style="display:flex;align-items:stretch;gap:0;">
            <div style="flex:none;display:flex;flex-direction:column;gap:5px;justify-content:center;">${r32cells}</div>
            <div style="width:15px;flex:none;position:relative;">
              <div style="position:absolute;left:0;top:25%;width:7px;height:1px;background:#2c5a38;"></div>
              <div style="position:absolute;left:0;top:75%;width:7px;height:1px;background:#2c5a38;"></div>
              <div style="position:absolute;left:7px;top:25%;height:50%;width:1px;background:#2c5a38;"></div>
              <div style="position:absolute;left:7px;top:50%;width:8px;height:1px;background:#2c5a38;"></div>
            </div>
            <div style="flex:1;min-width:0;display:flex;align-items:center;">
              <span style="display:inline-flex;align-items:center;gap:4px;padding:5px 7px;border-radius:7px;font-size:11px;font-weight:700;background:rgba(182,255,58,.12);color:#b6ff3a;border:1px solid #2c5a38;width:100%;white-space:nowrap;overflow:hidden;"><span style="font-size:12px;">${qf.flag || ''}</span>${esc(r16pick || '—')}</span>
            </div>
          </div>
        </div>`;
      }).join('')}</div>`;
  o.innerHTML = `
    <div data-close="1" style="position:fixed;inset:0;z-index:60;background:rgba(3,8,5,.82);backdrop-filter:blur(3px);"></div>
    <div style="position:fixed;z-index:61;left:0;right:0;bottom:0;top:7%;max-width:680px;margin:0 auto;background:#0a1813;border:1px solid #2c5a38;border-radius:22px 22px 0 0;overflow-y:auto;">
      <div style="position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#0a1813;border-bottom:1px solid #1c3a28;z-index:2;">
        <span style="font-family:'Barlow Condensed';font-weight:700;letter-spacing:.14em;font-size:12px;color:#7fd0a0;">PLAYER CARD</span>
        <button data-close="1" style="width:30px;height:30px;border-radius:9px;background:#15301f;border:1px solid #2c5a38;color:#eef5ec;font-size:16px;cursor:pointer;line-height:1;">✕</button>
      </div>
      <div style="padding:16px 16px 44px;">
        <div style="display:flex;align-items:center;gap:13px;">
          <div style="width:46px;height:46px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:12px;font-family:'JetBrains Mono';font-weight:800;font-size:20px;background:${rb};color:${rf};">${p.rank}</div>
          <div style="flex:1;min-width:0;"><div style="font-family:'Barlow Condensed';font-weight:800;font-size:28px;line-height:1;">${esc(p.name)}</div><div style="font-size:12px;color:#5f7567;">${esc(p.nick || '')}&nbsp;</div></div>
          <div style="text-align:right;flex:none;"><div style="font-family:'JetBrains Mono';font-weight:800;font-size:30px;color:#b6ff3a;line-height:1;">${p.p1}</div><div style="font-size:10px;letter-spacing:.12em;color:#5f7567;font-weight:700;">POINTS</div></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;">${ptile('PHASE 1', p.p1)}${ptile('PHASE 2', p.p2 || 0, { border: '#2c5a38', lblColor: '#ffce3a' })}${ptile('PHASE 3', '🔒', { valColor: '#5f7567' })}</div>
        <div style="font-family:'Barlow Condensed';font-weight:800;font-size:17px;margin:20px 0 4px;letter-spacing:.03em;">PHASE 1 · R32 PICKS</div>
        <div style="font-size:11px;color:#5f7567;margin-bottom:8px;">Teams backed to reach the Round of 32. Green = on track, red = trailing, grey = not started. <b style="color:#ffce3a;">Gold +2</b> = every qualifier from that group nailed (group bonus).</div>
        ${picksRows}
        <div style="font-family:'Barlow Condensed';font-weight:800;font-size:17px;margin:22px 0 4px;letter-spacing:.03em;">PHASE 2 · BRACKET</div>
        <div style="font-size:11px;color:#5f7567;margin-bottom:10px;">R32 picks (left) → the team they sent to the QF (right). The advancing finalist is highlighted lime.</div>
        ${miniBracket}
        <div style="font-family:'Barlow Condensed';font-weight:800;font-size:17px;margin:22px 0 8px;letter-spacing:.03em;">PHASE 1 BONUS</div>
        ${bonus('Q1', 'WORLD CUP WINNER', (w.flag + ' ' + (w.name || p.q1)))}
        ${bonus('Q2', 'GOLDEN BOOT', p.q2)}
        ${bonus('Q3', 'GOLDEN GLOVE', p.q3)}
        <div style="font-family:'Barlow Condensed';font-weight:800;font-size:17px;margin:22px 0 8px;letter-spacing:.03em;">PHASE 2 BONUS</div>
        ${bonus('Q4', 'MOST GOALS (R32+R16)', TEAM[p.q4]?.name || '—')}
        ${bonus('Q5', 'MOST CONCEDED (R32+R16)', TEAM[p.q5]?.name || '—')}
      </div>
    </div>`;
}

// ---------- Events ----------
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-tab]');
  if (nav) { state.tab = nav.dataset.tab; state.selected = null; state.openMatch = null; render(); return; }
  if (state.tab === 'build') { (DATA.meta?.phase >= 3 ? handleBuildEventP3 : handleBuildEvent)(buildCtx(), e.target); return; }
  const seg = e.target.closest('[data-mode]');
  if (seg) { state.standMode = seg.dataset.mode; recompute(); render(); return; }
  const sub = e.target.closest('[data-sub]');
  if (sub) { state.matchSub = sub.dataset.sub; render(); return; }
  const z = e.target.closest('[data-zoom]');
  if (z) { state.zoom = Math.round((Math.min(1.4, Math.max(0.6, state.zoom + (z.dataset.zoom === 'in' ? 0.2 : -0.2)))) * 10) / 10; render(); return; }
  const op = e.target.closest('[data-open]');
  if (op) { const [round, id] = op.dataset.open.split(':'); state.openMatch = { round, id: +id }; state.selected = null; renderOverlay(); return; }
  const close = e.target.closest('[data-close]');
  if (close) { state.selected = null; state.openMatch = null; renderOverlay(); return; }
  const pl = e.target.closest('[data-player]');
  if (pl) { state.selected = pl.dataset.player; state.openMatch = null; renderOverlay(); return; }
});

document.addEventListener('change', (e) => {
  if (state.tab !== 'build') return;
  const nameEl = e.target.closest('[data-name]');
  if (nameEl) { state.builderName = nameEl.value === '' ? null : +nameEl.value; state.submitState = 'idle'; render(); return; }
  const q4El = e.target.closest('[data-q4]');
  if (q4El) { state.q4 = q4El.value; state.submitState = 'idle'; render(); return; }
  const q5El = e.target.closest('[data-q5]');
  if (q5El) { state.q5 = q5El.value; state.submitState = 'idle'; render(); return; }
});

boot();
