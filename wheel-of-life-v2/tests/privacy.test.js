'use strict';
// Static privacy / claims audit of everything shipped (not tests).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'tests' || e.name === 'screenshots' ? [] : files(p);
    return /\.(js|css|html)$/.test(e.name) ? [p] : [];
  });
}
const shipped = files(ROOT);
const read = (p) => fs.readFileSync(p, 'utf8');

test('no network / storage / tracking APIs in shipped code', () => {
  const banned = [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /localStorage/, /sessionStorage/,
    /indexedDB/, /document\.cookie/, /\bgtag\b/, /\bga\s*\(/, /analytics/i, /web3forms/i, /facebook|fbq\(|pixel/i, /\bimport\s*\(/, /navigator\.(geolocation|sendBeacon)/];
  shipped.forEach((f) => banned.forEach((re) => assert.ok(!re.test(read(f)), f + ' matches ' + re)));
});

test('no external URLs; no remote fonts/images/@import', () => {
  shipped.forEach((f) => {
    const s = read(f);
    const urls = (s.match(/https?:\/\/[^\s"'<>)]+/g) || []).filter((u) => !/^https?:\/\/www\.w3\.org\/2000\/svg$/.test(u));
    assert.deepEqual(urls, [], f);
    assert.ok(!/@import|url\s*\(/.test(s), f + ' has @import/url()');
  });
});

test('no phone numbers, prices, dates or personal-data inputs', () => {
  shipped.forEach((f) => {
    const s = read(f);
    assert.ok(!/\b0?1[0125]\d{8}\b/.test(s), f + ' phone');
    assert.ok(!/([$€£]\s*\d|\d\s*[$€£]|ج\.م|جنيه|دولار|ريال|EGP|USD)/i.test(s), f + ' price');
    assert.ok(!/\b(19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/](19|20)\d{2}\b/.test(s), f + ' date');
    assert.ok(!/type\s*[:=]\s*['"]?(email|tel|password)/i.test(s), f + ' personal input');
    assert.ok(!/name=["'](email|phone|name)/i.test(s), f + ' personal field');
  });
});

test('Arabic copy: no diagnostic / scientific-validity claims, no overall score', () => {
  const D = require('../js/data.js');
  const strings = [];
  (function walk(o) { if (typeof o === 'string') strings.push(o); else if (o && typeof o === 'object') Object.values(o).forEach(walk); })(D);
  const text = strings.join('\n');
  // The disclaimer itself legitimately negates "تشخيصي"; remove it before scanning.
  const scan = text.replace(D.texts.disclaimer, '').replace(D.texts.interpretationNote, '');
  const banned = [/تشخيص/, /اضطراب/, /اكتئاب/, /قلق مرضي/, /علاج/, /مرض/, /مقياس معتمد|مُعتمد|موثّق|مُوثق|مثبت علميًا|علميًا/, /سريري|إكلينيكي/, /validated|clinical|diagnos/i,
    /الدرجة (الكلية|الإجمالية)|المجموع الكلي|متوسط (الدرجات|حياتك)|مؤشر (حياتك|الحياة)/, /لديك مشكلة|أنت تعاني|تعاني من/];
  banned.forEach((re) => assert.ok(!re.test(scan), 'banned wording: ' + re));
  // Required wording present verbatim.
  assert.equal(D.texts.disclaimer, 'هذا الاختبار أداة للتقييم الذاتي والتأمل، وليس اختبارًا نفسيًا تشخيصيًا ولا بديلًا عن التقييم الطبي أو النفسي المتخصص.');
  assert.equal(D.texts.reflectionQuestion, 'لو استطعت تحسين جانب واحد فقط خلال الـ30 يومًا القادمة، أي جانب سيحدث أكبر فرق في حياتك؟');
  const html = read(path.join(ROOT, 'index.html'));
  assert.ok(!/validated|clinical|diagnostic/i.test(html));
});

test('CTA URL is configurable and not hard-coded', () => {
  const cfg = read(path.join(ROOT, 'config', 'config.js'));
  assert.match(cfg, /courseUrl:\s*""/);
  shipped.filter((f) => !f.endsWith('config.js')).forEach((f) => assert.ok(!/umrezz/i.test(read(f)), f + ' hard-codes a site name/URL'));
});

test('CSS: no !important; JS: scrollIntoView only behind the explicit "read interpretation" action', () => {
  shipped.filter((f) => f.endsWith('.css')).forEach((f) => assert.ok(!/!important/.test(read(f)), f));
  const app = read(path.join(ROOT, 'js', 'app.js'));
  assert.equal((app.match(/scrollIntoView/g) || []).length, 1);
  assert.match(app, /function goToCard\(\)[\s\S]{0,400}scrollIntoView/);
  assert.ok(!/scrollIntoView/.test(read(path.join(ROOT, 'js', 'wheel.js'))));
});

test('developer notes are gated behind preview mode', () => {
  const app = read(path.join(ROOT, 'js', 'app.js'));
  assert.match(app, /else if \(isPreview\(\)\)/);
  assert.match(read(path.join(ROOT, 'config', 'config.js')), /previewMode:\s*false/);
});
