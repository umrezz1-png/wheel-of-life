'use strict';
// Run: node --test wheel-of-life-v2/tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/data.js');
const S = require('../js/scoring.js');

const all = (v) => Object.fromEntries(D.questions.map((q) => [q.id, v]));
// Build answers so each dimension has the given raw sum (3..15).
function byRaw(raws) {
  const a = {};
  D.dimensions.forEach((d, i) => {
    const qs = D.questions.filter((q) => q.dimension === d.key);
    let left = raws[i];
    qs.forEach((q, j) => {
      const remaining = qs.length - j - 1;
      const v = Math.max(1, Math.min(5, left - remaining));
      a[q.id] = v; left -= v;
    });
    assert.equal(left, 0);
  });
  return a;
}

test('structure: 24 questions, 8 dimensions, 3 each, unique ids', () => {
  assert.equal(D.questions.length, 24);
  assert.equal(D.dimensions.length, 8);
  assert.equal(new Set(D.questions.map((q) => q.id)).size, 24);
  D.dimensions.forEach((d) => assert.equal(D.questions.filter((q) => q.dimension === d.key).length, 3, d.key));
  D.questions.forEach((q) => { assert.ok(q.text.trim().length > 5); assert.ok(D.dimensions.some((d) => d.key === q.dimension)); });
  assert.deepEqual(D.dimensions.map((d) => d.label), ['الجانب الروحاني','الجانب المهني','الجانب المالي','الجانب الاجتماعي','الجانب الأسري','الجانب الشخصي','الجانب الصحي','الجانب الترفيهي']);
});

test('scale labels match spec', () => {
  assert.deepEqual(D.scale.map((s) => s.value), [1, 2, 3, 4, 5]);
  assert.deepEqual(D.scale.map((s) => s.label), ['لا ينطبق عليّ إطلاقًا','ينطبق بدرجة قليلة','إلى حد ما','ينطبق بدرجة كبيرة','ينطبق عليّ جدًا']);
});

test('boundaries: all 1 -> 0, all 5 -> 100, all 3 -> 50', () => {
  S.computeScores(D, all(1)).forEach((r) => { assert.equal(r.raw, 3); assert.equal(r.score, 0); assert.equal(r.band.key, 'review'); });
  S.computeScores(D, all(5)).forEach((r) => { assert.equal(r.raw, 15); assert.equal(r.score, 100); assert.equal(r.band.key, 'strong'); });
  S.computeScores(D, all(3)).forEach((r) => { assert.equal(r.raw, 9); assert.equal(r.score, 50); assert.equal(r.band.key, 'attention'); });
});

test('every possible raw (3..15) -> formula and band', () => {
  const expectBand = (raw) => (raw >= 13 ? 'strong' : raw >= 11 ? 'good' : raw >= 8 ? 'attention' : 'review');
  for (let raw = 3; raw <= 15; raw++) {
    const r = S.computeScores(D, byRaw(Array(8).fill(raw)))[0];
    assert.ok(Math.abs(r.score - ((raw - 3) / 12) * 100) < 1e-9);
    assert.equal(r.rounded, Math.round(((raw - 3) / 12) * 100));
    assert.equal(r.band.key, expectBand(raw), 'raw ' + raw);
  }
});

test('band edges on the 0-100 scale', () => {
  const k = (s) => S.bandFor(s, D.bands).key;
  assert.equal(k(100), 'strong'); assert.equal(k(80), 'strong'); assert.equal(k(79.99), 'good');
  assert.equal(k(60), 'good'); assert.equal(k(59.99), 'attention');
  assert.equal(k(40), 'attention'); assert.equal(k(39.99), 'review'); assert.equal(k(0), 'review');
});

test('mixed scores: per-dimension independence and order', () => {
  const raws = [15, 3, 9, 12, 6, 13, 7, 10];
  const res = S.computeScores(D, byRaw(raws));
  assert.deepEqual(res.map((r) => r.raw), raws);
  assert.deepEqual(res.map((r) => r.rounded), [100, 0, 50, 75, 25, 83, 33, 58]);
  assert.deepEqual(res.map((r) => r.key), D.dimensions.map((d) => d.key));
});

test('changing one answer recalculates only its dimension', () => {
  const a = all(3);
  const before = S.computeScores(D, a);
  a[13] = 5; // family, +2
  const after = S.computeScores(D, a);
  after.forEach((r, i) => {
    if (r.key === 'family') { assert.equal(r.raw, 11); assert.equal(r.rounded, 67); }
    else assert.equal(r.score, before[i].score);
  });
});

test('no overall score is produced', () => {
  const res = S.computeScores(D, all(4));
  assert.ok(Array.isArray(res));
  const ranked = S.rank(res);
  assert.deepEqual(Object.keys(ranked).sort(), ['attention', 'attentionTie', 'spread', 'strongest', 'strongestTie']);
  assert.equal(S.overall, undefined);
  assert.ok(!JSON.stringify(res).match(/overall|total|average/i));
});

test('ranking: top 3 / attention 3, disjoint, deterministic ties', () => {
  // distinct scores
  let r = S.rank(S.computeScores(D, byRaw([15, 3, 9, 12, 6, 13, 7, 10])));
  assert.deepEqual(r.strongest.map((x) => x.key), ['spiritual', 'personal', 'social']);
  assert.deepEqual(r.attention.map((x) => x.key), ['career', 'family', 'health']);
  // ties -> original order, in both lists
  r = S.rank(S.computeScores(D, byRaw([12, 12, 12, 12, 6, 6, 6, 6])));
  assert.deepEqual(r.strongest.map((x) => x.key), ['spiritual', 'career', 'financial']);
  assert.deepEqual(r.attention.map((x) => x.key), ['family', 'personal', 'health']);
  // all equal: never overlap, never more than 3, original order
  r = S.rank(S.computeScores(D, all(3)));
  assert.deepEqual(r.strongest.map((x) => x.key), ['spiritual', 'career', 'financial']);
  assert.deepEqual(r.attention.map((x) => x.key), ['social', 'family', 'personal']);
  assert.equal(r.spread, 0);
  // tie straddling the boundary of the top 3
  r = S.rank(S.computeScores(D, byRaw([15, 12, 12, 12, 3, 3, 3, 3])));
  assert.deepEqual(r.strongest.map((x) => x.key), ['spiritual', 'career', 'financial']);
  assert.equal(new Set([...r.strongest, ...r.attention].map((x) => x.key)).size, 6);
});

test('incomplete or invalid answers are rejected', () => {
  const a = all(3); delete a[24];
  assert.throws(() => S.computeScores(D, a));
  assert.throws(() => S.computeScores(D, { ...all(3), 5: 6 }));
  assert.throws(() => S.computeScores(D, { ...all(3), 5: 0 }));
  assert.throws(() => S.computeScores(D, { ...all(3), 5: '3' }));
});

test('tie flags: exact equality and edge-crossing ties', () => {
  // all equal -> spread exactly 0 (UI then shows no lists)
  assert.equal(S.rank(S.computeScores(D, all(3))).spread, 0);
  assert.equal(S.rank(S.computeScores(D, all(1))).spread, 0);
  assert.equal(S.rank(S.computeScores(D, all(5))).spread, 0);
  // near-equal but not identical: spread > 0 and <= 10
  let r = S.rank(S.computeScores(D, byRaw([9, 9, 9, 9, 9, 9, 9, 10])));
  assert.ok(r.spread > 0 && r.spread <= 10);
  assert.equal(r.strongestTie, true);   // 9s tie across the top-3 edge
  assert.equal(r.attentionTie, true);
  // distinct scores -> no edge-crossing tie
  r = S.rank(S.computeScores(D, byRaw([15, 3, 9, 12, 6, 13, 7, 10])));
  assert.equal(r.strongestTie, false); assert.equal(r.attentionTie, false);
  // tie fully inside the list (two equal, both selected, boundary item unique)
  r = S.rank(S.computeScores(D, byRaw([15, 15, 14, 3, 4, 5, 6, 7])));
  assert.equal(r.strongestTie, false);
  assert.deepEqual(r.strongest.map((x) => x.key), ['spiritual', 'career', 'financial']);
  // group of equal scores bigger than the list -> flagged, ordering still by display order
  r = S.rank(S.computeScores(D, byRaw([12, 12, 12, 12, 6, 6, 6, 6])));
  assert.equal(r.strongestTie, true); assert.equal(r.attentionTie, true);
  assert.deepEqual(r.strongest.map((x) => x.key), ['spiritual', 'career', 'financial']);
  assert.deepEqual(r.attention.map((x) => x.key), ['family', 'personal', 'health']);
});

test('ranking logic is unchanged by the tie flags (lists never overlap)', () => {
  for (let t = 0; t < 300; t++) {
    const raws = Array.from({ length: 8 }, () => 3 + Math.floor(Math.random() * 13));
    const r = S.rank(S.computeScores(D, byRaw(raws)));
    assert.equal(r.strongest.length, 3); assert.equal(r.attention.length, 3);
    assert.equal(new Set([...r.strongest, ...r.attention].map((x) => x.key)).size, 6);
  }
});
