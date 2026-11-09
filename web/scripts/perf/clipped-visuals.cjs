// Is any chart, canvas or picture cut off by the box that holds it? A visual that is taller or wider than its panel, with the panel clipping the rest, loses its edge without any error (the Replay's wagon wheel ran 33 px
// out of its panel at a laptop window and lost the ground's near edge). This finds every canvas, chart (svg), picture and chart label that is partly inside a clipping box and partly outside it, on the pages that
// have them, at the window sizes a laptop and a phone have. Run with the dev server on 3100 and the data server on 8788:
//   PLAYWRIGHT_CORE=<path> node scripts/perf/clipped-visuals.cjs [webkit] [ROUTES=... SIZES=1352x659,... ]
// A box that scrolls (overflow auto or scroll) is not a clip, and an item wholly outside a box (a tile waiting beside the carousel) is not partly cut off.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const BASE = process.env.BASE ?? 'http://localhost:3100';
const ROUTES = (process.env.ROUTES ? process.env.ROUTES.split(',') : [
  // Every kind of page the site has, with the views each has, and a spread of players, teams, tournaments and matches (Tests, one-day, T20, leagues, women's, with and without tracking).
  '/', '/players', '/teams', '/matches', '/tournaments', '/series', '/records', '/compare', '/api',
  '/matches/1415755', '/matches/1415755?view=replay', '/matches/1415755?view=analysis', '/matches/1415755?view=details',
  '/matches/west-indies-v-india-2026-09-30-1529228', '/matches/west-indies-v-india-2026-09-30-1529228?view=replay', '/matches/west-indies-v-india-2026-09-30-1529228?view=analysis', '/matches/west-indies-v-india-2026-09-30-1529228?view=details',
  '/matches/1544002?view=replay', '/matches/1521264?view=replay', '/matches/1114879?view=replay', '/matches/1122731?view=replay', '/matches/1442989?view=replay', '/matches/1384439?view=analysis',
  '/matches/64050', '/matches/64050?view=details', '/matches/238167?view=analysis', '/matches/1317484?view=replay', '/matches/1473508?view=analysis', '/matches/1359525?view=replay',
  '/players/ba607b88', '/players/ba607b88?view=batting', '/players/ba607b88?view=bowling', '/players/ba607b88?view=fielding', '/players/ba607b88?view=records', '/players/ba607b88?view=stats',
  '/teams/india~intl~male', '/teams/india~intl~male?view=overall', '/teams/india~intl~male?view=results', '/teams/india~intl~male?view=stats', '/teams/india~intl~male?view=versus',
  '/tournaments/ipl', '/tournaments/ipl?view=overview', '/tournaments/ipl?view=players', '/tournaments/ipl?view=teams', '/tournaments/mens-t20-world-cup',
  '/compare/players?a=ba607b88', '/compare/teams?a=india~intl~male&b=australia~intl~male',
]);
const SIZES = (process.env.SIZES ?? '1352x659,1100x640,1280x560,1440x900,390x844').split(',').map((s) => s.split('x').map(Number));

// Runs in the page.
const audit = () => {
  const out = [];
  const name = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className?.baseVal ?? e.className).split(' ').filter(Boolean).slice(0, 2).join('.')}${e.matches('img') ? '[' + (e.getAttribute('alt') || e.getAttribute('src') || '').slice(-28) + ']' : ''}`;
  const hides = (v) => v === 'hidden' || v === 'clip';
  const scrolls = (e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) || /(auto|scroll)/.test(s.overflowX); };
  // A tile of a row of tiles shows only as much as the row's window lets through, so a tile beside the one in view is not cut off. Inside a tile, the tile's own clipping boxes count.
  const limit = (e) => e.closest('.tile') ?? document.documentElement;
  const clips = (e) => { const found = []; const top = limit(e); for (let p = e.parentElement; p && p !== top.parentElement && p !== document.documentElement; p = p.parentElement) {
    const s = getComputedStyle(p); if (hides(s.overflowX) || hides(s.overflowY)) found.push({ el: p, x: hides(s.overflowX), y: hides(s.overflowY) });
  } return found; };
  // Rows of a long list that scroll inside their own box are reached by scrolling, so what is beyond that box is not cut off. The box itself is checked below.
  const inScroller = (e, r) => { for (let p = e.parentElement; p && p !== document.documentElement; p = p.parentElement) { if (scrolls(p)) { const b = p.getBoundingClientRect(); return r.bottom > b.bottom + 1 || r.top < b.top - 1 || r.right > b.right + 1 || r.left < b.left - 1; } } return false; };
  const items = [...document.querySelectorAll('canvas, svg, img, svg text, *')].filter((e, i, all) => all.indexOf(e) === i).filter((e) => {
    if (!e.matches('canvas, svg, img, svg text') && !(scrolls(e) && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1))) return false;
    const r = e.getBoundingClientRect(); return r.width > 24 && r.height > 8 && !e.closest('[aria-hidden="true"], [hidden]') && getComputedStyle(e).visibility !== 'hidden';
  });
  for (const e of items) {
    if (e.matches('svg') && e.closest('svg') !== e) continue;
    if (e.matches('img.wm')) continue; // the watermark on the match summary bleeds past its box on purpose
    // In the analysis state the page's bar and header strip slide up out of the frame on purpose.
    if (e.closest('.app[class*="state-ana"] .nav, .app[class*="state-ana"] .top, .app[class*="state-ana"] .sum')) continue;
    if (e.matches('svg text') && e.closest('button, [role=tab]')) continue;
    const r = e.getBoundingClientRect();
    if (inScroller(e, r)) continue;
    // A chart label is also clipped by the chart's own edge.
    const own = e.matches('svg text') && e.closest('svg') ? [{ el: e.closest('svg'), x: true, y: true }] : [];
    for (const c of [...own, ...clips(e)]) {
      const b = c.el.getBoundingClientRect(); if (b.width === 0) continue;
      const over = { top: b.top - r.top, bottom: r.bottom - b.bottom, left: b.left - r.left, right: r.right - b.right };
      const worst = Math.max(c.y ? over.top : 0, c.y ? over.bottom : 0, c.x ? over.left : 0, c.x ? over.right : 0);
      const inside = r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom;
      // Partly cut: some of it shows, and more than 2 px does not.
      if (inside && worst > 2) {
        const visibleShare = (Math.min(r.right, b.right) - Math.max(r.left, b.left)) * (Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top)) / (r.width * r.height);
        out.push(`${name(e)} ${e.matches('svg text') ? '"' + e.textContent.trim().slice(0, 18) + '" ' : ''}${Math.round(worst)} px outside ${name(c.el)} (${Math.round(visibleShare * 100)}% shown)`);
        break;
      }
    }
  }
  return [...new Set(out)];
};

(async () => {
  const browser = await engine.launch({ args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] });
  const bad = new Map(); let pages = 0;
  for (const [w, h] of SIZES) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    for (const route of ROUTES) {
      pages++;
      try {
        await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2200);
        // Move through the page so that tiles that draw when they come into view have been drawn.
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < Math.min(height, 6000); y += Math.max(200, h - 120)) { await page.evaluate((top) => window.scrollTo(0, top), y); await page.waitForTimeout(450); }
        await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
        const found = await page.evaluate(audit);
        for (const f of found) { const key = `${route} :: ${f.replace(/\d+ px/, 'N px')}`; (bad.get(key) ?? bad.set(key, []).get(key)).push(`${w}x${h}${/\d+ px/.exec(f)?.[0] ? ' ' + /\d+ px/.exec(f)[0] : ''}`); }
      } catch (e) { bad.set(`${route} :: could not be checked (${String(e).slice(0, 60)})`, [`${w}x${h}`]); }
    }
    await page.close();
  }
  await browser.close();
  if (bad.size) { console.log(`${bad.size} visuals are cut off (${pages} page loads):`); for (const [k, v] of bad) console.log(`  ${k}\n      at ${v.join(', ')}`); }
  else console.log(`nothing is cut off (${pages} page loads, ${SIZES.map((s) => s.join('x')).join(', ')})`);
  process.exit(bad.size ? 1 : 0);
})();
