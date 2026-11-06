// The speed budget for the root pages: a cold visit at 60 ms and 20 Mbit with no cache, a warm visit, and a filter change. First look is the first table row on screen; a filter change is the
// time until the count changes. Run against a production build on 3101 with the data server on 8788:
//   PLAYWRIGHT_CORE=<path> node scripts/perf/root-budget.cjs [port] [webkit]
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const PORT = process.argv.find((a) => /^\d{4}$/.test(a)) ?? '3101';
const engine = process.argv.includes('webkit') ? webkit : chromium;
const PAGES = [['teams', '.pgx.rtp', 'Type'], ['players', '.pgx.rpp', 'Gender'], ['matches', '.pgx.rmp', 'Format'], ['tournaments', '.pgx.rtn', 'Kind'], ['series', '.pgx.rsr', 'Gender']];
(async () => {
  const browser = await engine.launch();
  for (const [name, sc, filter] of PAGES) {
    const out = {};
    for (const mode of ['cold', 'warm']) {
      const ctx = await browser.newContext({ viewport: { width: 1352, height: 700 } }); const page = await ctx.newPage();
      if (mode === 'cold' && engine === chromium) { const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: (20 * 1024 * 1024) / 8, uploadThroughput: (20 * 1024 * 1024) / 8 }); }
      if (mode === 'warm') { await page.goto(`http://localhost:${PORT}/${name}`); await page.waitForSelector(`${sc} tbody tr.rlink`, { timeout: 60000 }); await page.waitForTimeout(1500); }
      const t0 = Date.now(); await page.goto(`http://localhost:${PORT}/${name}`); await page.waitForSelector(`${sc} tbody tr.rlink`, { timeout: 60000 }); out[mode] = Date.now() - t0;
      if (mode === 'warm') {
        await page.waitForTimeout(800);
        const before = await page.textContent(`${sc} .cnt .t b`); const t1 = Date.now();
        const opts = await page.$$eval(`${sc} select[aria-label="${filter}"] option`, (os) => os.filter((o) => o.value && !o.disabled).map((o) => o.value));
        await page.selectOption(`${sc} select[aria-label="${filter}"]`, opts[0]);
        await page.waitForFunction(([s, b]) => document.querySelector(`${s} .cnt .t b`)?.textContent !== b, [sc, before], { timeout: 10000 }).catch(() => undefined);
        out.filter = Date.now() - t1;
      }
      await ctx.close();
    }
    const flag = (v, lim) => (v <= lim ? 'ok' : 'OVER');
    console.log(`${name.padEnd(12)} cold ${String(out.cold).padStart(5)} ms ${flag(out.cold, 1000)}   warm ${String(out.warm).padStart(5)} ms ${flag(out.warm, 500)}   filter ${String(out.filter).padStart(4)} ms ${flag(out.filter, 300)}`);
  }
  await browser.close();
})();
