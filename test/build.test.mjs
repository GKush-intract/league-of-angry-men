import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyR32, applyR16, pickCounts, buildPayload, bracketModel, p3Model, applyQF, applySF, applyT, applyF, thirdCandidates, p3PickCounts, buildPayloadP3, isLockedP3 } from '../build.js';
import { parsePicksCsv, parsePicks3Csv } from '../scripts/fetch-picks.mjs';

test('applyR16 then invalidating R32 clears the R16 pick', () => {
  let picks = { r32: {}, r16: {} };
  picks = applyR32(picks, 0, 'AAA');   // region 0 match 0
  picks = applyR32(picks, 1, 'BBB');   // region 0 match 1
  picks = applyR16(picks, 0, 'AAA');   // advance AAA
  assert.equal(picks.r16[0], 'AAA');
  picks = applyR32(picks, 0, 'CCC');   // AAA no longer a finalist -> clear r16[0]
  assert.equal(picks.r16[0], undefined);
});

test('applyR16 survives a still-valid R32 change', () => {
  let picks = { r32: { 0: 'AAA', 1: 'BBB' }, r16: { 0: 'BBB' } };
  picks = applyR32(picks, 0, 'CCC');   // BBB still a finalist -> keep
  assert.equal(picks.r16[0], 'BBB');
});

test('pickCounts totals r32 + r16', () => {
  const M = { r32: [{id:0},{id:1}], regions: [{id:0}] };
  assert.deepEqual(pickCounts({ r32:{0:'A'}, r16:{} }, M), { r32done:1, r16done:0, total:1 });
});

test('buildPayload produces 16 r32 + 8 r16 entries with matchup strings', () => {
  const M = { r32: Array.from({length:16}, (_,i)=>({id:i, a:{code:`A${i}`.slice(0,3)}, b:{code:`B${i}`.slice(0,3)}})),
              regions: Array.from({length:8}, (_,j)=>({id:j, m:[2*j,2*j+1]})) };
  const ctx = { DATA: { players: [{ name:'Sam', nick:'The Cat' }] },
                state: { builderName:0, picks:{ r32:{0:'A0'}, r16:{0:'A0'} }, q4:'A0', q5:'B0' } };
  const p = JSON.parse(buildPayload(ctx, M));
  assert.equal(p.player, 'Sam'); assert.equal(p.phase, 2);
  assert.equal(p.r32.length, 16); assert.equal(p.r16.length, 8);
  assert.equal(p.r32[0].tie, 1); assert.match(p.r32[0].matchup, / v /);
  assert.equal(p.r32[0].pick, 'A0'); assert.equal(p.r16[0].region, 1);
  assert.equal(p.q4, 'A0'); assert.equal(p.q5, 'B0');
});

test('parsePicksCsv keeps latest per player and maps to bracket', () => {
  const header = ['submittedAt','player','nick',
    ...Array.from({length:16},(_,i)=>`r32_${i+1}`),
    ...Array.from({length:8},(_,i)=>`r16_${i+1}`),'q4','q5'].join(',');
  const row = (ts, p, r32_1, r16_1) => [ts,p,'',
    r32_1, ...Array(15).fill(''), r16_1, ...Array(7).fill(''), 'BRA','KOR'].join(',');
  const csv = [header, row('2026-06-27T10:00:00Z','Sam','AAA','AAA'),
                       row('2026-06-27T12:00:00Z','Sam','BBB','BBB')].join('\n');
  const out = parsePicksCsv(csv, new Set(['AAA','BBB','BRA','KOR']));
  assert.equal(out.Sam.bracket.r32['0'], 'BBB'); // latest wins (tie 1 -> matchId 0)
  assert.equal(out.Sam.bracket.r16['0'], 'BBB');
  assert.equal(out.Sam.q4, 'BRA');
});

test('parsePicksCsv drops codes not in validCodes (no phantom entries)', () => {
  const header = ['submittedAt','player','nick',
    ...Array.from({length:16},(_,i)=>`r32_${i+1}`),
    ...Array.from({length:8},(_,i)=>`r16_${i+1}`),'q4','q5'].join(',');
  // r32_1 = ZZZ (invalid), q4 = ZZZ (invalid), q5 = KOR (valid)
  const row = ['2026-06-27T10:00:00Z','Sam','',
    'ZZZ', ...Array(15).fill(''), ...Array(8).fill(''), 'ZZZ','KOR'].join(',');
  const out = parsePicksCsv([header,row].join('\n'), new Set(['AAA','BBB','BRA','KOR']));
  assert.equal(out.Sam.bracket.r32['0'], undefined); // invalid code dropped
  assert.equal(out.Sam.q4, undefined);               // invalid q4 dropped
  assert.equal(out.Sam.q5, 'KOR');                   // valid q5 kept
});

test('parsePicksCsv keeps column alignment with a quoted comma field', () => {
  const header = ['submittedAt','player','nick',
    ...Array.from({length:16},(_,i)=>`r32_${i+1}`),
    ...Array.from({length:8},(_,i)=>`r16_${i+1}`),'q4','q5'].join(',');
  // nick is quoted and contains a comma — must not shift the bracket columns
  const row = ['2026-06-27T10:00:00Z','Sam','"hi, there"',
    'AAA', ...Array(15).fill(''), 'AAA', ...Array(7).fill(''), 'BRA','KOR'].join(',');
  const out = parsePicksCsv([header,row].join('\n'), new Set(['AAA','BBB','BRA','KOR']));
  assert.equal(out.Sam.bracket.r32['0'], 'AAA'); // still aligned despite the comma
  assert.equal(out.Sam.bracket.r16['0'], 'AAA');
  assert.equal(out.Sam.q4, 'BRA');
});

test('parsePicksCsv: blank submittedAt does not overwrite a valid newer row', () => {
  const header = ['submittedAt','player','nick',
    ...Array.from({length:16},(_,i)=>`r32_${i+1}`),
    ...Array.from({length:8},(_,i)=>`r16_${i+1}`),'q4','q5'].join(',');
  const row = (ts, r32_1) => [ts,'Sam','',
    r32_1, ...Array(15).fill(''), ...Array(8).fill(''), 'BRA','KOR'].join(',');
  // valid 12:00 row first, then a blank-timestamp row for the same player
  const csv = [header, row('2026-06-27T12:00:00Z','BBB'), row('','AAA')].join('\n');
  const out = parsePicksCsv(csv, new Set(['AAA','BBB','BRA','KOR']));
  assert.equal(out.Sam.bracket.r32['0'], 'BBB'); // valid newer row wins
});

test('bracketModel uses explicit bracketR32 (real draw) in bracket order', () => {
  const ex = Array.from({ length: 16 }, (_, i) => [`H${i}`.padEnd(3, 'X').slice(0, 3), `A${i}`.padEnd(3, 'X').slice(0, 3)]);
  const TEAM = { [ex[0][0]]: { name: 'Home Zero', flag: '🏠' } };
  const M = bracketModel(null, null, ex, TEAM);
  assert.equal(M.r32.length, 16);
  assert.equal(M.regions.length, 8);
  assert.equal(M.seed.length, 32);
  assert.deepEqual(M.regions[0].m, [0, 1]);          // R16 still fed by consecutive ties
  assert.equal(M.r32[0].a.code, ex[0][0]);
  assert.equal(M.r32[0].b.code, ex[0][1]);
  assert.equal(M.r32[0].a.name, 'Home Zero');         // mapped from TEAM when present
  assert.equal(M.r32[1].a.name, ex[1][0]);            // falls back to code when not in TEAM
  assert.equal(M.r32[15].a.code, ex[15][0]);
});

// ---------- Phase 3 builder logic ----------
const P3_TEAMS = ['FRA','MAR','ESP','BEL','NOR','ENG','ARG','COL'];
const P3_DATA = {
  meta: { phase: 3, qfGuess: {} },
  players: [{ name: 'Artet', nick: 'gunner' }],
  koResults: { r16: ['PAR','FRA','CAN','MAR','POR','ESP','USA','BEL','BRA','NOR','MEX','ENG','ARG','EGY','SUI','COL'] },
  koMatches: [
    { h:'PAR',a:'FRA',done:true,w:'FRA' }, { h:'CAN',a:'MAR',done:true,w:'MAR' },
    { h:'POR',a:'ESP',done:true,w:'ESP' }, { h:'USA',a:'BEL',done:true,w:'BEL' },
    { h:'BRA',a:'NOR',done:true,w:'NOR' }, { h:'MEX',a:'ENG',done:true,w:'ENG' },
    { h:'ARG',a:'EGY',done:true,w:'ARG' }, { h:'SUI',a:'COL',done:true,w:'COL' },
  ],
};

test('p3Model pairs QF teams into 4 ties in bracket order', () => {
  const M = p3Model(P3_DATA, {});
  assert.deepEqual(M.qf.map(m => [m.a.code, m.b.code]),
    [['FRA','MAR'],['ESP','BEL'],['NOR','ENG'],['ARG','COL']]);
  assert.deepEqual(M.guessed, []);
});

test('applyQF clears an invalidated SF pick and champion', () => {
  let p3 = { qf: { 0:'FRA', 1:'ESP' }, sf: { 0:'FRA' }, f: 'FRA' };
  p3 = applyQF(p3, 0, 'MAR');            // FRA no longer reaches the SF
  assert.equal(p3.sf[0], undefined);
  assert.equal(p3.f, '');
  assert.equal(p3.qf[0], 'MAR');
});

test('applyQF keeps a still-valid SF pick and champion', () => {
  let p3 = { qf: { 0:'FRA', 1:'ESP' }, sf: { 0:'ESP' }, f: 'ESP' };
  p3 = applyQF(p3, 0, 'MAR');            // SF pick was ESP — untouched
  assert.equal(p3.sf[0], 'ESP');
  assert.equal(p3.f, 'ESP');
});

test('applySF clears an invalidated champion', () => {
  let p3 = { qf: {}, sf: { 0:'FRA', 1:'NOR' }, f: 'NOR' };
  p3 = applySF(p3, 1, 'ENG');
  assert.equal(p3.f, '');
  p3 = applySF(p3, 0, 'MAR');            // champion already cleared, stays ''
  assert.equal(p3.f, '');
});

test('p3PickCounts totals qf + sf + third + final (8 max)', () => {
  const { total, qfdone, sfdone, tdone, fdone } = p3PickCounts({ qf: { 0:'FRA', 2:'NOR' }, sf: { 1:'ENG' }, t: 'MAR', f: 'ENG' });
  assert.equal(qfdone, 2); assert.equal(sfdone, 1); assert.equal(tdone, 1); assert.equal(fdone, 1); assert.equal(total, 5);
});

test('thirdCandidates derives the two implied SF losers', () => {
  const p3 = { qf: { 0:'FRA', 1:'BEL', 2:'ENG', 3:'ARG' }, sf: { 0:'FRA', 1:'ARG' }, t: '', f: '' };
  assert.deepEqual(thirdCandidates(p3), ['BEL', 'ENG']);
});

test('thirdCandidates is null until all QF + SF picks exist and are consistent', () => {
  assert.equal(thirdCandidates({ qf: { 0:'FRA', 1:'BEL' }, sf: { 0:'FRA' }, t:'', f:'' }), null);
  // stale SF pick not among its QF feeders -> not derivable
  assert.equal(thirdCandidates({ qf: { 0:'FRA', 1:'BEL', 2:'ENG', 3:'ARG' }, sf: { 0:'MAR', 1:'ARG' }, t:'', f:'' }), null);
});

test('applyQF and applySF clear an invalidated 3rd-place pick', () => {
  let p3 = { qf: { 0:'FRA', 1:'BEL', 2:'ENG', 3:'ARG' }, sf: { 0:'FRA', 1:'ARG' }, t: 'BEL', f: 'FRA' };
  p3 = applySF(p3, 0, 'BEL');            // BEL now reaches the final -> can't be 3rd
  assert.equal(p3.t, '');
  p3 = applyT(p3, 'FRA');                // new implied losers: FRA, ENG
  assert.equal(p3.t, 'FRA');
  p3 = applyQF(p3, 0, 'MAR');            // SF1 pick BEL survives, but FRA is out of the bracket
  assert.equal(p3.sf[0], 'BEL');
  assert.equal(p3.t, '');
});

test('buildPayloadP3 produces 4 qf + 2 sf + third + final', () => {
  const M = p3Model(P3_DATA, {});
  const state = { builderName: 0, p3: { qf: { 0:'FRA',1:'BEL',2:'ENG',3:'ARG' }, sf: { 0:'FRA',1:'ARG' }, t: 'BEL', f: 'ARG' } };
  const out = JSON.parse(buildPayloadP3({ DATA: P3_DATA, state }, M));
  assert.equal(out.phase, 3);
  assert.equal(out.player, 'Artet');
  assert.equal(out.qf.length, 4);
  assert.deepEqual(out.qf[0], { tie: 1, matchup: 'FRA v MAR', pick: 'FRA' });
  assert.deepEqual(out.sf.map(s => s.pick), ['FRA','ARG']);
  assert.equal(out.third.pick, 'BEL');
  assert.equal(out.final.pick, 'ARG');
  assert.equal(out.q6, undefined);       // rule change: no Q6 in Phase 3 payloads
});

test('buildPayloadP3 leaves unanswered picks null', () => {
  const M = p3Model(P3_DATA, {});
  const state = { builderName: 0, p3: { qf: {}, sf: {}, t: '', f: '' } };
  const out = JSON.parse(buildPayloadP3({ DATA: P3_DATA, state }, M));
  assert.equal(out.qf[0].pick, null);
  assert.equal(out.third.pick, null);
  assert.equal(out.final.pick, null);
});

test('isLockedP3 respects meta.phase3Deadline', () => {
  assert.equal(isLockedP3({ meta: { phase3Deadline: '2000-01-01T00:00:00Z' } }), true);
  assert.equal(isLockedP3({ meta: { phase3Deadline: '2099-01-01T00:00:00Z' } }), false);
  assert.equal(isLockedP3({ meta: {} }), false);
});

// ---------- Phase 3 CSV sync ----------
test('parsePicks3Csv maps qf/sf/tp/f columns to bracket3, latest per player', () => {
  const csv = [
    'submittedAt,player,nick,qf_1,qf_2,qf_3,qf_4,sf_1,sf_2,tp,f',
    '2026-07-09T06:00:00Z,Artet,,FRA,ESP,NOR,ARG,FRA,ARG,ESP,ARG',
    '2026-07-09T08:00:00Z,Artet,,FRA,BEL,NOR,ARG,FRA,NOR,BEL,FRA',
    '2026-07-09T07:00:00Z,Ghost,,FRA,ESP,ENG,ARG,FRA,ENG,ESP,FRA',
  ].join('\n');
  const valid = new Set(['FRA', 'BEL', 'NOR', 'ARG', 'ESP', 'ENG']);
  const out = parsePicks3Csv(csv, valid);
  assert.deepEqual(out.Artet.bracket3, { qf: { 0: 'FRA', 1: 'BEL', 2: 'NOR', 3: 'ARG' }, sf: { 0: 'FRA', 1: 'NOR' }, t: 'BEL', f: 'FRA' });
  assert.equal(out.Ghost.bracket3.f, 'FRA');
});

test('parsePicks3Csv drops invalid codes without inventing keys', () => {
  const csv = 'submittedAt,player,nick,qf_1,qf_2,qf_3,qf_4,sf_1,sf_2,tp,f\n2026-07-09T06:00:00Z,Artet,,XXX,ESP,,,FRA,,,YYY';
  const out = parsePicks3Csv(csv, new Set(['FRA', 'ESP']));
  assert.deepEqual(out.Artet.bracket3, { qf: { 1: 'ESP' }, sf: { 0: 'FRA' } });
});
