// build.js — interactive bracket builders (the only input screens).
// Phase 2 (R32+R16) is kept intact below; Phase 3 (QF→Final) follows it.
import { seedTeams, seedIndex, r32Pairings, regions, qfTeams } from './compute.js';
import { SHEET_ENDPOINT, SHEET_ENDPOINT_P3 } from './config.js';

// Build the knockout model. If data.json supplies an explicit `bracketR32` (16
// [aCode, bCode] pairs in bracket order — the REAL FIFA draw), use it verbatim;
// otherwise fall back to the derived 1-v-32 re-seed from the group tables.
export function bracketModel(TABLES, PROJ, explicitR32, TEAM) {
  if (Array.isArray(explicitR32) && explicitR32.length === 16) {
    const mk = c => ({ code: c, name: (TEAM && TEAM[c] && TEAM[c].name) || c, flag: (TEAM && TEAM[c] && TEAM[c].flag) || '' });
    const r32 = explicitR32.map((pair, i) => ({ id: i, a: mk(pair[0]), b: mk(pair[1]) }));
    const seed = r32.flatMap(m => [m.a, m.b]);
    return { seed, idx: seedIndex(seed), r32, regions: regions() };
  }
  const seed = seedTeams(TABLES, PROJ);
  return { seed, idx: seedIndex(seed), r32: r32Pairings(seed), regions: regions() };
}
export function isLocked(DATA) {
  const d = DATA.meta?.phase2Deadline;
  return !!d && Date.now() >= Date.parse(d);
}
export function pickCounts(picks, M) {
  const r32done = M.r32.filter(m => picks.r32[m.id]).length;
  const r16done = M.regions.filter(r => picks.r16[r.id]).length;
  return { r32done, r16done, total: r32done + r16done };
}
// Returns the new picks object after choosing an R32 winner (clears invalidated R16).
export function applyR32(picks, mid, code) {
  const np = { r32: { ...picks.r32, [mid]: code }, r16: { ...picks.r16 } };
  const reg = Math.floor(mid / 2), f0 = np.r32[2 * reg], f1 = np.r32[2 * reg + 1];
  if (np.r16[reg] && np.r16[reg] !== f0 && np.r16[reg] !== f1) delete np.r16[reg];
  return np;
}
export function applyR16(picks, rid, code) {
  return { r32: { ...picks.r32 }, r16: { ...picks.r16, [rid]: code } };
}

export function buildPayload(ctx, M) {
  const { DATA, state } = ctx;
  const p = DATA.players[state.builderName] || { name: '?', nick: '' };
  const r32 = M.r32.map(m => ({ tie: m.id + 1, matchup: m.a.code + ' v ' + m.b.code, pick: state.picks.r32[m.id] || null }));
  const r16 = M.regions.map(reg => ({ region: reg.id + 1, pick: state.picks.r16[reg.id] || null }));
  return JSON.stringify({ player: p.name, nick: p.nick || '', phase: 2, submittedAt: new Date().toISOString(), r32, r16, q4: state.q4, q5: state.q5 }, null, 2);
}

export function submitBracket(ctx, M) {
  const payload = buildPayload(ctx, M);
  if (SHEET_ENDPOINT) {
    fetch(SHEET_ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: payload }).catch(() => {});
  }
  ctx.state.submitState = 'done'; ctx.state.lastPayload = payload; ctx.state.copied = false;
  ctx.rerender();
}

// ---------- rendering ----------
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// One team button (R32 or R16). When locked, omit data-* attrs so it's inert.
function teamBtn(code, flag, selCode, locked, attrs) {
  const isSel = selCode === code, dim = selCode && !isSel;
  let bg = 'transparent', extra = '';
  if (isSel) { bg = 'rgba(182,255,58,.16)'; extra = 'box-shadow:inset 3px 0 0 #b6ff3a;color:#fff;'; }
  const data = locked ? '' : attrs;
  const style = `display:flex;align-items:center;gap:7px;width:100%;text-align:left;padding:9px 10px;border:0;border-bottom:1px solid #122a1c;background:${bg};cursor:${locked ? 'default' : 'pointer'};color:#eef5ec;${dim ? 'opacity:.4;' : ''}${extra}`;
  return `<button ${data} style="${style}">
    <span style="font-size:15px;flex:none;">${flag || ''}</span>
    <span style="flex:1;min-width:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(code)}</span>
    <span style="font-family:'JetBrains Mono',monospace;font-weight:800;font-size:13px;color:#b6ff3a;">${isSel ? '✓' : ''}</span>
  </button>`;
}

export function renderBuild(ctx) {
  const { DATA, TABLES, PROJ, TEAM, state } = ctx;
  const M = bracketModel(TABLES, PROJ, DATA.bracketR32, TEAM);
  const locked = isLocked(DATA);
  const picks = state.picks || { r32: {}, r16: {} };
  const { total: pickCount } = pickCounts(picks, M);

  // derived lifecycle state
  let derived;
  if (locked) derived = 'locked';
  else if (pickCount === 0) derived = 'empty';
  else if (pickCount >= 24) derived = 'complete';
  else derived = 'partial';

  const statusMap = {
    empty: { icon: '○', color: '#7fd0a0', title: 'Bracket open', sub: 'Tap a team in each tie to send it through.' },
    partial: { icon: '◐', color: '#ffce3a', title: 'In progress', sub: 'Keep going — finish every R32 and R16 tie.' },
    complete: { icon: '●', color: '#b6ff3a', title: 'Ready to submit', sub: 'All 24 picks in. Lock it in below.' },
    locked: { icon: '🔒', color: '#ff7a6a', title: 'Picks locked — deadline passed', sub: 'R32 has kicked off. Brackets are read-only now.' }
  };
  const sb = statusMap[derived];
  const bannerStyle = `display:flex;align-items:center;gap:11px;padding:12px 14px;border-radius:12px;background:${derived === 'locked' ? 'rgba(255,122,106,.08)' : derived === 'complete' ? 'rgba(182,255,58,.07)' : '#0c1710'};border:1px solid ${derived === 'locked' ? '#5a3030' : derived === 'complete' ? '#2c5a38' : '#1c3a28'};`;

  const banner = `<div style="${bannerStyle}">
    <span style="font-size:15px;">${sb.icon}</span>
    <div style="flex:1;min-width:0;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;letter-spacing:.02em;color:${sb.color};">${sb.title}</div>
      <div style="font-size:11px;color:#9fb3a6;margin-top:1px;">${sb.sub}</div>
    </div>
    <div style="text-align:right;flex:none;">
      <div style="font-family:'JetBrains Mono',monospace;font-weight:800;font-size:16px;color:${sb.color};">${pickCount}/24</div>
      <div style="font-size:9px;color:#5f7567;font-weight:700;letter-spacing:.06em;">PICKS</div>
    </div>
  </div>`;

  // name select
  const selectStyle = `width:100%;padding:11px 12px;background:#0a1813;border:1px solid #1c3a28;border-radius:11px;color:#eef5ec;font-size:14px;font-weight:600;-webkit-appearance:none;appearance:none;cursor:pointer;${locked ? 'opacity:.55;' : ''}`;
  const nameOptions = (DATA.players || []).map((p, i) => {
    const sel = state.builderName != null && Number(state.builderName) === i ? ' selected' : '';
    const label = p.nick ? `${p.name} · ${p.nick}` : p.name;
    return `<option value="${i}"${sel}>${esc(label)}</option>`;
  }).join('');
  const nameSelect = `<div style="margin:14px 2px 6px;font-size:9px;letter-spacing:.12em;color:#5f7567;font-weight:700;">WHO ARE YOU?</div>
    <select ${locked ? 'disabled' : 'data-name'} style="${selectStyle}">
      <option value="">— select your name —</option>
      ${nameOptions}
    </select>`;

  // bracket regions
  const regionsHtml = M.regions.map(reg => {
    const f0 = picks.r32[reg.m[0]], f1 = picks.r32[reg.m[1]], ready = f0 && f1;
    const r16sel = picks.r16[reg.id];
    const done = !!r16sel, partial = !!(picks.r32[reg.m[0]] || picks.r32[reg.m[1]]);
    const statusText = done ? '✓ DONE' : ready ? 'PICK R16' : partial ? 'IN PROGRESS' : 'TAP A TEAM';
    const statusColor = done ? '#b6ff3a' : ready ? '#ffce3a' : '#5f7567';
    const r16border = done ? '#2c5a38' : '#1c3a28';

    const matches = reg.m.map(mid => {
      const m = M.r32[mid], sel = picks.r32[mid];
      const a = m.a || { code: '', flag: '' }, b = m.b || { code: '', flag: '' };
      return `<div style="background:#0a1813;border:1px solid #1c3a28;border-radius:10px;overflow:hidden;">
        ${teamBtn(a.code, a.flag, sel, locked, `data-r32="${mid}" data-code="${esc(a.code)}"`)}
        ${teamBtn(b.code, b.flag, sel, locked, `data-r32="${mid}" data-code="${esc(b.code)}"`)}
      </div>`;
    }).join('');

    let r16inner;
    if (ready) {
      r16inner = [f0, f1].map(code => {
        const flag = (TEAM[code] || {}).flag || '';
        return teamBtn(code, flag, r16sel, locked, `data-r16="${reg.id}" data-code="${esc(code)}"`);
      }).join('');
    } else {
      r16inner = `<div style="padding:11px 9px 13px;font-size:11px;color:#5f7567;line-height:1.4;">Pick both R32 winners first ↑</div>`;
    }

    return `<div style="margin-bottom:14px;background:#0c1710;border:1px solid #1c3a28;border-radius:14px;padding:11px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin:0 2px 9px;">
        <span style="font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:.1em;font-size:11px;color:#7fd0a0;">REGION ${reg.id + 1}</span>
        <span style="font-size:10px;font-weight:700;color:${statusColor};">${statusText}</span>
      </div>
      <div style="display:flex;align-items:stretch;gap:0;">
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:9px;">${matches}</div>
        <div style="width:26px;flex:none;position:relative;">
          <div style="position:absolute;left:0;top:25%;width:13px;height:1px;background:#2c5a38;"></div>
          <div style="position:absolute;left:0;top:75%;width:13px;height:1px;background:#2c5a38;"></div>
          <div style="position:absolute;left:13px;top:25%;height:50%;width:1px;background:#2c5a38;"></div>
          <div style="position:absolute;left:13px;top:50%;width:13px;height:1px;background:#2c5a38;"></div>
        </div>
        <div style="flex:1;min-width:0;display:flex;align-items:center;">
          <div style="width:100%;background:#0a1813;border:1px solid ${r16border};border-radius:10px;overflow:hidden;">
            <div style="font-size:8px;letter-spacing:.1em;color:#5f7567;font-weight:700;padding:6px 9px 0;">R16 → QF</div>
            ${r16inner}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  // locked banner (extra emphasis above the bracket)
  const lockedNote = locked
    ? `<div style="margin:12px 2px;padding:11px 13px;background:rgba(255,122,106,.08);border:1px solid #5a3030;border-radius:11px;font-size:12px;color:#ff9a8c;line-height:1.45;">🔒 Picks are locked — the Phase 2 deadline has passed. The bracket below is read-only.</div>`
    : '';

  const header = `<div style="margin:16px 2px 10px;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:26px;line-height:1;">BUILD YOUR BRACKET</div>
      <div style="font-size:12px;color:#7fd0a0;margin-top:3px;">Phase 2 · pick 16 R32 winners (2 pts) + 8 R16 winners (4 pts). Tap a team to send it through.</div>
    </div>`;

  // ---------- bonus questions (Q4/Q5) ----------
  const teamOptionEls = (q) => M.seed.map(t => {
    const info = TEAM[t.code] || {};
    const label = `${info.flag || ''} ${info.name || t.code}`.trim();
    const sel = q === t.code ? ' selected' : '';
    return `<option value="${esc(t.code)}"${sel}>${esc(label)}</option>`;
  }).join('');
  const bonusCard = (qLabel, copy, attr, qVal) => `<div style="background:#0c1710;border:1px solid #1c3a28;border-radius:12px;padding:13px;${qLabel === 'Q4' ? 'margin-bottom:9px;' : ''}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;"><span style="font-family:'JetBrains Mono',monospace;font-weight:800;color:#ffce3a;font-size:13px;">${qLabel}</span><span style="font-size:12px;color:#cfe0d4;">${copy}</span></div>
      <select ${locked ? 'disabled' : attr} style="${selectStyle}">
        <option value="">— pick a team —</option>
        ${teamOptionEls(qVal)}
      </select>
    </div>`;
  const bonus = `<div style="margin:18px 2px 8px;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:18px;">BONUS QUESTIONS</div>
    ${bonusCard('Q4', 'Most goals scored (R32 + R16) — worth 4', 'data-q4', state.q4)}
    ${bonusCard('Q5', 'Most goals conceded (R32 + R16) — worth 4', 'data-q5', state.q5)}`;

  // ---------- submit gate ----------
  const namePicked = state.builderName != null;
  const allDone = pickCount >= 24 && state.q4 && state.q5 && namePicked;
  const submitDisabled = locked || !allDone;
  const submitStyle = `width:100%;margin-top:18px;padding:15px;border:0;border-radius:13px;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:18px;letter-spacing:.04em;cursor:${submitDisabled ? 'not-allowed' : 'pointer'};background:${submitDisabled ? '#15301f' : 'linear-gradient(90deg,#1a7a43,#7ed957)'};color:${submitDisabled ? '#5f7567' : '#06140a'};`;
  const submitLabel = locked ? '🔒 LOCKED' : 'SUBMIT MY BRACKET';
  const submitHint = locked
    ? 'The deadline has passed — picks can no longer be changed.'
    : !namePicked ? 'Pick your name first.'
      : pickCount < 24 ? (24 - pickCount) + ' bracket picks to go.'
        : (!state.q4 || !state.q5) ? 'Answer Q4 and Q5 to finish.'
          : (SHEET_ENDPOINT ? 'Saves straight to the league Google Sheet.' : 'Preview mode — copy the JSON and send it to the organizer.');
  const submit = (locked || state.submitState === 'done') ? '' : `<button data-submit ${submitDisabled ? 'disabled' : ''} style="${submitStyle}">${submitLabel}</button>
    <div style="font-size:11px;color:#5f7567;text-align:center;margin-top:9px;line-height:1.5;">${submitHint}</div>`;

  // ---------- confirmation panel ----------
  let confirm = '';
  if (state.submitState === 'done') {
    const confirmTitle = SHEET_ENDPOINT ? 'Bracket submitted!' : 'Bracket captured (preview)';
    const confirmSub = SHEET_ENDPOINT ? 'Saved to the league sheet. Talk your trash in the group chat.' : 'No Sheet connected yet — copy this and send it to the organizer, or wire up Apps Script.';
    const copyLabel = state.copied ? 'Copied!' : 'Copy JSON';
    confirm = `<div style="margin-top:14px;padding:15px;background:linear-gradient(150deg,#15351f,#0c1f14);border:1px solid #2c5a38;border-radius:14px;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:18px;color:#b6ff3a;">✓ ${confirmTitle}</div>
      <div style="font-size:12px;color:#cfe0d4;margin-top:5px;line-height:1.5;">${confirmSub}</div>
      <pre style="margin:11px 0 0;padding:11px;background:#06100a;border:1px solid #1c3a28;border-radius:9px;font-family:'JetBrains Mono',monospace;font-size:10px;color:#9fb3a6;white-space:pre-wrap;word-break:break-word;max-height:170px;overflow:auto;">${esc(state.lastPayload || '')}</pre>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button data-copy style="flex:1;padding:10px;background:#15301f;border:1px solid #2c5a38;border-radius:9px;color:#b6ff3a;font-weight:700;font-size:12px;cursor:pointer;">${copyLabel}</button>
        <button data-reset style="flex:1;padding:10px;background:transparent;border:1px solid #1c3a28;border-radius:9px;color:#9fb3a6;font-weight:700;font-size:12px;cursor:pointer;">Edit again</button>
      </div>
    </div>`;
  }

  return `${header}${lockedNote}${banner}${nameSelect}
    <div style="margin:18px 2px 8px;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:18px;">THE BRACKET</div>
    ${regionsHtml}${bonus}${submit}${confirm}`;
}

// Delegated click handler for the Build tab. Returns true if it handled the event.
export function handleBuildEvent(ctx, target) {
  const { DATA, state, rerender } = ctx;
  if (isLocked(DATA)) return;
  const r32el = target.closest('[data-r32]');
  if (r32el) { state.picks = applyR32(state.picks, +r32el.dataset.r32, r32el.dataset.code); state.submitState = 'idle'; return rerender(); }
  const r16el = target.closest('[data-r16]');
  if (r16el) { state.picks = applyR16(state.picks, +r16el.dataset.r16, r16el.dataset.code); state.submitState = 'idle'; return rerender(); }
  const submitEl = target.closest('[data-submit]');
  if (submitEl && !submitEl.disabled) { return submitBracket(ctx, bracketModel(ctx.TABLES, ctx.PROJ, ctx.DATA.bracketR32, ctx.TEAM)); }
  const copyEl = target.closest('[data-copy]');
  if (copyEl) { if (navigator.clipboard) navigator.clipboard.writeText(state.lastPayload).then(() => { state.copied = true; rerender(); }).catch(() => {}); return; }
  const resetEl = target.closest('[data-reset]');
  if (resetEl) { state.submitState = 'idle'; return rerender(); }
}

// ==================== Phase 3 (QF → Final) ====================

// QF model from real knockout results; unresolved slots use meta.qfGuess and are
// flagged in `guessed` (region ids) so the UI can mark them provisional.
export function p3Model(DATA, TEAM) {
  const { teams, guessed } = qfTeams(DATA.koResults, DATA.koMatches, DATA.meta?.qfGuess || {});
  const mk = c => ({ code: c || '', name: (c && TEAM && TEAM[c] && TEAM[c].name) || c || '', flag: (c && TEAM && TEAM[c] && TEAM[c].flag) || '' });
  const qf = [0, 1, 2, 3].map(k => ({ id: k, a: mk(teams[2 * k]), b: mk(teams[2 * k + 1]) }));
  return { qf, guessed };
}
export function isLockedP3(DATA) {
  const d = DATA.meta?.phase3Deadline;
  return !!d && Date.now() >= Date.parse(d);
}
// p3 = { qf: {0..3: code}, sf: {0..1: code}, f: code|'' } — 7 picks total.
export function p3PickCounts(p3) {
  const qfdone = [0, 1, 2, 3].filter(k => p3.qf[k]).length;
  const sfdone = [0, 1].filter(s => p3.sf[s]).length;
  const fdone = p3.f ? 1 : 0;
  return { qfdone, sfdone, fdone, total: qfdone + sfdone + fdone };
}
// Choosing a QF winner clears any downstream pick it invalidates (SF, then champion).
export function applyQF(p3, k, code) {
  const np = { qf: { ...p3.qf, [k]: code }, sf: { ...p3.sf }, f: p3.f };
  const s = Math.floor(k / 2), f0 = np.qf[2 * s], f1 = np.qf[2 * s + 1];
  if (np.sf[s] && np.sf[s] !== f0 && np.sf[s] !== f1) delete np.sf[s];
  if (np.f && np.f !== np.sf[0] && np.f !== np.sf[1]) np.f = '';
  return np;
}
export function applySF(p3, s, code) {
  const np = { qf: { ...p3.qf }, sf: { ...p3.sf, [s]: code }, f: p3.f };
  if (np.f && np.f !== np.sf[0] && np.f !== np.sf[1]) np.f = '';
  return np;
}
export function applyF(p3, code) {
  return { qf: { ...p3.qf }, sf: { ...p3.sf }, f: code };
}

export function buildPayloadP3(ctx, M) {
  const { DATA, state } = ctx;
  const p = DATA.players[state.builderName] || { name: '?', nick: '' };
  const qf = M.qf.map(m => ({ tie: m.id + 1, matchup: m.a.code + ' v ' + m.b.code, pick: state.p3.qf[m.id] || null }));
  const sf = [0, 1].map(s => ({ tie: s + 1, pick: state.p3.sf[s] || null }));
  return JSON.stringify({ player: p.name, nick: p.nick || '', phase: 3, submittedAt: new Date().toISOString(), qf, sf, final: { pick: state.p3.f || null }, q6: state.q6 === '' || state.q6 == null ? null : +state.q6 }, null, 2);
}

export function submitBracketP3(ctx, M) {
  const payload = buildPayloadP3(ctx, M);
  if (SHEET_ENDPOINT_P3) {
    fetch(SHEET_ENDPOINT_P3, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: payload }).catch(() => {});
  }
  ctx.state.submitState = 'done'; ctx.state.lastPayload = payload; ctx.state.copied = false;
  ctx.rerender();
}

export function renderBuildP3(ctx) {
  const { DATA, TEAM, state } = ctx;
  const M = p3Model(DATA, TEAM);
  const locked = isLockedP3(DATA);
  const p3 = state.p3 || { qf: {}, sf: {}, f: '' };
  const { total: pickCount } = p3PickCounts(p3);

  const header = `<div style="margin:16px 2px 10px;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:26px;line-height:1;">BUILD YOUR RUN-IN</div>
      <div style="font-size:12px;color:#7fd0a0;margin-top:3px;">Phase 3 · pick 4 QF winners (6 pts), 2 SF winners (8 pts) and the champion (10 pts).</div>
    </div>`;

  // Hard gate: the QF bracket needs all 8 teams (results or best-guess) to render.
  if (M.qf.some(m => !m.a.code || !m.b.code)) {
    return `${header}<div style="background:#0c1710;border:1px dashed #1c3a28;border-radius:11px;padding:18px;text-align:center;color:#5f7567;font-size:12px;">The Quarterfinal line-up isn't settled yet — check back once the Round of 16 wraps up.</div>`;
  }

  let derived;
  if (locked) derived = 'locked';
  else if (pickCount === 0) derived = 'empty';
  else if (pickCount >= 7) derived = 'complete';
  else derived = 'partial';

  const statusMap = {
    empty: { icon: '○', color: '#7fd0a0', title: 'Bracket open', sub: 'Tap a team in each QF to send it through.' },
    partial: { icon: '◐', color: '#ffce3a', title: 'In progress', sub: 'Keep going — finish the QFs, SFs and the final.' },
    complete: { icon: '●', color: '#b6ff3a', title: 'Ready to submit', sub: 'All 7 picks in. Lock it in below.' },
    locked: { icon: '🔒', color: '#ff7a6a', title: 'Picks locked — deadline passed', sub: 'The Quarterfinals have kicked off. Brackets are read-only now.' }
  };
  const sb = statusMap[derived];
  const bannerStyle = `display:flex;align-items:center;gap:11px;padding:12px 14px;border-radius:12px;background:${derived === 'locked' ? 'rgba(255,122,106,.08)' : derived === 'complete' ? 'rgba(182,255,58,.07)' : '#0c1710'};border:1px solid ${derived === 'locked' ? '#5a3030' : derived === 'complete' ? '#2c5a38' : '#1c3a28'};`;
  const banner = `<div style="${bannerStyle}">
    <span style="font-size:15px;">${sb.icon}</span>
    <div style="flex:1;min-width:0;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;letter-spacing:.02em;color:${sb.color};">${sb.title}</div>
      <div style="font-size:11px;color:#9fb3a6;margin-top:1px;">${sb.sub}</div>
    </div>
    <div style="text-align:right;flex:none;">
      <div style="font-family:'JetBrains Mono',monospace;font-weight:800;font-size:16px;color:${sb.color};">${pickCount}/7</div>
      <div style="font-size:9px;color:#5f7567;font-weight:700;letter-spacing:.06em;">PICKS</div>
    </div>
  </div>`;

  // provisional-slot note (best-guess QF teams until the last R16 results land)
  const guessedCodes = M.guessed.flatMap(j => {
    const m = M.qf[Math.floor(j / 2)];
    return [j % 2 === 0 ? m.a.code : m.b.code];
  }).filter(Boolean);
  const provisionalNote = guessedCodes.length
    ? `<div style="margin:12px 2px;padding:11px 13px;background:rgba(255,206,58,.07);border:1px solid #5a4a1c;border-radius:11px;font-size:12px;color:#e9d9a0;line-height:1.45;">⏳ ${guessedCodes.map(esc).join(' and ')} ${guessedCodes.length > 1 ? 'are' : 'is'} a best guess — the last R16 games aren't done. The bracket corrects itself automatically once they finish; re-submit if your pick is affected.</div>`
    : '';

  const lockedNote = locked
    ? `<div style="margin:12px 2px;padding:11px 13px;background:rgba(255,122,106,.08);border:1px solid #5a3030;border-radius:11px;font-size:12px;color:#ff9a8c;line-height:1.45;">🔒 Picks are locked — the Phase 3 deadline has passed. The bracket below is read-only.</div>`
    : '';

  // name select
  const selectStyle = `width:100%;padding:11px 12px;background:#0a1813;border:1px solid #1c3a28;border-radius:11px;color:#eef5ec;font-size:14px;font-weight:600;-webkit-appearance:none;appearance:none;cursor:pointer;${locked ? 'opacity:.55;' : ''}`;
  const nameOptions = (DATA.players || []).map((p, i) => {
    const sel = state.builderName != null && Number(state.builderName) === i ? ' selected' : '';
    const label = p.nick ? `${p.name} · ${p.nick}` : p.name;
    return `<option value="${i}"${sel}>${esc(label)}</option>`;
  }).join('');
  const nameSelect = `<div style="margin:14px 2px 6px;font-size:9px;letter-spacing:.12em;color:#5f7567;font-weight:700;">WHO ARE YOU?</div>
    <select ${locked ? 'disabled' : 'data-name'} style="${selectStyle}">
      <option value="">— select your name —</option>
      ${nameOptions}
    </select>`;

  const connector = `<div style="width:26px;flex:none;position:relative;">
      <div style="position:absolute;left:0;top:25%;width:13px;height:1px;background:#2c5a38;"></div>
      <div style="position:absolute;left:0;top:75%;width:13px;height:1px;background:#2c5a38;"></div>
      <div style="position:absolute;left:13px;top:25%;height:50%;width:1px;background:#2c5a38;"></div>
      <div style="position:absolute;left:13px;top:50%;width:13px;height:1px;background:#2c5a38;"></div>
    </div>`;

  // two SEMIFINAL cards: QF ties 2s and 2s+1 feed SF s
  const sfCards = [0, 1].map(s => {
    const mids = [2 * s, 2 * s + 1];
    const f0 = p3.qf[mids[0]], f1 = p3.qf[mids[1]], ready = f0 && f1;
    const sfSel = p3.sf[s];
    const done = !!sfSel, partial = !!(f0 || f1);
    const statusText = done ? '✓ DONE' : ready ? 'PICK THE SF' : partial ? 'IN PROGRESS' : 'TAP A TEAM';
    const statusColor = done ? '#b6ff3a' : ready ? '#ffce3a' : '#5f7567';
    const sfBorder = done ? '#2c5a38' : '#1c3a28';

    const matches = mids.map(k => {
      const m = M.qf[k], sel = p3.qf[k];
      return `<div style="background:#0a1813;border:1px solid #1c3a28;border-radius:10px;overflow:hidden;">
        ${teamBtn(m.a.code, m.a.flag, sel, locked, `data-qf="${k}" data-code="${esc(m.a.code)}"`)}
        ${teamBtn(m.b.code, m.b.flag, sel, locked, `data-qf="${k}" data-code="${esc(m.b.code)}"`)}
      </div>`;
    }).join('');

    let sfInner;
    if (ready) {
      sfInner = [f0, f1].map(code => {
        const flag = (TEAM[code] || {}).flag || '';
        return teamBtn(code, flag, sfSel, locked, `data-sf="${s}" data-code="${esc(code)}"`);
      }).join('');
    } else {
      sfInner = `<div style="padding:11px 9px 13px;font-size:11px;color:#5f7567;line-height:1.4;">Pick both QF winners first ↑</div>`;
    }

    return `<div style="margin-bottom:14px;background:#0c1710;border:1px solid #1c3a28;border-radius:14px;padding:11px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin:0 2px 9px;">
        <span style="font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:.1em;font-size:11px;color:#7fd0a0;">SEMIFINAL ${s + 1}</span>
        <span style="font-size:10px;font-weight:700;color:${statusColor};">${statusText}</span>
      </div>
      <div style="display:flex;align-items:stretch;gap:0;">
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:9px;">${matches}</div>
        ${connector}
        <div style="flex:1;min-width:0;display:flex;align-items:center;">
          <div style="width:100%;background:#0a1813;border:1px solid ${sfBorder};border-radius:10px;overflow:hidden;">
            <div style="font-size:8px;letter-spacing:.1em;color:#5f7567;font-weight:700;padding:6px 9px 0;">SF → FINAL</div>
            ${sfInner}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  // THE FINAL card: the two SF picks meet; tap one to crown the champion
  const finReady = p3.sf[0] && p3.sf[1];
  const finDone = !!p3.f;
  const finStatus = finDone ? '✓ DONE' : finReady ? 'PICK THE CHAMPION' : 'PICK BOTH SEMIS FIRST';
  const finColor = finDone ? '#b6ff3a' : finReady ? '#ffce3a' : '#5f7567';
  let finInner;
  if (finReady) {
    finInner = [p3.sf[0], p3.sf[1]].map(code => {
      const flag = (TEAM[code] || {}).flag || '';
      return teamBtn(code, flag, p3.f, locked, `data-f data-code="${esc(code)}"`);
    }).join('');
  } else {
    finInner = `<div style="padding:11px 9px 13px;font-size:11px;color:#5f7567;line-height:1.4;">Pick both semifinal winners first ↑</div>`;
  }
  const finalCard = `<div style="margin-bottom:14px;background:#0c1710;border:1px solid ${finDone ? '#5a4a1c' : '#1c3a28'};border-radius:14px;padding:11px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin:0 2px 9px;">
      <span style="font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:.1em;font-size:11px;color:#ffce3a;">🏆 THE FINAL</span>
      <span style="font-size:10px;font-weight:700;color:${finColor};">${finStatus}</span>
    </div>
    <div style="background:#0a1813;border:1px solid ${finDone ? '#5a4a1c' : '#1c3a28'};border-radius:10px;overflow:hidden;">
      <div style="font-size:8px;letter-spacing:.1em;color:#5f7567;font-weight:700;padding:6px 9px 0;">CHAMPION · 10 PTS</div>
      ${finInner}
    </div>
  </div>`;

  // Q6 — number of games decided after 90 minutes (QF + SF + 3rd place + Final = 8)
  const q6options = Array.from({ length: 9 }, (_, n) =>
    `<option value="${n}"${String(state.q6) === String(n) ? ' selected' : ''}>${n} game${n === 1 ? '' : 's'}</option>`).join('');
  const bonus = `<div style="margin:18px 2px 8px;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:18px;">BONUS QUESTION</div>
    <div style="background:#0c1710;border:1px solid #1c3a28;border-radius:12px;padding:13px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;"><span style="font-family:'JetBrains Mono',monospace;font-weight:800;color:#ffce3a;font-size:13px;">Q6</span><span style="font-size:12px;color:#cfe0d4;">How many of the 8 games (QF + SF + 3rd place + Final) go past 90 minutes? — worth 7</span></div>
      <select ${locked ? 'disabled' : 'data-q6'} style="${selectStyle}">
        <option value="">— pick a number —</option>
        ${q6options}
      </select>
    </div>`;

  // submit gate (q6 can legitimately be 0 — check for '', not falsiness)
  const namePicked = state.builderName != null;
  const q6Answered = state.q6 !== '' && state.q6 != null;
  const allDone = pickCount >= 7 && q6Answered && namePicked;
  const submitDisabled = locked || !allDone;
  const submitStyle = `width:100%;margin-top:18px;padding:15px;border:0;border-radius:13px;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:18px;letter-spacing:.04em;cursor:${submitDisabled ? 'not-allowed' : 'pointer'};background:${submitDisabled ? '#15301f' : 'linear-gradient(90deg,#1a7a43,#7ed957)'};color:${submitDisabled ? '#5f7567' : '#06140a'};`;
  const submitLabel = locked ? '🔒 LOCKED' : 'SUBMIT MY PHASE 3';
  const submitHint = locked
    ? 'The deadline has passed — picks can no longer be changed.'
    : !namePicked ? 'Pick your name first.'
      : pickCount < 7 ? (7 - pickCount) + ' bracket picks to go.'
        : !q6Answered ? 'Answer Q6 to finish.'
          : (SHEET_ENDPOINT_P3 ? 'Saves straight to the league Google Sheet.' : 'Preview mode — copy the JSON and send it to the organizer.');
  const submit = (locked || state.submitState === 'done') ? '' : `<button data-submit ${submitDisabled ? 'disabled' : ''} style="${submitStyle}">${submitLabel}</button>
    <div style="font-size:11px;color:#5f7567;text-align:center;margin-top:9px;line-height:1.5;">${submitHint}</div>`;

  let confirm = '';
  if (state.submitState === 'done') {
    const confirmTitle = SHEET_ENDPOINT_P3 ? 'Phase 3 submitted!' : 'Phase 3 captured (preview)';
    const confirmSub = SHEET_ENDPOINT_P3 ? 'Saved to the league sheet. Talk your trash in the group chat.' : 'No Sheet connected yet — copy this and send it to the organizer, or wire up Apps Script.';
    const copyLabel = state.copied ? 'Copied!' : 'Copy JSON';
    confirm = `<div style="margin-top:14px;padding:15px;background:linear-gradient(150deg,#15351f,#0c1f14);border:1px solid #2c5a38;border-radius:14px;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:18px;color:#b6ff3a;">✓ ${confirmTitle}</div>
      <div style="font-size:12px;color:#cfe0d4;margin-top:5px;line-height:1.5;">${confirmSub}</div>
      <pre style="margin:11px 0 0;padding:11px;background:#06100a;border:1px solid #1c3a28;border-radius:9px;font-family:'JetBrains Mono',monospace;font-size:10px;color:#9fb3a6;white-space:pre-wrap;word-break:break-word;max-height:170px;overflow:auto;">${esc(state.lastPayload || '')}</pre>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button data-copy style="flex:1;padding:10px;background:#15301f;border:1px solid #2c5a38;border-radius:9px;color:#b6ff3a;font-weight:700;font-size:12px;cursor:pointer;">${copyLabel}</button>
        <button data-reset style="flex:1;padding:10px;background:transparent;border:1px solid #1c3a28;border-radius:9px;color:#9fb3a6;font-weight:700;font-size:12px;cursor:pointer;">Edit again</button>
      </div>
    </div>`;
  }

  return `${header}${lockedNote}${banner}${provisionalNote}${nameSelect}
    <div style="margin:18px 2px 8px;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:18px;">THE ROAD TO THE FINAL</div>
    ${sfCards}${finalCard}${bonus}${submit}${confirm}`;
}

// Delegated click handler for the Phase 3 Build tab.
export function handleBuildEventP3(ctx, target) {
  const { DATA, state, rerender } = ctx;
  if (isLockedP3(DATA)) return;
  const qfEl = target.closest('[data-qf]');
  if (qfEl) { state.p3 = applyQF(state.p3, +qfEl.dataset.qf, qfEl.dataset.code); state.submitState = 'idle'; return rerender(); }
  const sfEl = target.closest('[data-sf]');
  if (sfEl) { state.p3 = applySF(state.p3, +sfEl.dataset.sf, sfEl.dataset.code); state.submitState = 'idle'; return rerender(); }
  const fEl = target.closest('[data-f]');
  if (fEl) { state.p3 = applyF(state.p3, fEl.dataset.code); state.submitState = 'idle'; return rerender(); }
  const submitEl = target.closest('[data-submit]');
  if (submitEl && !submitEl.disabled) { return submitBracketP3(ctx, p3Model(ctx.DATA, ctx.TEAM)); }
  const copyEl = target.closest('[data-copy]');
  if (copyEl) { if (navigator.clipboard) navigator.clipboard.writeText(state.lastPayload).then(() => { state.copied = true; rerender(); }).catch(() => {}); return; }
  const resetEl = target.closest('[data-reset]');
  if (resetEl) { state.submitState = 'idle'; return rerender(); }
}
