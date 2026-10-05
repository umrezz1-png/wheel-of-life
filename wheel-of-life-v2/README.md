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
the "strongest 3" and "need attention 3" lists never overlap. If all eight scores are
exactly equal, the lists are replaced by a single "start with the aspect you choose" notice;
near-equal scores and ties across a list boundary get an explanatory note.

## Results screen

The wheel is a visual aid (hidden from assistive tech). Dimensions are chosen with eight real
HTML buttons (>= 44x44 CSS px) below it; the read-out under them is a polite live region and
selecting never scrolls the page. The "read this aspect's interpretation" button is the only
thing that moves to a card. Answers can be reviewed ("راجع إجاباتي") with answers and per-aspect
plans kept in memory only; "restart" asks for confirmation when a plan has been written.

## Configure the course button

Set `courseUrl` in `config/config.js` (absolute `http(s)://…` or a path starting with `/`).
Nothing is guessed. While it is empty or invalid, visitors see the course card **without** a
button and without any developer text. To see the disabled placeholder button and the
developer note while building, enable preview mode: `previewMode: true` in the config, or open
the page with the hash `#lw2-preview` (e.g. `index.html#lw2-preview`).

## Tests

```bash
node --test wheel-of-life-v2/tests/scoring.test.js wheel-of-life-v2/tests/privacy.test.js

# browser E2E + network audit + screenshots (needs Playwright + Chromium and the server above)
NODE_PATH=$(npm root -g) node wheel-of-life-v2/tests/e2e.cjs
```
