import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyR32, applyR16, pickCounts, buildPayload } from '../build.js';
import { parsePicksCsv } from '../scripts/fetch-picks.mjs';

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
