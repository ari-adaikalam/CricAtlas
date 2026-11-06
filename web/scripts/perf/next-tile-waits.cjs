// The next tile must not animate before it is scrolled to. Opens Records and Batting, prints how much of each tile is on screen and whether its rows or charts have played, then scrolls half a
// screen and prints it again. At open only the first two tiles may say "rows play" or "drawn yes"; the next tile (about 6% visible) and the ones after must say "wait" and "no".
// A regression here (the 20% check measuring only one direction) happened once already. Run:  PLAYWRIGHT_CORE=<path> PORT=3100 node scripts/perf/next-tile-waits.cjs webkit|chromium
const { webkit, chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
(async () => {
  const b = await (process.argv[2]==='chromium' ? chromium : webkit).launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const probe = () => page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.car > .tile')];
    const car = document.querySelector('.car'); const box = car.getBoundingClientRect();
    return tiles.slice(0, 5).map((t, i) => {
      const r = t.getBoundingClientRect(); const vis = Math.max(0, Math.min(r.right, box.right) - Math.max(r.left, box.left)) / r.width;
      const rows = t.querySelector('[data-rows]'); const svgPlay = t.querySelector('svg.play, .play');
      return `${i}: ${(vis * 100).toFixed(0)}% visible, rows ${rows ? rows.getAttribute('data-rows') : '-'}, drawn ${svgPlay ? 'yes' : 'no'}`;
    });
  });
  for (const [view, extra] of [['records', 'ba607b88'], ['batting', 'ba607b88']]) {
    await page.goto(`http://localhost:${process.env.PORT ?? 3100}/players/${extra}?format=ODI&view=${view}`); await page.waitForTimeout(7000);
    console.log(view, 'at open:'); (await probe()).forEach(l => console.log('  ' + l));
    await page.evaluate(() => { const c = document.querySelector('.car'); c.scrollBy({ left: c.clientWidth * 0.55, behavior: 'instant' }); });
    await page.waitForTimeout(2500);
    console.log(view, 'scrolled by about half a screen:'); (await probe()).forEach(l => console.log('  ' + l));
  }
  await b.close();
})();
