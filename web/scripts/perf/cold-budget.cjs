// The cold-visit budget: a fresh browser, no cache, 60 ms latency and 20 Mbit. Reports when the profile is on screen, and, with Batting, Bowling or Records clicked at
// once, when the view reveals and when its first tile has content. Run:  PLAYWRIGHT_CORE=<path> node scripts/perf/cold-budget.cjs 3101 <player id>
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const PORT = process.argv[2] || '3101';
const ID = process.argv[3] || 'ba607b88';
(async () => {
  const b = await chromium.launch();
  async function fresh(throttle) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (throttle) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 20e6 / 8, uploadThroughput: 20e6 / 8 });
    return { ctx, page, cdp };
  }
  const res = {};
  for (const [label, throttle, view] of [['cold 60ms/20Mbit', true, 'Batting analysis'], ['cold 60ms/20Mbit', true, 'Records'], ['cold 60ms/20Mbit', true, 'Bowling analysis']]) {
    const { ctx, page } = await fresh(throttle);
    const t0 = Date.now();
    await page.goto(`http://localhost:${PORT}/players/${ID}`, { waitUntil: 'commit' });
    await page.waitForSelector('table', { timeout: 30000 });
    const profile = Date.now() - t0;
    // clicked at once (the worst case): the view must open with nothing waiting
    const t1 = Date.now();
    await page.evaluate(() => { window.__r = null; const t=performance.now(); const tick=()=>{ const car=document.querySelector('.car'); if(car && car.getAttribute('data-enter')==='play' && window.__r===null) window.__r=Math.round(performance.now()-t); requestAnimationFrame(tick)}; requestAnimationFrame(tick); });
    await page.locator('.btn:visible').filter({ hasText: new RegExp('^' + view + '$') }).first().click();
    await page.waitForFunction(() => window.__r !== null, null, { timeout: 30000 });
    const reveal = await page.evaluate(() => window.__r);
    // first tile has content
    await page.waitForFunction(() => { const t=document.querySelector('.car > .tile'); return t && t.children.length>=2 && !t.querySelector('[role=status][aria-label$=", loading"]'); }, null, { timeout: 30000 });
    const content = Date.now() - t1;
    console.log(`${label} ${view}: profile on screen ${profile} ms; clicked at once -> reveal ${reveal} ms, first tile with content ${content} ms`);
    await ctx.close();
  }
  await b.close();
})();
