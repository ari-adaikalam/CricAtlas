// With the profile open for a while (the views preload behind it), clicks a view and reports the reveal time and whether any of the first two tiles is still loading. The page has to be
// open long enough for the preload: the last case clicks after 1.5 s to show what happens before the engine is ready. Run:  PLAYWRIGHT_CORE=<path> node scripts/perf/preload-reveal.cjs 3101
const { webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
(async () => {
  const port = process.argv[2] || '3101'; const b = await webkit.launch();
  for (const [id, fmt, view, wait] of [['462411b3','TEST','Bowling analysis',5000],['462411b3','ODI','Bowling analysis',5000],['462411b3','T20S','Bowling analysis',5000],['462411b3','TEST','Bowling analysis',1500]]) {
    const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await page.goto(`http://localhost:${port}/players/${id}?format=${fmt}`); await page.waitForTimeout(wait);
    await page.evaluate(() => { window.__t0 = performance.now(); window.__r = null; window.__ld = null; const tick = () => { const car = document.querySelector('.car'); if (car && car.getAttribute('data-enter') === 'play' && window.__r === null) { window.__r = Math.round(performance.now() - window.__t0); const tiles=[...car.querySelectorAll(':scope > .tile')].slice(0,2); window.__ld = tiles.filter(t=>t.querySelector('[role=status][aria-label$=", loading"]')).length; } requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    await page.locator('.btn:visible').filter({ hasText: new RegExp('^'+view+'$') }).first().click();
    await page.waitForTimeout(3000);
    console.log(port, id, fmt, view, 'preload wait', wait, 'ms -> reveal', await page.evaluate(() => window.__r), 'ms, first-two tiles still loading at reveal:', await page.evaluate(() => window.__ld));
    await page.close();
  }
  await b.close();
})();
