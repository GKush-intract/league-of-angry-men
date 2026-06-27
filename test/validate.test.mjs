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

function baseData() {
  return JSON.parse(JSON.stringify(good));
}

test('accepts optional phase-2 player fields', () => {
  const data = baseData();
  data.players[0].bracket = { r32: { '0': 'BRA' }, r16: { '0': 'BRA' } };
  data.players[0].q4 = 'BRA'; data.players[0].q5 = 'KOR'; data.players[0].p2 = 6;
  assert.deepEqual(validate(data).errors, []);
});

test('rejects malformed bracket', () => {
  const data = baseData();
  data.players[0].bracket = { r32: { '0': 123 } }; // non-string code
  assert.ok(validate(data).errors.some(e => e.includes('bracket.r32')));
});

test('rejects NaN p2', () => {
  const data = baseData();
  data.players[0].p2 = NaN;
  assert.ok(validate(data).errors.some(e => e.includes('p2')));
});

test('accepts a valid bracketR32 override (16 pairs of real codes)', () => {
  const data = baseData();
  const codes = 'ABCDEFGHIJKL'.split('').flatMap(L => ['1', '2', '3', '4'].map(n => L + n)); // 48 group codes
  data.bracketR32 = Array.from({ length: 16 }, (_, i) => [codes[i], codes[i + 16]]);
  assert.deepEqual(validate(data).errors, []);
});

test('rejects malformed bracketR32 (wrong length or unknown code)', () => {
  const short = baseData(); short.bracketR32 = [['A1', 'A2']];
  assert.ok(validate(short).errors.some(e => e.includes('16')));
  const bad = baseData();
  bad.bracketR32 = Array.from({ length: 16 }, () => ['ZZ9', 'A1']); // ZZ9 not in any group
  assert.ok(validate(bad).errors.some(e => e.includes('bracketR32')));
});
