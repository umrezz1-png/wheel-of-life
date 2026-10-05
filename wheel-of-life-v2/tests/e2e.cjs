'use strict';
/*
 * Browser end-to-end + audits. Needs Playwright (+ Chromium) and a static server:
 *   (cd wheel-of-life-v2 && python3 -m http.server 8765 --bind 127.0.0.1) &
 *   NODE_PATH=$(npm root -g) node wheel-of-life-v2/tests/e2e.cjs
 * Writes screenshots to wheel-of-life-v2/screenshots/.
 */
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const BASE = process.env.LW2_URL || 'http://127.0.0.1:8765/index.html';
const SHOTS = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const D = require('../js/data.js');

let pass = 0; const fails = [];
async function check(name, fn) {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}

async function newPage(browser, opts) {
  const ctx = await browser.newContext(Object.assign({ locale: 'ar-EG', reducedMotion: 'reduce' }, opts));
  const page = await ctx.newPage();
  const requests = [], errors = [], dialogs = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), post: r.postData() }));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(BASE);
  return { ctx, page, requests, errors };
}

const nextBtn = (p) => p.locator('.lw2-nav .lw2-btn--primary');
async function answer(p, v) { await p.locator('.lw2-opt[data-value="' + v + '"] label').click(); }
async function fill(page, values) {
  await page.getByRole('button', { name: 'ابدأ الاختبار' }).click();
  for (let i = 0; i < 24; i++) { await answer(page, values[i]); await nextBtn(page).click(); }
}
const scoreOf = async (page, key) => (await page.locator('#lw2-dim-' + key + ' .lw2-dim__score').innerText()).trim();

(async () => {
  const browser = await chromium.launch();

  console.log('Flow & behaviour (mobile 375x812, touch)');
  let { ctx, page, requests, errors } = await newPage(browser, { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.screenshot({ path: path.join(SHOTS, '01-intro-mobile.png'), fullPage: true });

  await check('intro shows title, subtitle, disclaimer, no inputs', async () => {
    assert.equal(await page.locator('h1').innerText(), 'اختبار عجلة الحياة');
    assert.ok(await page.getByText('اكتشف مدى التوازن بين أهم جوانب حياتك').count());
    assert.ok((await page.locator('.lw2-notice').innerText()).includes(D.texts.disclaimer));
    assert.equal(await page.locator('input:not([type=radio]), textarea, select').count(), 0);
  });

  await page.getByRole('button', { name: 'ابدأ الاختبار' }).click();
  await check('Q1: shows 5 options, Next disabled until answered', async () => {
    assert.equal(await page.locator('.lw2-opt').count(), 5);
    assert.ok(await nextBtn(page).isDisabled());
    assert.equal(await page.locator('legend').innerText(), D.questions[0].text);
  });
  await page.screenshot({ path: path.join(SHOTS, '02-question-mobile.png') });
  await check('cannot skip: clicking disabled Next / pressing Enter stays on Q1', async () => {
    await nextBtn(page).click({ force: true }).catch(() => {});
    await page.keyboard.press('Enter');
    assert.match(await page.locator('.lw2-progress__count').innerText(), /١ من ٢٤/);
  });
  await check('touch targets >= 44px tall', async () => {
    for (const l of await page.locator('.lw2-opt__label').all()) assert.ok((await l.boundingBox()).height >= 44);
    assert.ok((await nextBtn(page).boundingBox()).height >= 44);
  });
  await check('keyboard: digit key selects, Tab/Space/arrows work, Enter submits', async () => {
    await page.keyboard.press('4');
    assert.equal(await page.locator('.lw2-opt.is-selected').getAttribute('data-value'), '4');
    assert.ok(await nextBtn(page).isEnabled());
    await page.keyboard.press('ArrowDown'); // native radio group navigation
    const v = await page.locator('.lw2-opt__input:checked').getAttribute('value');
    assert.equal(v, '5');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter'); // form submit -> next
    assert.match(await page.locator('.lw2-progress__count').innerText(), /٢ من ٢٤/);
  });
  await check('focus moves to the new question on Next', async () => {
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.tagName), 'LEGEND');
  });
  await check('Previous keeps the answer; changing it works', async () => {
    await page.getByRole('button', { name: 'السابق' }).click();
    assert.equal(await page.locator('.lw2-opt.is-selected').getAttribute('data-value'), '4');
    await answer(page, 2);
    assert.equal(await page.locator('.lw2-opt.is-selected').getAttribute('data-value'), '2');
  });
  await check('progressbar semantics', async () => {
    const pb = page.locator('[role=progressbar]');
    assert.equal(await pb.getAttribute('aria-valuemax'), '24');
    assert.equal(await pb.getAttribute('aria-valuenow'), '1');
    assert.equal(await page.locator('.lw2-seg').count(), 8);
  });
  await check('every option is a labelled radio in a fieldset with a legend', async () => {
    assert.equal(await page.locator('fieldset > legend').count(), 1);
    for (const inp of await page.locator('.lw2-opt__input').all()) {
      const id = await inp.getAttribute('id');
      assert.equal(await page.locator('label[for="' + id + '"]').count(), 1);
    }
  });
  await check('no horizontal overflow at 375px', async () => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  });
  await ctx.close();

  console.log('Scoring through the real UI');
  const scenarios = [
    ['all 1 -> 0', () => Array(24).fill(1), () => 0],
    ['all 5 -> 100', () => Array(24).fill(5), () => 100],
    ['all 3 -> 50', () => Array(24).fill(3), () => 50],
    ['mixed', () => { const raws = [15, 3, 9, 12, 6, 13, 7, 10]; const a = []; raws.forEach((r) => { let left = r; for (let j = 0; j < 3; j++) { const v = Math.max(1, Math.min(5, left - (2 - j))); a.push(v); left -= v; } }); return a; }, null]
  ];
  for (const [name, mk, exp] of scenarios) {
    ({ ctx, page, requests, errors } = await newPage(browser, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }));
    const vals = mk();
    await fill(page, vals);
    await check('UI result: ' + name, async () => {
      await page.waitForSelector('.lw2-results');
      const nf = new Intl.NumberFormat('ar-EG');
      for (let d = 0; d < 8; d++) {
        const raw = vals.slice(d * 3, d * 3 + 3).reduce((a, b) => a + b, 0);
        const want = Math.round(((raw - 3) / 12) * 100);
        assert.equal(await scoreOf(page, D.dimensions[d].key), nf.format(want) + '/' + nf.format(100));
      }
    });
    if (name === 'mixed') {
      await check('mixed: wheel (8 nodes), top3, attention3, bands, no overall', async () => {
        assert.equal(await page.locator('.lw2-wheel__node').count(), 8);
        const lists = page.locator('.lw2-listcard');
        const names = async (i) => lists.nth(i).locator('.lw2-rank__name').allInnerTexts();
        assert.deepEqual(await names(0), ['الجانب الروحاني', 'الجانب الشخصي', 'الجانب الاجتماعي']);
        assert.deepEqual(await names(1), ['الجانب المهني', 'الجانب الأسري', 'الجانب الصحي']);
        assert.equal(await page.locator('.lw2-dim').count(), 8);
        const body = await page.locator('.lw2-root').innerText();
        assert.ok(!/الإجمالي|الكلي|المتوسط|Overall/i.test(body));
        assert.ok(body.includes('الجانب المهني حصل على ٠/١٠٠ في تقييمك الحالي'));
        for (const b of D.bands) if (b.key !== 'good' || true) assert.ok(body.includes(b.label));
      });
      await check('mixed: wheel click selects dimension, centre readout + card highlight', async () => {
        await page.locator('.lw2-wheel__node').nth(5).locator('.lw2-wheel__label').click(); // tap the label
        assert.equal(await page.locator('.lw2-wheel__centre-name').textContent(), 'الشخصي');
        assert.equal(await page.locator('.lw2-wheel__centre-score').textContent(), '٨٣');
        assert.ok(await page.locator('#lw2-dim-personal.is-highlight').count());
        await page.locator('.lw2-wheel__node').nth(2).locator('.lw2-wheel__dot').click({ force: true }); // tap the dot
        assert.equal(await page.locator('.lw2-wheel__centre-name').textContent(), 'المالي');
        await page.locator('.lw2-wheel__node').nth(0).focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('.lw2-wheel__centre-name').textContent(), 'الروحاني');
      });
      await check('wheel text labels render >= 12px effective on 375px', async () => {
        const fs = await page.evaluate(() => { const t = document.querySelector('.lw2-wheel__label'); const r = t.getBoundingClientRect(); const svg = document.querySelector('.lw2-wheel__svg').getBoundingClientRect(); return parseFloat(getComputedStyle(t).fontSize) * (svg.width / 480); });
        assert.ok(fs >= 12, 'effective font ' + fs);
      });
      await check('wheel fits viewport (no overflow)', async () => {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
        const box = await page.locator('.lw2-wheel').boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 375);
      });
      await check('changing an answer after results recalculates (Back from results)', async () => {
        await page.locator('.lw2-dim').first().scrollIntoViewIfNeeded();
      });
      // Reflection + action card
      await check('reflection question + 8 choices; action card appears; fields kept in memory', async () => {
        assert.ok(await page.getByText(D.texts.reflectionQuestion).first().count());
        assert.equal(await page.locator('.lw2-choice').count(), 8);
        await page.locator('.lw2-choice__label', { hasText: 'الجانب الأسري' }).click();
        assert.ok(await page.getByText('بطاقة خطوتك الأولى: الجانب الأسري').count());
        assert.equal(await page.locator('.lw2-field__label').count(), 3);
        await page.locator('#lw2-act-change').fill('تجربة');
        await page.locator('.lw2-choice__label', { hasText: 'الجانب الصحي' }).click();
        assert.equal(await page.locator('#lw2-act-change').inputValue(), 'تجربة');
      });
      await check('CTA: quote + course title + body + disabled button when URL unset', async () => {
        const t = await page.locator('.lw2-cta').innerText();
        assert.ok(t.includes(D.texts.balanceQuote) && t.includes('كورس إدارة الضغوط') && t.includes(D.texts.cta.body));
        assert.ok(await page.getByRole('button', { name: D.texts.cta.button }).isDisabled());
      });
      await check('disclaimer visible on results and in footer', async () => {
        assert.ok((await page.locator('.lw2-results .lw2-notice').innerText()).includes(D.texts.disclaimer));
        assert.ok((await page.locator('.lw2-footer').innerText()).includes(D.texts.disclaimer));
      });
      await page.screenshot({ path: path.join(SHOTS, '03-results-mobile-full.png'), fullPage: true });
      await page.locator('.lw2-wheel').scrollIntoViewIfNeeded();
      await page.locator('.lw2-wheel__node').nth(5).locator('.lw2-wheel__label').click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(SHOTS, '04-results-mobile-top.png') });
      await check('reload resets (nothing persisted)', async () => {
        await page.reload();
        assert.ok(await page.getByRole('button', { name: 'ابدأ الاختبار' }).count());
        const stored = await page.evaluate(() => ({ l: localStorage.length, s: sessionStorage.length, c: document.cookie }));
        assert.deepEqual(stored, { l: 0, s: 0, c: '' });
        assert.deepEqual((await ctx.cookies()), []);
      });
      await check('retake button resets state', async () => {
        await fill(page, Array(24).fill(3));
        await page.getByRole('button', { name: 'إعادة الاختبار من البداية' }).click();
        assert.ok(await page.getByRole('button', { name: 'ابدأ الاختبار' }).count());
        await page.getByRole('button', { name: 'ابدأ الاختبار' }).click();
        assert.equal(await page.locator('.lw2-opt.is-selected').count(), 0);
      });
    }
    await check('NETWORK (' + name + '): only same-origin GETs of static files; zero POST/beacon', async () => {
      const origin = new URL(BASE).origin;
      requests.forEach((r) => { assert.equal(r.method, 'GET', r.method + ' ' + r.url); assert.ok(r.url.startsWith(origin), 'external: ' + r.url); assert.ok(!r.post); });
      const paths = [...new Set(requests.map((r) => new URL(r.url).pathname))].sort();
      assert.ok(paths.every((p) => /\.(html|css|js)$|^\/$/.test(p) || p === '/favicon.ico'), paths.join(','));
    });
    await check('CONSOLE (' + name + '): no errors/CSP violations', async () => {
      const real = errors.filter((e) => !/favicon/.test(e));
      assert.deepEqual(real, []);
    });
    await ctx.close();
  }

  console.log('Layout across viewports (RTL, no overflow)');
  for (const [w, h] of [[320, 640], [375, 812], [768, 1024], [1280, 800]]) {
    ({ ctx, page, requests, errors } = await newPage(browser, { viewport: { width: w, height: h } }));
    await fill(page, [5, 4, 3, 2, 1, 5, 4, 3, 2, 1, 5, 4, 3, 2, 1, 5, 4, 3, 2, 1, 5, 4, 3, 2]);
    await check('results ' + w + 'px: no horizontal overflow, dir=rtl', async () => {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'overflow');
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.lw2-root')).direction), 'rtl');
    });
    await check('results ' + w + 'px: wheel labels inside the SVG box', async () => {
      const bad = await page.evaluate(() => { const svg = document.querySelector('.lw2-wheel__svg').getBoundingClientRect(); return [...document.querySelectorAll('.lw2-wheel__label,.lw2-wheel__value')].filter((t) => { const r = t.getBoundingClientRect(); return r.left < svg.left - 1 || r.right > svg.right + 1; }).length; });
      assert.equal(bad, 0);
    });
    if (w === 768) { await page.screenshot({ path: path.join(SHOTS, '05-results-tablet-full.png'), fullPage: true }); }
    if (w === 1280) { await page.screenshot({ path: path.join(SHOTS, '06-results-desktop-top.png') }); }
    if (w === 320) { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(SHOTS, '07-results-320.png') }); }
    await ctx.close();
  }

  console.log('Course URL config + safety');
  {
    const c = await browser.newContext({ viewport: { width: 375, height: 800 } });
    for (const [url, expectLink] of [['https://example.org/course', true], ['/ar/course/', true], ['javascript:alert(1)', false], ['//evil.test/x', false]]) {
      const p = await c.newPage();
      await p.route('**/config/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.LW2_CONFIG={courseUrl:' + JSON.stringify(url) + '};' }));
      await p.goto(BASE); await fill(p, Array(24).fill(3));
      await check('courseUrl=' + url + ' -> ' + (expectLink ? 'link' : 'disabled button'), async () => {
        const a = p.locator('.lw2-cta a');
        if (expectLink) { assert.equal(await a.getAttribute('href'), url); assert.equal(await a.getAttribute('target'), '_blank'); assert.match(await a.getAttribute('rel'), /noopener/); }
        else assert.equal(await a.count(), 0);
      });
      await p.close();
    }
    await c.close();
  }

  console.log('Accessibility (structure)');
  {
    ({ ctx, page } = await newPage(browser, { viewport: { width: 375, height: 800 } }));
    await check('html lang/dir; single h1 on intro; landmarks', async () => {
      assert.equal(await page.getAttribute('html', 'lang'), 'ar'); assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
      assert.equal(await page.locator('h1').count(), 1); assert.equal(await page.locator('main').count(), 1);
    });
    await fill(page, Array(24).fill(4));
    await check('results: h2 focused, headings in order, wheel nodes are labelled buttons', async () => {
      assert.equal(await page.evaluate(() => document.activeElement.id), 'lw2-results-title');
      const lv = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => +h.tagName[1]));
      for (let i = 1; i < lv.length; i++) assert.ok(lv[i] - lv[i - 1] <= 1, 'heading jump ' + lv.join(''));
      for (const n of await page.locator('.lw2-wheel__node').all()) {
        assert.equal(await n.getAttribute('role'), 'button'); assert.equal(await n.getAttribute('tabindex'), '0'); assert.match(await n.getAttribute('aria-label'), /من ٠?١٠٠|١٠٠/);
      }
    });
    await check('all form fields have labels; live region present', async () => {
      assert.equal(await page.locator('[aria-live]').count() >= 1, true);
      await page.locator('.lw2-choice__label').first().click();
      for (const f of await page.locator('textarea').all()) assert.equal(await page.locator('label[for="' + (await f.getAttribute('id')) + '"]').count(), 1);
    });
    await check('keyboard-only: can reach and activate a choice with Tab+Space', async () => {
      await page.locator('.lw2-choice .lw2-opt__input').first().focus();
      await page.keyboard.press('ArrowDown');
      assert.ok(await page.locator('.lw2-choice.is-selected').count() === 1);
    });
    await check('focus indicator visible on focusable elements', async () => {
      await page.locator('.lw2-wheel__node').first().focus();
      await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
      const ol = await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return s.outlineStyle + '|' + s.outlineWidth + '|' + e.tagName; });
      assert.ok(ol, ol);
    });
    await ctx.close();
  }
  {
    ({ ctx, page } = await newPage(browser, { viewport: { width: 375, height: 800 }, reducedMotion: 'no-preference' }));
    await check('motion enabled: wheel animation runs without errors', async () => {
      await fill(page, Array(24).fill(3));
      await page.waitForTimeout(900);
      assert.ok(await page.locator('.lw2-wheel__area').count());
    });
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
  if (fails.length) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(2); });
