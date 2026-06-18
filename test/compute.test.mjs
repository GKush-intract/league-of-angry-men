import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeGroupTable, computeAllTables, resolveTables, projectedQualifiers,
  scorePlayer, buildStandings, bonusGroups, GROUP_LETTERS,
} from '../compute.js';

const teamsA = [["MEX","Mexico","🇲🇽"],["KOR","South Korea","🇰🇷"],["CZE","Czechia","🇨🇿"],["RSA","South Africa","🇿🇦"]];

// ---- group tables ----
test('computeGroupTable: empty results -> all zeros', () => {
  const t = computeGroupTable('A', teamsA, {});
  assert.equal(t.length, 4);
  assert.ok(t.every(r => r.p === 0 && r.pts === 0 && r.gd === 0));
});

test('computeGroupTable: win/draw accounting + sort', () => {
  const t = computeGroupTable('A', teamsA, { A1: [2, 1], A2: [0, 0], A3: [1, 0] });
  const by = Object.fromEntries(t.map(r => [r.code, r]));
  assert.equal(by.MEX.pts, 6); assert.equal(by.MEX.gf, 3); assert.equal(by.MEX.ga, 1); assert.equal(by.MEX.gd, 2);
  assert.equal(by.KOR.pts, 0); assert.equal(by.RSA.pts, 1); assert.equal(by.CZE.pts, 1);
  assert.equal(t[0].code, 'MEX');
});

test('LIVE result counts like FT', () => {
  const t = computeGroupTable('A', teamsA, { A1: [1, 0, 'LIVE', 57] });
  const mex = t.find(r => r.code === 'MEX');
  assert.equal(mex.pts, 3); assert.equal(mex.p, 1);
});

test('computeAllTables covers 12 groups', () => {
  const groups = Object.fromEntries(GROUP_LETTERS.map(L => [L, teamsA]));
  assert.equal(Object.keys(computeAllTables(groups, {})).length, 12);
});

// ---- official tables override ----
test('resolveTables: uses official standings order when provided, else computes', () => {
  const groups = { ...Object.fromEntries(GROUP_LETTERS.map(L => [L, teamsA])) };
  // official table for A puts South Africa top despite a computed result saying Mexico
  const official = { A: [
    { code: 'RSA', p: 1, w: 1, d: 0, l: 0, gf: 5, ga: 0, gd: 5, pts: 3 },
    { code: 'MEX', p: 1, w: 1, d: 0, l: 0, gf: 2, ga: 1, gd: 1, pts: 3 },
    { code: 'KOR', p: 1, w: 0, d: 0, l: 1, gf: 1, ga: 2, gd: -1, pts: 0 },
    { code: 'CZE', p: 1, w: 0, d: 0, l: 1, gf: 0, ga: 5, gd: -5, pts: 0 },
  ] };
  const tables = resolveTables(groups, { A1: [2, 1] }, official);
  assert.equal(tables.A[0].code, 'RSA');            // official order wins
  assert.equal(tables.A[0].name, 'South Africa');   // name/flag filled from groups
  assert.equal(tables.A[0].pts, 3);
  assert.equal(tables.B[0].p, 0);                   // B has no official -> computed (empty)
});

// ---- projected qualifiers ----
test('projectedQualifiers: 32 qualified, 8 best thirds add a 3rd team', () => {
  const mk = (n) => [["T1" + n, "T1 " + n, "🏳️"], ["T2" + n, "T2 " + n, "🏳️"], ["T3" + n, "T3 " + n, "🏳️"], ["T4" + n, "T4 " + n, "🏳️"]];
  const groups = Object.fromEntries(GROUP_LETTERS.map(L => [L, mk(L)]));
  const proj = projectedQualifiers(computeAllTables(groups, {}));
  assert.equal(proj.qualified.size, 32);
  assert.equal(proj.best8.size, 8);
  const sizes = GROUP_LETTERS.map(L => proj.groupQ[L].length);
  assert.equal(sizes.filter(s => s === 3).length, 8);
  assert.equal(sizes.filter(s => s === 2).length, 4);
});

test('projectedQualifiers: started flag reflects played matches', () => {
  const mk = (n) => [["T1" + n, "a", "🏳️"], ["T2" + n, "b", "🏳️"], ["T3" + n, "c", "🏳️"], ["T4" + n, "d", "🏳️"]];
  const groups = Object.fromEntries(GROUP_LETTERS.map(L => [L, mk(L)]));
  const proj = projectedQualifiers(computeAllTables(groups, { A1: [1, 0] }));
  assert.equal(proj.started.A, true);
  assert.equal(proj.started.B, false);
});

test('projectedQualifiers: honors an explicit bestThirds list', () => {
  const mk = (n) => [["T1" + n, "a", "🏳️"], ["T2" + n, "b", "🏳️"], ["T3" + n, "c", "🏳️"], ["T4" + n, "d", "🏳️"]];
  const groups = Object.fromEntries(GROUP_LETTERS.map(L => [L, mk(L)]));
  const tables = computeAllTables(groups, {});
  // explicitly qualify only group A's and B's third-placed teams
  const proj = projectedQualifiers(tables, ['T3A', 'T3B']);
  assert.deepEqual([...proj.best8].sort(), ['A', 'B']);
  assert.equal(proj.groupQ.A.length, 3);  // top2 + qualifying 3rd
  assert.equal(proj.groupQ.C.length, 2);  // C's third not in list
  assert.ok(proj.qualified.has('T3A'));
  assert.ok(!proj.qualified.has('T3C'));
});

// ---- scoring + standings ----
const projStub = {
  qualified: new Set(['MEX', 'KOR', 'BRA', 'MAR', 'SCO']),
  groupQ: { A: ['MEX', 'KOR'], C: ['BRA', 'MAR', 'SCO'] },
  top2: {}, started: {}, best8: new Set(),
};

test('scorePlayer: q counts qualified picks, g rewards exact group match', () => {
  const s = scorePlayer({ picks: { A: ['MEX', 'KOR'], C: ['BRA', 'MAR', 'SCO'] }, b: 0 }, projStub);
  assert.equal(s.q, 5);
  assert.equal(s.g, 4);
  assert.equal(s.total, 9);
});

test('scorePlayer: partial group gives q but no g', () => {
  const s = scorePlayer({ picks: { A: ['MEX', 'BRA'], C: ['BRA', 'MAR'] }, b: 0 }, projStub);
  assert.equal(s.q, 4);   // MEX, BRA(A), BRA(C), MAR
  assert.equal(s.g, 0);
});

test('bonusGroups: returns exactly the groups with a full qualifier match', () => {
  const bg = bonusGroups({ picks: { A: ['MEX', 'KOR'], C: ['BRA', 'MAR', 'SCO'], B: ['MEX'] } }, projStub);
  assert.deepEqual([...bg].sort(), ['A', 'C']);   // B has no groupQ -> no bonus
  // and its size*2 matches scorePlayer's g
  const s = scorePlayer({ picks: { A: ['MEX', 'KOR'], C: ['BRA', 'MAR', 'SCO'] }, b: 0 }, projStub);
  assert.equal(s.g, bg.size * 2 - 0);
});

test('buildStandings: sorts and computes movement', () => {
  const players = [
    { name: 'Low', picks: {}, b: 0 },
    { name: 'High', picks: { A: ['MEX', 'KOR'] }, b: 5 },
  ];
  const st = buildStandings(players, projStub, { High: 2, Low: 1 });
  assert.equal(st[0].name, 'High');
  assert.equal(st[0].rank, 1);
  assert.equal(st[0].mv, 1);
  assert.equal(st[1].mv, -1);
});
