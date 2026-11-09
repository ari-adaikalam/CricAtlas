// While a link opens another page, a copy of the top bar lies over the page (barHold.ts) so the bar being swapped for the new page's own copy cannot be seen. Checks that the copy is there in every frame in which
// a page is opening, in Chromium and WebKit, and that none is left on the page afterwards.
//   PLAYWRIGHT_CORE=<path> [BASE=http://localhost:3101] node scripts/perf/bar-hold.cjs
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const { FLOWS } = require('./nav-flows.cjs');
const BASE = process.env.BASE ?? 'http://localhost:3101';
(async () => { for (const [en, eng] of [['Chromium', chromium], ['WebKit', webkit]]) { const b = await eng.launch(en === 'Chromium' ? { args: ['--use-gl=swiftshader'] } : {}); let ok = 0, bad = [];
  for (const name of ['Home to Teams', 'Home to a team (menu)', 'Home to a player (menu)', 'Teams to a team', 'Players to a player', 'A team to Home', 'A match to Home', 'A team to Matches', 'Home to API', 'A player to a match (menu)', 'Home to Compare']) {
    const [, start, find] = FLOWS.find((f) => f[0] === name); const page = await b.newPage({ viewport: { width: 1352, height: 659 } });
    await page.goto(BASE + start, { waitUntil: 'load' }); await page.waitForTimeout(4200);
    await page.evaluate(() => { window.__c = []; const t0 = performance.now(); const tick = () => { const hold = document.getElementById('bar-hold'); const pts = [[100, 30], [300, 30], [900, 30], [1250, 30]]; const covered = pts.every(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.closest('#bar-hold') } ); const swapping = document.documentElement.hasAttribute('data-opening'); window.__c.push([Math.round(performance.now() - t0), !!hold, covered, swapping, location.pathname]); if (performance.now() - t0 < 4000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    const el = await find(page); const box = await el.boundingBox(); await page.mouse.move(box.x + 8, box.y + 5); await page.waitForTimeout(200); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(4200);
    const r = await page.evaluate(() => window.__c);
    // the bar must be covered by the held copy for every frame in which the page is opening (data-opening) and until the new path is drawn
    const opening = r.filter((x) => x[3]); const uncovered = opening.filter((x) => !x[1]); const held = r.filter((x) => x[1]).length; const stale = r.filter((x) => x[1]).length;
    if (opening.length && uncovered.length === 0 && held > 0) ok++; else bad.push(name + ' (opening frames ' + opening.length + ', uncovered ' + uncovered.length + ', held copy frames ' + held + ')');
    const leftover = await page.evaluate(() => !!document.getElementById('bar-hold')); if (leftover) bad.push(name + ' left the held copy on the page');
    await page.close(); }
  console.log(en, ': the held bar copy covered the bar through every opening in', ok, 'of 11 flows;', bad.length ? 'PROBLEMS: ' + bad.join(' ; ') : 'none left behind'); await b.close(); } })();
