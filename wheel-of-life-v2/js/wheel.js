/*
 * Wheel of Life v2 — 8-axis wheel as inline SVG (no libraries).
 * LW2.wheel.render(container, results, { format, onSelect }) -> { select(key) }
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
    var fmt = opts.format || function (x) { return String(x); };
    var dimsByKey = opts.dimensions || {};
    var n = results.length;

    container.textContent = '';
    var svg = el('svg', {
      'class': 'lw2-wheel__svg', viewBox: '0 0 ' + SIZE + ' ' + SIZE,
      role: 'group', 'aria-label': 'عجلة الحياة بثمانية محاور. التفاصيل مكتوبة في القائمة أسفلها.',
      focusable: 'false'
    }, container);

    // Grid rings (octagons) + labels of the scale on one spoke.
    RINGS.forEach(function (r) {
      var pts = [];
      for (var i = 0; i < n; i++) { var p = pt(i, n, (R * r) / 100); pts.push(f(p.x) + ',' + f(p.y)); }
      el('polygon', { 'class': 'lw2-wheel__ring', points: pts.join(' ') }, svg);
    });
    for (var i = 0; i < n; i++) {
      var e = pt(i, n, R);
      el('line', { 'class': 'lw2-wheel__spoke', x1: C, y1: C, x2: f(e.x), y2: f(e.y) }, svg);
    }

    // Filled shape.
    var shapeG = el('g', { 'class': 'lw2-wheel__shape' }, svg);
    var shapePts = results.map(function (r, idx) {
      var p = pt(idx, n, (R * r.score) / 100);
      return f(p.x) + ',' + f(p.y);
    });
    el('polygon', { 'class': 'lw2-wheel__area', points: shapePts.join(' ') }, shapeG);

    // Centre read-out.
    var centre = el('g', { 'class': 'lw2-wheel__centre', 'aria-hidden': 'true' }, svg);
    el('circle', { 'class': 'lw2-wheel__centre-bg', cx: C, cy: C, r: 44 }, centre);
    var cName = el('text', { 'class': 'lw2-wheel__centre-name', x: C, y: C - 6, 'text-anchor': 'middle' }, centre);
    var cScore = el('text', { 'class': 'lw2-wheel__centre-score', x: C, y: C + 24, 'text-anchor': 'middle' }, centre);

    var nodes = {};
    var current = null;

    function select(key) {
      current = key;
      results.forEach(function (r) {
        var g = nodes[r.key];
        g.classList.toggle('is-selected', r.key === key);
        g.setAttribute('aria-pressed', r.key === key ? 'true' : 'false');
      });
      var r = results.filter(function (x) { return x.key === key; })[0];
      if (r) {
        centre.classList.add('is-visible');
        cName.textContent = (dimsByKey[key] && dimsByKey[key].short) || key;
        cScore.textContent = fmt(r.rounded);
      }
      if (opts.onSelect) opts.onSelect(key);
    }

    // Points + labels (each an accessible button).
    results.forEach(function (r, idx) {
      var dim = dimsByKey[r.key] || { label: r.key, short: r.key };
      var p = pt(idx, n, (R * r.score) / 100);
      var l = pt(idx, n, LABEL_R);
      var g = el('g', {
        'class': 'lw2-wheel__node', role: 'button', tabindex: '0', 'aria-pressed': 'false',
        'aria-label': dim.label + '، ' + fmt(r.rounded) + ' من ' + fmt(100)
      }, svg);
      el('circle', { 'class': 'lw2-wheel__hit', cx: f(p.x), cy: f(p.y), r: 24 }, g);
      el('circle', { 'class': 'lw2-wheel__dot', cx: f(p.x), cy: f(p.y), r: 7 }, g);

      var anchor = Math.abs(l.cos) < 0.25 ? 'middle' : (l.cos > 0 ? 'start' : 'end');
      var ly = l.y + (l.sin > 0.25 ? 14 : (l.sin < -0.25 ? -6 : 5));
      var t = el('text', { 'class': 'lw2-wheel__label', x: f(l.x), y: f(ly), 'text-anchor': anchor }, g);
      t.textContent = dim.short;
      var s = el('text', { 'class': 'lw2-wheel__value', x: f(l.x), y: f(ly + 18), 'text-anchor': anchor }, g);
      s.textContent = fmt(r.rounded);
      // Wide invisible target around the label for touch.
      var w = 84, h = 52;
      var rx = anchor === 'middle' ? l.x - w / 2 : (anchor === 'start' ? l.x - 4 : l.x - w + 4);
      el('rect', { 'class': 'lw2-wheel__hit', x: f(rx), y: f(ly - 22), width: w, height: h, rx: 10 }, g);

      g.addEventListener('click', function () { select(r.key); });
      g.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(r.key); }
      });
      nodes[r.key] = g;
    });

    return { select: select, current: function () { return current; } };
  }

  window.LW2 = window.LW2 || {};
  window.LW2.wheel = { render: render };
})();
