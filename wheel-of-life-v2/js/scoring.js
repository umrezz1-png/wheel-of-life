/*
 * Wheel of Life v2 — scoring. Pure functions, no DOM, no I/O.
 *
 * Per dimension: raw = sum of its 3 answers (3..15),
 *                score = ((raw - 3) / 12) * 100  (0..100).
 * There is deliberately NO overall / aggregate score.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LW2 = root.LW2 || {};
    root.LW2.scoring = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPS = 1e-9;

  function normalize(raw, perDim) {
    var n = perDim || 3;
    var min = n * 1;
    var span = n * 5 - min; // 12 for 3 questions
    return ((raw - min) / span) * 100;
  }

  function bandFor(score, bands) {
    for (var i = 0; i < bands.length; i++) {
      if (score >= bands[i].min - EPS) return bands[i];
    }
    return bands[bands.length - 1];
  }

  /**
   * @param data    assessment data (js/data.js)
   * @param answers object { [questionId]: 1..5 } — every question required
   * @returns array in the original dimension order:
   *   [{ key, index, raw, score, rounded, band }]
   */
  function computeScores(data, answers) {
    var perDim = data.questionsPerDimension;
    var raw = {};
    data.dimensions.forEach(function (d) { raw[d.key] = { sum: 0, n: 0 }; });

    data.questions.forEach(function (q) {
      var v = answers[q.id];
      if (!(v === 1 || v === 2 || v === 3 || v === 4 || v === 5)) {
        throw new Error('Missing or invalid answer for question ' + q.id);
      }
      raw[q.dimension].sum += v;
      raw[q.dimension].n += 1;
    });

    return data.dimensions.map(function (d, index) {
      if (raw[d.key].n !== perDim) {
        throw new Error('Dimension ' + d.key + ' has ' + raw[d.key].n + ' questions');
      }
      var score = normalize(raw[d.key].sum, perDim);
      return {
        key: d.key,
        index: index,
        raw: raw[d.key].sum,
        score: score,
        rounded: Math.round(score),
        band: bandFor(score, data.bands)
      };
    });
  }

  /**
   * Strongest 3 and 3 needing most attention.
   * Ties are broken by the original dimension order (deterministic).
   * The two lists never overlap: attention is drawn from the rest.
   */
  function rank(scores) {
    var byStrength = scores.slice().sort(function (a, b) {
      return (b.score - a.score) || (a.index - b.index);
    });
    var strongest = byStrength.slice(0, 3);
    var picked = {};
    strongest.forEach(function (s) { picked[s.key] = true; });

    var attention = scores.slice().sort(function (a, b) {
      return (a.score - b.score) || (a.index - b.index);
    }).filter(function (s) { return !picked[s.key]; }).slice(0, 3);

    var all = scores.map(function (s) { return s.score; });
    var spread = Math.max.apply(null, all) - Math.min.apply(null, all);
    return { strongest: strongest, attention: attention, spread: spread };
  }

  return { normalize: normalize, bandFor: bandFor, computeScores: computeScores, rank: rank };
});
