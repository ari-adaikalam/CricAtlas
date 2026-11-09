// The Replay moves between views as the other views do: the view slides like a carousel row, and the playback bar is wiped like the timeline, at the same moment and in the
// same direction, with the leaving bar erased ahead of it. Samples every frame of Analysis to Replay, Replay to Details and back (a kept view).
//   PLAYWRIGHT_CORE=<path> node scripts/perf/replay-transition.cjs [webkit]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
(async () => {
  const b = await engine.launch({ args: ['--use-gl=swiftshader'] }); const bad = [];
  const page = await b.newPage({ viewport: { width: 1352, height: 659 } });
  await page.goto('http://localhost:3100/matches/west-indies-v-india-2026-09-30-1529228?view=analysis'); await page.waitForSelector('#p-ana .car > .tile'); await page.waitForTimeout(3500);
  for (const [label, from] of [['Replay', 'Analysis'], ['Details', 'Replay'], ['Replay', 'Details']]) {
    await page.evaluate(() => { window.__s = []; const t0 = performance.now(); const tick = () => { const rv = document.querySelector('#p-rep .rview'); const bar = document.querySelector('#p-rep .rpbar'); const gv = document.querySelector('.pane.ghost .rview, .pane.ghost .car'); const gb = document.querySelector('.pane.ghost .rpbar, .pane.ghost .rail'); const c = (x) => (x ? getComputedStyle(x).clipPath : 'none'); window.__s.push({ rv: rv ? rv.getBoundingClientRect().left : null, bar: c(bar), gv: gv ? gv.getBoundingClientRect().left : null, gb: c(gb) }); if (performance.now() - t0 < 1500) requestAnimationFrame(tick); }; tick(); });
    await page.locator('#vsw button', { hasText: label }).click(); await page.waitForTimeout(2200);
    const s = await page.evaluate(() => window.__s);
    const where = `${from} to ${label}`;
    const ghostMoved = s.some((x) => x.gv !== null && Math.abs(x.gv) > 50 && Math.abs(x.gv) < 1300);
    const barWiped = s.some((x) => x.gb !== 'none' && /calc|%/.test(x.gb) && !/^inset\(-20px -20px -20px -20px\)$/.test(x.gb));
    if (!ghostMoved) bad.push(`${where}: the leaving view did not slide`);
    if (!barWiped) bad.push(`${where}: the leaving bar was not wiped`);
    if (label === 'Replay') {
      const slid = s.some((x) => x.rv !== null && Math.abs(x.rv) > 50);
      const newWipe = s.some((x) => /calc/.test(x.bar));
      if (!slid) bad.push(`${where}: the Replay did not slide in`);
      if (!newWipe) bad.push(`${where}: the new bar was not wiped in`);
      const last = s[s.length - 1];
      if (last.rv !== 0 || last.bar !== 'none') bad.push(`${where}: the Replay did not settle (${last.rv}, ${last.bar})`);
    }
  }
  await b.close(); console.log(bad.length ? bad.join('\n') : 'ok'); process.exit(bad.length ? 1 : 0);
})();
