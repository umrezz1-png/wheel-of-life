/*
 * Wheel of Life v2 — UI controller.
 * In-memory state only: no storage, no network, no cookies.
 * Mount point: any element with [data-lw2-app].
 */
(function () {
  'use strict';

  var LW2 = window.LW2;
  var D = LW2.data, S = LW2.scoring, W = LW2.wheel;
  var T = D.texts;
  var TOTAL = D.questions.length;
  var nf = new Intl.NumberFormat('ar-EG');
  function num(n) { return nf.format(n); }

  var dimsByKey = {};
  D.dimensions.forEach(function (d) { dimsByKey[d.key] = d; });

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // Tiny DOM helper. Text always goes through textContent.
  function h(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === false || v == null) return;
      if (k === 'text') n.textContent = v;
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function txt(s) { return document.createTextNode(s); }

  // "٨٣ / ١٠٠" kept in left-to-right order inside right-to-left text.
  // Arabic-Indic digits are "AN" in the bidi algorithm: AN + neutral + AN is
  // reordered like RTL text even under dir=ltr (it would render "١٠٠ / ٨٣").
  // Each number is therefore its own inline-block (an atomic box), inside an
  // isolated LTR <bdi>, so the order is always 83 on the left, 100 on the right.
  function scoreNode(n, cls) {
    return h('bdi', { dir: 'ltr', 'class': 'lw2-score' + (cls ? ' ' + cls : '') }, [
      h('span', { 'class': 'lw2-n', text: num(n) }), txt(' / '), h('span', { 'class': 'lw2-n', text: num(100) })
    ]);
  }

  function chevron(pointsLeft) {
    var NS = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '20'); s.setAttribute('height', '20');
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    s.setAttribute('class', 'lw2-btn__icon');
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', pointsLeft ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7');
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2.2'); p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    s.appendChild(p);
    return s;
  }

  function validCourseUrl() {
    var u = (window.LW2_CONFIG && window.LW2_CONFIG.courseUrl) || '';
    u = String(u).trim();
    return /^https?:\/\/[^\s]+$/i.test(u) || /^\/(?!\/)[^\s]*$/.test(u) ? u : '';
  }

  // Developer notes are shown only in an explicit preview mode.
  function isPreview() {
    return !!(window.LW2_CONFIG && window.LW2_CONFIG.previewMode) || /(^|[#&])lw2-preview(&|$)/.test(window.location.hash || '');
  }

  function mount(root) {
    root.classList.add('lw2-root');
    root.setAttribute('dir', 'rtl');
    root.setAttribute('lang', 'ar');

    // Everything lives in memory only. plans: one independent plan per dimension.
    var state = { step: -1, answers: {}, plans: {}, actionDim: null, reviewing: false };
    var shouldFocus = false;
    var keyHandler = null;

    var live = h('div', { 'class': 'lw2-sr', 'aria-live': 'polite', 'aria-atomic': 'true' });
    var stage = h('div', { 'class': 'lw2-stage' });
    var footer = h('footer', { 'class': 'lw2-footer' }, [h('p', { text: T.disclaimer })]);
    root.textContent = '';
    root.appendChild(live);
    root.appendChild(stage);
    root.appendChild(footer);

    function announce(msg) { live.textContent = ''; setTimeout(function () { live.textContent = msg; }, 30); }

    function go(step, focus) {
      state.step = step;
      shouldFocus = !!focus;
      render();
    }

    function answeredCount() {
      return D.questions.filter(function (q) { return state.answers[q.id]; }).length;
    }

    function planOf(key) {
      return state.plans[key] || (state.plans[key] = { change: '', first: '', when: '' });
    }
    function hasPlan() {
      return Object.keys(state.plans).some(function (k) {
        var p = state.plans[k];
        return Object.keys(p).some(function (f) { return String(p[f]).trim() !== ''; });
      });
    }
    function resetAll() {
      state.answers = {}; state.plans = {}; state.actionDim = null; state.reviewing = false;
      go(-1, true);
    }

    function render() {
      if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
      stage.textContent = '';
      var screen;
      if (state.step < 0) screen = renderIntro();
      else if (state.step < TOTAL) screen = renderQuestion();
      else screen = renderResults();
      screen.classList.add('lw2-enter');
      stage.appendChild(screen);
      if (shouldFocus) {
        var target = screen.querySelector('[data-lw2-focus]');
        if (target) target.focus({ preventScroll: false });
        if (state.step >= 0) window.scrollTo({ top: Math.max(0, root.getBoundingClientRect().top + window.pageYOffset - 8), behavior: 'auto' });
      }
      shouldFocus = false;
    }

    /* ---------- Intro ---------- */
    function renderIntro() {
      return h('section', { 'class': 'lw2-screen lw2-intro', 'aria-labelledby': 'lw2-title' }, [
        h('p', { 'class': 'lw2-eyebrow', text: num(D.dimensions.length) + ' جوانب · ' + num(TOTAL) + ' سؤالًا' }),
        h('h1', { id: 'lw2-title', 'class': 'lw2-title', text: T.title, tabindex: '-1', 'data-lw2-focus': '' }),
        h('p', { 'class': 'lw2-subtitle', text: T.subtitle }),
        h('p', { 'class': 'lw2-lead', text: T.intro }),
        h('ul', { 'class': 'lw2-facts' }, [
          h('li', { text: T.periodNote }),
          h('li', { text: T.privacyNote })
        ]),
        h('div', { 'class': 'lw2-notice', role: 'note' }, [h('p', { text: T.disclaimer })]),
        h('div', { 'class': 'lw2-nav lw2-nav--single' }, [
          h('button', { type: 'button', 'class': 'lw2-btn lw2-btn--primary', onclick: function () { go(0, true); } }, [
            h('span', { text: 'ابدأ الاختبار' }), chevron(true)
          ])
        ])
      ]);
    }

    /* ---------- Question ---------- */
    function renderQuestion() {
      var q = D.questions[state.step];
      var dim = dimsByKey[q.dimension];
      var name = 'lw2-q' + q.id;

      var segs = D.dimensions.map(function (d) {
        var fill = h('span', { 'class': 'lw2-seg__fill' });
        return h('span', { 'class': 'lw2-seg', 'data-dim': d.key }, [fill]);
      });
      var bar = h('div', { 'class': 'lw2-progress__bar', role: 'progressbar', 'aria-label': 'تقدمك في الاختبار',
        'aria-valuemin': '0', 'aria-valuemax': String(TOTAL) }, segs);

      function paintProgress() {
        var done = answeredCount();
        bar.setAttribute('aria-valuenow', String(done));
        bar.setAttribute('aria-valuetext', 'تمت الإجابة على ' + num(done) + ' من ' + num(TOTAL) + ' سؤالًا');
        segs.forEach(function (s) {
          var key = s.getAttribute('data-dim');
          var c = D.questions.filter(function (x) { return x.dimension === key && state.answers[x.id]; }).length;
          s.firstChild.style.width = Math.round((c / D.questionsPerDimension) * 100) + '%';
          s.classList.toggle('is-current', key === q.dimension);
        });
      }

      var nextBtn, hint;
      var isLast = state.step === TOTAL - 1;

      function refreshNext() {
        var ok = !!state.answers[q.id];
        nextBtn.disabled = !ok;
        nextBtn.setAttribute('aria-disabled', ok ? 'false' : 'true');
        hint.hidden = ok;
      }

      function choose(value) {
        state.answers[q.id] = value;
        opts.forEach(function (o) { o.classList.toggle('is-selected', o.getAttribute('data-value') === String(value)); });
        paintProgress();
        refreshNext();
      }

      var opts = D.scale.map(function (s) {
        var id = name + '-' + s.value;
        var input = h('input', { type: 'radio', name: name, id: id, value: String(s.value), 'class': 'lw2-opt__input',
          checked: state.answers[q.id] === s.value, onchange: function () { choose(s.value); } });
        var label = h('label', { 'for': id, 'class': 'lw2-opt__label' }, [
          h('span', { 'class': 'lw2-opt__num', 'aria-hidden': 'true', text: num(s.value) }),
          h('span', { 'class': 'lw2-opt__text', text: s.label })
        ]);
        return h('div', { 'class': 'lw2-opt' + (state.answers[q.id] === s.value ? ' is-selected' : ''), 'data-value': String(s.value) }, [input, label]);
      });

      var legend = h('legend', { 'class': 'lw2-q__text', tabindex: '-1', 'data-lw2-focus': '', text: q.text });
      var fieldset = h('fieldset', { 'class': 'lw2-q__fieldset' }, [
        legend,
        h('p', { 'class': 'lw2-q__scale', text: T.scaleHint }),
        h('div', { 'class': 'lw2-opts' }, opts)
      ]);

      nextBtn = h('button', { type: 'button', 'class': 'lw2-btn lw2-btn--primary', disabled: true, 'aria-disabled': 'true',
        onclick: function () { if (state.answers[q.id]) go(state.step + 1, true); } },
        [h('span', { text: isLast ? 'اعرض عجلة حياتي' : 'التالي' }), chevron(true)]);
      var prevBtn = h('button', { type: 'button', 'class': 'lw2-btn lw2-btn--ghost',
        onclick: function () { go(state.step - 1, true); } }, [chevron(false), h('span', { text: 'السابق' })]);
      hint = h('p', { 'class': 'lw2-hint', text: 'اختر إجابة للمتابعة. يمكنك أيضًا الضغط على أحد الأرقام من ' + num(1) + ' إلى ' + num(5) + '.' });

      // While reviewing, once every answer exists, jump straight back to the (updated) results.
      var updated = (state.reviewing && answeredCount() === TOTAL)
        ? h('button', { type: 'button', 'class': 'lw2-btn lw2-btn--ghost lw2-btn--block lw2-review-link',
            onclick: function () { go(TOTAL, true); } }, [h('span', { text: T.updatedResults })])
        : null;

      var screen = h('section', { 'class': 'lw2-screen lw2-question', 'aria-label': 'السؤال ' + num(q.id) + ' من ' + num(TOTAL) }, [
        h('div', { 'class': 'lw2-progress' }, [
          h('div', { 'class': 'lw2-progress__meta' }, [
            h('span', { 'class': 'lw2-chip', text: dim.label }),
            h('span', { 'class': 'lw2-progress__count', text: 'السؤال ' + num(q.id) + ' من ' + num(TOTAL) })
          ]),
          bar
        ]),
        h('form', { 'class': 'lw2-q', onsubmit: function (e) { e.preventDefault(); },
          onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); if (state.answers[q.id]) go(state.step + 1, true); } } }, [fieldset]),
        h('div', { 'class': 'lw2-nav' }, [prevBtn, nextBtn]),
        hint,
        updated
      ]);

      // 1-5 (Latin or Arabic-Indic) pick an answer. Bound to the document so it
      // also works when focus is on the page body; removed on every re-render.
      keyHandler = function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var t = e.target;
        if (t && (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'radio'))) return;
        var i = '12345'.indexOf(e.key); if (i < 0) i = '١٢٣٤٥'.indexOf(e.key);
        if (i < 0) return;
        e.preventDefault();
        choose(i + 1);
        var inp = screen.querySelector('#' + name + '-' + (i + 1));
        if (inp) { inp.checked = true; inp.focus(); }
      };
      document.addEventListener('keydown', keyHandler);

      paintProgress(); refreshNext();
      announce('السؤال ' + num(q.id) + ' من ' + num(TOTAL) + '. ' + dim.label);
      return screen;
    }

    /* ---------- Results ---------- */
    function interpretationNode(r) {
      var d = dimsByKey[r.key];
      return h('p', { 'class': 'lw2-dim__text' }, [
        txt(d.label + ' حصل على '), scoreNode(r.rounded), txt(' في تقييمك الحالي، ' + r.band.sentence)
      ]);
    }

    function renderResults() {
      var firstMissing = D.questions.filter(function (q) { return !state.answers[q.id]; })[0];
      if (firstMissing) { state.step = firstMissing.id - 1; return renderQuestion(); }
      state.reviewing = false;

      var results = S.computeScores(D, state.answers);
      var ranked = S.rank(results);
      var byKey = {};
      results.forEach(function (r) { byKey[r.key] = r; });
      var cards = {}, pickBtns = {}, wheelApi;

      /* Wheel + independent selector buttons + readout */
      var wheelBox = h('div', { 'class': 'lw2-wheel' });

      var pick = h('div', { 'class': 'lw2-pick', role: 'group', 'aria-label': T.pickLabel }, results.map(function (r) {
        var b = h('button', { type: 'button', 'class': 'lw2-pick__btn', 'aria-pressed': 'false', 'data-key': r.key,
          onclick: function () { selectDim(r.key); } }, [
          h('span', { 'class': 'lw2-pick__name', text: dimsByKey[r.key].short }),
          scoreNode(r.rounded)
        ]);
        pickBtns[r.key] = b;
        return b;
      }));

      var readoutText = h('p', { 'class': 'lw2-readout__text', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', text: T.pickHint });
      var readBtn = h('button', { type: 'button', 'class': 'lw2-btn lw2-btn--ghost lw2-readout__btn', hidden: true,
        onclick: function () { goToCard(); } }, [h('span', { text: T.readDimension })]);
      var readout = h('div', { 'class': 'lw2-readout' }, [readoutText, readBtn]);
      var selected = null;

      function selectDim(key) {
        selected = key;
        wheelApi.mark(key);
        Object.keys(pickBtns).forEach(function (k) {
          var on = k === key;
          pickBtns[k].setAttribute('aria-pressed', on ? 'true' : 'false');
          pickBtns[k].classList.toggle('is-selected', on);
          cards[k].classList.toggle('is-highlight', on);
        });
        readoutText.textContent = '';
        readoutText.appendChild(h('strong', { text: dimsByKey[key].label }));
        readoutText.appendChild(txt(' · '));
        readoutText.appendChild(scoreNode(byKey[key].rounded));
        readoutText.appendChild(txt(' · ' + byKey[key].band.label));
        readBtn.hidden = false;
      }

      // Only the explicit button moves the page to the card.
      function goToCard() {
        if (!selected) return;
        var card = cards[selected];
        card.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
        card.querySelector('.lw2-dim__name').focus({ preventScroll: true });
      }

      /* Strongest / attention lists, close-score and tie notes */
      function listCard(title, items, kind) {
        return h('section', { 'class': 'lw2-listcard lw2-listcard--' + kind }, [
          h('h3', { 'class': 'lw2-h3', text: title }),
          h('ol', { 'class': 'lw2-rank' }, items.map(function (r) {
            return h('li', { 'class': 'lw2-rank__item' }, [
              h('span', { 'class': 'lw2-rank__name', text: dimsByKey[r.key].label }),
              scoreNode(r.rounded, 'lw2-rank__score'),
              h('span', { 'class': 'lw2-rank__band', text: r.band.label })
            ]);
          }))
        ]);
      }

      var rankBlock = [];
      if (ranked.spread === 0) {
        rankBlock.push(h('div', { 'class': 'lw2-tienotice', role: 'note' }, [h('p', { text: T.allEqualNotice })]));
      } else {
        if (ranked.spread <= 10) rankBlock.push(h('p', { 'class': 'lw2-note lw2-note--before', text: T.closeScoresNote }));
        rankBlock.push(h('div', { 'class': 'lw2-lists' }, [
          listCard(T.strongestTitle, ranked.strongest, 'strong'),
          listCard(T.attentionTitle, ranked.attention, 'attention')
        ]));
        if (ranked.strongestTie || ranked.attentionTie) rankBlock.push(h('p', { 'class': 'lw2-note', text: T.tieBoundaryNote }));
        if (ranked.spread > 10 && Math.min.apply(null, ranked.attention.map(function (r) { return r.score; })) >= 60) {
          rankBlock.push(h('p', { 'class': 'lw2-note', text: T.relativeListNote }));
        }
      }

      /* Per-dimension cards */
      var dimList = h('ul', { 'class': 'lw2-dims' }, results.map(function (r) {
        var d = dimsByKey[r.key];
        var fill = h('span', { 'class': 'lw2-meter__fill lw2-band--' + r.band.key });
        fill.style.width = Math.round(r.score) + '%';
        var li = h('li', { 'class': 'lw2-dim', id: 'lw2-dim-' + r.key }, [
          h('div', { 'class': 'lw2-dim__head' }, [
            h('h4', { 'class': 'lw2-dim__name', tabindex: '-1', text: d.label }),
            scoreNode(r.rounded, 'lw2-dim__score')
          ]),
          h('div', { 'class': 'lw2-meter', role: 'img', 'aria-label': d.label + ': ' + num(r.rounded) + ' من ' + num(100) }, [fill]),
          h('p', { 'class': 'lw2-dim__band' }, [
            h('span', { 'class': 'lw2-bandtag lw2-band--' + r.band.key, text: r.band.label })
          ]),
          h('p', { 'class': 'lw2-dim__covers', text: d.covers }),
          interpretationNode(r)
        ]);
        cards[r.key] = li;
        return li;
      }));

      /* Reflection + one plan per dimension (memory only) */
      var actionHost = h('div', { 'class': 'lw2-action-host', 'aria-live': 'polite' });
      var reflName = 'lw2-focus-dim';
      var choices = D.dimensions.map(function (d) {
        var id = reflName + '-' + d.key;
        var input = h('input', { type: 'radio', name: reflName, id: id, value: d.key, 'class': 'lw2-opt__input',
          checked: state.actionDim === d.key, onchange: function () { state.actionDim = d.key; paintChoices(); paintAction(true); } });
        return h('div', { 'class': 'lw2-choice' + (state.actionDim === d.key ? ' is-selected' : ''), 'data-key': d.key }, [
          input, h('label', { 'for': id, 'class': 'lw2-choice__label', text: d.label })
        ]);
      });
      function paintChoices() {
        choices.forEach(function (c) { c.classList.toggle('is-selected', c.getAttribute('data-key') === state.actionDim); });
      }
      function paintAction(focus) {
        actionHost.textContent = '';
        if (!state.actionDim) return;
        var key = state.actionDim, d = dimsByKey[key], plan = planOf(key);
        var heading = h('h3', { 'class': 'lw2-h3', tabindex: '-1', text: T.actionTitle + ': ' + d.label });
        var fields = T.actionFields.map(function (fdef) {
          var id = 'lw2-act-' + key + '-' + fdef.key;
          var ta = h('textarea', { id: id, 'class': 'lw2-field__input', rows: '2', maxlength: '240', placeholder: fdef.placeholder, autocomplete: 'off',
            oninput: function (e) { plan[fdef.key] = e.target.value; } });
          ta.value = plan[fdef.key];
          return h('div', { 'class': 'lw2-field' }, [h('label', { 'for': id, 'class': 'lw2-field__label', text: fdef.label }), ta]);
        });
        actionHost.appendChild(h('div', { 'class': 'lw2-actioncard', 'data-dim': key }, [heading].concat(fields, [h('p', { 'class': 'lw2-privacy', text: T.actionPrivacy })])));
        if (focus) heading.focus();
      }

      /* Course card: dev notes / placeholder button only in explicit preview mode */
      var url = validCourseUrl();
      var ctaCard = [h('h3', { id: 'lw2-cta-title', 'class': 'lw2-h3', text: T.cta.title }), h('p', { text: T.cta.body })];
      if (url) {
        ctaCard.push(h('a', { 'class': 'lw2-btn lw2-btn--primary lw2-btn--block', href: url, target: '_blank', rel: 'noopener noreferrer' },
          [h('span', { text: T.cta.button }), chevron(true)]));
      } else if (isPreview()) {
        ctaCard.push(h('button', { type: 'button', 'class': 'lw2-btn lw2-btn--primary lw2-btn--block', disabled: true, 'aria-disabled': 'true' }, [h('span', { text: T.cta.button })]));
        ctaCard.push(h('p', { 'class': 'lw2-devnote', text: T.cta.missingUrl }));
      }
      var cta = h('section', { 'class': 'lw2-cta', 'aria-labelledby': 'lw2-cta-title' }, [
        h('blockquote', { 'class': 'lw2-quote' }, [h('p', { text: T.balanceQuote })]),
        h('div', { 'class': 'lw2-cta__card' }, ctaCard)
      ]);

      /* Review answers / restart (restart asks first when a plan was written) */
      var confirmHost = h('div', { 'class': 'lw2-confirmhost' });
      var retakeBtn = h('button', { type: 'button', 'class': 'lw2-btn lw2-btn--ghost', onclick: function () {
        if (!hasPlan()) { resetAll(); return; }
        showConfirm();
      } }, [h('span', { text: T.retake })]);
      var reviewBtn = h('button', { type: 'button', 'class': 'lw2-btn lw2-btn--ghost', onclick: function () {
        state.reviewing = true; go(0, true);
      } }, [h('span', { text: T.reviewAnswers })]);

      function hideConfirm() { confirmHost.textContent = ''; retakeBtn.focus(); }
      function showConfirm() {
        confirmHost.textContent = '';
        var cancel = h('button', { type: 'button', 'class': 'lw2-btn lw2-btn--ghost', onclick: hideConfirm }, [h('span', { text: T.confirmNo })]);
        var yes = h('button', { type: 'button', 'class': 'lw2-btn lw2-btn--primary', onclick: resetAll }, [h('span', { text: T.confirmYes })]);
        confirmHost.appendChild(h('div', { 'class': 'lw2-confirm', role: 'alertdialog', 'aria-labelledby': 'lw2-confirm-t',
          onkeydown: function (e) { if (e.key === 'Escape') { e.preventDefault(); hideConfirm(); } } }, [
          h('p', { id: 'lw2-confirm-t', text: T.confirmReset }),
          h('div', { 'class': 'lw2-nav' }, [cancel, yes])
        ]));
        cancel.focus();
      }

      var screen = h('section', { 'class': 'lw2-screen lw2-results', 'aria-labelledby': 'lw2-results-title' }, [
        h('h2', { id: 'lw2-results-title', 'class': 'lw2-title lw2-title--results', tabindex: '-1', 'data-lw2-focus': '', text: T.resultsTitle }),
        h('p', { 'class': 'lw2-lead', text: T.resultsLead }),
        wheelBox,
        h('p', { 'class': 'lw2-note lw2-note--center', text: T.scaleNote }),
        pick,
        readout
      ].concat(rankBlock, [
        h('h3', { 'class': 'lw2-h3 lw2-h3--section', text: T.interpretationTitle }),
        h('p', { 'class': 'lw2-note', text: T.interpretationNote }),
        dimList,
        h('div', { 'class': 'lw2-notice', role: 'note' }, [h('p', { text: T.disclaimer })]),
        h('section', { 'class': 'lw2-reflect', 'aria-labelledby': 'lw2-reflect-q' }, [
          h('h3', { id: 'lw2-reflect-q', 'class': 'lw2-h3', text: T.reflectionQuestion }),
          h('fieldset', { 'class': 'lw2-choices' }, [h('legend', { 'class': 'lw2-sr', text: T.reflectionQuestion }), h('div', { 'class': 'lw2-choices__grid' }, choices)]),
          actionHost
        ]),
        cta,
        h('div', { 'class': 'lw2-nav lw2-actions' }, [reviewBtn, retakeBtn]),
        confirmHost
      ]));

      wheelApi = W.render(wheelBox, results, { dimensions: dimsByKey, format: num, onSelect: selectDim });
      paintAction(false);
      announce(T.resultsTitle);
      return screen;
    }

    render();
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-lw2-app]'), mount);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
