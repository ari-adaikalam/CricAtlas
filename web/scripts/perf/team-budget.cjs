// The cold-visit budget for the Team page: a fresh browser, no cache, 60 ms latency and 20 Mbit, on a production build. Reports when the profile is on screen, then, with a view clicked at
// once, when its first tile has content, and the number of data requests and bytes before the profile. Run:
//   PLAYWRIGHT_CORE=<path> node scripts/perf/team-budget.cjs 3101 [team slug]
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const PORT = process.argv[2] || '3101';
const SLUG = process.argv[3] || 'india~intl~male';
(async () => {
  const b = await chromium.launch();
  for (const [label, view] of [['Results', 'Results'], ['Players', 'Players'], ['Bat, bowl, field', 'Batting, bowling and fielding']]) {
    for (const warm of [false, true]) {
      const ctx = await b.newContext({ viewport: { width: 1352, height: 700 } });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: !warm });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 20e6 / 8, uploadThroughput: 20e6 / 8 });
      const reqs = []; page.on('requestfinished', async (r) => { const u = r.url(); if (/\/t\//.test(u)) { const s = await r.sizes().catch(() => null); reqs.push(`${u.split('/t/')[1]} ${s ? Math.round(s.responseBodySize / 1024) + 'KB' : ''}`); } });
      if (warm) { await page.goto(`http://localhost:${PORT}/teams/${SLUG}`); await page.waitForSelector('.sum .phead'); await page.waitForTimeout(1500); }
      const t0 = Date.now();
      await page.goto(`http://localhost:${PORT}/teams/${SLUG}`, { waitUntil: 'commit' });
      await page.waitForSelector('.sum .phead .pid h1', { timeout: 30000 });
      const profile = Date.now() - t0;
      const before = reqs.length;
      const t1 = Date.now();
      await page.locator('.btns button', { hasText: view }).first().click();
      await page.waitForFunction(() => { const t = document.querySelector('.pane:not(.held):not(.ghost) .car > .tile'); return t && t.innerText.trim().length > 60 && getComputedStyle(t).opacity === '1'; }, null, { timeout: 30000 });
      const tile = Date.now() - t1;
      console.log(`${warm ? 'warm' : 'cold'} ${label}: profile ${profile} ms, first tile ${tile} ms after the click, data files before the click: ${before} (${reqs.slice(0, before).join(', ')})`);
      await ctx.close();
    }
  }
  await b.close();
})();
