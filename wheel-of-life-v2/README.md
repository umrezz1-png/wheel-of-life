# Wheel of Life v2 — اختبار عجلة الحياة

Standalone, Arabic/RTL, mobile-first self-assessment. **No backend, no database,
no network calls, no storage, no tracking.** Independent of the root `index.html`.

## Preview

```bash
cd wheel-of-life-v2
python3 -m http.server 8765 --bind 127.0.0.1
# open http://127.0.0.1:8765/index.html  (phone: use the machine's LAN IP)
```

Opening `index.html` directly from disk (`file://`) also works in most browsers,
but a local server is the reference way to preview.

## Layout

```
index.html          preview shell (CSP: no network allowed, noindex)
config/config.js    deployment config — course URL only
js/data.js          ALL content: questions, scale, dimensions, bands, Arabic copy
js/scoring.js       pure scoring + ranking (also runs in Node)
js/wheel.js         inline-SVG 8-axis wheel (no libraries)
js/app.js           UI controller (in-memory state only)
css/lw2.css         component styles, scoped under .lw2-root / lw2- prefix
css/page.css        preview-only page background (not part of the component)
tests/              scoring + privacy audits (node:test) and browser E2E (Playwright)
screenshots/        preview captures
```

## Scoring

Per dimension: `raw = Σ 3 answers (3..15)`, `score = ((raw − 3) / 12) × 100`,
shown rounded. **No overall score exists anywhere.** Bands (UX wording only,
not clinical cut-offs): 80–100 strong · 60–79 good · 40–59 needs attention · 0–39 priority for review.
Bands use the unrounded score. Ties are broken by the original dimension order;
the "strongest 3" and "need attention 3" lists never overlap.

## Configure the course button

Set `courseUrl` in `config/config.js` (absolute `http(s)://…` or a path starting with `/`).
Empty/invalid → the button renders disabled with a developer note. Nothing is guessed.

## Tests

```bash
node --test wheel-of-life-v2/tests/scoring.test.js wheel-of-life-v2/tests/privacy.test.js

# browser E2E + network audit + screenshots (needs Playwright + Chromium and the server above)
NODE_PATH=$(npm root -g) node wheel-of-life-v2/tests/e2e.cjs
```
