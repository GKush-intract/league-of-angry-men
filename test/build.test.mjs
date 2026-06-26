import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyR32, applyR16, pickCounts } from '../build.js';

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
