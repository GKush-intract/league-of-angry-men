import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../scripts/validate-data.mjs';

const good = {
  groups: Object.fromEntries('ABCDEFGHIJKL'.split('').map(L => [L,
    [[L + '1', 'a', '🏳️'], [L + '2', 'b', '🏳️'], [L + '3', 'c', '🏳️'], [L + '4', 'd', '🏳️']]])),
  results: {},
  players: Array.from({ length: 20 }, (_, i) => ({ name: 'P' + i, picks: { A: ['A1', 'A2'] }, q1: 'A1', q2: 'x', q3: 'y', b: 0 })),
};

test('validate: structural ok, warns on pick totals', () => {
  const { errors, warnings } = validate(good);
  assert.equal(errors.length, 0);
  assert.ok(warnings.some(w => w.includes('P0')));   // 2 picks != 32 -> warning
});

test('validate: pick code outside its group is an error', () => {
  const bad = JSON.parse(JSON.stringify(good));
  bad.players[0].picks.A = ['Z9'];
  const { errors } = validate(bad);
  assert.ok(errors.some(e => e.includes('Z9')));
});

test('validate: real data.json reconciles cleanly (no errors, all totals 32)', async () => {
  const { readFileSync } = await import('node:fs');
  const data = JSON.parse(readFileSync(new URL('../data.json', import.meta.url), 'utf8'));
  const { errors, warnings } = validate(data);
  assert.equal(errors.length, 0, errors.join('; '));
  assert.equal(warnings.length, 0, warnings.join('; '));
});
