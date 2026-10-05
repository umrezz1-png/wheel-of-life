'use strict';
/*
 * Browser end-to-end + audits (Chromium; WebKit/Firefox only if installed).
 *   (cd wheel-of-life-v2 && python3 -m http.server 8765 --bind 127.0.0.1) &
 *   NODE_PATH=$(npm root -g) node wheel-of-life-v2/tests/e2e.cjs
 * Screenshots go to wheel-of-life-v2/screenshots/. No test uses force-click.
 */
const { chromium, webkit, firefox } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const BASE = process.env.LW2_URL || 'http://127.0.0.1:8765/index.html';
const SHOTS = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const D = require('../js/data.js');
const nf = new Intl.NumberFormat('ar-EG');
const N = (n) => nf.format(n);
const SC = (n) => N(n) + ' / ' + N(100);

let pass = 0; const fails = [];
async function check(name, fn) {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').slice(0, 3).join(' | ')); }
}

/* ---------- helpers ---------- */
function valsFromRaws(raws) {
  const a = [];
  raws.forEach((r) => { let left = r; for (let j = 0; j < 3; j++) { const v = Math.max(1, Math.min(5, left - (2 - j))); a.push(v); left -= v; } });
  return a;
}
const rawsOf = (vals) => D.dimensions.map((_, d) => vals.slice(d * 3, d * 3 + 3).reduce((a, b) => a + b, 0));
const scoreOfRaw = (raw) => ((raw - 3) / 12) * 100;
const bandOf = (s) => D.bands.find((b) => s >= b.min - 1e-9);

const SCEN = {
  all1: Array(24).fill(1), all3: Array(24).fill(3), all5: Array(24).fill(5),
  mixed: valsFromRaws([15, 3, 9, 12, 6, 13, 7, 10]),
  low: valsFromRaws([3, 4, 5, 3, 6, 7, 3, 4]),
  close: valsFromRaws([9, 9, 9, 9, 9, 9, 9, 10]),
  twoLevels: valsFromRaws([12, 12, 12, 12, 6, 6, 6, 6])
};

async function open(browser, o = {}) {
  const ctx = await browser.newContext({
    locale: 'ar-EG', reducedMotion: o.motion || 'reduce', viewport: { width: o.w || 390, height: o.h || 800 },
    deviceScaleFactor: o.dpr || 1, hasTouch: !!o.touch, isMobile: !!o.touch
  });
  const page = await ctx.newPage();
  const requests = [], errors = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), post: r.postData() }));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  if (o.config) await page.route('**/config/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.LW2_CONFIG=' + JSON.stringify(o.config) + ';' }));
  await page.goto(BASE + (o.hash || ''));
  return { ctx, page, requests, errors };
}
const start = (p) => p.getByRole('button', { name: 'ابدأ الاختبار' }).click();
async function fill(page, vals) {            // real keyboard: digit selects, Enter advances
  await start(page);
  for (const v of vals) { await page.keyboard.press(String(v)); await page.keyboard.press('Enter'); }
  await page.waitForSelector('.lw2-results');
}
const scoreText = async (page, key) => (await page.locator('#lw2-dim-' + key + ' .lw2-dim__score').innerText()).trim();
const allScoreTexts = async (page) => Promise.all(D.dimensions.map((d) => scoreText(page, d.key)));
const nextBtn = (p) => p.locator('.lw2-nav .lw2-btn--primary');
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function shot(page, name, opts) { await page.waitForTimeout(60); await page.screenshot(Object.assign({ path: path.join(SHOTS, name) }, opts)); }

/* in-page geometry audits */
const wheelGeometry = (page) => page.evaluate(() => {
  const svg = document.querySelector('.lw2-wheel__svg').getBoundingClientRect();
  const scale = svg.width / 480;
  const texts = [...document.querySelectorAll('.lw2-wheel__label,.lw2-wheel__value')];
  const rects = texts.map((t) => { const r = t.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, cls: t.getAttribute('class'), eff: parseFloat(getComputedStyle(t).fontSize) * scale }; });
  let overlaps = 0;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    if (w > 1 && h > 1) overlaps++;
  }
  const outside = rects.filter((x) => x.l < svg.left - 1 || x.r > svg.right + 1 || x.t < svg.top - 1 || x.b > svg.bottom + 1).length;
  return { n: rects.length, overlaps, outside, minEff: Math.min(...rects.map((x) => x.eff)), scale };
});

(async () => {
  const browser = await chromium.launch();

  /* ===== 1. Flow, touch, keyboard (390 touch) ===== */
  console.log('Flow & behaviour (390x844 touch)');
  let { ctx, page, requests, errors } = await open(browser, { touch: true, dpr: 2 });
  await shot(page, '01-intro-mobile.png', { fullPage: true });
  await check('intro: title, subtitle, disclaimer, no inputs, hint spacing from CSS reset fix', async () => {
    assert.equal(await page.locator('h1').innerText(), D.texts.title);
    assert.ok(await page.getByText(D.texts.subtitle).count());
    assert.ok((await page.locator('.lw2-notice').innerText()).includes(D.texts.disclaimer));
    assert.equal(await page.locator('input:not([type=radio]), textarea, select').count(), 0);
  });
  await check('CSS specificity: component margins are no longer erased by the reset', async () => {
    const m = await page.evaluate(() => {
      const g = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
      return { lead: g('.lw2-lead', 'marginBottom'), sub: g('.lw2-subtitle', 'marginBottom'), title: g('.lw2-title', 'marginBottom'), eyebrow: g('.lw2-eyebrow', 'marginTop'), facts: g('.lw2-facts', 'marginBottom') };
    });
    assert.deepEqual(m, { lead: '18px', sub: '14px', title: '6px', eyebrow: '8px', facts: '18px' });
  });
  await start(page);
  await check('Q1: five options, Next disabled until answered; scale labels exact', async () => {
    assert.equal(await page.locator('.lw2-opt').count(), 5);
    assert.ok(await nextBtn(page).isDisabled());
    assert.deepEqual(await page.locator('.lw2-opt__text').allInnerTexts(), D.scale.map((s) => s.label));
    const sp = await page.evaluate(() => ({ fs: getComputedStyle(document.querySelector('.lw2-q__fieldset')).marginTop, hint: getComputedStyle(document.querySelector('.lw2-hint')).marginTop }));
    assert.deepEqual(sp, { fs: '12px', hint: '12px' });
  });
  await shot(page, '02-question-mobile.png');
  await check('cannot skip: disabled Next and Enter keep Q1', async () => {
    await page.keyboard.press('Enter');
    assert.match(await page.locator('.lw2-progress__count').innerText(), /١ من ٢٤/);
  });
  await check('touch targets >= 44px (real taps, no force)', async () => {
    for (const l of await page.locator('.lw2-opt__label').all()) assert.ok((await l.boundingBox()).height >= 44);
    await page.locator('.lw2-opt[data-value="4"] label').tap();
    assert.equal(await page.locator('.lw2-opt.is-selected').getAttribute('data-value'), '4');
    const b = await nextBtn(page).boundingBox(); assert.ok(b.height >= 44 && b.width >= 44);
  });
  await check('keyboard: digit selects, arrows move, Enter advances, focus lands on new question', async () => {
    await page.keyboard.press('2');
    assert.equal(await page.locator('.lw2-opt.is-selected').getAttribute('data-value'), '2');
    await page.keyboard.press('Enter');
    assert.match(await page.locator('.lw2-progress__count').innerText(), /٢ من ٢٤/);
    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'LEGEND');
  });
  await check('Previous keeps answers; changing one works; progressbar semantics', async () => {
    await page.getByRole('button', { name: 'السابق' }).click();
    assert.equal(await page.locator('.lw2-opt.is-selected').getAttribute('data-value'), '2');
    await page.keyboard.press('5');
    assert.equal(await page.locator('.lw2-opt.is-selected').getAttribute('data-value'), '5');
    const pb = page.locator('[role=progressbar]');
    assert.equal(await pb.getAttribute('aria-valuemax'), '24'); assert.equal(await pb.getAttribute('aria-valuenow'), '1');
    assert.equal(await page.locator('.lw2-seg').count(), 8);
  });
  await check('radios labelled in fieldset+legend; no horizontal scroll', async () => {
    assert.equal(await page.locator('fieldset > legend').count(), 1);
    for (const inp of await page.locator('.lw2-opt__input').all()) assert.equal(await page.locator('label[for="' + (await inp.getAttribute('id')) + '"]').count(), 1);
    assert.ok(await noHScroll(page));
  });
  await ctx.close();

  /* ===== 2. Scoring through the real UI ===== */
  console.log('Scoring through the real UI');
  for (const name of ['all1', 'all3', 'all5', 'mixed', 'low']) {
    ({ ctx, page, requests, errors } = await open(browser, { touch: true }));
    const vals = SCEN[name];
    await fill(page, vals);
    await check('UI scores [' + name + ']: every card value, band label and no overall wording', async () => {
      const raws = rawsOf(vals);
      for (let d = 0; d < 8; d++) {
        const s = scoreOfRaw(raws[d]);
        assert.equal(await scoreText(page, D.dimensions[d].key), SC(Math.round(s)));
        assert.ok((await page.locator('#lw2-dim-' + D.dimensions[d].key).innerText()).includes(bandOf(s).label));
      }
      const body = await page.locator('.lw2-root').innerText();
      assert.ok(!/الإجمالي|الكلي|المتوسط|Overall/i.test(body));
    });
    await check('UI sentence [' + name + ']: "<dimension> حصل على <score> في تقييمك الحالي"', async () => {
      const raws = rawsOf(vals);
      const t = await page.locator('#lw2-dim-' + D.dimensions[0].key + ' .lw2-dim__text').innerText();
      assert.equal(t.startsWith(D.dimensions[0].label + ' حصل على ' + SC(Math.round(scoreOfRaw(raws[0]))) + ' في تقييمك الحالي، '), true, t);
    });
    if (name === 'all1' || name === 'all3' || name === 'all5') {
      await check('equal scores [' + name + ']: no lists, exact notice, wheel/cards/reflection stay', async () => {
        assert.equal(await page.locator('.lw2-lists').count(), 0);
        assert.equal(await page.locator('.lw2-listcard').count(), 0);
        assert.equal(await page.locator('.lw2-tienotice').innerText(), D.texts.allEqualNotice);
        assert.equal(await page.locator('.lw2-wheel__node').count(), 8);
        assert.equal(await page.locator('.lw2-dim').count(), 8);
        assert.equal(await page.locator('.lw2-choice').count(), 8);
        assert.ok(await page.getByText(D.texts.reflectionQuestion).first().count());
        assert.equal(await page.getByText(D.texts.closeScoresNote).count(), 0);
      });
    }
    if (name === 'mixed') {
      await check('mixed: top/attention lists exact; no ties => no tie/close note', async () => {
        const names = async (i) => page.locator('.lw2-listcard').nth(i).locator('.lw2-rank__name').allInnerTexts();
        assert.deepEqual(await names(0), ['الجانب الروحاني', 'الجانب الشخصي', 'الجانب الاجتماعي']);
        assert.deepEqual(await names(1), ['الجانب المهني', 'الجانب الأسري', 'الجانب الصحي']);
        assert.equal(await page.getByText(D.texts.tieBoundaryNote).count(), 0);
        assert.equal(await page.getByText(D.texts.closeScoresNote).count(), 0);
      });
    }
    if (name === 'low') {
      await check('low: lists present, attention items in the lowest band', async () => {
        assert.equal(await page.locator('.lw2-listcard').count(), 2);
        assert.equal((await page.locator('.lw2-listcard').nth(1).locator('.lw2-rank__band').allInnerTexts())[0], 'أولوية للمراجعة');
      });
    }
    await check('NETWORK [' + name + ']: only same-origin GET of static files; no storage/cookies', async () => {
      const origin = new URL(BASE).origin;
      requests.forEach((r) => { assert.equal(r.method, 'GET', r.method + ' ' + r.url); assert.ok(r.url.startsWith(origin), 'external ' + r.url); assert.ok(!r.post); });
      const paths = [...new Set(requests.map((r) => new URL(r.url).pathname))];
      assert.ok(paths.every((p) => /\.(html|css|js)$|^\/$/.test(p) || p === '/favicon.ico'), paths.join(','));
      assert.deepEqual(await page.evaluate(() => ({ l: localStorage.length, s: sessionStorage.length, c: document.cookie })), { l: 0, s: 0, c: '' });
      assert.deepEqual(await ctx.cookies(), []);
    });
    await check('CONSOLE [' + name + ']: no errors or CSP violations', async () => { assert.deepEqual(errors.filter((e) => !/favicon/.test(e)), []); });
    await ctx.close();
  }

  /* ===== 3. Wheel picker: targets, no scroll jump, read-out, interpretation button ===== */
  console.log('Wheel picker, touch targets, scroll stability');
  for (const w of [320, 375, 390]) {
    for (const name of ['all1', 'mixed']) {
      ({ ctx, page } = await open(browser, { w, h: 760, touch: true, dpr: 2 }));
      await fill(page, SCEN[name]);
      await check('[' + w + 'px/' + name + '] 8 picker buttons, each >= 44x44, none overlapping', async () => {
        const boxes = [];
        for (const b of await page.locator('.lw2-pick__btn').all()) { const r = await b.boundingBox(); assert.ok(r.width >= 44 && r.height >= 44, JSON.stringify(r)); boxes.push(r); }
        assert.equal(boxes.length, 8);
        for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
          const a = boxes[i], b = boxes[j];
          assert.ok(!(Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5), 'overlap ' + i + '/' + j);
        }
      });
      await check('[' + w + 'px/' + name + '] real tap on every button selects it, read-out shows name+score, page does not jump', async () => {
        await page.locator('.lw2-wheel').scrollIntoViewIfNeeded();
        const raws = rawsOf(SCEN[name]);
        for (let i = 0; i < 8; i++) {
          const btn = page.locator('.lw2-pick__btn').nth(i);
          await btn.scrollIntoViewIfNeeded();
          const y0 = await page.evaluate(() => window.scrollY);
          await btn.tap();
          const y1 = await page.evaluate(() => window.scrollY);
          assert.ok(Math.abs(y1 - y0) < 2, 'scroll jumped ' + (y1 - y0));
          assert.equal(await btn.getAttribute('aria-pressed'), 'true');
          assert.equal(await page.locator('.lw2-pick__btn[aria-pressed=true]').count(), 1);
          const ro = await page.locator('.lw2-readout__text').innerText();
          assert.ok(ro.includes(D.dimensions[i].label) && ro.includes(SC(Math.round(scoreOfRaw(raws[i])))), ro);
          assert.equal(await page.locator('.lw2-wheel__node.is-selected').getAttribute('data-key'), D.dimensions[i].key);
        }
      });
      await check('[' + w + 'px/' + name + '] wheel text >= 12px effective, no clipping, no overlap', async () => {
        const g = await wheelGeometry(page);
        assert.equal(g.n, 16); assert.ok(g.minEff >= 12, 'min effective font ' + g.minEff.toFixed(2)); assert.equal(g.outside, 0); assert.equal(g.overlaps, 0);
      });
      await check('[' + w + 'px/' + name + '] no horizontal scroll', async () => { assert.ok(await noHScroll(page)); });
      if (name === 'mixed' && w === 320) {
        await page.locator('.lw2-wheel').scrollIntoViewIfNeeded();
        await page.locator('.lw2-pick__btn').nth(4).tap();
        await shot(page, '03-results-wheel-320.png');
      }
      if (name === 'all1' && w === 375) { await page.locator('.lw2-wheel').scrollIntoViewIfNeeded(); await shot(page, '04-results-allzero-375.png'); }
      await ctx.close();
    }
  }

  ({ ctx, page, requests } = await open(browser, { w: 390, h: 844, touch: true, dpr: 2 }));
  await fill(page, SCEN.mixed);
  await check('SVG tap (convenience) selects too and does not scroll', async () => {
    const y0 = await page.evaluate(() => window.scrollY);
    await page.locator('.lw2-wheel__node[data-key="personal"] .lw2-wheel__label').tap();
    assert.equal(await page.locator('.lw2-readout__text').innerText().then((t) => t.includes('الجانب الشخصي')), true);
    assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - y0) < 2);
  });
  await check('read-out is a polite live region; SVG is hidden from AT; picker group labelled', async () => {
    assert.equal(await page.locator('.lw2-readout__text').getAttribute('role'), 'status');
    assert.equal(await page.locator('.lw2-readout__text').getAttribute('aria-live'), 'polite');
    assert.equal(await page.locator('.lw2-wheel__node').first().getAttribute('role'), null);
    assert.equal(await page.locator('.lw2-wheel__node[tabindex]').count(), 0);
    assert.equal(await page.locator('.lw2-pick').getAttribute('aria-label'), D.texts.pickLabel);
  });
  await check('"اقرأ تفسير هذا الجانب" moves to the card and focuses its heading', async () => {
    await page.locator('.lw2-pick__btn[data-key="family"]').scrollIntoViewIfNeeded();
    await page.locator('.lw2-pick__btn[data-key="family"]').tap();
    const btn = page.getByRole('button', { name: D.texts.readDimension });
    assert.ok(await btn.isVisible());
    const y0 = await page.evaluate(() => window.scrollY);
    await btn.tap(); await page.waitForTimeout(80);
    assert.ok((await page.evaluate(() => window.scrollY)) > y0 + 100, 'did not move to the card');
    assert.equal(await page.evaluate(() => document.activeElement.closest('.lw2-dim') && document.activeElement.closest('.lw2-dim').id), 'lw2-dim-family');
    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'H4');
    const top = await page.locator('#lw2-dim-family').evaluate((e) => e.getBoundingClientRect().top);
    assert.ok(top >= -2 && top < 400, 'card top ' + top);
  });
  await check('scores keep left-to-right digit order (geometry of both numbers)', async () => {
    const res = await page.evaluate(() => [...document.querySelectorAll('.lw2-score')].map((e) => { const n = e.querySelectorAll('.lw2-n'); const a = n[0].getBoundingClientRect(), b = n[1].getBoundingClientRect(); return { ok: a.left < b.left && e.getAttribute('dir') === 'ltr' && e.tagName === 'BDI' && /^[٠-٩]+ \/ [٠-٩]+$/.test(e.textContent) }; }));
    assert.ok(res.length >= 30 && res.every((x) => x.ok), 'bad: ' + res.filter((x) => !x.ok).length + '/' + res.length);
  });
  await check('spacing review (results): note, quote, h3 and field margins come from component classes', async () => {
    const m = await page.evaluate(() => {
      const g = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
      return { lead: g('.lw2-results .lw2-lead', 'marginBottom'), h3: g('.lw2-listcard .lw2-h3', 'marginBottom'), quote: g('.lw2-quote', 'marginBottom'), note: g('.lw2-note--center', 'marginTop'), dim: g('.lw2-dim__text', 'marginTop') };
    });
    assert.deepEqual(m, { lead: '18px', h3: '12px', quote: '18px', note: '10px', dim: '6px' });
  });
  await shot(page, '09-results-cards-390.png');
  await ctx.close();

  /* ===== 4. Ties ===== */
  console.log('Ties and notes');
  ({ ctx, page } = await open(browser, { w: 390, touch: true, dpr: 2 }));
  await fill(page, SCEN.close);
  await check('close but not identical: note precedes the two lists; boundary-tie note follows them', async () => {
    assert.ok(await page.getByText(D.texts.closeScoresNote).count());
    assert.equal(await page.locator('.lw2-listcard').count(), 2);
    const order = await page.evaluate(() => { const n = [...document.querySelectorAll('.lw2-note')].find((e) => e.textContent.includes('متقاربة')); const l = document.querySelector('.lw2-lists'); const t = [...document.querySelectorAll('.lw2-note')].find((e) => e.textContent.includes('ترتيب العرض')); return { before: !!(n.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING), after: !!(l.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) }; });
    assert.deepEqual(order, { before: true, after: true });
    const keys = await page.locator('.lw2-rank__name').allInnerTexts();
    assert.equal(new Set(keys).size, 6);
  });
  await page.locator('.lw2-note--before').evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await shot(page, '10-ties-close-390.png');
  await ctx.close();
  ({ ctx, page } = await open(browser, { w: 390, touch: true, dpr: 2 }));
  await fill(page, SCEN.twoLevels);
  await check('two score levels: deterministic by display order + boundary-tie note, no close note', async () => {
    const s = await page.locator('.lw2-listcard').nth(0).locator('.lw2-rank__name').allInnerTexts();
    const a = await page.locator('.lw2-listcard').nth(1).locator('.lw2-rank__name').allInnerTexts();
    assert.deepEqual(s, ['الجانب الروحاني', 'الجانب المهني', 'الجانب المالي']);
    assert.deepEqual(a, ['الجانب الأسري', 'الجانب الشخصي', 'الجانب الصحي']);
    assert.ok(await page.getByText(D.texts.tieBoundaryNote).count());
    assert.equal(await page.getByText(D.texts.closeScoresNote).count(), 0);
  });
  await ctx.close();
  ({ ctx, page } = await open(browser, { w: 390, touch: true, dpr: 2 }));
  await fill(page, SCEN.all3);
  await page.locator('.lw2-tienotice').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await shot(page, '11-ties-allequal-390.png');
  await ctx.close();

  /* ===== 5. Review answers, per-dimension plans, restart ===== */
  console.log('Review, plans, restart');
  ({ ctx, page } = await open(browser, { w: 390, touch: true }));
  await fill(page, SCEN.mixed);
  const before = await allScoreTexts(page);
  const careerIdx = 1; // الجانب المهني (questions 4-6)
  await check('plans are independent per dimension and restored on return', async () => {
    const pickDim = (k) => page.locator('.lw2-choice__label', { hasText: D.dimensions.find((d) => d.key === k).label }).click();
    await pickDim('family');
    assert.ok(await page.getByText('بطاقة خطوتك الأولى: الجانب الأسري').count());
    await page.locator('#lw2-act-family-change').fill('خطة الأسرة');
    await page.locator('#lw2-act-family-when').fill('غدًا');
    await pickDim('health');
    assert.ok(await page.getByText('بطاقة خطوتك الأولى: الجانب الصحي').count());
    for (const f of ['change', 'first', 'when']) assert.equal(await page.locator('#lw2-act-health-' + f).inputValue(), '', 'health.' + f + ' leaked');
    await page.locator('#lw2-act-health-change').fill('خطة الصحة');
    await pickDim('family');
    assert.equal(await page.locator('#lw2-act-family-change').inputValue(), 'خطة الأسرة');
    assert.equal(await page.locator('#lw2-act-family-when').inputValue(), 'غدًا');
    await pickDim('health');
    assert.equal(await page.locator('#lw2-act-health-change').inputValue(), 'خطة الصحة');
    assert.equal(await page.locator('#lw2-act-health-when').inputValue(), '');
    assert.equal(await page.locator('.lw2-actioncard').count(), 1);
  });
  await check('review answers: keeps answers, edit one answer, updated results change only that dimension, plans kept', async () => {
    await page.getByRole('button', { name: D.texts.reviewAnswers }).click();
    assert.match(await page.locator('.lw2-progress__count').innerText(), /١ من ٢٤/);
    assert.equal(await page.locator('.lw2-opt.is-selected').getAttribute('data-value'), String(SCEN.mixed[0]));
    assert.equal(await page.locator('[role=progressbar]').getAttribute('aria-valuenow'), '24');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Enter');          // Q1..Q4 -> Q5
    assert.match(await page.locator('.lw2-progress__count').innerText(), /٥ من ٢٤/);
    const old = SCEN.mixed[4]; const nu = old === 5 ? 2 : old + 1;
    await page.keyboard.press(String(nu));
    assert.equal(await page.locator('.lw2-opt.is-selected').getAttribute('data-value'), String(nu));
    await page.getByRole('button', { name: D.texts.updatedResults }).click();
    await page.waitForSelector('.lw2-results');
    const after = await allScoreTexts(page);
    const vals = SCEN.mixed.slice(); vals[4] = nu;
    const expect = rawsOf(vals).map((r) => SC(Math.round(scoreOfRaw(r))));
    assert.deepEqual(after, expect);
    after.forEach((t, i) => { if (i === careerIdx) assert.notEqual(t, before[i]); else assert.equal(t, before[i], 'dimension ' + i + ' changed'); });
    assert.equal(await page.locator('#lw2-act-health-change').inputValue(), 'خطة الصحة');   // plan restored (health still selected)
    await page.locator('.lw2-choice__label', { hasText: 'الجانب الأسري' }).click();
    assert.equal(await page.locator('#lw2-act-family-change').inputValue(), 'خطة الأسرة');
  });
  await check('review path through all 24 keeps working: Next at last question returns to results too', async () => {
    await page.getByRole('button', { name: D.texts.reviewAnswers }).click();
    for (let i = 0; i < 24; i++) await page.keyboard.press('Enter');
    await page.waitForSelector('.lw2-results');
    assert.equal((await allScoreTexts(page)).length, 8);
  });
  await check('restart WITH a written plan asks inside the UI; Escape/cancel keep everything', async () => {
    await page.getByRole('button', { name: D.texts.retake }).click();
    const dlg = page.getByRole('alertdialog');
    assert.ok(await dlg.isVisible());
    await dlg.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await shot(page, '12-restart-confirm-390.png');
    assert.equal((await dlg.innerText()).includes(D.texts.confirmReset), true);
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), D.texts.confirmNo);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('alertdialog').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), D.texts.retake);
    await page.getByRole('button', { name: D.texts.retake }).click();
    await page.getByRole('button', { name: D.texts.confirmNo }).click();
    assert.ok(await page.locator('.lw2-results').count());
    assert.equal(await page.locator('#lw2-act-family-change').inputValue(), 'خطة الأسرة');
  });
  await check('confirmed restart clears answers and plans', async () => {
    await page.getByRole('button', { name: D.texts.retake }).click();
    await page.getByRole('button', { name: D.texts.confirmYes }).click();
    assert.equal(await page.locator('h1').innerText(), D.texts.title);
    await start(page);
    assert.equal(await page.locator('.lw2-opt.is-selected').count(), 0);
    for (const v of SCEN.all3) { await page.keyboard.press(String(v)); await page.keyboard.press('Enter'); }
    await page.waitForSelector('.lw2-results');
    await page.locator('.lw2-choice__label', { hasText: 'الجانب الأسري' }).click();
    assert.equal(await page.locator('#lw2-act-family-change').inputValue(), '');
  });
  await check('restart WITHOUT any plan text goes straight to the intro (no prompt)', async () => {
    await page.getByRole('button', { name: D.texts.retake }).click();
    assert.equal(await page.getByRole('alertdialog').count(), 0);
    assert.equal(await page.locator('h1').innerText(), D.texts.title);
  });
  await ctx.close();

  /* ===== 6. Course card: production vs explicit preview ===== */
  console.log('Course card');
  const ctaCases = [
    ['production, empty URL', {}, '', { button: false, note: false }],
    ['preview hash, empty URL', {}, '#lw2-preview', { button: 'disabled', note: true }],
    ['previewMode flag, empty URL', { config: { courseUrl: '', previewMode: true } }, '', { button: 'disabled', note: true }],
    ['absolute URL', { config: { courseUrl: 'https://example.org/c', previewMode: false } }, '', { link: 'https://example.org/c' }],
    ['relative URL', { config: { courseUrl: '/ar/course/', previewMode: false } }, '', { link: '/ar/course/' }],
    ['javascript: URL ignored', { config: { courseUrl: 'javascript:alert(1)', previewMode: false } }, '', { button: false, note: false }],
    ['protocol-relative URL ignored', { config: { courseUrl: '//evil.test/x', previewMode: false } }, '', { button: false, note: false }]
  ];
  for (const [name, o, hash, exp] of ctaCases) {
    ({ ctx, page } = await open(browser, Object.assign({ w: 390 }, o, { hash })));
    await fill(page, SCEN.all3);
    await check('CTA ' + name, async () => {
      const t = await page.locator('.lw2-cta').innerText();
      assert.ok(t.includes(D.texts.balanceQuote) && t.includes(D.texts.cta.title) && t.includes(D.texts.cta.body));
      if (exp.link) {
        const a = page.locator('.lw2-cta a'); assert.equal(await a.getAttribute('href'), exp.link); assert.equal(await a.getAttribute('target'), '_blank'); assert.match(await a.getAttribute('rel'), /noopener/);
        assert.equal(await page.locator('.lw2-devnote').count(), 0);
      } else {
        assert.equal(await page.locator('.lw2-cta a').count(), 0);
        assert.equal(await page.locator('.lw2-cta button').count(), exp.button === 'disabled' ? 1 : 0);
        if (exp.button === 'disabled') assert.ok(await page.locator('.lw2-cta button').isDisabled());
        assert.equal(await page.locator('.lw2-devnote').count(), exp.note ? 1 : 0);
        assert.equal(/config\.js|رابط الكورس غير مُعدّ/.test(await page.locator('.lw2-root').innerText()), !!exp.note);
      }
    });
    await ctx.close();
  }

  /* ===== 7. Keyboard-only journey ===== */
  console.log('Keyboard-only journey');
  ({ ctx, page } = await open(browser, { w: 390 }));
  await check('Tab -> Enter start; digits+Enter through 24; results: Tab to picker, Enter select, Tab to read button, Enter focuses the card', async () => {
    await page.keyboard.press('Tab');                       // h1 is tabindex -1; first stop = start button
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'ابدأ الاختبار');
    await page.keyboard.press('Enter');
    for (const v of SCEN.mixed) { await page.keyboard.press(String(v)); await page.keyboard.press('Enter'); }
    await page.waitForSelector('.lw2-results');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'lw2-results-title');
    let guard = 0; while (!(await page.evaluate(() => document.activeElement.classList.contains('lw2-pick__btn'))) && guard++ < 30) await page.keyboard.press('Tab');
    assert.ok(guard < 30, 'never reached the picker by Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-key')), 'spiritual');
    await page.keyboard.press('Tab'); await page.keyboard.press('Space');
    assert.equal(await page.locator('.lw2-pick__btn[aria-pressed=true]').getAttribute('data-key'), 'career');
    guard = 0; while (!(await page.evaluate(() => document.activeElement.classList.contains('lw2-readout__btn'))) && guard++ < 30) await page.keyboard.press('Tab');
    await page.keyboard.press('Enter'); await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => document.activeElement.closest('.lw2-dim') && document.activeElement.closest('.lw2-dim').id), 'lw2-dim-career');
  });
  await ctx.close();

  /* ===== 8. Real focus indicators (computed + pixels) ===== */
  console.log('Focus indicators');
  ({ ctx, page } = await open(browser, { w: 390, dpr: 2 }));
  async function focusProof(label, locator, visualSel) {
    await check('focus ring: ' + label, async () => {
      const target = visualSel ? page.locator(visualSel) : locator;
      await locator.evaluate((e) => e.blur());
      await target.scrollIntoViewIfNeeded();
      const bb = await target.boundingBox();
      const clip = { x: Math.max(0, bb.x - 8), y: Math.max(0, bb.y - 8), width: bb.width + 16, height: bb.height + 16 };
      const a = await page.screenshot({ clip });
      await page.keyboard.press('Shift');                       // keyboard modality => :focus-visible
      await locator.focus();
      assert.equal(await locator.evaluate((e) => e.matches(':focus-visible')), true);
      const o = await target.evaluate((e) => { const s = getComputedStyle(e); return { st: s.outlineStyle, w: parseFloat(s.outlineWidth), c: s.outlineColor }; });
      assert.ok(o.st !== 'none' && o.w >= 2 && !/rgba\(0, 0, 0, 0\)/.test(o.c), JSON.stringify(o));
      const b = await page.screenshot({ clip });
      assert.ok(!a.equals(b), 'pixels did not change when focused');
    });
  }
  await focusProof('start button', page.getByRole('button', { name: 'ابدأ الاختبار' }));
  await start(page);
  await focusProof('answer option (label ring)', page.locator('#lw2-q1-3'), '.lw2-opt[data-value="3"] .lw2-opt__label');
  await focusProof('Previous button', page.getByRole('button', { name: 'السابق' }));
  for (const v of SCEN.mixed) { await page.keyboard.press(String(v)); await page.keyboard.press('Enter'); }
  await page.waitForSelector('.lw2-results');
  await focusProof('picker button', page.locator('.lw2-pick__btn').nth(2));
  await page.locator('.lw2-pick__btn').nth(2).click();
  await focusProof('read-interpretation button', page.getByRole('button', { name: D.texts.readDimension }));
  await page.locator('.lw2-choice__label', { hasText: 'الجانب الصحي' }).click();
  await focusProof('plan textarea', page.locator('#lw2-act-health-change'));
  await ctx.close();

  /* ===== 9. Reduced motion ===== */
  console.log('Reduced motion');
  for (const motion of ['reduce', 'no-preference']) {
    ({ ctx, page } = await open(browser, { w: 390, motion }));
    await fill(page, SCEN.mixed);
    await check('prefers-reduced-motion=' + motion + ': ' + (motion === 'reduce' ? 'no element animates or transitions' : 'animations are active (test is meaningful)'), async () => {
      const st = await page.evaluate(() => {
        const out = { anim: 0, trans: 0 };
        document.querySelectorAll('.lw2-root *, .lw2-root *::before').forEach((e) => { const s = getComputedStyle(e); if (s.animationName !== 'none') out.anim++; if (s.transitionDuration.split(',').some((d) => parseFloat(d) > 0)) out.trans++; });
        return out;
      });
      if (motion === 'reduce') assert.deepEqual(st, { anim: 0, trans: 0 });
      else { assert.ok(st.anim > 0 && st.trans > 0, JSON.stringify(st)); }
    });
    await ctx.close();
  }

  /* ===== 10. Viewports ===== */
  console.log('Viewports: 320 375 390 430 768 1280');
  for (const [w, h] of [[320, 700], [375, 812], [390, 844], [430, 932], [768, 1024], [1280, 800]]) {
    ({ ctx, page } = await open(browser, { w, h, dpr: w <= 430 ? 2 : 1 }));
    await check('[' + w + '] intro: no horizontal scroll, dir=rtl', async () => { assert.ok(await noHScroll(page)); assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.lw2-root')).direction), 'rtl'); });
    await start(page);
    await check('[' + w + '] question: no horizontal scroll, options >= 44px', async () => {
      assert.ok(await noHScroll(page));
      for (const l of await page.locator('.lw2-opt__label').all()) assert.ok((await l.boundingBox()).height >= 44);
    });
    for (const v of SCEN.mixed) { await page.keyboard.press(String(v)); await page.keyboard.press('Enter'); }
    await page.waitForSelector('.lw2-results');
    await check('[' + w + '] results: no horizontal scroll; wheel text legible, in bounds, no overlap', async () => {
      assert.ok(await noHScroll(page));
      const g = await wheelGeometry(page);
      assert.equal(g.overlaps, 0); assert.equal(g.outside, 0); assert.ok(g.minEff >= 12, 'effective ' + g.minEff.toFixed(2));
    });
    await check('[' + w + '] results: nothing is wider than the viewport', async () => {
      const bad = await page.evaluate(() => [...document.querySelectorAll('.lw2-root *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && !e.closest('svg'); }).map((e) => e.className).slice(0, 3));
      assert.deepEqual(bad, []);
    });
    if (w === 390) { await page.locator('.lw2-pick__btn').nth(5).click(); await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, '05-results-top-390.png'); await shot(page, '06-results-full-390.png', { fullPage: true }); }
    if (w === 768) { await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, '07-results-tablet-768.png'); }
    if (w === 1280) { await page.locator('.lw2-pick__btn').nth(1).click(); await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, '08-results-desktop-1280.png'); }
    await ctx.close();
  }

  /* ===== 11. Other engines ===== */
  console.log('Other engines');
  for (const [name, type] of [['WebKit', webkit], ['Firefox', firefox]]) {
    let b = null;
    try { b = await type.launch(); } catch (e) { console.log('  --   ' + name + ': NOT TESTED (browser not installed in this environment)'); continue; }
    ({ ctx, page } = await open(b, { w: 390 }));
    await check(name + ': full quiz + results render', async () => { await fill(page, SCEN.mixed); assert.equal(await page.locator('.lw2-dim').count(), 8); assert.ok(await noHScroll(page)); });
    await ctx.close(); await b.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
  if (fails.length) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(2); });
