// Does the top bar stay put when a page is opened from a link? The bar is drawn by the layout on some pages and inside the page's own frame on others (Home, player, team, match, tournament, Compare), so a click can
// show two bars, none, a dim one or one 60 px low for a few frames. This samples every frame from the click until the page settles and reports any frame where it is not exactly one fully visible bar at the top.
//   PLAYWRIGHT_CORE=<path> [DELAY=300] node scripts/perf/nav-bar-flash.cjs [webkit]        (dev server on 3100, data server on 8788; DELAY holds back the data files by that many ms)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const BASE = process.env.BASE ?? 'http://localhost:3100';
const DELAY = +(process.env.DELAY ?? 0);
const { FLOWS } = require('./nav-flows.cjs');
const sample = () => {
  window.__s = []; const t0 = performance.now();
  const eff = (e) => { let o = 1; for (let x = e; x; x = x.parentElement) { const s = getComputedStyle(x); if (s.display === 'none' || s.visibility === 'hidden') return 0; o *= +s.opacity; } return o; };
  const tick = () => { const bars = [...document.querySelectorAll('.nav:not(#bar-hold .nav)')].map((n) => ({ o: eff(n), top: n.getBoundingClientRect().top, h: n.getBoundingClientRect().height })).filter((b) => b.o > 0.04 && b.h > 0);
    window.__s.push({ t: Math.round(performance.now() - t0), held: !!document.getElementById('bar-hold'), n: bars.length, o: Math.min(...bars.map((b) => b.o), 1), top: Math.max(...bars.map((b) => Math.abs(b.top)), 0), path: location.pathname.slice(0, 26) });
    if (performance.now() - t0 < 2600) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};
(async () => {
  const browser = await engine.launch(engine === webkit ? {} : { args: ['--use-gl=swiftshader'] }); const bad = [];
  for (const [name, start, pick] of FLOWS) {
    const page = await browser.newPage({ viewport: { width: 1352, height: 659 } });
    if (DELAY) await page.route(/bundle|\.parquet|\.json/, async (route) => { if (route.request().url().includes('/_next/')) return route.continue(); await new Promise((r) => setTimeout(r, DELAY)); route.continue(); });
    try {
      await page.goto(BASE + start, { waitUntil: 'load' }); await page.waitForTimeout(4200);
      const el = await pick(page); const href = await el.getAttribute('href').catch(() => '');
      await page.evaluate(sample); await el.click(); await page.waitForTimeout(2900);
      const frames = await page.evaluate(() => window.__s);
      const moved = frames.findIndex((f) => f.path !== frames[0].path);
      const after = moved < 0 ? [] : frames.slice(Math.max(0, moved - 1));
      // While a copy of the bar lies over the page (barHold.ts) the bars under it may change as they like; a frame is a fault only when the copy is not there.
      const faults = after.filter((f) => !f.held && (f.n !== 1 || f.o < 0.95 || f.top > 1));
      if (moved < 0) bad.push(`${name}: the click did not open a page (${href})`);
      else if (faults.length) { const kinds = [...new Set(faults.map((f) => f.n === 0 ? 'no bar' : f.n > 1 ? `${f.n} bars` : f.top > 1 ? `bar ${Math.round(f.top)} px off` : `bar at ${Math.round(f.o * 100)}%`))].join(', '); bad.push(`${name} (${href}): ${faults.length} frames with ${kinds}, first at ${faults[0].t} ms`); }
    } catch (e) { bad.push(`${name}: could not be run (${String(e).slice(0, 70)})`); }
    await page.close();
  }
  await browser.close();
  if (bad.length) { console.log(`${bad.length} of ${FLOWS.length} openings flash the bar${DELAY ? ` (data +${DELAY} ms)` : ''}:`); bad.forEach((b) => console.log('  ' + b)); } else console.log(`the bar stays put in all ${FLOWS.length} openings${DELAY ? ` (data +${DELAY} ms)` : ''}`);
  process.exit(bad.length ? 1 : 0);
})();
