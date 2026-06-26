// build.js — Phase 2 interactive bracket builder (the only input screen).
import { seedTeams, seedIndex, r32Pairings, regions } from './compute.js';
import { SHEET_ENDPOINT } from './config.js';

export function bracketModel(TABLES, PROJ) {
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
  const M = bracketModel(TABLES, PROJ);
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

  // Q4/Q5 + submit + confirm panel are Task 6 — placeholder only.
  const submitStub = `<div data-build-submit-stub style="margin-top:16px;padding:16px;text-align:center;color:#5f7567;border:1px dashed #1c3a28;border-radius:12px;">Bonus questions &amp; submit — Task 6</div>`;

  return `${header}${lockedNote}${banner}${nameSelect}
    <div style="margin:18px 2px 8px;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:18px;">THE BRACKET</div>
    ${regionsHtml}${submitStub}`;
}

// Delegated click handler for the Build tab. Returns true if it handled the event.
export function handleBuildEvent(ctx, target) {
  const { DATA, state, rerender } = ctx;
  if (isLocked(DATA)) return;
  const r32el = target.closest('[data-r32]');
  if (r32el) { state.picks = applyR32(state.picks, +r32el.dataset.r32, r32el.dataset.code); state.submitState = 'idle'; return rerender(); }
  const r16el = target.closest('[data-r16]');
  if (r16el) { state.picks = applyR16(state.picks, +r16el.dataset.r16, r16el.dataset.code); state.submitState = 'idle'; return rerender(); }
}
