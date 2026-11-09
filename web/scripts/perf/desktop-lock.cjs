// The desktop lock: the phone round must change nothing at desktop sizes. This records where every structural element of every page and view sits (its box, rounded to
// a pixel) at five desktop window sizes, and a later run reports every element that moved, resized, appeared or went. It is run after every phone commit and must report no difference.
//   PLAYWRIGHT_CORE=<path> node scripts/perf/desktop-lock.cjs [--webkit] --save      writes the baseline (two runs, keeping only boxes that did not change between them, so live text does not count)
//   PLAYWRIGHT_CORE=<path> node scripts/perf/desktop-lock.cjs [--webkit] [--only text]  compares with the baseline. Exit status 1 when anything differs.
// The hashes (desktop-lock/<engine>.hashes.json) are committed with the tag `desktop-locked`; the boxes (desktop-lock/detail/) are not, and are written again from that tag when they are missing.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

const args = process.argv.slice(2);
const ENGINE = args.includes('--webkit') ? 'webkit' : 'chromium';
const engine = ENGINE === 'webkit' ? webkit : chromium;
const SAVE = args.includes('--save');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const SIZES = [[1352, 660], [1352, 700], [1440, 900], [1280, 560], [1100, 640]];
const ROOT = path.join(__dirname, 'desktop-lock');
const DETAIL = path.join(ROOT, 'detail', ENGINE);
const HASHES = path.join(ROOT, `${ENGINE}.hashes.json`);

const KOHLI = 'ba607b88';
const PAGES = [
  ['home', '/'],
  ['player', `/players/${KOHLI}`, [['batting', 'button:has-text("Batting analysis")'], ['bowling', '#vsw button:text-is("Bowling")'], ['records', '#vsw button:text-is("Records")'], ['full stats', '#vsw button:text-is("Full stats")']]],
  ['team', '/teams/india~intl~male', [['results', '.btns button:has-text("Results")'], ['players', '#vsw button:text-is("Players")'], ['bat bowl field', '#vsw button:text-is("Bat, bowl, field")']]],
  ['tournament', '/tournaments/ipl', [['overview', '.btns button:has-text("Overview")'], ['players', '#vsw button:text-is("Players")'], ['teams', '#vsw button:text-is("Teams and matches")']]],
  ['match', '/matches/1490706', [['analysis', 'button:has-text("Match analysis")'], ['replay', '#vsw button:text-is("Replay")'], ['details', '#vsw button:text-is("Details")']]],
  ['match chase', '/matches/1298150?view=replay'],
  ['players root', '/players'], ['teams root', '/teams'], ['matches root', '/matches'], ['tournaments root', '/tournaments'], ['series root', '/series'],
  ['records', '/records'],
  ['compare root', '/compare'],
  ['compare players', '/compare/players'],
  ['compare players overall', `/compare/players?a=${KOHLI}&b=3fb19989&format=ODI&view=overall`],
  ['compare teams', '/compare/teams'],
  ['not found', '/no-such-page'],
];

const STATE = new Set(['on', 'also', 'active', 'sel', 'selected', 'open', 'seen', 'played', 'cur', 'current', 'hot', 'live', 'wait', 'play', 'hover', 'focus']);
const SELECTOR = '[data-tile], .pan, .tile, section, h1, h2, h3, h4, button, a, input, select, th, nav, .kn, table, canvas, svg';

/** Runs in the page: every visible structural element with a stable key and its box. Positioned by order within its own kind, so a new element only moves the ones after it. */
const SNAPSHOT = ({ selector, state }) => {
  const STATE = new Set(state);
  const out = {};
  const seen = new Map();
  for (const el of document.querySelectorAll(selector)) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    // The Compare root shows a different pair on every load.
    if (el.closest('.cro-vs')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    // A class that only says which state an element is in (the rail's current node, a played tile) is left out of the key, so a carousel that stopped one tile over does not rename its elements.
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter((c) => !STATE.has(c)).slice(0, 2).join('.') : '';
    const tile = el.closest('[data-tile]')?.getAttribute('data-tile') ?? '';
    const base = `${tile}|${el.tagName.toLowerCase()}.${cls}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out[`${base}#${n}`] = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  }
  out['#doc'] = [document.documentElement.scrollWidth, document.documentElement.scrollHeight, innerWidth, innerHeight];
  return out;
};

async function captureAll(browser) {
  const result = {};
  for (const [w, h] of SIZES) {
    for (const [label, url, views = []] of PAGES) {
      if (ONLY && !label.includes(ONLY)) continue;
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(`http://localhost:3100${url}`, { waitUntil: 'load' }).catch(() => undefined);
      await page.waitForTimeout(3500);
      result[`${w}x${h} ${label}`] = await page.evaluate(SNAPSHOT, { selector: SELECTOR, state: [...STATE] });
      for (const [name, selector] of views) {
        const b = page.locator(selector).first();
        if (!(await b.count()) || !(await b.isEnabled().catch(() => false))) continue;
        await b.click().catch(() => undefined);
        await page.mouse.move(0, 0);
        await page.waitForTimeout(2500);
        result[`${w}x${h} ${label} ${name}`] = await page.evaluate(SNAPSHOT, { selector: SELECTOR, state: [...STATE] });
      }
      await page.close();
    }
  }
  return result;
}

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '_');
const hashOf = (boxes) => crypto.createHash('sha256').update(JSON.stringify(Object.keys(boxes).sort().map((k) => [k, boxes[k]]))).digest('hex').slice(0, 16);

(async () => {
  const browser = await engine.launch();
  const first = await captureAll(browser);
  if (SAVE) {
    // A second run: a box that differs between the two runs is live (a clock, a hero line) and is left out of the baseline.
    const second = await captureAll(browser);
    fs.mkdirSync(DETAIL, { recursive: true });
    const hashes = ONLY && fs.existsSync(HASHES) ? JSON.parse(fs.readFileSync(HASHES, 'utf8')) : {};
    let dropped = 0;
    for (const [key, boxes] of Object.entries(first)) {
      const kept = {}, live = [];
      for (const [k, v] of Object.entries(boxes)) { if (second[key] && second[key][k] && same(v, second[key][k])) kept[k] = v; else { live.push(k); dropped += 1; } }
      fs.writeFileSync(path.join(DETAIL, `${slug(key)}.json`), JSON.stringify({ kept, live }));
      hashes[key] = hashOf(kept);
    }
    fs.writeFileSync(HASHES, JSON.stringify(hashes, null, 1));
    console.log(`${Object.keys(first).length} page states saved for ${ENGINE}; ${dropped} live boxes left out`);
    await browser.close();
    return;
  }
  await browser.close();
  if (!fs.existsSync(HASHES)) { console.log(`no baseline for ${ENGINE}: run with --save first`); process.exit(2); }
  const baseline = JSON.parse(fs.readFileSync(HASHES, 'utf8'));
  const problems = [];
  let checked = 0;
  for (const [key, boxes] of Object.entries(first)) {
    const file = path.join(DETAIL, `${slug(key)}.json`);
    if (!fs.existsSync(file)) { problems.push(`${key}: not in the baseline`); continue; }
    const { kept: base, live } = JSON.parse(fs.readFileSync(file, 'utf8'));
    const liveSet = new Set(live);
    checked += 1;
    // Only the boxes in the baseline are compared, and a box that is new in this run is reported (an element added at desktop).
    const diffs = [];
    for (const [k, v] of Object.entries(base)) { const now = boxes[k]; if (!now) diffs.push(`gone ${k}`); else if (!same(v, now)) diffs.push(`${k} ${v.join(',')} to ${now.join(',')}`); }
    const added = Object.keys(boxes).filter((k) => !(k in base) && !liveSet.has(k) && k !== '#doc').length;
    if (diffs.length || added > 0) problems.push(`${key}: ${diffs.length} changed or gone${added ? `, ${added} new` : ''}${diffs.length ? ` (${diffs.slice(0, 3).join('; ')})` : ''}`);
  }
  // Baseline states the run did not reach (a page that failed to open) also count.
  for (const key of Object.keys(baseline)) if (!(key in first) && !ONLY) problems.push(`${key}: not reached in this run`);
  console.log(`${checked} page states compared in ${ENGINE}`);
  if (problems.length) { console.log(`${problems.length} differ from the desktop baseline:`); problems.slice(0, 40).forEach((p) => console.log('  ' + p)); process.exit(1); }
  console.log('desktop unchanged');
})();
