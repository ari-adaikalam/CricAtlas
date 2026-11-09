// Does the top bar move after it first appears on a hard load (a refresh)? From the first frame, the position and size of the brand, the search box and the Compare button are recorded; any later change is
// a shift (the font arriving late used to widen the brand name and move the others by a few pixels). With the network slowed, so the order of events is as on a real connection.
//   PLAYWRIGHT_CORE=<path> [BASE=http://localhost:3101] node scripts/perf/bar-first-paint.cjs
const { chromium, webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const BASE = process.env.BASE ?? 'http://localhost:3101';
const PAGES = ['/', '/players', '/players/ba607b88', '/teams/india~intl~male', '/matches/1415755', '/tournaments/ipl', '/api', '/compare'];
(async () => {
  const bad = []; let n = 0;
  for (const [name, engine] of [['Chromium', chromium], ['WebKit', webkit]]) {
    const browser = await engine.launch(name === 'Chromium' ? { args: ['--use-gl=swiftshader'] } : {});
    for (const url of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: 1352, height: 659 } }); const page = await ctx.newPage();
      if (name === 'Chromium') { const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 120, downloadThroughput: 500000, uploadThroughput: 250000 }); }
      await page.addInitScript(() => { window.__s = []; const tick = () => { const bar = [...document.querySelectorAll('.nav')].find((x) => { const r = x.getBoundingClientRect(); const cs = getComputedStyle(x); return r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; }); const g = (s) => { const e = bar && bar.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 2) / 2).join(','); }; if (bar) window.__s.push([g('.brand span, .brand b'), g('.nmi > a'), g('.srch'), g('a.cmp, a[href="/compare"]')].join('|')); if (performance.now() < 7000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
      await page.goto(BASE + url, { waitUntil: 'load' }); await page.waitForTimeout(3500);
      const seen = await page.evaluate(() => window.__s); const distinct = [...new Set(seen)]; n++;
      if (seen.length === 0) bad.push(`${name} ${url}: no bar was ever seen`);
      else if (distinct.length > 1) bad.push(`${name} ${url}: the bar changed size or place after it appeared (${distinct.length} different layouts)`);
      await ctx.close();
    }
    await browser.close();
  }
  console.log(`${n} hard loads.`); if (bad.length) { console.log(`${bad.length} move the top bar after it appears:`); bad.forEach((b) => console.log('  ' + b)); process.exit(1); } else console.log('on every one the top bar appears at its final size and place and never moves.');
})();
