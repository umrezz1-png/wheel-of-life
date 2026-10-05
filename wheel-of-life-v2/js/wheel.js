/*
 * Wheel of Life v2 — 8-axis wheel as inline SVG (no libraries).
 *
 * The SVG is a visual aid: it is hidden from assistive tech and its small
 * touch areas are NOT the reliable way to pick a dimension. The app provides
 * real HTML buttons (>= 44x44 CSS px) for that and calls mark() to sync the
 * drawing. Tapping the drawing still works as a convenience.
 *
 * LW2.wheel.render(container, results, { dimensions, onSelect }) -> { mark(key), clear() }
 */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var SIZE = 480, C = SIZE / 2, R = 138, LABEL_R = 158;
  var RINGS = [20, 40, 60, 80, 100];

  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }

  // Counter-clockwise from the top: matches the right-to-left reading flow.
  function angle(i, n) { return -Math.PI / 2 - (i * 2 * Math.PI) / n; }
  function pt(i, n, radius) {
    var a = angle(i, n);
    return { x: C + radius * Math.cos(a), y: C + radius * Math.sin(a), cos: Math.cos(a), sin: Math.sin(a) };
  }
  function f(x) { return Math.round(x * 100) / 100; }

  function render(container, results, opts) {
    opts = opts || {};
    var dimsByKey = opts.dimensions || {};
    var n = results.length;

    container.textContent = '';
    var svg = el('svg', {
      'class': 'lw2-wheel__svg', viewBox: '0 0 ' + SIZE + ' ' + SIZE,
      role: 'img', 'aria-label': 'عجلة الحياة بثمانية محاور. الدرجات مكتوبة في الأزرار والبطاقات أسفلها.',
      focusable: 'false'
    }, container);

    RINGS.forEach(function (r) {
      var pts = [];
      for (var i = 0; i < n; i++) { var p = pt(i, n, (R * r) / 100); pts.push(f(p.x) + ',' + f(p.y)); }
      el('polygon', { 'class': 'lw2-wheel__ring', points: pts.join(' ') }, svg);
    });
    for (var i = 0; i < n; i++) {
      var e = pt(i, n, R);
      el('line', { 'class': 'lw2-wheel__spoke', x1: C, y1: C, x2: f(e.x), y2: f(e.y) }, svg);
    }

    var shapeG = el('g', { 'class': 'lw2-wheel__shape' }, svg);
    var shapePts = results.map(function (r, idx) {
      var p = pt(idx, n, (R * r.score) / 100);
      return f(p.x) + ',' + f(p.y);
    });
    el('polygon', { 'class': 'lw2-wheel__area', points: shapePts.join(' ') }, shapeG);

    var nodes = {};

    results.forEach(function (r, idx) {
      var dim = dimsByKey[r.key] || { label: r.key, short: r.key };
      var p = pt(idx, n, (R * r.score) / 100);
      var l = pt(idx, n, LABEL_R);
      var g = el('g', { 'class': 'lw2-wheel__node', 'data-key': r.key }, svg);
      el('circle', { 'class': 'lw2-wheel__hit', cx: f(p.x), cy: f(p.y), r: 24 }, g);
      el('circle', { 'class': 'lw2-wheel__dot', cx: f(p.x), cy: f(p.y), r: 7 }, g);

      var anchor = Math.abs(l.cos) < 0.25 ? 'middle' : (l.cos > 0 ? 'start' : 'end');
      var ly = l.y + (l.sin > 0.25 ? 18 : (l.sin < -0.25 ? -28 : -6));
      // Wide invisible touch area, drawn BEHIND the text so the text stays the visible target.
      var w = 96, h = 66;
      var rx = anchor === 'middle' ? l.x - w / 2 : (anchor === 'start' ? l.x - 4 : l.x - w + 4);
      el('rect', { 'class': 'lw2-wheel__hit', x: f(rx), y: f(ly - 26), width: w, height: h, rx: 10 }, g);
      var t = el('text', { 'class': 'lw2-wheel__label', x: f(l.x), y: f(ly), 'text-anchor': anchor }, g);
      t.textContent = dim.short;
      var s = el('text', { 'class': 'lw2-wheel__value', x: f(l.x), y: f(ly + 28), 'text-anchor': anchor }, g);
      s.textContent = (opts.format || String)(r.rounded);

      g.addEventListener('click', function () { if (opts.onSelect) opts.onSelect(r.key); });
      nodes[r.key] = g;
    });

    return {
      mark: function (key) {
        Object.keys(nodes).forEach(function (k) { nodes[k].classList.toggle('is-selected', k === key); });
      },
      clear: function () {
        Object.keys(nodes).forEach(function (k) { nodes[k].classList.remove('is-selected'); });
      }
    };
  }

  window.LW2 = window.LW2 || {};
  window.LW2.wheel = { render: render };
})();
